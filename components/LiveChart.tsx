'use client';
import { useEffect, useRef } from 'react';
import type { Candle } from '@/lib/types';

interface Props { candles: Candle[]; price: number | null; tfLabel?: string; }

function dedupe(cs: Candle[]): Candle[] {
    const m = new Map<number, Candle>();
    for (const c of cs) { const e = m.get(c.time); if (!e || c.volume > e.volume) m.set(c.time, c); }
    return [...m.values()].sort((a, b) => a.time - b.time);
}
function emaLine(closes: number[], times: number[], p: number) {
    if (closes.length < p) return [];
    const k = 2 / (p + 1); const r: { time: number; value: number }[] = [];
    let prev = closes.slice(0, p).reduce((a, b) => a + b, 0) / p;
    r.push({ time: times[p - 1], value: prev });
    for (let i = p; i < closes.length; i++) { prev = closes[i] * k + prev * (1 - k); r.push({ time: times[i], value: prev }); }
    return r;
}

export default function LiveChart({ candles, price, tfLabel = '1m' }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const seriesRef = useRef<any>(null);
    const e50Ref = useRef<any>(null);
    const e200Ref = useRef<any>(null);
    const initRef = useRef(false);

    useEffect(() => {
        if (!containerRef.current || initRef.current) return;
        let chart: any; let obs: ResizeObserver;
        import('lightweight-charts').then(({ createChart, CrosshairMode, LineStyle }) => {
            if (!containerRef.current || initRef.current) return;
            initRef.current = true;
            chart = createChart(containerRef.current, {
                width: containerRef.current.clientWidth, height: containerRef.current.clientHeight,
                layout: { background: { color: 'transparent' }, textColor: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 },
                grid: { vertLines: { color: 'rgba(26,48,80,0.35)' }, horzLines: { color: 'rgba(26,48,80,0.35)' } },
                crosshair: {
                    mode: CrosshairMode.Normal,
                    vertLine: { color: 'rgba(245,158,11,0.4)', style: LineStyle.Dashed, labelBackgroundColor: '#0f1f38' },
                    horzLine: { color: 'rgba(245,158,11,0.4)', style: LineStyle.Dashed, labelBackgroundColor: '#0f1f38' }
                },
                rightPriceScale: { borderColor: '#1a3050', textColor: '#94a3b8' },
                timeScale: { borderColor: '#1a3050', timeVisible: true, secondsVisible: false },
            });
            chartRef.current = chart;
            seriesRef.current = chart.addCandlestickSeries({ upColor: '#10b981', downColor: '#ef4444', borderUpColor: '#10b981', borderDownColor: '#ef4444', wickUpColor: '#10b981', wickDownColor: '#ef4444' });
            e50Ref.current = chart.addLineSeries({ color: 'rgba(59,130,246,0.8)', lineWidth: 1, title: 'EMA50', priceLineVisible: false, lastValueVisible: false });
            e200Ref.current = chart.addLineSeries({ color: 'rgba(245,158,11,0.8)', lineWidth: 1, title: 'EMA200', priceLineVisible: false, lastValueVisible: false });
            obs = new ResizeObserver(() => { if (containerRef.current && chart) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight }); });
            obs.observe(containerRef.current);
        });
        return () => { obs?.disconnect(); try { chart?.remove() } catch (_) { }; chartRef.current = null; seriesRef.current = null; e50Ref.current = null; e200Ref.current = null; initRef.current = false; };
    }, []);

    useEffect(() => {
        if (!seriesRef.current || candles.length === 0) return;
        const clean = dedupe(candles);
        try { seriesRef.current.setData(clean); } catch (_) { }
        const closes = clean.map(c => c.close), times = clean.map(c => c.time);
        try { e50Ref.current?.setData(emaLine(closes, times, 50)); } catch (_) { }
        try { e200Ref.current?.setData(emaLine(closes, times, 200)); } catch (_) { }
        if (chartRef.current && candles.length < 50) try { chartRef.current.timeScale().fitContent(); } catch (_) { }
    }, [candles]);

    return (
        <div className="relative w-full h-full">
            <div ref={containerRef} className="w-full h-full" />
            <div className="absolute top-2 left-3 flex items-center gap-3 pointer-events-none">
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-blue-500/80 rounded" /><span className="text-xs text-slate-400 font-mono">EMA 50</span></div>
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-amber-500/80 rounded" /><span className="text-xs text-slate-400 font-mono">EMA 200</span></div>
                <span className="text-xs text-slate-500 font-mono">BTC/USD · {tfLabel.toUpperCase()}</span>
            </div>
        </div>
    );
}
