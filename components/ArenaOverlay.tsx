'use client';

import type { AIState } from '@/lib/types';

interface Props {
    deathAnimation: boolean;
    reviveAnimation: boolean;
    ai: AIState;
}

export default function ArenaOverlay({ deathAnimation, reviveAnimation, ai }: Props) {
    if (!deathAnimation && !reviveAnimation) return null;

    if (deathAnimation) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/80 animate-death-screen" />
                {/* Red scanlines */}
                <div className="absolute inset-0 opacity-20" style={{
                    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(239,68,68,0.3) 2px, rgba(239,68,68,0.3) 4px)',
                    animation: 'screen-flash 0.3s ease-in-out 6',
                }} />
                <div className="relative z-10 text-center animate-death-screen">
                    <div className="text-8xl mb-4">💀</div>
                    <div className="text-6xl font-black text-red-500 tracking-widest mb-2" style={{
                        textShadow: '0 0 30px #ef4444, 0 0 60px #ef4444',
                    }}>
                        AI DIED
                    </div>
                    <div className="text-xl font-mono text-red-400 mb-2">
                        Generation {ai.generation} ended
                    </div>
                    <div className="text-slate-400 font-mono text-sm">
                        Final Accuracy: <span className="text-red-400 font-bold">{ai.accuracy}%</span>
                    </div>
                    <div className="mt-4 text-slate-500 font-mono text-xs">
                        Restarting with adapted logic...
                    </div>
                </div>
            </div>
        );
    }

    if (reviveAnimation) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
                <div className="absolute inset-0 bg-emerald-900/30 animate-death-screen" />
                <div className="relative z-10 text-center animate-revive">
                    <div className="text-8xl mb-4">⚡</div>
                    <div className="text-5xl font-black text-emerald-400 tracking-widest mb-2" style={{
                        textShadow: '0 0 30px #10b981, 0 0 60px #10b981',
                    }}>
                        REVIVAL
                    </div>
                    <div className="text-xl font-mono text-emerald-300 mb-2">
                        Generation {ai.generation} online
                    </div>
                    <div className="text-slate-400 font-mono text-sm">
                        Bias adapted. 3 lives restored.
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
