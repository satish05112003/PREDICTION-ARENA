"use client";

import { BrainCircuit, Activity, Zap, ShieldAlert, Cpu } from 'lucide-react';
import React, { useMemo } from 'react';
import { Indicators } from '@/lib/types';

interface MLData {
    prediction: string;
    confidence: number;
    price: number;
}

interface MLPredictionPanelProps {
    latestML: MLData | null;
    currentIndicators?: Partial<Indicators>;
}

export function MLPredictionPanel({ latestML, currentIndicators }: MLPredictionPanelProps) {
    if (!latestML) return null;

    const { prediction, confidence, price } = latestML;

    const isUp = prediction === 'UP';
    const isDown = prediction === 'DOWN';
    const isNeutral = prediction === 'NEUTRAL' || prediction === 'ERROR' || prediction === 'READY_WAITING_DATA';

    const colorClass = isUp ? 'text-[#00ffcc]' : isDown ? 'text-[#ff0055]' : 'text-gray-400';
    const bgClass = isUp ? 'bg-[#00ffcc]/10 shadow-[0_0_15px_rgba(0,255,204,0.15)]' : isDown ? 'bg-[#ff0055]/10 shadow-[0_0_15px_rgba(255,0,85,0.15)]' : 'bg-white/5';

    // Auto-generate some UI reasons based on current 5m S-indicators
    const reasons = useMemo(() => {
        if (!currentIndicators?.S) return [];
        const S = currentIndicators.S;
        const out = [];
        if (S.s_RSI > 0) out.push({ label: 'RSI', val: 'bullish', col: 'text-[#00ffcc]' });
        else if (S.s_RSI < 0) out.push({ label: 'RSI', val: 'bearish', col: 'text-[#ff0055]' });

        if (S.s_MACD > 0) out.push({ label: 'Momentum', val: 'positive', col: 'text-[#00ffcc]' });
        else if (S.s_MACD < 0) out.push({ label: 'Momentum', val: 'negative', col: 'text-[#ff0055]' });

        if (S.s_OB > 0) out.push({ label: 'Orderbook', val: 'buyers', col: 'text-[#00ffcc]' });
        else if (S.s_OB < 0) out.push({ label: 'Orderbook', val: 'sellers', col: 'text-[#ff0055]' });

        return out;
    }, [currentIndicators]);

    return (
        <div className={`p-4 rounded-xl border border-white/5 backdrop-blur-md transition-all ${bgClass}`}>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[#8b5cf6]/20 rounded text-[#8b5cf6]">
                        <Cpu size={16} />
                    </div>
                    <h2 className="text-xs font-bold text-gray-400 tracking-wider">NEXT 5M ML PREDICTION</h2>
                </div>
                {prediction === 'READY_WAITING_DATA' && (
                    <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded border border-white/5">GATHERING SNAPSHOTS...</span>
                )}
            </div>

            <div className="flex gap-4 mb-4">
                <div className="flex-1 bg-black/40 rounded-lg p-3 border border-white/5">
                    <div className="text-[10px] text-gray-500 mb-1">SNAP PRICE</div>
                    <div className="font-mono font-bold text-sm">${(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div className="flex-1 bg-black/40 rounded-lg p-3 border border-white/5">
                    <div className="text-[10px] text-gray-500 mb-1">PREDICTION</div>
                    <div className={`font-black font-mono tracking-wider text-lg ${colorClass}`}>
                        {prediction}
                    </div>
                </div>
            </div>

            {!isNeutral && (
                <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Model Confidence</span>
                        <span className={colorClass}>{confidence}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${isUp ? 'bg-[#00ffcc]' : 'bg-[#ff0055]'}`}
                            style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }}
                        />
                    </div>
                </div>
            )}

            <div className="bg-black/30 rounded p-3 text-xs border border-white/5 space-y-1.5">
                <div className="text-gray-500 mb-2 uppercase tracking-wider text-[10px]">Real-Time Factors</div>
                {reasons.length > 0 ? reasons.map((r, i) => (
                    <div key={i} className="flex justify-between items-center">
                        <span className="text-gray-400 font-mono">{r.label}</span>
                        <span className={`font-mono text-[10px] font-bold ${r.col}`}>→ {r.val.toUpperCase()}</span>
                    </div>
                )) : (
                    <div className="text-gray-600 font-mono text-[10px] text-center italic">Waiting for sufficient volatility...</div>
                )}
            </div>
        </div>
    );
}
