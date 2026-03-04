// Central type definitions for BTC Prediction Arena v2

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
export interface OrderBlock { type: 'bullish' | 'bearish'; high: number; low: number; time: number; }
export interface MACDData { macdLine: number; signalLine: number; histogram: number; histogramHistory?: number[]; }

export interface Indicators {
    rsi: number | null; rsiHistory?: number[];
    macd: MACDData | null;
    ema50: number | null; ema200: number | null;
    volSpike: number; volHistory?: number[];
    momentum: number; momentumHistory?: number[];
    atr: number; orderBlocks: OrderBlock[];
    currentPrice: number; timestamp: number;
    S?: any;
}

export interface Prediction {
    tf: string; direction: 'UP' | 'DOWN'; confidence: number;
    score: number; reasons: string[]; price: number; timestamp: number;
}

export interface AIState {
    generation: number; startTime?: number; lives: number;
    accuracy: number; wins: number; losses: number;
    streak: number; consecutiveLosses: number; totalPredictions: number;
    status: 'ALIVE' | 'DANGER' | 'CRITICAL' | 'DEAD';
    confidenceThreshold: number; volatilityMode: 'AGGRESSIVE' | 'CONSERVATIVE';
    rolling50Accuracy: number; avgConfidence: number;
    upBias: number; downBias: number;
    longestWinStreak: number; longestLossStreak: number;
}

export interface PredictionLog {
    id: string; timestamp: string; tf: string;
    prediction: 'UP' | 'DOWN'; actual: 'UP' | 'DOWN'; correct: boolean;
    confidence: number; openPrice: number; closePrice: number; priceDiff: number;
}

export interface SnapshotRecord {
    id: string; snapshotTimeIST: string; evaluationTimeIST: string;
    timeframe: string; snapshotPrice: number;
    predictedDirection: 'UP' | 'DOWN'; confidence: number; score: number; reasons: string[];
    lockedAt: number; evaluationTimestamp: number;
    evaluatedPrice: number | null; actualDirection: 'UP' | 'DOWN' | 'NEUTRAL' | null;
    result: 'PENDING' | 'WIN' | 'LOSS' | 'DRAW';
}

export interface GenerationRecord {
    id: number; startTimeIST: string; endTimeIST: string;
    totalPredictions: number; wins: number; losses: number; accuracy: number;
    longestWinStreak: number; longestLossStreak: number;
    survivalMinutes: number; status: 'DEAD' | 'ACTIVE';
}

export interface DailyStats {
    date: string; total: number; wins: number; losses: number; accuracy: number;
    streak: number; longestWinStreak: number; longestLossStreak: number;
    byTF: Record<string, { t: number; w: number }>;
    snapshots?: { total: number; wins: number };
}

export interface LifetimeStats {
    totalPredictions: number; totalWins: number; totalLosses: number;
    lifetimeAccuracy: number; bestGenAccuracy: number; worstGenAccuracy: number;
    highestWinStreak: number; totalGenerations: number;
    snapWins: number; snapLosses: number;
}

export interface ISTTick { istIso: string; istHour: number; istMinute: number; istSecond: number; }

export interface DualAIState { live: AIState; snap: AIState; }
export interface DualDailyStats { live: DailyStats; snap: DailyStats; }
export interface DualLifetimeStats { live: LifetimeStats; snap: LifetimeStats; }
export interface DualGenerations { live: GenerationRecord[]; snap: GenerationRecord[]; }

export type WSMessage =
    | { type: 'INIT'; data: any }
    | { type: 'TICK'; data: { price: number; time: number; currentCandle: Candle } }
    | { type: 'NEW_CANDLE'; data: Candle }
    | { type: 'TF_INDICATORS'; data: Record<string, Partial<Indicators>> }
    | { type: 'INDICATORS'; data: Indicators }
    | { type: 'PREDICTIONS'; data: Record<string, Prediction | null> }
    | { type: 'EVALUATION'; data: PredictionLog }
    | { type: 'AI_STATUS'; data: DualAIState }
    | { type: 'AI_DIED'; data: { mode: 'LIVE' | 'SNAP'; generation: number; accuracy: number; reason?: string } }
    | { type: 'AI_REVIVED'; data: DualAIState }
    | { type: 'LIFE_LOST'; data: { mode: 'LIVE' | 'SNAP'; livesLeft: number } }
    | { type: 'CONNECTION'; data: { connected: boolean } }
    | { type: 'PRICE'; data: { price: number; time: number } }
    | { type: 'SNAPSHOT_CREATED'; data: SnapshotRecord }
    | { type: 'SNAPSHOT_EVALUATED'; data: SnapshotRecord }
    | { type: 'SNAPSHOTS_UPDATE'; data: SnapshotRecord[] }
    | { type: 'GENERATIONS'; data: DualGenerations }
    | { type: 'DAILY_STATS'; data: DualDailyStats }
    | { type: 'DAILY_RESET'; data: DualDailyStats }
    | { type: 'LIFETIME_STATS'; data: DualLifetimeStats }
    | { type: 'IST_TICK'; data: ISTTick }
    | { type: 'ML_PREDICTION'; data: any };
