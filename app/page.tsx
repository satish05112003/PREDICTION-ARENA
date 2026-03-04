'use client';
import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useArenaWS, aggCandles } from '@/lib/useArenaWS';
import Header from '@/components/Header';
import TimeframeSelector from '@/components/TimeframeSelector';
import AIStatusPanel from '@/components/AIStatusPanel';
import PredictionsPanel from '@/components/PredictionsPanel';
import IndicatorsPanel from '@/components/IndicatorsPanel';
import PredictionHistory from '@/components/PredictionHistory';
import ArenaOverlay from '@/components/ArenaOverlay';
import EvaluationToast from '@/components/EvaluationToast';
import ISTSnapshotArena from '@/components/ISTSnapshotArena';
import GenerationHistory from '@/components/GenerationHistory';
import PerformancePanel from '@/components/PerformancePanel';
import { MLPredictionPanel } from '@/components/MLPredictionPanel';

const LiveChart = dynamic(() => import('@/components/LiveChart'), { ssr: false });

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
const TF_MINS: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60 };

export default function ArenaPage() {
    const [selectedTF, setSelectedTF] = useState('5m');

    const {
        connected, price, candles1m, tfIndicators, predictions,
        ai, history, snapshots, generations, dailyStats, lifetimeStats, istTick,
        lifeAnimation, deathAnimation, reviveAnimation,
        latestEvaluation, snapshotFlash, latestML
    } = useArenaWS(WS_URL);

    // Aggregate 1m candles to selected TF for chart display
    const chartCandles = useMemo(
        () => aggCandles(candles1m, TF_MINS[selectedTF] || 1),
        [candles1m, selectedTF]
    );

    // Indicators for selected TF
    const activeIndicators = tfIndicators[selectedTF] || tfIndicators['1m'] || {};

    return (
        <div className="min-h-screen arena-grid flex flex-col">
            <ArenaOverlay deathAnimation={deathAnimation} reviveAnimation={reviveAnimation} ai={ai.live} />
            <EvaluationToast evaluation={latestEvaluation} />

            {/* Header */}
            <Header price={price} connected={connected} accuracy={ai.live.rolling50Accuracy} />

            <main className="flex-1 p-4 lg:p-5">
                <div className="max-w-[1920px] mx-auto space-y-4">

                    {/* ROW 1: Chart + Right Panel */}
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
                        {/* Chart column */}
                        <div className="glass rounded-xl border border-arena-border overflow-hidden flex flex-col" style={{ height: '520px' }}>
                            {/* TF Switcher lives above chart */}
                            <div className="border-b border-arena-border bg-arena-surface/60">
                                <TimeframeSelector selected={selectedTF} onChange={setSelectedTF} />
                            </div>
                            <div className="flex-1 relative">
                                <LiveChart candles={chartCandles} price={price} tfLabel={selectedTF} />
                                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-arena-surface/80 to-transparent pointer-events-none" />
                            </div>
                        </div>

                        {/* Right panel */}
                        <div className="flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: '520px' }}>
                            <AIStatusPanel ai={ai} lifeAnimation={lifeAnimation} deathAnimation={deathAnimation} reviveAnimation={reviveAnimation} />
                            <PredictionsPanel predictions={predictions} />
                            <MLPredictionPanel latestML={latestML} currentIndicators={tfIndicators['5m']} />
                        </div>
                    </div>

                    {/* ROW 2: IST Snapshot Arena */}
                    <ISTSnapshotArena snapshots={snapshots} istTick={istTick} ai={ai.snap} snapshotFlash={snapshotFlash} price={price} />

                    {/* ROW 3: Indicators + Prediction History */}
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
                        <IndicatorsPanel indicators={activeIndicators} />
                        <PredictionHistory history={history} ai={ai.live} />
                    </div>

                    {/* ROW 4: Generation History + Performance Panel */}
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
                        <GenerationHistory generations={generations} ai={ai} />
                        <PerformancePanel dailyStats={dailyStats} lifetimeStats={lifetimeStats} />
                    </div>

                </div>
            </main>

            <footer className="border-t border-arena-border py-2.5 px-6 flex items-center justify-between">
                <div className="text-xs font-mono text-slate-600">
                    BTC Prediction Arena v2 · Coinbase WS · IST Engine · Weighted Scoring · Live Gen {ai.live.generation} / Snap Gen {ai.snap.generation}
                </div>
                <div className="text-xs font-mono text-slate-700">
                    Rolling 50: <span className={ai.live.rolling50Accuracy >= 65 ? 'text-emerald-500' : 'text-red-500'}>{ai.live.rolling50Accuracy}% (Live)</span>
                    {' · '}Min 65% to survive · Not financial advice
                </div>
            </footer>
        </div>
    );
}
