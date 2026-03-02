'use client';

import type { Indicators } from '@/lib/types';

interface Props {
    indicators: Partial<Indicators>;
}

export default function IndicatorsPanel({ indicators }: Props) {
    const { rsi, rsiHistory, macd, ema50, ema200, volSpike, volHistory, momentum, momentumHistory, atr } = indicators as any;

    const trendSignal =
        ema50 && ema200
            ? ema50 > ema200
                ? { label: 'UPTREND', color: '#10b981' }
                : { label: 'DOWNTREND', color: '#ef4444' }
            : null;

    return (
        <div className="glass rounded-xl border border-arena-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-arena-border">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-xs font-mono font-bold tracking-widest text-slate-400">
                    INDICATORS
                </span>
                <span className="text-xs font-mono text-slate-600 ml-auto">5 signals active</span>
            </div>

            {/* 4 + 1 grid */}
            <div className="grid grid-cols-2 gap-px bg-arena-border">
                {/* RSI */}
                <MiniCard
                    label="RSI (14)"
                    value={rsi ? rsi.toFixed(1) : '—'}
                    valueColor={!rsi ? '#64748b' : rsi > 70 ? '#ef4444' : rsi < 30 ? '#10b981' : '#e2e8f0'}
                    badge={!rsi ? '' : rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL'}
                    badgeColor={!rsi ? '#64748b' : rsi > 70 ? '#ef4444' : rsi < 30 ? '#10b981' : '#64748b'}
                    sparkData={rsiHistory || []}
                    sparkMin={0}
                    sparkMax={100}
                    sparkColor={!rsi ? '#64748b' : rsi > 70 ? '#ef4444' : rsi < 30 ? '#10b981' : '#3b82f6'}
                    refLines={[30, 70]}
                />

                {/* MACD */}
                <MiniCard
                    label="MACD (12,26,9)"
                    value={macd ? (macd.histogram >= 0 ? `+${macd.histogram.toFixed(1)}` : macd.histogram.toFixed(1)) : '—'}
                    valueColor={!macd ? '#64748b' : macd.histogram >= 0 ? '#10b981' : '#ef4444'}
                    badge={!macd ? '' : macd.histogram >= 0 ? 'BULLISH' : 'BEARISH'}
                    badgeColor={!macd ? '#64748b' : macd.histogram >= 0 ? '#10b981' : '#ef4444'}
                    sparkData={macd?.histogramHistory || []}
                    sparkMin={undefined}
                    sparkMax={undefined}
                    sparkColor={!macd ? '#64748b' : macd.histogram >= 0 ? '#10b981' : '#ef4444'}
                    barMode
                />

                {/* Momentum */}
                <MiniCard
                    label="MOMENTUM (5c)"
                    value={momentum !== undefined ? `${momentum > 0 ? '+' : ''}${momentum.toFixed(3)}%` : '—'}
                    valueColor={momentum === undefined ? '#64748b' : momentum > 0.3 ? '#10b981' : momentum < -0.3 ? '#ef4444' : '#e2e8f0'}
                    badge={momentum === undefined ? '' : momentum > 0.5 ? 'BULLISH' : momentum < -0.5 ? 'BEARISH' : 'FLAT'}
                    badgeColor={momentum === undefined ? '#64748b' : momentum > 0.5 ? '#10b981' : momentum < -0.5 ? '#ef4444' : '#64748b'}
                    sparkData={momentumHistory || []}
                    sparkMin={undefined}
                    sparkMax={undefined}
                    sparkColor={momentum && momentum > 0 ? '#10b981' : '#ef4444'}
                    barMode
                />

                {/* Volume */}
                <MiniCard
                    label="VOLUME SPIKE"
                    value={volSpike !== undefined ? `${volSpike.toFixed(2)}×` : '—'}
                    valueColor={volSpike === undefined ? '#64748b' : volSpike > 3 ? '#f59e0b' : volSpike > 1.5 ? '#fbbf24' : '#e2e8f0'}
                    badge={volSpike === undefined ? '' : volSpike > 3 ? 'HIGH SPIKE' : volSpike > 1.5 ? 'ELEVATED' : 'NORMAL'}
                    badgeColor={volSpike === undefined ? '#64748b' : volSpike > 3 ? '#f59e0b' : volSpike > 1.5 ? '#fbbf24' : '#64748b'}
                    sparkData={volHistory || []}
                    sparkMin={0}
                    sparkMax={undefined}
                    sparkColor="#f59e0b"
                    barMode
                />
            </div>

            {/* Bottom: EMA Trend (full width) */}
            <div className="bg-arena-card border-t border-arena-border">
                <div className="flex items-center justify-between px-4 py-3">
                    <div>
                        <div className="text-xs font-mono text-slate-500 mb-0.5">EMA 50 / 200 TREND</div>
                        <div className="text-sm font-mono font-bold" style={{ color: trendSignal?.color || '#64748b' }}>
                            {trendSignal?.label || '—'}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-mono text-slate-600">
                            EMA50: <span className="text-blue-400">{ema50 ? `$${ema50.toFixed(0)}` : '—'}</span>
                        </div>
                        <div className="text-xs font-mono text-slate-600">
                            EMA200: <span className="text-amber-400">{ema200 ? `$${ema200.toFixed(0)}` : '—'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: trendSignal?.color || '#64748b' }} />
                        <div className="text-xs font-mono text-slate-500">
                            ATR: <span className="text-slate-300">{atr ? `$${atr.toFixed(0)}` : '—'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── MINI CHART CARD ──────────────────────────────────────────────────────────
interface MiniCardProps {
    label: string;
    value: string;
    valueColor: string;
    badge: string;
    badgeColor: string;
    sparkData: number[];
    sparkMin?: number;
    sparkMax?: number;
    sparkColor: string;
    refLines?: number[];
    barMode?: boolean;
}

function MiniCard({ label, value, valueColor, badge, badgeColor, sparkData, sparkMin, sparkMax, sparkColor, refLines, barMode }: MiniCardProps) {
    const height = 40;
    const width = 120;

    const validData = sparkData.filter(v => v !== null && v !== undefined && !isNaN(v));
    const minVal = sparkMin !== undefined ? sparkMin : Math.min(...validData);
    const maxVal = sparkMax !== undefined ? sparkMax : Math.max(...validData);
    const range = maxVal - minVal || 1;

    const toY = (v: number) => height - ((v - minVal) / range) * height;

    const points = validData.map((v, i) => {
        const x = (i / Math.max(1, validData.length - 1)) * width;
        const y = toY(v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return (
        <div className="bg-arena-card px-3 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-500">{label}</span>
                {badge && (
                    <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ color: badgeColor, background: `${badgeColor}18`, border: `1px solid ${badgeColor}40` }}>
                        {badge}
                    </span>
                )}
            </div>

            <div className="text-xl font-black font-mono" style={{ color: valueColor }}>
                {value}
            </div>

            {/* Sparkline */}
            {validData.length > 2 && (
                <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                    {/* Reference lines */}
                    {refLines?.map(ref => (
                        <line
                            key={ref}
                            x1="0" y1={toY(ref).toFixed(1)}
                            x2={width} y2={toY(ref).toFixed(1)}
                            stroke="rgba(100,116,139,0.3)" strokeWidth="1" strokeDasharray="2,2"
                        />
                    ))}

                    {barMode ? (
                        validData.map((v, i) => {
                            const x = (i / Math.max(1, validData.length - 1)) * width;
                            const barW = Math.max(1, (width / Math.max(1, validData.length)) * 0.7);
                            const midY = height / 2;
                            const barH = Math.abs(toY(v) - midY);
                            const barY = v >= 0 ? midY - barH : midY;
                            const col = v >= 0 ? '#10b981' : '#ef4444';
                            return (
                                <rect key={i}
                                    x={x - barW / 2} y={barY}
                                    width={barW} height={Math.max(1, barH)}
                                    fill={col} opacity="0.7"
                                />
                            );
                        })
                    ) : (
                        <polyline
                            points={points}
                            fill="none"
                            stroke={sparkColor}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}

                    {/* Last value dot */}
                    {validData.length > 0 && !barMode && (
                        <circle
                            cx={width}
                            cy={toY(validData[validData.length - 1]).toFixed(1)}
                            r="2" fill={sparkColor}
                        />
                    )}
                </svg>
            )}

            {validData.length <= 2 && (
                <div className="h-10 flex items-center">
                    <div className="w-full h-px bg-slate-700 opacity-50 animate-pulse" />
                </div>
            )}
        </div>
    );
}
