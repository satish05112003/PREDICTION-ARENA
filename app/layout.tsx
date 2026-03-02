import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'BTC Prediction Arena — Live AI vs Bitcoin',
    description:
        'Watch a rule-based AI predict Bitcoin price direction in real time. Tracks its own accuracy. Lives or dies by its performance. Public. Transparent. Intense.',
    keywords: ['bitcoin', 'btc', 'prediction', 'ai', 'trading', 'live', 'indicator'],
    openGraph: {
        title: 'BTC Prediction Arena',
        description: 'Live AI prediction engine for BTC/USD. Win. Lose. Survive.',
        type: 'website',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="font-sans antialiased">{children}</body>
        </html>
    );
}
