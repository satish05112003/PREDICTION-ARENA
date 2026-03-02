'use client';

import type { Prediction } from '@/lib/types';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface Props {
    predictions: Record<string, Prediction | null>;
}

const TF_ORDER = ['5m', '15m', '30m', '1h'];
const TF_LABELS: Record<string, string> = {
    '5m': '5 MIN',
    '15m': '15 MIN',
    '30m': '30 MIN',
    '1h': '1 HOUR',
};

export default function PredictionsPanel({ predictions }: Props) {
    return (
        <div className="glass rounded-xl p-4 border border-arena-border">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs font-mono font-bold tracking-widest text-slate-400">
                    LIVE PREDICTIONS
                </span>
            </div>

            <div className="space-y-3">
                {TF_ORDER.map((tf) => {
                    const pred = predictions[tf];
                    if (!pred) return <PredictionSkeleton key={tf} tf={tf} label={TF_LABELS[tf]} />;
                    return <PredictionCard key={tf} pred={pred} label={TF_LABELS[tf]} />;
                })}
            </div>
        </div>
    );
}

function PredictionCard({ pred, label }: { pred: Prediction; label: string }) {
    const isUp = pred.direction === 'UP';
    const cardClass = isUp ? 'badge-up' : 'badge-down';
    const Icon = isUp ? TrendingUp : TrendingDown;
    const confColor =
        pred.confidence >= 75 ? 'bg-emerald-500' :
            pred.confidence >= 60 ? 'bg-amber-500' :
                'bg-slate-500';
    const timeAgo = Math.round((Date.now() - pred.timestamp) / 1000);

    return (
        <div className={`rounded-lg p-3 transition-all duration-300 animate-float-in ${cardClass}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className="text-xs font-mono font-bold tracking-widest opacity-70">{label}</div>
                </div>
                <div className="flex items-center gap-1 text-xs opacity-50">
                    <Clock size={10} />
                    <span className="font-mono">{timeAgo}s ago</span>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon size={20} strokeWidth={2.5} />
                    <span className="text-lg font-black tracking-wide">{pred.direction}</span>
                </div>
                <div className="text-right">
                    <div className="text-xs font-mono opacity-60 mb-1">CONFIDENCE</div>
                    <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-black/30 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${confColor} transition-all duration-500`}
                                style={{ width: `${pred.confidence}%` }}
                            />
                        </div>
                        <span className="text-sm font-mono font-bold">{pred.confidence}%</span>
                    </div>
                </div>
            </div>

            {/* Score indicator */}
            <div className="mt-2 pt-2 border-t border-current border-opacity-10">
                <div className="flex items-center justify-between text-xs opacity-50 font-mono">
                    <span>Score: {pred.score > 0 ? '+' : ''}{pred.score}</span>
                    <span>${pred.price?.toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>
                </div>
            </div>
        </div>
    );
}

function PredictionSkeleton({ tf, label }: { tf: string; label: string }) {
    return (
        <div className="rounded-lg p-3 bg-slate-800/30 border border-slate-700/30">
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-mono font-bold tracking-widest text-slate-500">{label}</div>
                <div className="w-12 h-3 bg-slate-700/50 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
                <div className="w-20 h-6 bg-slate-700/50 rounded animate-pulse" />
            </div>
        </div>
    );
}
