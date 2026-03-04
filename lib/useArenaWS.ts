'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSMessage, AIState, DualAIState, DualDailyStats, DualLifetimeStats, DualGenerations, PredictionLog, Indicators, Prediction, Candle, SnapshotRecord, ISTTick, GenerationRecord, DailyStats, LifetimeStats } from '@/lib/types';

const DEFAULT_AI: AIState = {
    generation: 1, lives: 3, accuracy: 100, wins: 0, losses: 0, streak: 0, consecutiveLosses: 0,
    totalPredictions: 0, status: 'ALIVE', confidenceThreshold: 55, volatilityMode: 'AGGRESSIVE',
    rolling50Accuracy: 100, avgConfidence: 0, upBias: 50, downBias: 50,
    longestWinStreak: 0, longestLossStreak: 0,
};
const DEFAULT_DAILY: DailyStats = {
    date: '', total: 0, wins: 0, losses: 0, accuracy: 0, streak: 0,
    longestWinStreak: 0, longestLossStreak: 0,
    byTF: { '5m': { t: 0, w: 0 }, '15m': { t: 0, w: 0 }, '30m': { t: 0, w: 0 }, '1h': { t: 0, w: 0 } },
};
const DEFAULT_LIFETIME: LifetimeStats = {
    totalPredictions: 0, totalWins: 0, totalLosses: 0, lifetimeAccuracy: 0,
    bestGenAccuracy: 0, worstGenAccuracy: 100, highestWinStreak: 0,
    totalGenerations: 1, snapWins: 0, snapLosses: 0,
};

const DUAL_AI = { live: DEFAULT_AI, snap: DEFAULT_AI };
const DUAL_DAILY = { live: DEFAULT_DAILY, snap: DEFAULT_DAILY };
const DUAL_LIFETIME = { live: DEFAULT_LIFETIME, snap: DEFAULT_LIFETIME };
const DUAL_GENS = { live: [], snap: [] };

// Client-side candle aggregation for chart TF display
export function aggCandles(c1m: Candle[], mins: number): Candle[] {
    if (mins <= 1) return c1m;
    const ps = mins * 60;
    const g = new Map<number, Candle[]>();
    for (const c of c1m) {
        const b = Math.floor(c.time / ps) * ps;
        if (!g.has(b)) g.set(b, []);
        g.get(b)!.push(c);
    }
    return [...g.entries()].map(([t, cs]) => ({
        time: t, open: cs[0].open,
        high: Math.max(...cs.map(c => c.high)),
        low: Math.min(...cs.map(c => c.low)),
        close: cs[cs.length - 1].close,
        volume: cs.reduce((s, c) => s + c.volume, 0),
    })).sort((a, b) => a.time - b.time);
}

export function useArenaWS(url: string) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mounted = useRef(true);

    const [connected, setConnected] = useState(false);
    const [price, setPrice] = useState<number | null>(null);
    const [candles1m, setCandles1m] = useState<Candle[]>([]);
    const [currentCandle, setCurrentCandle] = useState<Candle | null>(null);
    const [tfIndicators, setTFIndicators] = useState<Record<string, Partial<Indicators>>>({});
    const [predictions, setPredictions] = useState<Record<string, Prediction | null>>({});
    const [ai, setAI] = useState<DualAIState>(DUAL_AI);
    const [history, setHistory] = useState<PredictionLog[]>([]);
    const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
    const [generations, setGenerations] = useState<DualGenerations>(DUAL_GENS);
    const [dailyStats, setDailyStats] = useState<DualDailyStats>(DUAL_DAILY);
    const [lifetimeStats, setLifetime] = useState<DualLifetimeStats>(DUAL_LIFETIME);
    const [istTick, setISTTick] = useState<ISTTick | null>(null);
    const [lifeAnim, setLifeAnim] = useState(false);
    const [deathAnim, setDeathAnim] = useState(false);
    const [reviveAnim, setReviveAnim] = useState(false);
    const [latestEval, setLatestEval] = useState<PredictionLog | null>(null);
    const [snapFlash, setSnapFlash] = useState<{ result: 'WIN' | 'LOSS'; tf: string } | null>(null);
    const [latestML, setLatestML] = useState<any>(null);

    function handle(msg: WSMessage) {
        switch (msg.type) {
            case 'INIT':
                if (msg.data.baseCandles) setCandles1m(msg.data.baseCandles);
                if (msg.data.tfIndicators) setTFIndicators(msg.data.tfIndicators);
                if (msg.data.predictions) setPredictions(msg.data.predictions);
                if (msg.data.ai) setAI(msg.data.ai);
                if (msg.data.history) setHistory(msg.data.history);
                if (msg.data.snapshots) setSnapshots(msg.data.snapshots);
                if (msg.data.generations) setGenerations(msg.data.generations);
                if (msg.data.dailyStats) setDailyStats(msg.data.dailyStats);
                if (msg.data.lifetimeStats) setLifetime(msg.data.lifetimeStats);
                if (msg.data.price) setPrice(msg.data.price);
                if (msg.data.latestML) setLatestML(msg.data.latestML);
                setConnected(msg.data.connected ?? true);
                break;
            case 'TICK': setPrice(msg.data.price); setCurrentCandle(msg.data.currentCandle); break;
            case 'PRICE': setPrice(msg.data.price); break;
            case 'NEW_CANDLE': setCandles1m(p => [...p, msg.data].slice(-600)); setCurrentCandle(null); break;
            case 'TF_INDICATORS': setTFIndicators(msg.data); break;
            case 'INDICATORS': setTFIndicators(p => ({ ...p, '1m': msg.data })); break;
            case 'PREDICTIONS': setPredictions(msg.data); break;
            case 'AI_STATUS': setAI(msg.data); break;
            case 'EVALUATION': setLatestEval(msg.data); setHistory(p => [msg.data, ...p].slice(0, 200)); break;
            case 'LIFE_LOST': trigAnim(setLifeAnim, 700); break;
            case 'AI_DIED': trigAnim(setDeathAnim, 3500); break;
            case 'AI_REVIVED': setAI(msg.data); trigAnim(setReviveAnim, 1200); break;
            case 'CONNECTION': setConnected(msg.data.connected); break;
            case 'SNAPSHOT_CREATED': setSnapshots(p => [msg.data, ...p].slice(0, 50)); break;
            case 'SNAPSHOT_EVALUATED':
                setSnapshots(p => p.map(s => s.id === msg.data.id ? msg.data : s));
                if (msg.data.result === 'WIN' || msg.data.result === 'LOSS') {
                    setSnapFlash({ result: msg.data.result, tf: msg.data.timeframe });
                    setTimeout(() => setSnapFlash(null), 2000);
                }
                break;
            case 'SNAPSHOTS_UPDATE': setSnapshots(msg.data); break;
            case 'GENERATIONS': setGenerations(msg.data); break;
            case 'DAILY_STATS': setDailyStats(msg.data); break;
            case 'DAILY_RESET': setDailyStats(msg.data); break;
            case 'LIFETIME_STATS': setLifetime(msg.data); break;
            case 'IST_TICK': setISTTick(msg.data); break;
            case 'ML_PREDICTION': setLatestML(msg.data); break;
        }
    }

    function trigAnim(setter: (v: boolean) => void, ms: number) {
        setter(true); setTimeout(() => setter(false), ms);
    }

    const connect = useCallback(() => {
        if (!mounted.current) return;
        try {
            const ws = new WebSocket(url);
            wsRef.current = ws;
            ws.onopen = () => { if (!mounted.current) return; setConnected(true); if (reconnTimer.current) { clearTimeout(reconnTimer.current); reconnTimer.current = null; } };
            ws.onmessage = e => { if (!mounted.current) return; try { handle(JSON.parse(e.data)); } catch (_) { } };
            ws.onclose = () => { if (!mounted.current) return; setConnected(false); reconnTimer.current = setTimeout(connect, 3000); };
            ws.onerror = () => ws.close();
        } catch (_) { reconnTimer.current = setTimeout(connect, 5000); }
    }, [url]);

    useEffect(() => {
        mounted.current = true;
        connect();
        return () => {
            mounted.current = false;
            if (reconnTimer.current) clearTimeout(reconnTimer.current);
            if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
        };
    }, [connect]);

    const candles = currentCandle ? [...candles1m.slice(-199), currentCandle] : candles1m.slice(-200);
    return {
        connected, price, candles1m, candles, tfIndicators, predictions,
        ai, history, snapshots, generations, dailyStats, lifetimeStats, istTick,
        lifeAnimation: lifeAnim, deathAnimation: deathAnim, reviveAnimation: reviveAnim,
        latestEvaluation: latestEval, snapshotFlash: snapFlash, latestML
    };
}
