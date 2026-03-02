'use client';
interface Props { selected: string; onChange: (tf: string) => void; }
const TFS = [
    { key: '1m', label: '1M' },
    { key: '5m', label: '5M' },
    { key: '15m', label: '15M' },
    { key: '30m', label: '30M' },
    { key: '1h', label: '1H' },
];
const TF_COLORS: Record<string, string> = {
    '1m': '#94a3b8', '5m': '#a78bfa', '15m': '#60a5fa', '30m': '#fbbf24', '1h': '#34d399',
};
export default function TimeframeSelector({ selected, onChange }: Props) {
    return (
        <div className="flex items-center gap-1 px-3 py-2">
            <span className="text-xs font-mono text-slate-600 mr-2 tracking-widest">TIMEFRAME</span>
            {TFS.map(({ key, label }) => {
                const active = selected === key;
                const col = TF_COLORS[key];
                return (
                    <button
                        key={key}
                        onClick={() => onChange(key)}
                        style={{
                            background: active ? `${col}22` : 'transparent',
                            border: `1px solid ${active ? col : 'rgba(26,48,80,0.6)'}`,
                            color: active ? col : '#64748b',
                            boxShadow: active ? `0 0 8px ${col}44` : 'none',
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all duration-150 hover:opacity-80 cursor-pointer"
                    >
                        {label}
                    </button>
                );
            })}
            <div className="ml-auto text-xs font-mono text-slate-600">
                Chart · Indicators · Predictions synced to selected TF
            </div>
        </div>
    );
}
