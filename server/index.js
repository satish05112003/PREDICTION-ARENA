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
    recentPreds: [], latestML: null,
    aiLIVE: freshAI(1), aiSNAP: freshAI(1),
    generationsLIVE: [], generationsSNAP: [],
    dailyStatsLIVE: freshDaily(), dailyStatsSNAP: freshDaily(),
    lifetimeStatsLIVE: freshLifetime(), lifetimeStatsSNAP: freshLifetime(),
    rollingWindowLIVE: [], rollingWindowSNAP: [],
    connected: false, dataReady: false,
    mlWeights: {
        s_MACD: 0.1, s_RSI: 0.1, s_EMA: 0.1, s_OB: 0.15, s_VP: 0.1, s_VWAP: 0.15,
        s_VOL: 0.1, s_MS: 0.1, s_H: 0.05, s_OI: 0.0, s_FR: 0.0, bias: 0
    }
};
const clients = new Set();

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
function persist() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            generationsLIVE: state.generationsLIVE, generationsSNAP: state.generationsSNAP,
            lifetimeStatsLIVE: state.lifetimeStatsLIVE, lifetimeStatsSNAP: state.lifetimeStatsSNAP,
            dailyStatsLIVE: state.dailyStatsLIVE, dailyStatsSNAP: state.dailyStatsSNAP,
            snapshots: state.snapshots.slice(0, 200),
            history: state.history.slice(0, 500),
            snapshotFiredKeys: [...state.snapshotFiredKeys].slice(-300),
            aiLIVE: {
                generation: state.aiLIVE.generation, startTime: state.aiLIVE.startTime,
                longestWinStreak: state.aiLIVE.longestWinStreak, longestLossStreak: state.aiLIVE.longestLossStreak
            },
            aiSNAP: {
                generation: state.aiSNAP.generation, startTime: state.aiSNAP.startTime,
                longestWinStreak: state.aiSNAP.longestWinStreak, longestLossStreak: state.aiSNAP.longestLossStreak
            },
            mlWeights: state.mlWeights,
        }, null, 2));
    } catch (e) { console.error('[PERSIST] write fail:', e.message); }
}
function loadPersisted() {
    try {
        if (!fs.existsSync(DATA_FILE)) return;
        const s = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (s.generationsLIVE) { state.generationsLIVE = s.generationsLIVE; state.generationsSNAP = s.generationsSNAP || JSON.parse(JSON.stringify(s.generationsLIVE)); }
        else if (s.generations) { state.generationsLIVE = s.generations; state.generationsSNAP = JSON.parse(JSON.stringify(s.generations)); }

        if (s.lifetimeStatsLIVE) { state.lifetimeStatsLIVE = { ...freshLifetime(), ...s.lifetimeStatsLIVE }; state.lifetimeStatsSNAP = { ...freshLifetime(), ...(s.lifetimeStatsSNAP || s.lifetimeStatsLIVE) }; }
        else if (s.lifetimeStats) { state.lifetimeStatsLIVE = { ...freshLifetime(), ...s.lifetimeStats }; state.lifetimeStatsSNAP = { ...freshLifetime(), ...s.lifetimeStats }; }

        if (s.snapshots) state.snapshots = s.snapshots;
        if (s.history) state.history = s.history.slice(0, 500);
        if (s.latestML) state.latestML = s.latestML;
        if (s.snapshotFiredKeys) state.snapshotFiredKeys = new Set(s.snapshotFiredKeys);

        if (s.dailyStatsLIVE && s.dailyStatsLIVE.date === istDateStr()) { state.dailyStatsLIVE = s.dailyStatsLIVE; state.dailyStatsSNAP = s.dailyStatsSNAP || JSON.parse(JSON.stringify(s.dailyStatsLIVE)); }
        else if (s.dailyStats && s.dailyStats.date === istDateStr()) { state.dailyStatsLIVE = s.dailyStats; state.dailyStatsSNAP = JSON.parse(JSON.stringify(s.dailyStats)); }

        if (s.mlWeights) state.mlWeights = s.mlWeights;

        const loadAI = (from, to) => {
            if (!from) return;
            to.generation = from.generation || 1;
            to.startTime = from.startTime || Date.now();
            to.longestWinStreak = from.longestWinStreak || 0;
            to.longestLossStreak = from.longestLossStreak || 0;
        };
        loadAI(s.aiLIVE || s.ai, state.aiLIVE);
        loadAI(s.aiSNAP || s.ai, state.aiSNAP);

        state.lifetimeStatsLIVE.totalGenerations = Math.max(state.aiLIVE.generation, state.generationsLIVE.length + 1);
        state.lifetimeStatsSNAP.totalGenerations = Math.max(state.aiSNAP.generation, state.generationsSNAP.length + 1);
        console.log(`[PERSIST] Gen LIVE:${state.aiLIVE.generation} SNAP:${state.aiSNAP.generation} | ${state.snapshots.length} snaps | ${state.history.length} history`);
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

// ─── QUANT V5 HELPERS ────────────────────────────────────────────────────────
function calcPOC(candles) {
    if (!candles.length) return 0;
    const bins = new Map(), binSize = candles[candles.length - 1].close * 0.001;
    for (const c of candles) { const b = Math.floor(c.close / binSize) * binSize; bins.set(b, (bins.get(b) || 0) + c.volume); }
    let maxV = 0, poc = candles[candles.length - 1].close;
    for (const [p, v] of bins.entries()) if (v > maxV) { maxV = v; poc = p; }
    return poc;
}
function calcVWAP(candles) {
    let sumPV = 0, sumV = 0;
    for (const c of candles) { const typ = (c.high + c.low + c.close) / 3; sumPV += typ * c.volume; sumV += c.volume; }
    return sumV === 0 ? candles[candles.length - 1].close : sumPV / sumV;
}
function calcHurst(closes) {
    if (closes.length < 20) return 0.5;
    const n = closes.length, mean = closes.reduce((a, b) => a + b, 0) / n, devs = closes.map(c => c - mean);
    let maxZ = -Infinity, minZ = Infinity, run = 0;
    for (const d of devs) { run += d; if (run > maxZ) maxZ = run; if (run < minZ) minZ = run; }
    const R = maxZ - minZ, S = Math.sqrt(devs.reduce((a, b) => a + b * b, 0) / n) || 1, H = Math.log(R / S) / Math.log(n);
    return isNaN(H) ? 0.5 : Math.max(0, Math.min(1, H));
}
function calcBOS(candles, currentPrice, atr) {
    if (candles.length < 10) return 0;
    const highs = candles.map(c => c.high), lows = candles.map(c => c.low);
    const swingHigh = Math.max(...highs.slice(-10, -1)), swingLow = Math.min(...lows.slice(-10, -1));
    let bos = 0; if (currentPrice > swingHigh) bos = 1; else if (currentPrice < swingLow) bos = -1;
    const ret = Math.abs(currentPrice - candles[candles.length - 2].close);
    return bos * Math.min(1, ret / (atr || 1));
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
    const currentPrice = closes[closes.length - 1];

    // QUANT V5 NORMALIZED VECTORS
    // 1. Order Book (Aggression via close/open)
    let bidVol = 0, askVol = 0;
    for (const c of candles.slice(-5)) { if (c.close > c.open) bidVol += c.volume; else askVol += c.volume; }
    const obImbalance = (bidVol + askVol) === 0 ? 0 : (bidVol - askVol) / (bidVol + askVol);
    const s_OB = Math.max(-1, Math.min(1, obImbalance));

    // 2. Volume Profile POC
    const poc = calcPOC(candles);
    const s_VP = atr ? Math.tanh((currentPrice - poc) / atr) : 0;

    // 3. VWAP
    const vwap = calcVWAP(candles);
    const s_VWAP = atr ? Math.tanh((currentPrice - vwap) / atr) : 0;

    // 4. Volatility VR
    const atrHist = [];
    for (let i = Math.max(1, candles.length - 50); i <= candles.length; i++) atrHist.push(calcATR(candles.slice(0, i), 14) || 1);
    const smaATR = atrHist.reduce((a, b) => a + b, 0) / (atrHist.length || 1);
    const s_VOL = Math.tanh((atr / smaATR) - 1);

    // 5. Market Structure
    const s_MS = calcBOS(candles, currentPrice, atr);

    // 6. Hurst Exponent
    const hurst = calcHurst(closes.slice(-30));
    const s_H = Math.max(-1, Math.min(1, 2 * (hurst - 0.5)));

    // Classic features normalized
    const s_MACD = macdData && atr ? Math.tanh((macdData.macdLine - macdData.signalLine) / atr) : 0;
    const s_RSI = rsi14 ? Math.tanh((rsi14 - 50) / 20) : 0;
    const s_EMA = ema50 && ema200 && atr ? Math.tanh((ema50[ema50.length - 1] - ema200[ema200.length - 1]) / atr) : 0;

    // 7. Funding / OI (Spot approximations)
    const s_OI = 0, s_FR = 0;

    const S = { s_MACD, s_RSI, s_EMA, s_OB, s_VP, s_VWAP, s_VOL, s_MS, s_H, s_OI, s_FR };

    // Sparklines for UI
    const rsiHist = [];
    for (let i = Math.max(15, closes.length - 35); i < closes.length; i++) { const v = calcRSI(closes.slice(0, i + 1), 14); if (v !== null) rsiHist.push(v); }
    const momHist = [];
    for (let i = 5; i < closes.length && momHist.length < 30; i++) { momHist.push(((closes[i] - closes[i - 5]) / closes[i - 5]) * 100); }

    return {
        S, // Return the ML vector
        rsi: rsi14, rsiHistory: rsiHist.slice(-30),
        macd: macdData, ema50: ema50[ema50.length - 1] || null, ema200: ema200[ema200.length - 1] || null,
        volSpike, volHistory: vols.slice(-30), momentum, momentumHistory: momHist,
        atr, orderBlocks, currentPrice, timestamp: Date.now(),
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

// ─── UNIFIED ML PREDICTION ENGINE (LOGISTIC REGRESSION) ──────────────────────
function makePrediction(tf, mode = 'LIVE') {
    const tfMin = TF_SEC[tf] / 60;
    const candles = tf === '1m' ? state.baseCandles : aggCandles(state.baseCandles, tfMin);
    if (candles.length < 26) return null;
    const ind = state.tfIndicators[tf] || computeInd(candles);
    if (!ind.S) return null;

    const w = state.mlWeights;
    const S = ind.S;

    // Linear combination (logistic regression)
    const z = w.s_MACD * S.s_MACD + w.s_RSI * S.s_RSI + w.s_EMA * S.s_EMA +
        w.s_OB * S.s_OB + w.s_VP * S.s_VP + w.s_VWAP * S.s_VWAP +
        w.s_VOL * S.s_VOL + w.s_MS * S.s_MS + w.s_H * S.s_H +
        w.s_OI * S.s_OI + w.s_FR * S.s_FR + w.bias;

    // Sigmoid probability
    const P_up = 1 / (1 + Math.exp(-z));
    const ai = mode === 'LIVE' ? state.aiLIVE : state.aiSNAP;

    // Threshold calculation (Expected Accuracy Opt)
    const p_est = Math.max(P_up, 1 - P_up);
    let theta = (ai.confidenceThreshold || 55) / 100;

    // Ruin control
    if (ai.rolling50Accuracy < 68 && theta < 0.65) theta = 0.65;

    // Skip trade if probability is basically random
    if (p_est < theta) return null;

    const direction = P_up >= 0.5 ? 'UP' : 'DOWN';
    const confidence = Math.round(p_est * 100);
    const score = Math.round(z * 10); // Extrapolated UI score

    const pred = {
        tf, direction, confidence, score,
        reasons: [`Logistic P(UP): ${(P_up * 100).toFixed(1)}%`, 'VWAP/Profile/OrderFlow Active', `Hurst: ${S.s_H > 0 ? 'Trending' : 'Mean-Reverting'}`],
        price: ind.currentPrice, timestamp: Date.now(),
        S, P_up // stored for gradient descent
    };

    state.recentPreds.push({ direction, confidence });
    if (state.recentPreds.length > 100) state.recentPreds.shift();
    return pred;
}

// ─── PREDICTIONS ISSUE ────────────────────────────────────────────────────────
function issuePredictions() {
    const now = Date.now();
    for (const tf of ALL_TFS) {
        if (state.aiLIVE.status === 'DEAD') {
            state.predictions[tf] = null;
            continue;
        }
        const pred = makePrediction(tf, 'LIVE');
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
                S: pred.S, P_up: pred.P_up // stored for SGD evaluation
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
        recordResult('LIVE', correct, ev.prediction, ev.confidence, ev.tf);

        // --- QUANT V5 LOGISTIC SGD UPDATE ---
        if (ev.P_up !== undefined && ev.S) {
            const y = actual === 'UP' ? 1 : 0;
            const error = ev.P_up - y;
            const eta = state.aiLIVE.rolling50Accuracy < 65 ? 0.005 : 0.01; // adaptive lr
            for (const key of Object.keys(ev.S)) {
                if (state.mlWeights[key] !== undefined) {
                    state.mlWeights[key] -= eta * error * ev.S[key];
                }
            }
            state.mlWeights.bias -= eta * error;
        }

        broadcast({ type: 'EVALUATION', data: entry });
        // Re-issue
        const np = makePrediction(ev.tf, 'LIVE');
        if (np && state.aiLIVE.status !== 'DEAD') {
            state.predictions[ev.tf] = np;
            state.pendingEvaluations.push({
                tf: ev.tf, prediction: np.direction,
                confidence: np.confidence, openPrice: price,
                targetCloseTime: now + TF_SEC[ev.tf] * 1000, issuedAt: now,
                S: np.S, P_up: np.P_up
            });
            broadcast({ type: 'PREDICTIONS', data: state.predictions });
        }
    }
}

// ─── RECORD RESULT (SHARED BY CANDLE + SNAPSHOT) ─────────────────────────────
function recordResult(mode, correct, direction, confidence, tf) {
    const ai = mode === 'LIVE' ? state.aiLIVE : state.aiSNAP;
    const rollingWindow = mode === 'LIVE' ? state.rollingWindowLIVE : state.rollingWindowSNAP;
    const d = mode === 'LIVE' ? state.dailyStatsLIVE : state.dailyStatsSNAP;
    const lt = mode === 'LIVE' ? state.lifetimeStatsLIVE : state.lifetimeStatsSNAP;

    if (correct) { ai.wins++; ai.streak = ai.streak >= 0 ? ai.streak + 1 : 1; ai.consecutiveLosses = 0; }
    else { ai.losses++; ai.streak = ai.streak <= 0 ? ai.streak - 1 : -1; ai.consecutiveLosses++; ai.lives = Math.max(0, ai.lives - 1); broadcast({ type: 'LIFE_LOST', data: { mode, livesLeft: ai.lives } }); }
    ai.totalPredictions++;
    ai.accuracy = Math.round((ai.wins / ai.totalPredictions) * 100);
    ai.longestWinStreak = Math.max(ai.longestWinStreak, ai.streak > 0 ? ai.streak : 0);
    ai.longestLossStreak = Math.max(ai.longestLossStreak, -ai.streak > 0 ? -ai.streak : 0);
    // Rolling window
    rollingWindow.push(correct); if (rollingWindow.length > ROLLING_N) rollingWindow.shift();
    const rollingAcc = rollingWindow.length >= 10
        ? Math.round((rollingWindow.filter(Boolean).length / rollingWindow.length) * 100) : 100;
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
    d.total++; if (correct) d.wins++; else d.losses++;
    d.accuracy = Math.round((d.wins / d.total) * 100);
    if (d.byTF[tf]) { d.byTF[tf].t++; if (correct) d.byTF[tf].w++; }
    // Lifetime
    lt.totalPredictions++; if (correct) lt.totalWins++; else lt.totalLosses++;
    lt.lifetimeAccuracy = Math.round((lt.totalWins / lt.totalPredictions) * 100);
    lt.highestWinStreak = Math.max(lt.highestWinStreak, ai.longestWinStreak);
    checkSurvival(mode);
}

// ─── SURVIVAL + GENERATION ────────────────────────────────────────────────────
function checkSurvival(mode) {
    const ai = mode === 'LIVE' ? state.aiLIVE : state.aiSNAP;
    const rollingWindow = mode === 'LIVE' ? state.rollingWindowLIVE : state.rollingWindowSNAP;
    const rolling = ai.rolling50Accuracy;
    let die = false, why = '';
    if (ai.lives <= 0) { die = true; why = 'NO_LIVES'; }
    else if (rollingWindow.length >= 20 && rolling < DEATH_ACC) { die = true; why = 'LOW_ACCURACY'; }
    else if (ai.consecutiveLosses >= 3) { die = true; why = '3_CONSECUTIVE_LOSSES'; }
    if (die) {
        ai.status = 'DEAD';
        archiveGen(mode);
        broadcast({ type: 'AI_DIED', data: { mode, generation: ai.generation, accuracy: ai.accuracy, reason: why } });
        setTimeout(() => resurrectAI(mode), 5000);
        return;
    }
    if (rollingWindow.length >= 10 && rolling < DANGER_ACC) ai.status = 'DANGER';
    else if (ai.consecutiveLosses >= 2) ai.status = 'CRITICAL';
    else ai.status = 'ALIVE';
    broadcast({ type: 'AI_STATUS', data: { live: state.aiLIVE, snap: state.aiSNAP } });
    broadcast({ type: 'DAILY_STATS', data: { live: state.dailyStatsLIVE, snap: state.dailyStatsSNAP } });
    broadcast({ type: 'LIFETIME_STATS', data: { live: state.lifetimeStatsLIVE, snap: state.lifetimeStatsSNAP } });
}

function archiveGen(mode) {
    const ai = mode === 'LIVE' ? state.aiLIVE : state.aiSNAP;
    const lt = mode === 'LIVE' ? state.lifetimeStatsLIVE : state.lifetimeStatsSNAP;
    const generations = mode === 'LIVE' ? state.generationsLIVE : state.generationsSNAP;
    const now = Date.now();
    generations.push({
        id: ai.generation, startTimeIST: fmtIST(ai.startTime || now), endTimeIST: fmtIST(now),
        totalPredictions: ai.totalPredictions, wins: ai.wins, losses: ai.losses, accuracy: ai.accuracy,
        longestWinStreak: ai.longestWinStreak, longestLossStreak: ai.longestLossStreak,
        survivalMinutes: Math.round((now - (ai.startTime || now)) / 60000), status: 'DEAD',
    });
    lt.totalGenerations = ai.generation + 1;
    lt.bestGenAccuracy = Math.max(lt.bestGenAccuracy, ai.accuracy);
    lt.worstGenAccuracy = Math.min(lt.worstGenAccuracy, ai.accuracy);
    broadcast({ type: 'GENERATIONS', data: { live: state.generationsLIVE, snap: state.generationsSNAP } });
    persist();
}

function resurrectAI(mode) {
    if (mode === 'LIVE') {
        const newGen = state.aiLIVE.generation + 1;
        state.aiLIVE = freshAI(newGen);
        state.rollingWindowLIVE = [];
        state.pendingEvaluations = [];
        state.lifetimeStatsLIVE.totalGenerations = newGen;
    } else {
        const newGen = state.aiSNAP.generation + 1;
        state.aiSNAP = freshAI(newGen);
        state.rollingWindowSNAP = [];
        state.lifetimeStatsSNAP.totalGenerations = newGen;
    }
    broadcast({ type: 'AI_REVIVED', data: { live: state.aiLIVE, snap: state.aiSNAP } });
    broadcast({ type: 'AI_STATUS', data: { live: state.aiLIVE, snap: state.aiSNAP } });
    if (mode === 'LIVE') issuePredictions();
}

// ─── DAILY RESET CHECK ────────────────────────────────────────────────────────
function checkDailyReset() {
    const today = istDateStr();
    if (state.dailyStatsLIVE.date !== today) {
        state.dailyStatsLIVE = freshDaily();
        state.dailyStatsSNAP = freshDaily();
        broadcast({ type: 'DAILY_STATS', data: { live: state.dailyStatsLIVE, snap: state.dailyStatsSNAP } });
        persist();
        console.log('[IST] Daily stats reset for', today);
    }
}

// ─── CANDLE PROCESSING ────────────────────────────────────────────────────────
let lastTickBroadcast = 0;
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
    // Broadcast tick immediately (throttled to max 10/sec to prevent flooding)
    const now = Date.now();
    if (now - lastTickBroadcast >= 100) {
        lastTickBroadcast = now;
        broadcast({ type: 'TICK', data: { price, time: tradeTime, currentCandle: state.currentCandle } });
    }
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
    if (!state.price || !state.dataReady || state.aiSNAP.status === 'DEAD') return;
    const now = Date.now();
    const epochMin = Math.floor((now + IST_MS) / 60000);
    const key = `${tf}:${epochMin}`;
    if (state.snapshotFiredKeys.has(key)) return;
    state.snapshotFiredKeys.add(key);
    if (state.snapshotFiredKeys.size > 300) state.snapshotFiredKeys = new Set([...state.snapshotFiredKeys].slice(-150));
    const pred = makePrediction(tf, 'SNAP'); if (!pred) return;
    const snap = {
        id: `snap-${tf}-${now}`, snapshotTimeIST: fmtIST(now), evaluationTimeIST: fmtIST(now + TF_MS[tf]),
        timeframe: tf, snapshotPrice: state.price, predictedDirection: pred.direction,
        confidence: pred.confidence, score: pred.score, reasons: pred.reasons,
        lockedAt: now, evaluationTimestamp: now + TF_MS[tf],
        evaluatedPrice: null, actualDirection: null, result: 'PENDING',
        S: pred.S, P_up: pred.P_up // Stored for SGD evaluation
    };
    state.snapshots.unshift(snap); if (state.snapshots.length > 200) state.snapshots.pop();
    console.log(`[IST] Snapshot ${tf} | ${pred.direction} ${pred.confidence}% | $${state.price.toFixed(2)}`);

    // --- PYTHON ML INTEGRATION ---
    if (tf === '5m') {
        fetch('http://127.0.0.1:5000/snapshot', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: snap.id, timestamp: snap.snapshotTimeIST, price: state.price, indicators: pred.S })
        }).then(r => r.json()).then(data => {
            if (data && data.prediction) {
                state.latestML = data.prediction;
                broadcast({ type: 'ML_PREDICTION', data: data.prediction });
            }
        }).catch(err => console.error('[ML] Snapshot POST error:', err.message));
    }

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

        // Update Snapshot ML Loss (Gradient Descent)
        if (s.result !== 'DRAW' && s.P_up !== undefined && s.S) {
            const y = s.actualDirection === 'UP' ? 1 : 0;
            const error = s.P_up - y;
            const eta = state.aiSNAP.rolling50Accuracy < 65 ? 0.005 : 0.01;
            for (const key of Object.keys(s.S)) {
                if (state.mlWeights[key] !== undefined) state.mlWeights[key] -= eta * error * s.S[key];
            }
            state.mlWeights.bias -= eta * error;
        }

        if (s.result !== 'DRAW') recordResult('SNAP', s.result === 'WIN', s.predictedDirection, s.confidence, s.timeframe);
        // Track daily snap
        state.dailyStatsSNAP.snapshots = state.dailyStatsSNAP.snapshots || { total: 0, wins: 0 };
        state.dailyStatsSNAP.snapshots.total++;
        if (s.result === 'WIN') { state.dailyStatsSNAP.snapshots.wins++; state.lifetimeStatsSNAP.snapWins++; }
        else if (s.result === 'LOSS') state.lifetimeStatsSNAP.snapLosses++;
        broadcast({ type: 'SNAPSHOT_EVALUATED', data: s }); changed = true;

        // --- PYTHON ML INTEGRATION RESOLVE ---
        if (s.timeframe === '5m' && s.result !== 'DRAW') {
            const isLatest = state.latestML && state.latestML.id === s.id;
            fetch('http://127.0.0.1:5000/resolve', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: s.id, close_price: state.price, ml_prediction: isLatest ? state.latestML.prediction : null, ml_confidence: isLatest ? state.latestML.confidence : null, timestamp: fmtIST(Date.now()), snapshot_price: s.snapshotPrice })
            }).catch(err => console.error('[ML] Resolve error:', err.message));
        }
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
            ai: { live: state.aiLIVE, snap: state.aiSNAP }, history: state.history.slice(0, 200),
            snapshots: state.snapshots.slice(0, 50),
            generations: { live: state.generationsLIVE, snap: state.generationsSNAP },
            dailyStats: { live: state.dailyStatsLIVE, snap: state.dailyStatsSNAP },
            lifetimeStats: { live: state.lifetimeStatsLIVE, snap: state.lifetimeStatsSNAP },
            connected: state.connected, price: state.price, latestML: state.latestML
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
    broadcast({ type: 'AI_STATUS', data: { live: state.aiLIVE, snap: state.aiSNAP } });
    broadcast({ type: 'DAILY_STATS', data: { live: state.dailyStatsLIVE, snap: state.dailyStatsSNAP } });
    broadcast({ type: 'LIFETIME_STATS', data: { live: state.lifetimeStatsLIVE, snap: state.lifetimeStatsSNAP } });
    if (state.price) broadcast({ type: 'PRICE', data: { price: state.price, time: state.lastTick } });
}, 5000);

// Indicator refresh: every 1s
setInterval(() => {
    if (state.baseCandles.length > 50) { computeAllTF(); broadcast({ type: 'TF_INDICATORS', data: state.tfIndicators }); }
}, 1000);

// Persist: every 30s
setInterval(persist, 30000);

console.log('[SERVER] BTC Prediction Arena v2.0 starting...');
