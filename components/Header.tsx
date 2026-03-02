'use client';

import { useEffect, useState } from 'react';
import { Activity, Wifi, WifiOff } from 'lucide-react';

interface Props {
    price: number | null;
    connected: boolean;
    accuracy?: number;
}

export default function Header({ price, connected, accuracy }: Props) {
    const [displayPrice, setDisplayPrice] = useState<number | null>(null);
    const [priceDir, setPriceDir] = useState<'up' | 'down' | null>(null);
    const prevRef = useState<number | null>(null);

    useEffect(() => {
        if (price === null) return;
        setDisplayPrice(prev => {
            if (prev !== null && prev !== price) {
                const dir = price > prev ? 'up' : 'down';
                setPriceDir(dir);
                // Clear colour after short delay — no layout movement
                setTimeout(() => setPriceDir(null), 600);
            }
            return price;
        });
    }, [price]);

    const priceColor =
        priceDir === 'up' ? '#10b981' :
            priceDir === 'down' ? '#ef4444' :
                '#ffffff';

    return (
        <header className="relative border-b border-arena-border bg-arena-surface/80 backdrop-blur-md z-50">
            <div className="px-6 py-3 flex items-center justify-between gap-4">

                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-xl font-black shadow-lg animate-glow-pulse flex-shrink-0">
                        ₿
                    </div>
                    <div>
                        <div className="text-lg font-black tracking-tight gradient-text leading-none">
                            BTC PREDICTION ARENA
                        </div>
                        <div className="text-xs text-slate-500 font-mono tracking-widest mt-0.5">
                            RULE-BASED AI vs BITCOIN
                        </div>
                    </div>
                </div>

                {/* Live Price — centred, NO layout-shifting animations */}
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="text-xs text-slate-500 font-mono tracking-widest mb-0.5">
                        BTCUSD · COINBASE
                    </div>
                    <div
                        className="text-3xl font-black font-mono leading-none transition-colors duration-300"
                        style={{ color: priceColor, minWidth: '14ch', textAlign: 'center' }}
                    >
                        {displayPrice
                            ? `$${displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '— connecting —'}
                    </div>
                    {/* Static LIVE pill — never shifts layout */}
                    <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-mono text-emerald-400 font-bold tracking-widest">LIVE</span>
                        {accuracy !== undefined && (
                            <>
                                <span className="text-slate-600 font-mono text-xs">·</span>
                                <span className={`text-xs font-mono font-bold ${accuracy >= 55 ? 'text-emerald-400' : accuracy >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                                    AI {accuracy}% ACC
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Connection badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold
                        ${connected
                            ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400'
                            : 'bg-red-900/30 border border-red-500/30 text-red-400'}`}>
                        {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                        {connected ? 'CONNECTED' : 'OFFLINE'}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-900/20 border border-blue-500/20">
                        <Activity size={12} className="text-blue-400" />
                        <span className="text-xs font-mono text-blue-400">COINBASE</span>
                    </div>
                </div>
            </div>

            {/* Disclaimer strip */}
            <div className="px-6 py-1 bg-slate-900/60 border-t border-slate-800/50 flex items-center gap-2">
                <span className="text-xs text-amber-600 font-mono">⚠</span>
                <span className="text-xs text-slate-600 font-mono">
                    Probabilistic prediction engine — not financial advice. Accuracy tracked publicly. Never trade based solely on AI signals.
                </span>
            </div>
        </header>
    );
}
