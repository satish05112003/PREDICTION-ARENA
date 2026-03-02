'use client';

import { useEffect, useState, useMemo } from 'react';
import type { SnapshotRecord, ISTTick, AIState } from '@/lib/types';
import { Lock, Clock, TrendingUp, TrendingDown, Zap, CheckCircle2, XCircle, Minus } from 'lucide-react';

interface Props {
    snapshots: SnapshotRecord[];
    istTick: ISTTick | null;
    ai: AIState;
    snapshotFlash: { result: 'WIN' | 'LOSS'; tf: string } | null;
    price: number | null;
}

const TIMEFRAMES = ['5m', '15m', '30m', '1h'];

const TF_COLORS: Record<string, { bg: string; border: string; text: string; dim: string }> = {
    '5m': { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.4)', text: '#a78bfa', dim: '#7c5cbf' },
    '15m': { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)', text: '#60a5fa', dim: '#3b6eaf' },
    '30m': { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24', dim: '#b8860b' },
    '1h': { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)', text: '#34d399', dim: '#0d7a54' },
};

const TF_SEC: Record<string, number> = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };

/** Compute seconds until next IST boundary for a given TF */
function secondsToNextBoundary(tf: string, istTick: ISTTick): number {
    const totalSecondsIST = istTick.istHour * 3600 + istTick.istMinute * 60 + istTick.istSecond;
    const period = TF_SEC[tf];
    const elapsed = totalSecondsIST % period;
    return period - elapsed;
}

/** Format seconds as MM:SS */
function fmtCountdown(sec: number): string {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

/** Format a snapshot IST string to HH:MM:SS portion */
function fmtTime(istStr: string): string {
    // "2026-03-02 16:53:55.xxx IST" → "16:53:55"
    const parts = istStr.split(' ');
    if (parts[1]) return parts[1].split('.')[0];
    return istStr.slice(11, 19);
}

export default function ISTSnapshotArena({ snapshots, istTick, ai, snapshotFlash, price }: Props) {
    const [now, setNow] = useState(Date.now());
    const [flashVisible, setFlashVisible] = useState(false);

    // Local 1s tick for countdowns
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    // Snapshot result flash effect
    useEffect(() => {
        if (!snapshotFlash) return;
        setFlashVisible(true);
        const t = setTimeout(() => setFlashVisible(false), 1800);
        return () => clearTimeout(t);
    }, [snapshotFlash]);

    // Latest snapshot per TF (most recent)
    const latestByTF = useMemo(() => {
        const map: Record<string, SnapshotRecord | null> = { '5m': null, '15m': null, '30m': null, '1h': null };
        for (const s of snapshots) {
            if (!map[s.timeframe]) map[s.timeframe] = s;
        }
        return map;
    }, [snapshots]);

    // IST time string
    const istTimeStr = istTick
        ? `${String(istTick.istHour).padStart(2, '0')}:${String(istTick.istMinute).padStart(2, '0')}:${String(istTick.istSecond).padStart(2, '0')}`
        : '-- : -- : --';

    // Snapshot stats
    const totalSnaps = snapshots.filter(s => s.result !== 'PENDING').length;
    const wins = snapshots.filter(s => s.result === 'WIN').length;
    const losses = snapshots.filter(s => s.result === 'LOSS').length;
    const snapAcc = totalSnaps > 0 ? Math.round((wins / totalSnaps) * 100) : null;

    return (
        <div className="relative glass rounded-xl border border-arena-border overflow-hidden">
            {/* WIN/LOSS flash overlay */}
            {flashVisible && snapshotFlash && (
                <div
                    className="absolute inset-0 z-30 pointer-events-none rounded-xl"
                    style={{
                        background: snapshotFlash.result === 'WIN'
                            ? 'rgba(16,185,129,0.15)'
                            : 'rgba(239,68,68,0.15)',
                        boxShadow: snapshotFlash.result === 'WIN'
                            ? 'inset 0 0 40px rgba(16,185,129,0.3)'
                            : 'inset 0 0 40px rgba(239,68,68,0.3)',
                        animation: 'screen-flash 0.4s ease-in-out 2',
                    }}
                />
            )}

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-arena-border">
                <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-xs font-mono font-bold tracking-widest text-slate-400">
                        IST SNAPSHOT ARENA
                    </span>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                        <Lock size={9} className="text-amber-400" />
                        <span className="text-xs font-mono text-amber-400">TIME-LOCKED</span>
                    </div>
                </div>

                {/* IST Clock */}
                <div className="flex items-center gap-3">
                    {snapAcc !== null && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/60 border border-slate-700/40">
                            <span className="text-xs text-slate-500 font-mono">SNAP ACC</span>
                            <span className={`text-sm font-black font-mono ${snapAcc >= 55 ? 'text-emerald-400' : snapAcc >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                                {snapAcc}%
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/40">
                        <Clock size={12} className="text-amber-400" />
                        <span className="text-sm font-black font-mono text-amber-300 tracking-wider">
                            {istTimeStr}
                        </span>
                        <span className="text-xs font-mono text-slate-500">IST</span>
                    </div>
                </div>
            </div>

            <div className="p-4">
                {/* ── 4 TF Cards ──────────────────────────────────────────────── */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                    {TIMEFRAMES.map(tf => {
                        const col = TF_COLORS[tf];
                        const snap = latestByTF[tf];
                        const countdown = istTick ? secondsToNextBoundary(tf, istTick) : TF_SEC[tf];
                        const pct = Math.round((1 - countdown / TF_SEC[tf]) * 100);
                        const isLive = snap?.result === 'PENDING';
                        const timeRemaining = snap && snap.result === 'PENDING'
                            ? Math.max(0, Math.floor((snap.evaluationTimestamp - Date.now()) / 1000))
                            : null;

                        return (
                            <div
                                key={tf}
                                className="rounded-xl p-3 relative overflow-hidden transition-all duration-300"
                                style={{
                                    background: col.bg,
                                    border: `1px solid ${col.border}`,
                                    boxShadow: isLive ? `0 0 12px ${col.border}` : 'none',
                                }}
                            >
                                {/* Progress bar (time elapsed in current boundary period) */}
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800/60">
                                    <div
                                        className="h-full transition-all duration-1000"
                                        style={{ width: `${pct}%`, background: col.text, opacity: 0.6 }}
                                    />
                                </div>

                                {/* TF Header */}
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-mono font-black" style={{ color: col.text }}>
                                        {tf.toUpperCase()}
                                    </span>
                                    {isLive && (
                                        <span className="text-xs px-1.5 py-0.5 rounded font-mono font-bold animate-pulse"
                                            style={{ background: `${col.text}22`, color: col.text }}>
                                            LIVE
                                        </span>
                                    )}
                                    {snap && snap.result !== 'PENDING' && (
                                        <ResultBadge result={snap.result} />
                                    )}
                                </div>

                                {/* Prediction or countdown */}
                                {snap && snap.result === 'PENDING' ? (
                                    <>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            {snap.predictedDirection === 'UP'
                                                ? <TrendingUp size={16} style={{ color: '#10b981' }} />
                                                : <TrendingDown size={16} style={{ color: '#ef4444' }} />
                                            }
                                            <span className={`text-lg font-black font-mono ${snap.predictedDirection === 'UP' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {snap.predictedDirection}
                                            </span>
                                            <span className="text-xs font-mono text-slate-500 ml-auto">{snap.confidence}%</span>
                                        </div>
                                        <div className="text-xs font-mono text-slate-500 mb-1">
                                            @ ${snap.snapshotPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                        {timeRemaining !== null && (
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-xs font-mono text-slate-600">eval in</span>
                                                <span className="text-sm font-black font-mono" style={{ color: timeRemaining < 30 ? '#ef4444' : col.text }}>
                                                    {fmtCountdown(timeRemaining)}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                ) : snap && snap.result !== 'PENDING' ? (
                                    <>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            {snap.predictedDirection === 'UP'
                                                ? <TrendingUp size={14} style={{ color: '#10b981' }} />
                                                : <TrendingDown size={14} style={{ color: '#ef4444' }} />
                                            }
                                            <span className={`text-base font-black font-mono ${snap.predictedDirection === 'UP' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {snap.predictedDirection}
                                            </span>
                                        </div>
                                        <div className="text-xs font-mono text-slate-600">
                                            Δ {snap.evaluatedPrice !== null
                                                ? `$${(snap.evaluatedPrice - snap.snapshotPrice).toFixed(2)}`
                                                : '—'}
                                        </div>
                                        <div className="mt-1.5">
                                            <span className="text-xs font-mono text-slate-600">next in </span>
                                            <span className="text-xs font-mono font-bold" style={{ color: col.text }}>
                                                {fmtCountdown(countdown)}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-xs font-mono text-slate-600 mb-1">Next snapshot in</div>
                                        <div className="text-xl font-black font-mono" style={{ color: col.text }}>
                                            {fmtCountdown(countdown)}
                                        </div>
                                        <div className="text-xs text-slate-700 font-mono mt-1">awaiting boundary</div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Snapshot History Table ────────────────────────────────── */}
                <div className="rounded-xl border border-arena-border overflow-hidden">
                    <div className="px-3 py-2 border-b border-arena-border flex items-center justify-between bg-slate-900/40">
                        <div className="flex items-center gap-2">
                            <Zap size={11} className="text-amber-400" />
                            <span className="text-xs font-mono font-bold tracking-widest text-slate-400">SNAPSHOT LOG</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono">
                            <span className="text-emerald-400 font-bold">{wins}W</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-red-400 font-bold">{losses}L</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-slate-500">{snapshots.filter(s => s.result === 'PENDING').length} PENDING</span>
                        </div>
                    </div>

                    {snapshots.length === 0 ? (
                        <div className="text-center py-6">
                            <div className="text-slate-600 font-mono text-xs">
                                Snapshots fire automatically at IST boundaries · 5m, 15m, 30m, 1h
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                                <thead className="sticky top-0 z-10" style={{ background: '#0a1628' }}>
                                    <tr>
                                        {['IST TIME', 'TF', 'SNAP $', 'PRED', 'ACTUAL', 'CONF', 'Δ PRICE', 'RESULT'].map(h => (
                                            <th key={h} style={{
                                                fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                                                color: '#64748b', padding: '0.4rem 0.6rem', borderBottom: '1px solid #1a3050',
                                                textAlign: h === 'RESULT' ? 'center' : 'left', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
                                            }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshots.map(s => {
                                        const col = TF_COLORS[s.timeframe] || TF_COLORS['5m'];
                                        const priceDiff = s.evaluatedPrice !== null ? s.evaluatedPrice - s.snapshotPrice : null;
                                        return (
                                            <tr key={s.id} style={{
                                                borderBottom: '1px solid rgba(26,48,80,0.3)',
                                                background: s.result === 'WIN' ? 'rgba(16,185,129,0.04)' : s.result === 'LOSS' ? 'rgba(239,68,68,0.04)' : 'transparent',
                                            }}>
                                                <td style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', color: '#64748b' }}>
                                                    {fmtTime(s.snapshotTimeIST)}
                                                </td>
                                                <td style={{ padding: '0.4rem 0.6rem' }}>
                                                    <span style={{
                                                        fontSize: '0.65rem', fontFamily: 'JetBrains Mono, monospace',
                                                        fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                                        background: col.bg, color: col.text, border: `1px solid ${col.border}`,
                                                    }}>
                                                        {s.timeframe}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', color: '#e2e8f0' }}>
                                                    ${s.snapshotPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                </td>
                                                <td style={{ padding: '0.4rem 0.6rem' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace',
                                                        fontWeight: 700, color: s.predictedDirection === 'UP' ? '#10b981' : '#ef4444',
                                                    }}>
                                                        {s.predictedDirection === 'UP' ? '▲ UP' : '▼ DN'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.4rem 0.6rem' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace',
                                                        fontWeight: 700,
                                                        color: s.actualDirection === null ? '#64748b' : s.actualDirection === 'UP' ? '#10b981' : s.actualDirection === 'DOWN' ? '#ef4444' : '#f59e0b',
                                                    }}>
                                                        {s.actualDirection === null ? '⏳' : s.actualDirection === 'UP' ? '▲ UP' : s.actualDirection === 'DOWN' ? '▼ DN' : '— EQ'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8' }}>
                                                    {s.confidence}%
                                                </td>
                                                <td style={{
                                                    padding: '0.4rem 0.6rem', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace',
                                                    color: priceDiff === null ? '#64748b' : priceDiff >= 0 ? '#10b981' : '#ef4444', fontWeight: 700,
                                                }}>
                                                    {priceDiff === null ? '—' : `${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(1)}`}
                                                </td>
                                                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                                                    <ResultBadge result={s.result} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ResultBadge({ result }: { result: string }) {
    if (result === 'PENDING') return (
        <span style={{ fontSize: '0.6rem', fontFamily: 'JetBrains Mono, monospace', color: '#f59e0b', fontWeight: 700 }}>
            ⏳ WAIT
        </span>
    );
    if (result === 'WIN') return (
        <span className="flex items-center gap-0.5" style={{ color: '#10b981', fontSize: '0.65rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
            <CheckCircle2 size={11} /> WIN
        </span>
    );
    if (result === 'LOSS') return (
        <span className="flex items-center gap-0.5" style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
            <XCircle size={11} /> LOSS
        </span>
    );
    return (
        <span className="flex items-center gap-0.5" style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
            <Minus size={11} /> DRAW
        </span>
    );
}
