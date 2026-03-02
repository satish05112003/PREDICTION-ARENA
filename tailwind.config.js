/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                arena: {
                    bg: '#050b14',
                    surface: '#0a1628',
                    card: '#0f1f38',
                    border: '#1a3050',
                    accent: '#f59e0b',
                    gold: '#fbbf24',
                    green: '#10b981',
                    red: '#ef4444',
                    blue: '#3b82f6',
                    muted: '#64748b',
                },
            },
            fontFamily: {
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'glow': 'glow 2s ease-in-out infinite alternate',
                'flash-red': 'flash-red 0.5s ease-in-out',
                'slide-in': 'slide-in 0.3s ease-out',
            },
            keyframes: {
                glow: {
                    'from': { boxShadow: '0 0 5px #f59e0b, 0 0 10px #f59e0b' },
                    'to': { boxShadow: '0 0 20px #f59e0b, 0 0 40px #f59e0b' },
                },
                'flash-red': {
                    '0%, 100%': { backgroundColor: 'transparent' },
                    '50%': { backgroundColor: 'rgba(239, 68, 68, 0.3)' },
                },
                'slide-in': {
                    'from': { transform: 'translateY(-10px)', opacity: '0' },
                    'to': { transform: 'translateY(0)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
};
