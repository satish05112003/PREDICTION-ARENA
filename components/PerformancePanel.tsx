'use client';
import { useState } from 'react';
import type { DailyStats, LifetimeStats } from '@/lib/types';

interface Props { dailyStats: DailyStats; lifetimeStats: LifetimeStats; }

const TF_COLORS: Record<string, string> = { '5m': '#a78bfa', '15m': '#60a5fa', '30m': '#fbbf24', '1h': '#34d399' };

export default function PerformancePanel({ dailyStats, lifetimeStats }: Props) {
    const [tab, setTab] = useState<'daily' | 'lifetime'>('daily');

    const d = dailyStats;
    const lt = lifetimeStats;

    // Best/worst TF for daily
    const tfEntries = Object.entries(d.byTF || {});
    const tfWithAcc = tfEntries.map(([tf, s]) => ({ tf, acc: s.t > 0 ? Math.round((s.w / s.t) * 100) : null, total: s.t })).filter(x => x.total > 0);
    const bestTF = tfWithAcc.sort((a, b) => (b.acc || 0) - (a.acc || 0))[0];
    const worstTF = tfWithAcc.sort((a, b) => (a.acc || 100) - (b.acc || 100))[0];

    return (
        <div className="glass rounded-xl border border-arena-border overflow-hidden">
            {/* Tab header */}
            <div className="flex border-b border-arena-border">
                {(['daily', 'lifetime'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className="flex-1 py-2.5 text-xs font-mono font-bold tracking-widest transition-colors"
                        style={{
                            color: tab === t ? '#f59e0b' : '#64748b',
                            background: tab === t ? 'rgba(245,158,11,0.06)' : 'transparent',
                            borderBottom: tab === t ? '2px solid #f59e0b' : '2px solid transparent',
                        }}>
                        {t === 'daily' ? '📅 DAILY' : '♾️ LIFETIME'}
                    </button>
                ))}
            </div>

            <div className="p-4">
                {tab === 'daily' && (
                    <div className="space-y-3">
                        <div className="text-xs font-mono text-slate-500 mb-2">Resets at 12:00 AM IST · {d.date || '—'}</div>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { label: 'TOTAL', val: d.total, color: '#e2e8f0' },
                                { label: 'WINS', val: d.wins, color: '#10b981' },
                                { label: 'LOSSES', val: d.losses, color: '#ef4444' },
                            ].map(({ label, val, color }) => (
                                <div key={label} className="text-center p-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                                    <div className="text-xs font-mono text-slate-500">{label}</div>
                                    <div className="text-xl font-black font-mono" style={{ color }}>{val}</div>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between px-2">
                            <div>
                                <div className="text-xs font-mono text-slate-500">ACCURACY</div>
                                <div className={`text-2xl font-black font-mono ${d.accuracy >= 70 ? 'text-emerald-400' : d.accuracy >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {d.total > 0 ? `${d.accuracy}%` : '—'}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-mono text-slate-500">BEST STREAK</div>
                                <div className="text-xl font-black font-mono text-emerald-400">{d.longestWinStreak}W</div>
                            </div>
                        </div>
                        {/* Per TF */}
                        <div className="grid grid-cols-4 gap-1">
                            {Object.entries(d.byTF || {}).map(([tf, s]) => {
                                const acc = s.t > 0 ? Math.round((s.w / s.t) * 100) : null;
                                const col = TF_COLORS[tf] || '#64748b';
                                return (
                                    <div key={tf} className="text-center p-2 rounded-lg border"
                                        style={{ background: `${col}10`, borderColor: `${col}30` }}>
                                        <div className="text-xs font-bold font-mono" style={{ color: col }}>{tf.toUpperCase()}</div>
                                        <div className="text-sm font-black font-mono text-slate-200">{acc !== null ? `${acc}%` : '—'}</div>
                                        <div className="text-xs font-mono text-slate-600">{s.t} pred</div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono px-1">
                            <span className="text-slate-500">Best TF: <span className="text-emerald-400 font-bold">{bestTF ? `${bestTF.tf} (${bestTF.acc}%)` : '—'}</span></span>
                            <span className="text-slate-500">Worst TF: <span className="text-red-400 font-bold">{worstTF && worstTF !== bestTF ? `${worstTF.tf} (${worstTF.acc}%)` : '—'}</span></span>
                        </div>
                        {d.snapshots && d.snapshots.total > 0 && (
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20 text-xs font-mono">
                                <span className="text-amber-400">📍 Snapshots:</span>
                                <span className="text-slate-300">{d.snapshots.wins}W / {d.snapshots.total - d.snapshots.wins}L of {d.snapshots.total}</span>
                                <span className={`ml-auto font-bold ${d.snapshots.total > 0 ? (d.snapshots.wins / d.snapshots.total >= 0.65 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                                    {d.snapshots.total > 0 ? `${Math.round((d.snapshots.wins / d.snapshots.total) * 100)}%` : '—'}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'lifetime' && (
                    <div className="space-y-3">
                        <div className="text-xs font-mono text-slate-500 mb-2">All-time · Never resets</div>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { label: 'TOTAL PREDICTIONS', val: lt.totalPredictions, color: '#e2e8f0', sub: '' },
                                { label: 'LIFETIME ACCURACY', val: `${lt.lifetimeAccuracy}%`, color: lt.lifetimeAccuracy >= 65 ? '#10b981' : lt.lifetimeAccuracy >= 60 ? '#f59e0b' : '#ef4444', sub: '' },
                                { label: 'TOTAL WINS', val: lt.totalWins, color: '#10b981', sub: '' },
                                { label: 'TOTAL LOSSES', val: lt.totalLosses, color: '#ef4444', sub: '' },
                                { label: 'BEST GEN ACCURACY', val: `${lt.bestGenAccuracy}%`, color: '#10b981', sub: '' },
                                { label: 'WORST GEN ACCURACY', val: `${lt.worstGenAccuracy}%`, color: '#ef4444', sub: '' },
                                { label: 'HIGHEST WIN STREAK', val: lt.highestWinStreak, color: '#fbbf24', sub: ' games' },
                                { label: 'TOTAL GENERATIONS', val: lt.totalGenerations, color: '#a78bfa', sub: ' gens' },
                            ].map(({ label, val, color, sub }) => (
                                <div key={label} className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                                    <div className="text-xs font-mono text-slate-500 leading-tight">{label}</div>
                                    <div className="text-lg font-black font-mono" style={{ color }}>{val}{sub}</div>
                                </div>
                            ))}
                        </div>
                        {(lt.snapWins + lt.snapLosses) > 0 && (
                            <div className="px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 text-xs font-mono">
                                <span className="text-amber-400 font-bold">📍 Lifetime Snapshots: </span>
                                <span className="text-emerald-400 font-bold">{lt.snapWins}W</span>
                                <span className="text-slate-600"> / </span>
                                <span className="text-red-400 font-bold">{lt.snapLosses}L</span>
                                <span className="ml-2 text-slate-400">
                                    ({lt.snapWins + lt.snapLosses > 0 ? Math.round((lt.snapWins / (lt.snapWins + lt.snapLosses)) * 100) : 0}% acc)
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
