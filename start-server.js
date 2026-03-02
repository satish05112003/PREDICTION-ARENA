/**
 * start-server.js — Safe server launcher
 * Kills any process on port 8080 first, then starts fresh.
 */
const { execSync, spawn } = require('child_process');

// Kill any existing process on port 8080
try {
    if (process.platform === 'win32') {
        const result = execSync('netstat -ano | findstr :8080', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const lines = result.split('\n').filter(l => l.includes('LISTENING') || l.includes('ESTABLISHED'));
        const pids = [...new Set(lines.map(l => l.trim().split(/\s+/).pop()))].filter(Boolean);
        for (const pid of pids) {
            try {
                execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                console.log(`[START] Killed old process PID ${pid}`);
            } catch (_) { }
        }
    }
} catch (_) {
    // No process on port 8080 — that's fine
}

// Short delay then start
setTimeout(() => {
    console.log('[START] Launching BTC Prediction Arena server...');
    const child = spawn(process.execPath, ['server/index.js'], {
        stdio: 'inherit',
        cwd: process.cwd(),
    });
    child.on('exit', (code) => {
        console.error(`[START] Server exited with code ${code}. Restarting in 3s...`);
        setTimeout(() => require('./start-server'), 3000);
    });
}, 500);
