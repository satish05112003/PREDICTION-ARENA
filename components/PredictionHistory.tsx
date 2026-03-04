'use client';
import { useState } from 'react';
import type { PredictionLog, AIState } from '@/lib/types';
import { CheckCircle, XCircle, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react';

interface Props { history: PredictionLog[]; ai: AIState; }

const ALL_TFS = ['ALL', '5m', '15m', '30m', '1h'];

const TF_COLORS: Record<string, { text: string; bg: string; border: string }> = {
    'ALL': { text: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' },
    '5m': { text: '#a78bfa', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)' },
    '15m': { text: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)' },
    '30m': { text: '#fbbf24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
    '1h': { text: '#34d399', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
};

export default function PredictionHistory({ history, ai }: Props) {
    const [selectedTF, setSelectedTF] = useState<string>('ALL');

    const filtered = selectedTF === 'ALL' ? history : history.filter(h => h.tf === selectedTF);

    const totalW = filtered.filter(h => h.correct).length;
    const totalL = filtered.filter(h => !h.correct).length;
    const overallAcc = filtered.length > 0 ? Math.round((totalW / filtered.length) * 100) : null;

    const visibleHistory = filtered.slice(0, 50);

    return (
        <div className="glass rounded-xl border border-arena-border overflow-hidden flex flex-col h-full">
            {/* Header */}
            <div className="px-3 py-2 border-b border-arena-border flex items-center justify-between bg-[#0a1628]">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-400" />
                    <span className="text-xs font-mono font-bold tracking-widest text-slate-400">LOG</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-bold"
                    style={{
                        borderColor: overallAcc !== null ? (overallAcc >= 55 ? 'rgba(16,185,129,0.4)' : overallAcc >= 45 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)') : '#1a3050',
                        color: overallAcc !== null ? (overallAcc >= 55 ? '#10b981' : overallAcc >= 45 ? '#f59e0b' : '#ef4444') : '#64748b',
                    }}>
                    TOTAL: {overallAcc !== null ? `${overallAcc}%` : '—'}
                </div>
            </div>

            {/* TF Filter Tabs */}
            <div className="flex border-b border-arena-border" style={{ background: '#080f1e' }}>
                <div className="flex items-center px-2 py-1 gap-1 w-full overflow-x-auto">
                    <Filter size={10} className="text-slate-600 shrink-0" />
                    {ALL_TFS.map(tf => {
                        const col = TF_COLORS[tf];
                        const tfCount = tf === 'ALL' ? history.length : history.filter(h => h.tf === tf).length;
                        const active = selectedTF === tf;
                        return (
                            <button
                                key={tf}
                                onClick={() => setSelectedTF(tf)}
                                className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all"
                                style={{
                                    color: active ? col.text : '#475569',
                                    background: active ? col.bg : 'transparent',
                                    border: `1px solid ${active ? col.border : 'transparent'}`,
                                }}
                            >
                                {tf}
                                <span className="ml-1 opacity-60">{tfCount}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* History List */}
            {filtered.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-slate-500 font-mono text-xs">
                    <div className="text-xl mb-1">⏳</div>
                    <div>{selectedTF === 'ALL' ? 'Awaiting predictions...' : `No ${selectedTF} predictions yet`}</div>
                </div>
            ) : (
                <div className="overflow-y-auto flex-1">
                    <div className="flex flex-col">
                        {visibleHistory.map(entry => {
                            const tfCol = TF_COLORS[entry.tf] || TF_COLORS['5m'];
                            return (
                                <div key={entry.id} className={`flex items-center justify-between px-3 py-2 border-b border-arena-border/50 transition-colors animate-float-in ${entry.correct ? 'bg-emerald-900/10' : 'bg-red-900/10'}`}>

                                    {/* Left: TF + Time */}
                                    <div className="flex flex-col gap-0.5 w-14">
                                        <span className="px-1 py-0.5 rounded text-[10px] font-bold text-center w-fit"
                                            style={{ background: tfCol.bg, color: tfCol.text, border: `1px solid ${tfCol.border}` }}>
                                            {entry.tf}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                            {new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                        </span>
                                    </div>

                                    {/* Mid: Direction */}
                                    <div className="flex flex-col items-center justify-center w-16">
                                        <div className={`flex items-center text-xs font-black ${entry.prediction === 'UP' ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {entry.prediction === 'UP' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                            {entry.prediction}
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono">{entry.confidence}%</span>
                                    </div>

                                    {/* Right: Result */}
                                    <div className="flex items-center justify-end gap-2 w-20">
                                        <div className={`text-right text-[11px] font-mono ${entry.priceDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {entry.priceDiff > 0 ? '+' : ''}{entry.priceDiff.toFixed(0)}
                                        </div>
                                        <div className="shrink-0">
                                            {entry.correct ? <CheckCircle size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-red-400" />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="px-3 py-2 border-t border-arena-border bg-slate-900/40 mt-auto flex justify-between items-center">
                <div className="text-[10px] font-mono">
                    <span className="text-emerald-400 font-bold">{totalW}W</span>
                    <span className="text-slate-600 px-1">/</span>
                    <span className="text-red-400 font-bold">{totalL}L</span>
                    {selectedTF !== 'ALL' && <span className="text-slate-600 ml-1">· {selectedTF}</span>}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Gen {ai.generation} · {filtered.length} total</div>
            </div>
        </div>
    );
}
