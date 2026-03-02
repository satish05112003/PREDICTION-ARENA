'use strict';
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', e => console.error('[CRASH]', e.message, e.stack));
process.on('unhandledRejection', r => console.error('[REJECT]', r));

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PORT = 8080;
const COINBASE_WS = 'wss://advanced-trade-ws.coinbase.com';
const DATA_FILE = path.join(__dirname, 'arena-data.json');
const MAX_LIVES = 3;
const DANGER_ACC = 65;     // DANGER zone below this rolling accuracy
const DEATH_ACC = 60;     // Die below this
const ROLLING_N = 50;
const THRESH_NORMAL = 55;
const THRESH_STRICT = 65;
const SCORE_MIN = 25;     // No-trade zone: |score| < 25 → skip
const IST_MS = 5.5 * 60 * 60 * 1000;
const TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };
const ALL_TFS = ['5m', '15m', '30m', '1h'];

// ─── IST HELPERS ─────────────────────────────────────────────────────────────
const getIST = () => new Date(Date.now() + IST_MS);
const fmtIST = ms => new Date(ms + IST_MS).toISOString().replace('T', ' ').replace('Z', ' IST');
const istDateStr = () => { const d = getIST(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

// ─── STATE FACTORIES ─────────────────────────────────────────────────────────
const freshAI = (gen = 1) => ({
    generation: gen, startTime: Date.now(), lives: MAX_LIVES,
    accuracy: 100, wins: 0, losses: 0, streak: 0, consecutiveLosses: 0,
    totalPredictions: 0, status: 'ALIVE', confidenceThreshold: THRESH_NORMAL,
    volatilityMode: 'AGGRESSIVE', rolling50Accuracy: 100,
    avgConfidence: 0, upBias: 50, downBias: 50,
    longestWinStreak: 0, longestLossStreak: 0,
});
const freshDaily = () => ({
    date: istDateStr(), total: 0, wins: 0, losses: 0, accuracy: 0,
    streak: 0, longestWinStreak: 0, longestLossStreak: 0,
    byTF: { '5m': { t: 0, w: 0 }, '15m': { t: 0, w: 0 }, '30m': { t: 0, w: 0 }, '1h': { t: 0, w: 0 } },
});
const freshLifetime = () => ({
    totalPredictions: 0, totalWins: 0, totalLosses: 0, lifetimeAccuracy: 0,
    bestGenAccuracy: 0, worstGenAccuracy: 100, highestWinStreak: 0,
    totalGenerations: 1, snapWins: 0, snapLosses: 0,
});

let state = {
    price: null, lastTick: null, baseCandles: [], currentCandle: null,
    tfIndicators: {}, indicators: {},
    predictions: { '5m': null, '15m': null, '30m': null, '1h': null },
    pendingEvaluations: [], history: [], snapshots: [], snapshotFiredKeys: new Set(),
    rollingWindow: [], recentPreds: [],
    ai: freshAI(1), generations: [], dailyStats: freshDaily(), lifetimeStats: freshLifetime(),
    connected: false, dataReady: false,
};
const clients = new Set();

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
function persist() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            generations: state.generations,
            lifetimeStats: state.lifetimeStats,
            dailyStats: state.dailyStats,
            snapshots: state.snapshots.slice(0, 200),
            snapshotFiredKeys: [...state.snapshotFiredKeys].slice(-300),
            ai: {
                generation: state.ai.generation, startTime: state.ai.startTime,
                longestWinStreak: state.ai.longestWinStreak, longestLossStreak: state.ai.longestLossStreak
            },
        }, null, 2));
    } catch (e) { console.error('[PERSIST] write fail:', e.message); }
}
function loadPersisted() {
    try {
        if (!fs.existsSync(DATA_FILE)) return;
        const s = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (s.generations) state.generations = s.generations;
        if (s.lifetimeStats) state.lifetimeStats = { ...freshLifetime(), ...s.lifetimeStats };
        if (s.snapshots) state.snapshots = s.snapshots;
        if (s.snapshotFiredKeys) state.snapshotFiredKeys = new Set(s.snapshotFiredKeys);
        if (s.dailyStats && s.dailyStats.date === istDateStr()) state.dailyStats = s.dailyStats;
        if (s.ai) {
            state.ai.generation = s.ai.generation || 1;
            state.ai.startTime = s.ai.startTime || Date.now();
            state.ai.longestWinStreak = s.ai.longestWinStreak || 0;
            state.ai.longestLossStreak = s.ai.longestLossStreak || 0;
        }
        state.lifetimeStats.totalGenerations = Math.max(state.ai.generation, state.generations.length + 1);
        console.log(`[PERSIST] Gen ${state.ai.generation} | ${state.generations.length} dead gens | ${state.snapshots.length} snaps`);
    } catch (e) { console.error('[PERSIST] load fail:', e.message); }
}

// ─── MATH ─────────────────────────────────────────────────────────────────────
function calcEMA(vals, p) {
    if (vals.length < p) return [];
    const k = 2 / (p + 1); let prev = vals.slice(0, p).reduce((a, b) => a + b, 0) / p;
    const r = [prev];
    for (let i = p; i < vals.length; i++) { prev = vals[i] * k + prev * (1 - k); r.push(prev); }
    return r;
}
function calcRSI(closes, p = 14) {
    if (closes.length < p + 1) return null;
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
    g /= p; l /= p;
    for (let i = p + 1; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function calcMACD(closes, fast = 12, slow = 26, sig = 9) {
    if (closes.length < slow + sig) return null;
    const fe = calcEMA(closes, fast), se = calcEMA(closes, slow);
    const fa = fe.slice(fe.length - se.length);
    const ml = fa.map((v, i) => v - se[i]);
    const sl = calcEMA(ml, sig);
    const hist = sl.map((v, i) => ml[ml.length - sl.length + i] - v);
    return {
        macdLine: ml[ml.length - 1], signalLine: sl[sl.length - 1],
        histogram: hist[hist.length - 1], histogramHistory: hist.slice(-30)
    };
}
function calcATR(candles, p = 14) {
    const c = candles.slice(-(p + 1));
    const trs = c.slice(1).map((x, i) => Math.max(x.high - x.low, Math.abs(x.high - c[i].close), Math.abs(x.low - c[i].close)));
    return trs.length ? trs.reduce((a, b) => a + b, 0) / trs.length : 0;
}
function detectOB(candles, lb = 20) {
    const blocks = [], r = candles.slice(-lb);
    for (let i = 1; i < r.length - 1; i++) {
        const cur = r[i], nxt = r[i + 1];
        if (cur.close > cur.open && nxt.close < nxt.open && (nxt.open - nxt.close) > (cur.close - cur.open) * 1.5)
            blocks.push({ type: 'bearish', high: cur.high, low: cur.low, time: cur.time });
        if (cur.close < cur.open && nxt.close > nxt.open && (nxt.close - nxt.open) > (cur.open - cur.close) * 1.5)
            blocks.push({ type: 'bullish', high: cur.high, low: cur.low, time: cur.time });
    }
    return blocks.slice(-5);
}
function aggCandles(base, mins) {
    if (mins <= 1) return base;
    const ps = mins * 60, groups = new Map();
    for (const c of base) {
        const bkt = Math.floor(c.time / ps) * ps;
        if (!groups.has(bkt)) groups.set(bkt, []);
        groups.get(bkt).push(c);
    }
    return [...groups.entries()].map(([t, cs]) => ({
        time: t, open: cs[0].open, high: Math.max(...cs.map(c => c.high)),
        low: Math.min(...cs.map(c => c.low)), close: cs[cs.length - 1].close,
        volume: cs.reduce((s, c) => s + c.volume, 0),
    })).sort((a, b) => a.time - b.time);
}

// ─── INDICATOR ENGINE ─────────────────────────────────────────────────────────
function computeInd(candles) {
    if (candles.length < 30) return {};
    const closes = candles.map(c => c.close), vols = candles.map(c => c.volume);
    const macdData = calcMACD(closes), ema50 = calcEMA(closes, 50), ema200 = calcEMA(closes, 200);
    const rsi14 = calcRSI(closes, 14);
    const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 || 1;
    const volSpike = vols[vols.length - 1] / avgVol;
    const momentum = closes.length >= 6 ? ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : 0;
    const atr = calcATR(candles, 14);
    const orderBlocks = detectOB(candles, 20);
    // Sparklines
    const rsiHist = [];
    for (let i = Math.max(15, closes.length - 35); i < closes.length; i++) { const v = calcRSI(closes.slice(0, i + 1), 14); if (v !== null) rsiHist.push(v); }
    const momHist = [];
    for (let i = 5; i < closes.length && momHist.length < 30; i++) { momHist.push(((closes[i] - closes[i - 5]) / closes[i - 5]) * 100); }
    return {
        rsi: rsi14, rsiHistory: rsiHist.slice(-30),
        macd: macdData, ema50: ema50[ema50.length - 1] || null, ema200: ema200[ema200.length - 1] || null,
        volSpike, volHistory: vols.slice(-30), momentum, momentumHistory: momHist,
        atr, orderBlocks, currentPrice: closes[closes.length - 1], timestamp: Date.now(),
    };
}

function computeAllTF() {
    if (state.baseCandles.length < 30) return;
    const tf = {};
    tf['1m'] = computeInd(state.baseCandles);
    for (const t of ALL_TFS) {
        const c = aggCandles(state.baseCandles, TF_SEC[t] / 60);
        if (c.length >= 20) tf[t] = computeInd(c);
    }
    state.tfIndicators = tf;
    state.indicators = tf['1m'] || {};
}

// ─── UNIFIED WEIGHTED PREDICTION ENGINE ──────────────────────────────────────
// Score: -100 to +100. UP if >+25, DOWN if <-25, NO TRADE if |score|<25
function scoreIndicators(ind) {
    if (!ind || !ind.rsi || !ind.macd) return null;
    let score = 0; const reasons = [];

    // 1. EMA Trend ±20
    if (ind.ema50 && ind.ema200) {
        if (ind.ema50 > ind.ema200) { score += 20; reasons.push('EMA uptrend +20'); }
        else { score -= 20; reasons.push('EMA downtrend -20'); }
    }
    // 2. MACD Crossover ±15 strong / ±10 weak
    const macdBull = ind.macd.macdLine > ind.macd.signalLine;
    const histAbs = Math.abs(ind.macd.histogram);
    const strong = histAbs > 5;
    if (macdBull) { const v = strong ? 15 : 10; score += v; reasons.push(`MACD bullish ${strong ? 'strong' : 'weak'} +${v}`); }
    else { const v = strong ? 15 : 10; score -= v; reasons.push(`MACD bearish ${strong ? 'strong' : 'weak'} -${v}`); }
    // 3. MACD Histogram Momentum ±10
    if (ind.macd.histogram > 0) { score += 10; reasons.push('Histogram bullish +10'); }
    else { score -= 10; reasons.push('Histogram bearish -10'); }
    // 4. RSI Zone ±15/−10/−20
    const r = ind.rsi;
    if (r > 70 || r < 30) { score -= 20; reasons.push(`RSI reversal risk ${r.toFixed(0)} -20`); }
    else if (r >= 55 && r <= 70) { score += 15; reasons.push(`RSI bullish zone ${r.toFixed(0)} +15`); }
    else if (r >= 30 && r <= 45) { score -= 15; reasons.push(`RSI bearish zone ${r.toFixed(0)} -15`); }
    else { score -= 10; reasons.push(`RSI neutral ${r.toFixed(0)} -10`); }
    // 5. Order Block ±20
    if (ind.orderBlocks && ind.currentPrice) {
        for (const ob of ind.orderBlocks.slice(-3)) {
            if (ind.currentPrice >= ob.low && ind.currentPrice <= ob.high) {
                const v = ob.type === 'bullish' ? 20 : -20;
                score += v; reasons.push(`${ob.type} OB reaction ${v > 0 ? '+' : ''}${v}`); break;
            }
        }
    }
    // 6. Volume Spike ±10
    if (ind.volSpike !== undefined) {
        const dir = (ind.momentum || 0) >= 0 ? 1 : -1;
        if (ind.volSpike > 1.5) { const v = 10 * dir; score += v; reasons.push(`Vol spike ${ind.volSpike.toFixed(1)}x ${v > 0 ? '+' : ''}${v}`); }
        else { const v = -5 * dir; score += v; reasons.push(`Low vol ${v > 0 ? '+' : ''}${v}`); }
    }
    // 7. ATR Volatility Filter −15%
    if (ind.atr && ind.currentPrice && ind.atr / ind.currentPrice < 0.001) {
        score = Math.round(score * 0.85); reasons.push('Low ATR -15%');
    }
    return { score: Math.round(score), reasons };
}

function makePrediction(tf) {
    const tfMin = TF_SEC[tf] / 60;
    const candles = tf === '1m' ? state.baseCandles : aggCandles(state.baseCandles, tfMin);
    if (candles.length < 26) return null;
    const ind = state.tfIndicators[tf] || computeInd(candles);
    const res = scoreIndicators(ind);
    if (!res) return null;
    const { score, reasons } = res;
    if (Math.abs(score) < SCORE_MIN) return null; // No-trade zone
    const direction = score > 0 ? 'UP' : 'DOWN';
    const maxScore = 90;
    const rawConf = Math.min(95, Math.round((Math.abs(score) / maxScore) * 100));
    const confidence = Math.max(50, rawConf);
    const threshold = state.ai.confidenceThreshold || THRESH_NORMAL;
    if (confidence < threshold) return null;
    // Track for bias
    state.recentPreds.push({ direction, confidence });
    if (state.recentPreds.length > 100) state.recentPreds.shift();
    return { tf, direction, confidence, score, reasons, price: ind.currentPrice, timestamp: Date.now() };
}

// ─── PREDICTIONS ISSUE ────────────────────────────────────────────────────────
function issuePredictions() {
    if (state.ai.status === 'DEAD') return;
    const now = Date.now();
    for (const tf of ALL_TFS) {
        const pred = makePrediction(tf);
        if (!pred) {
            if (!state.predictions[tf]) state.predictions[tf] = null;
            continue;
        }
        state.predictions[tf] = pred;
        const exists = state.pendingEvaluations.find(e => e.tf === tf);
        if (!exists) {
            const tfMin = TF_SEC[tf] / 60;
            state.pendingEvaluations.push({
                tf, prediction: pred.direction, confidence: pred.confidence,
                openPrice: pred.price, targetCloseTime: now + TF_SEC[tf] * 1000, issuedAt: now,
            });
        }
    }
    broadcast({ type: 'PREDICTIONS', data: state.predictions });
}

// ─── EVALUATE CANDLE PREDICTIONS ────────────────────────────────────────────
function evaluatePending() {
    const now = Date.now(); const price = state.indicators.currentPrice; if (!price) return;
    const toEval = state.pendingEvaluations.filter(e => now >= e.targetCloseTime);
    state.pendingEvaluations = state.pendingEvaluations.filter(e => now < e.targetCloseTime);
    for (const ev of toEval) {
        const actual = price > ev.openPrice ? 'UP' : 'DOWN';
        const correct = actual === ev.prediction;
        const entry = {
            id: `${now}-${ev.tf}`, timestamp: new Date(ev.issuedAt).toISOString(),
            evaluatedAt: new Date(now).toISOString(), tf: ev.tf,
            prediction: ev.prediction, actual, correct, confidence: ev.confidence,
            openPrice: ev.openPrice, closePrice: price,
            priceDiff: parseFloat((price - ev.openPrice).toFixed(2)),
        };
        state.history.unshift(entry); if (state.history.length > 200) state.history.pop();
        recordResult(correct, ev.prediction, ev.confidence, ev.tf);
        broadcast({ type: 'EVALUATION', data: entry });
        // Re-issue
        const np = makePrediction(ev.tf);
        if (np && state.ai.status !== 'DEAD') {
            state.predictions[ev.tf] = np;
            state.pendingEvaluations.push({
                tf: ev.tf, prediction: np.direction,
                confidence: np.confidence, openPrice: price,
                targetCloseTime: now + TF_SEC[ev.tf] * 1000, issuedAt: now
            });
            broadcast({ type: 'PREDICTIONS', data: state.predictions });
        }
    }
}

// ─── RECORD RESULT (SHARED BY CANDLE + SNAPSHOT) ─────────────────────────────
function recordResult(correct, direction, confidence, tf) {
    const ai = state.ai;
    if (correct) { ai.wins++; ai.streak = ai.streak >= 0 ? ai.streak + 1 : 1; ai.consecutiveLosses = 0; }
    else { ai.losses++; ai.streak = ai.streak <= 0 ? ai.streak - 1 : -1; ai.consecutiveLosses++; ai.lives = Math.max(0, ai.lives - 1); broadcast({ type: 'LIFE_LOST', data: { livesLeft: ai.lives } }); }
    ai.totalPredictions++;
    ai.accuracy = Math.round((ai.wins / ai.totalPredictions) * 100);
    ai.longestWinStreak = Math.max(ai.longestWinStreak, ai.streak > 0 ? ai.streak : 0);
    ai.longestLossStreak = Math.max(ai.longestLossStreak, -ai.streak > 0 ? -ai.streak : 0);
    // Rolling window
    state.rollingWindow.push(correct); if (state.rollingWindow.length > ROLLING_N) state.rollingWindow.shift();
    const rollingAcc = state.rollingWindow.length >= 10
        ? Math.round((state.rollingWindow.filter(Boolean).length / state.rollingWindow.length) * 100) : 100;
    ai.rolling50Accuracy = rollingAcc;
    // Adaptive threshold
    if (rollingAcc < 68) { ai.confidenceThreshold = THRESH_STRICT; ai.volatilityMode = 'CONSERVATIVE'; }
    else if (rollingAcc >= 72) { ai.confidenceThreshold = THRESH_NORMAL; ai.volatilityMode = 'AGGRESSIVE'; }
    // Bias
    const up = state.recentPreds.filter(p => p.direction === 'UP').length;
    const tot = state.recentPreds.length || 1;
    ai.upBias = Math.round((up / tot) * 100); ai.downBias = 100 - ai.upBias;
    ai.avgConfidence = state.recentPreds.length ? Math.round(state.recentPreds.reduce((s, p) => s + p.confidence, 0) / state.recentPreds.length) : 0;
    // Daily
    const d = state.dailyStats;
    d.total++; if (correct) d.wins++; else d.losses++;
    d.accuracy = Math.round((d.wins / d.total) * 100);
    if (d.byTF[tf]) { d.byTF[tf].t++; if (correct) d.byTF[tf].w++; }
    // Lifetime
    const lt = state.lifetimeStats;
    lt.totalPredictions++; if (correct) lt.totalWins++; else lt.totalLosses++;
    lt.lifetimeAccuracy = Math.round((lt.totalWins / lt.totalPredictions) * 100);
    lt.highestWinStreak = Math.max(lt.highestWinStreak, ai.longestWinStreak);
    checkSurvival();
}

// ─── SURVIVAL + GENERATION ────────────────────────────────────────────────────
function checkSurvival() {
    const ai = state.ai; const rolling = ai.rolling50Accuracy;
    let die = false, why = '';
    if (ai.lives <= 0) { die = true; why = 'NO_LIVES'; }
    else if (state.rollingWindow.length >= 20 && rolling < DEATH_ACC) { die = true; why = 'LOW_ACCURACY'; }
    else if (ai.consecutiveLosses >= 3) { die = true; why = '3_CONSECUTIVE_LOSSES'; }
    if (die) {
        ai.status = 'DEAD';
        archiveGen();
        broadcast({ type: 'AI_DIED', data: { generation: ai.generation, accuracy: ai.accuracy, reason: why } });
        setTimeout(resurrectAI, 5000);
        return;
    }
    if (state.rollingWindow.length >= 10 && rolling < DANGER_ACC) ai.status = 'DANGER';
    else if (ai.consecutiveLosses >= 2) ai.status = 'CRITICAL';
    else ai.status = 'ALIVE';
    broadcast({ type: 'AI_STATUS', data: ai });
    broadcast({ type: 'DAILY_STATS', data: state.dailyStats });
    broadcast({ type: 'LIFETIME_STATS', data: state.lifetimeStats });
}

function archiveGen() {
    const ai = state.ai; const now = Date.now();
    state.generations.push({
        id: ai.generation, startTimeIST: fmtIST(ai.startTime || now), endTimeIST: fmtIST(now),
        totalPredictions: ai.totalPredictions, wins: ai.wins, losses: ai.losses, accuracy: ai.accuracy,
        longestWinStreak: ai.longestWinStreak, longestLossStreak: ai.longestLossStreak,
        survivalMinutes: Math.round((now - (ai.startTime || now)) / 60000), status: 'DEAD',
    });
    const lt = state.lifetimeStats;
    lt.totalGenerations = state.ai.generation + 1;
    lt.bestGenAccuracy = Math.max(lt.bestGenAccuracy, ai.accuracy);
    lt.worstGenAccuracy = Math.min(lt.worstGenAccuracy, ai.accuracy);
    broadcast({ type: 'GENERATIONS', data: state.generations });
    persist();
}

function resurrectAI() {
    const newGen = state.ai.generation + 1;
    state.ai = freshAI(newGen);
    state.rollingWindow = [];
    state.pendingEvaluations = [];
    state.lifetimeStats.totalGenerations = newGen;
    broadcast({ type: 'AI_REVIVED', data: state.ai });
    broadcast({ type: 'AI_STATUS', data: state.ai });
    issuePredictions();
}

// ─── DAILY RESET CHECK ────────────────────────────────────────────────────────
function checkDailyReset() {
    const today = istDateStr();
    if (state.dailyStats.date !== today) {
        state.dailyStats = freshDaily();
        broadcast({ type: 'DAILY_STATS', data: state.dailyStats });
        persist();
        console.log('[IST] Daily stats reset for', today);
    }
}

// ─── CANDLE PROCESSING ────────────────────────────────────────────────────────
function processTick(price, qty, tradeTime) {
    state.price = price; state.lastTick = tradeTime;
    const bkt = Math.floor(tradeTime / (60 * 1000)) * 60;
    if (!state.currentCandle || state.currentCandle.time !== bkt) {
        if (state.currentCandle) {
            const last = state.baseCandles[state.baseCandles.length - 1];
            if (!last || last.time !== state.currentCandle.time) state.baseCandles.push({ ...state.currentCandle });
            if (state.baseCandles.length > 600) state.baseCandles.shift();
            computeAllTF();
            evaluatePending();
            issuePredictions();
            broadcast({ type: 'NEW_CANDLE', data: state.currentCandle });
            broadcast({ type: 'TF_INDICATORS', data: state.tfIndicators });
        }
        state.currentCandle = { time: bkt, open: price, high: price, low: price, close: price, volume: qty };
    } else {
        state.currentCandle.high = Math.max(state.currentCandle.high, price);
        state.currentCandle.low = Math.min(state.currentCandle.low, price);
        state.currentCandle.close = price;
        state.currentCandle.volume += qty;
    }
    broadcast({ type: 'TICK', data: { price, time: tradeTime, currentCandle: state.currentCandle } });
}

// ─── COINBASE ─────────────────────────────────────────────────────────────────
function fetchJSON(url) {
    return new Promise((res, rej) => {
        https.get(url, { headers: { 'User-Agent': 'BTC-Arena/2.0' } }, (r) => {
            let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } });
        }).on('error', rej);
    });
}

async function loadHistory() {
    try {
        const end = Math.floor(Date.now() / 1000), start = end - 300 * 60;
        const url = `https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD/candles?start=${start}&end=${end}&granularity=ONE_MINUTE`;
        const data = await fetchJSON(url);
        if (data?.candles?.length > 0) {
            const seen = new Map();
            for (const k of [...data.candles].reverse()) {
                const t = parseInt(k.start, 10);
                if (!seen.has(t)) seen.set(t, { time: t, open: parseFloat(k.open), high: parseFloat(k.high), low: parseFloat(k.low), close: parseFloat(k.close), volume: parseFloat(k.volume) });
            }
            state.baseCandles = [...seen.values()].sort((a, b) => a.time - b.time);
            console.log(`[BOOT] Coinbase: ${state.baseCandles.length} candles`);
            state.dataReady = true; computeAllTF(); issuePredictions(); return;
        }
        throw new Error('empty');
    } catch (e) {
        console.error('[BOOT] Coinbase failed:', e.message, '. Trying Binance...');
        try {
            const raw = await fetchJSON('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=300');
            const seen = new Map();
            for (const k of raw) { const t = Math.floor(k[0] / 1000); if (!seen.has(t)) seen.set(t, { time: t, open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) }); }
            state.baseCandles = [...seen.values()].sort((a, b) => a.time - b.time);
            console.log(`[BOOT] Binance fallback: ${state.baseCandles.length} candles`);
            state.dataReady = true; computeAllTF(); issuePredictions();
        } catch (e2) { console.error('[BOOT] Both failed:', e2.message); setTimeout(loadHistory, 5000); }
    }
}

let cbWs = null;
function connectCoinbase() {
    if (cbWs) try { cbWs.terminate() } catch (_) { }
    cbWs = new WebSocket(COINBASE_WS);
    cbWs.on('open', () => {
        cbWs.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channel: 'ticker' }));
        state.connected = true; broadcast({ type: 'CONNECTION', data: { connected: true } });
        console.log('[WS] Coinbase connected');
    });
    cbWs.on('message', raw => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.channel !== 'ticker' || !msg.events) return;
            for (const ev of msg.events) for (const t of (ev.tickers || [])) {
                if (t.product_id !== 'BTC-USD') continue;
                const p = parseFloat(t.price); if (isNaN(p) || p <= 0) continue;
                processTick(p, parseFloat(t.last_size || '0'), t.time ? new Date(t.time).getTime() : Date.now());
            }
        } catch (_) { }
    });
    cbWs.on('close', () => { state.connected = false; broadcast({ type: 'CONNECTION', data: { connected: false } }); setTimeout(connectCoinbase, 3000); });
    cbWs.on('error', () => cbWs.close());
}

// ─── IST SNAPSHOT ENGINE ──────────────────────────────────────────────────────
const TF_MS = { '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000 };

function istBoundaries(ist) {
    const s = ist.getUTCSeconds(), m = ist.getUTCMinutes();
    if (s !== 0) return [];
    const fire = []; if (m % 5 === 0) fire.push('5m'); if (m % 15 === 0) fire.push('15m');
    if (m % 30 === 0) fire.push('30m'); if (m === 0) fire.push('1h');
    return fire;
}

function createSnapshot(tf) {
    if (!state.price || !state.dataReady || state.ai.status === 'DEAD') return;
    const now = Date.now();
    const epochMin = Math.floor((now + IST_MS) / 60000);
    const key = `${tf}:${epochMin}`;
    if (state.snapshotFiredKeys.has(key)) return;
    state.snapshotFiredKeys.add(key);
    if (state.snapshotFiredKeys.size > 300) state.snapshotFiredKeys = new Set([...state.snapshotFiredKeys].slice(-150));
    const pred = makePrediction(tf); if (!pred) return;
    const snap = {
        id: `snap-${tf}-${now}`, snapshotTimeIST: fmtIST(now), evaluationTimeIST: fmtIST(now + TF_MS[tf]),
        timeframe: tf, snapshotPrice: state.price, predictedDirection: pred.direction,
        confidence: pred.confidence, score: pred.score, reasons: pred.reasons,
        lockedAt: now, evaluationTimestamp: now + TF_MS[tf],
        evaluatedPrice: null, actualDirection: null, result: 'PENDING',
    };
    state.snapshots.unshift(snap); if (state.snapshots.length > 200) state.snapshots.pop();
    console.log(`[IST] Snapshot ${tf} | ${pred.direction} ${pred.confidence}% | $${state.price.toFixed(2)}`);
    broadcast({ type: 'SNAPSHOT_CREATED', data: snap });
    broadcast({ type: 'SNAPSHOTS_UPDATE', data: state.snapshots.slice(0, 50) });
}

function evalSnapshots() {
    if (!state.price) return; const now = Date.now(); let changed = false;
    for (const s of state.snapshots) {
        if (s.result !== 'PENDING' || now < s.evaluationTimestamp) continue;
        if (!state.lastTick || now - state.lastTick > 10000) continue;
        const diff = state.price - s.snapshotPrice;
        s.actualDirection = Math.abs(diff) < 0.01 ? 'NEUTRAL' : diff > 0 ? 'UP' : 'DOWN';
        s.evaluatedPrice = state.price;
        s.result = s.actualDirection === 'NEUTRAL' ? 'DRAW' : s.actualDirection === s.predictedDirection ? 'WIN' : 'LOSS';
        console.log(`[IST] Eval ${s.timeframe}: ${s.predictedDirection}→${s.actualDirection} | ${s.result} | Δ$${diff.toFixed(2)}`);
        if (s.result !== 'DRAW') recordResult(s.result === 'WIN', s.predictedDirection, s.confidence, s.timeframe);
        // Track daily snap
        state.dailyStats.snapshots = state.dailyStats.snapshots || { total: 0, wins: 0 };
        state.dailyStats.snapshots.total++;
        if (s.result === 'WIN') { state.dailyStats.snapshots.wins++; state.lifetimeStats.snapWins++; }
        else if (s.result === 'LOSS') state.lifetimeStats.snapLosses++;
        broadcast({ type: 'SNAPSHOT_EVALUATED', data: s }); changed = true;
    }
    if (changed) { broadcast({ type: 'SNAPSHOTS_UPDATE', data: state.snapshots.slice(0, 50) }); persist(); }
}

// ─── WEBSOCKET SERVER ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ port: PORT }, () => console.log(`[SERVER] ws://localhost:${PORT}`));
wss.on('connection', ws => {
    clients.add(ws);
    ws.send(JSON.stringify({
        type: 'INIT', data: {
            baseCandles: state.baseCandles.slice(-300), tfIndicators: state.tfIndicators,
            indicators: state.indicators, predictions: state.predictions,
            ai: state.ai, history: state.history, snapshots: state.snapshots.slice(0, 50),
            generations: state.generations, dailyStats: state.dailyStats,
            lifetimeStats: state.lifetimeStats, connected: state.connected, price: state.price,
        }
    }));
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
});

function broadcast(msg) {
    const d = JSON.stringify(msg);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(d);
}

// ─── SCHEDULERS ──────────────────────────────────────────────────────────────
loadPersisted();
loadHistory().then(() => connectCoinbase());

// IST scheduler: every second
let lastSec = -1;
setInterval(() => {
    const ist = getIST(); const s = ist.getUTCSeconds();
    if (s === lastSec) return; lastSec = s;
    for (const tf of istBoundaries(ist)) createSnapshot(tf);
    evalSnapshots();
    checkDailyReset();
    if (s % 10 === 0) broadcast({ type: 'SNAPSHOTS_UPDATE', data: state.snapshots.slice(0, 50) });
}, 1000);

// IST clock broadcast: every second
setInterval(() => {
    const ist = getIST();
    broadcast({ type: 'IST_TICK', data: { istIso: ist.toISOString(), istHour: ist.getUTCHours(), istMinute: ist.getUTCMinutes(), istSecond: ist.getUTCSeconds() } });
}, 1000);

// Status heartbeat: every 5s
setInterval(() => {
    broadcast({ type: 'AI_STATUS', data: state.ai });
    broadcast({ type: 'DAILY_STATS', data: state.dailyStats });
    broadcast({ type: 'LIFETIME_STATS', data: state.lifetimeStats });
    if (state.price) broadcast({ type: 'PRICE', data: { price: state.price, time: state.lastTick } });
}, 5000);

// Indicator refresh: every 30s
setInterval(() => {
    if (state.baseCandles.length > 50) { computeAllTF(); broadcast({ type: 'TF_INDICATORS', data: state.tfIndicators }); }
}, 30000);

// Persist: every 30s
setInterval(persist, 30000);

console.log('[SERVER] BTC Prediction Arena v2.0 starting...');
