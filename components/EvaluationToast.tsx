'use client';

import type { PredictionLog } from '@/lib/types';
import { CheckCircle, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
    evaluation: PredictionLog | null;
}

export default function EvaluationToast({ evaluation }: Props) {
    const [visible, setVisible] = useState(false);
    const [current, setCurrent] = useState<PredictionLog | null>(null);

    useEffect(() => {
        if (!evaluation) return;
        setCurrent(evaluation);
        setVisible(true);
        const t = setTimeout(() => setVisible(false), 4000);
        return () => clearTimeout(t);
    }, [evaluation]);

    if (!visible || !current) return null;

    const isCorrect = current.correct;

    return (
        <div
            className={`fixed bottom-6 right-6 z-[500] flex items-start gap-3 rounded-xl p-4 shadow-2xl max-w-xs animate-float-in transition-all
        ${isCorrect
                    ? 'bg-emerald-900/90 border border-emerald-500/50'
                    : 'bg-red-900/90 border border-red-500/50'
                }`}
        >
            {isCorrect
                ? <CheckCircle size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                : <XCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
            }
            <div>
                <div className={`text-sm font-bold font-mono ${isCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
                    {isCorrect ? '✓ CORRECT PREDICTION' : '✗ WRONG PREDICTION'}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                    {current.tf} — predicted {current.prediction}, actual {current.actual}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                    Δ ${current.priceDiff >= 0 ? '+' : ''}{current.priceDiff.toFixed(1)} | {current.confidence}% conf
                </div>
                {!isCorrect && (
                    <div className="text-xs text-red-400 font-mono mt-0.5 font-bold">
                        ❤️ Life lost!
                    </div>
                )}
            </div>
        </div>
    );
}
