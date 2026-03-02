'use client';

import type { PredictionLog, AIState } from '@/lib/types';
import { CheckCircle, XCircle } from 'lucide-react';

interface Props {
    history: PredictionLog[];
    ai: AIState;
}

const TF_ORDER = ['5m', '15m', '30m', '1h'];

export default function PredictionHistory({ history, ai }: Props) {
    // Per-TF accuracy
    const tfStats: Record<string, { w: number; l: number }> = {};
    for (const tf of TF_ORDER) tfStats[tf] = { w: 0, l: 0 };
    for (const h of history) {
        if (tfStats[h.tf]) {
            if (h.correct) tfStats[h.tf].w++;
            else tfStats[h.tf].l++;
        }
    }

    const totalW = history.filter(h => h.correct).length;
    const totalL = history.filter(h => !h.correct).length;
    const overallAcc = history.length > 0 ? Math.round((totalW / history.length) * 100) : null;

    return (
        <div className="glass rounded-xl border border-arena-border overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b border-arena-border flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-400" />
                    <span className="text-xs font-mono font-bold tracking-widest text-slate-400">
                        PREDICTION LOG
                    </span>
                    <span className="text-xs font-mono text-slate-600">— all timeframes</span>
                </div>

                {/* Per-TF accuracy chips */}
                <div className="flex items-center gap-2 flex-wrap">
                    {TF_ORDER.map(tf => {
                        const s = tfStats[tf];
                        const total = s.w + s.l;
                        const acc = total > 0 ? Math.round((s.w / total) * 100) : null;
                        return (
                            <div key={tf} className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/40">
                                <span className="text-xs font-mono text-slate-400">{tf}</span>
                                <span className="text-xs font-mono font-bold" style={{
                                    color: acc === null ? '#64748b' : acc >= 55 ? '#10b981' : acc >= 45 ? '#f59e0b' : '#ef4444'
                                }}>
                                    {acc !== null ? `${acc}%` : '—'}
                                </span>
                            </div>
                        );
                    })}

                    {/* Overall */}
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border font-mono text-xs font-bold"
                        style={{
                            borderColor: overallAcc !== null ? (overallAcc >= 55 ? 'rgba(16,185,129,0.4)' : overallAcc >= 45 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)') : '#1a3050',
                            color: overallAcc !== null ? (overallAcc >= 55 ? '#10b981' : overallAcc >= 45 ? '#f59e0b' : '#ef4444') : '#64748b',
                            background: overallAcc !== null ? (overallAcc >= 55 ? 'rgba(16,185,129,0.08)' : overallAcc >= 45 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)') : 'transparent',
                        }}>
                        OVERALL {overallAcc !== null ? `${overallAcc}%` : '—'}
                    </div>
                </div>
            </div>

            {/* Empty state */}
            {history.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                    <div className="text-4xl mb-3">⏳</div>
                    <div className="text-slate-500 font-mono text-sm">Awaiting first completed prediction...</div>
                    <div className="text-slate-700 font-mono text-xs mt-1.5">5m, 15m, 30m, and 1h predictions update every candle close</div>
                    <div className="mt-4 grid grid-cols-4 gap-3">
                        {TF_ORDER.map(tf => (
                            <div key={tf} className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30 text-center">
                                <div className="text-xs font-mono text-slate-400 font-bold">{tf}</div>
                                <div className="text-xs text-slate-600 font-mono mt-0.5">pending</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Table */}
            {history.length > 0 && (
                <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '300px' }}>
                    <table className="w-full arena-table">
                        <thead className="sticky top-0 z-10" style={{ background: '#0a1628' }}>
                            <tr>
                                <th className="text-left">ISSUED</th>
                                <th className="text-left">TF</th>
                                <th className="text-center">PREDICTION</th>
                                <th className="text-center">ACTUAL</th>
                                <th className="text-right">CONFIDENCE</th>
                                <th className="text-right">PRICE Δ</th>
                                <th className="text-center">✓/✗</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((entry) => (
                                <tr
                                    key={entry.id}
                                    className={`transition-colors animate-float-in ${entry.correct ? 'hover:bg-emerald-900/8' : 'hover:bg-red-900/8'}`}
                                >
                                    <td className="text-slate-500 whitespace-nowrap">
                                        {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                                        })}
                                    </td>
                                    <td>
                                        <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                                            style={{
                                                background: entry.tf === '5m' ? 'rgba(139,92,246,0.2)' : entry.tf === '15m' ? 'rgba(59,130,246,0.2)' : entry.tf === '30m' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
                                                color: entry.tf === '5m' ? '#8b5cf6' : entry.tf === '15m' ? '#3b82f6' : entry.tf === '30m' ? '#f59e0b' : '#10b981',
                                            }}>
                                            {entry.tf}
                                        </span>
                                    </td>
                                    <td className="text-center">
                                        <span className={`font-bold text-xs ${entry.prediction === 'UP' ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {entry.prediction === 'UP' ? '▲ UP' : '▼ DOWN'}
                                        </span>
                                    </td>
                                    <td className="text-center">
                                        <span className={`font-bold text-xs ${entry.actual === 'UP' ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {entry.actual === 'UP' ? '▲ UP' : '▼ DOWN'}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-slate-500"
                                                    style={{ width: `${entry.confidence}%` }} />
                                            </div>
                                            <span className="text-slate-300">{entry.confidence}%</span>
                                        </div>
                                    </td>
                                    <td className={`text-right font-mono ${entry.priceDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {entry.priceDiff >= 0 ? '+' : ''}{entry.priceDiff.toFixed(0)}
                                    </td>
                                    <td className="text-center">
                                        {entry.correct
                                            ? <CheckCircle size={14} className="text-emerald-400 mx-auto" />
                                            : <XCircle size={14} className="text-red-400 mx-auto" />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Footer stats */}
            <div className="px-4 py-2.5 border-t border-arena-border bg-slate-900/40 flex items-center justify-between flex-wrap gap-2 mt-auto">
                <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-emerald-400 font-bold">{totalW}W</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-red-400 font-bold">{totalL}L</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500">{history.length} predictions logged</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-500">AI Gen {ai.generation}</span>
                    <span className="text-slate-600">·</span>
                    <span className={`font-bold ${ai.accuracy >= 55 ? 'text-emerald-400' : ai.accuracy >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                        {ai.accuracy}% overall accuracy
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500">min 45% to survive</span>
                </div>
            </div>
        </div>
    );
}
