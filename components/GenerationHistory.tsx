'use client';
import type { GenerationRecord, AIState } from '@/lib/types';

interface Props { generations: GenerationRecord[]; ai: AIState; }

export default function GenerationHistory({ generations, ai }: Props) {
    const current = {
        id: ai.generation, status: 'ACTIVE' as const,
        startTimeIST: '', endTimeIST: null,
        totalPredictions: ai.totalPredictions,
        wins: ai.wins, losses: ai.losses, accuracy: ai.accuracy,
        longestWinStreak: ai.longestWinStreak, longestLossStreak: ai.longestLossStreak,
        survivalMinutes: 0,
    };
    const all = [...generations, current].reverse(); // newest first

    return (
        <div className="glass rounded-xl border border-arena-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-arena-border">
                <div className="w-2 h-2 rounded-full bg-violet-400" />
                <span className="text-xs font-mono font-bold tracking-widest text-slate-400">GENERATION HISTORY</span>
                <span className="text-xs font-mono text-slate-600 ml-auto">{all.length} total</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
                {all.map(gen => {
                    const active = gen.status === 'ACTIVE';
                    const accColor = gen.accuracy >= 70 ? '#10b981' : gen.accuracy >= 65 ? '#f59e0b' : '#ef4444';
                    return (
                        <div key={gen.id}
                            className="px-4 py-3 border-b border-arena-border/50 transition-colors"
                            style={{ background: active ? 'rgba(139,92,246,0.06)' : 'transparent' }}>
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black font-mono"
                                        style={{ color: active ? '#a78bfa' : '#64748b' }}>
                                        GEN {gen.id}
                                    </span>
                                    {active ? (
                                        <span className="text-xs px-1.5 py-0.5 rounded font-mono font-bold bg-violet-500/20 text-violet-400 border border-violet-500/30 animate-pulse">
                                            ACTIVE
                                        </span>
                                    ) : (
                                        <span className="text-xs px-1.5 py-0.5 rounded font-mono text-slate-600 bg-slate-800/40">
                                            DEAD
                                        </span>
                                    )}
                                </div>
                                <span className="text-sm font-black font-mono" style={{ color: accColor }}>
                                    {gen.accuracy}%
                                </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-xs font-mono">
                                <div className="text-center">
                                    <div className="text-slate-600 text-xs">PREDS</div>
                                    <div className="text-slate-300 font-bold">{gen.totalPredictions}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-slate-600 text-xs">WIN</div>
                                    <div className="text-emerald-400 font-bold">{gen.wins}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-slate-600 text-xs">LOSS</div>
                                    <div className="text-red-400 font-bold">{gen.losses}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-slate-600 text-xs">STREAK</div>
                                    <div className="text-amber-400 font-bold">{gen.longestWinStreak}W</div>
                                </div>
                            </div>
                            {!active && gen.survivalMinutes > 0 && (
                                <div className="text-xs font-mono text-slate-700 mt-1">
                                    Survived {gen.survivalMinutes}m · ended {gen.endTimeIST?.split(' ')[1]?.slice(0, 5) || '—'}
                                </div>
                            )}
                        </div>
                    );
                })}
                {all.length === 0 && (
                    <div className="text-center py-6 text-slate-600 font-mono text-xs">No generation data yet</div>
                )}
            </div>
        </div>
    );
}
