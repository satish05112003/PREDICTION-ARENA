const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🛑 Stopping PM2 services...');
try {
    execSync('pm2 stop btc-arena-server btc-arena-python-ml', { stdio: 'inherit' });
} catch (e) {
    console.log('Note: PM2 services might not be running. Proceeding with reset...');
}

console.log('🧹 Wiping Node.js backend stats (arena-data.json)...');
const nodeDataPath = path.join(__dirname, '../server/arena-data.json');
const emptyNodeData = {
    "generationsLIVE": [],
    "generationsSNAP": [],
    "lifetimeStatsLIVE": { "totalPredictions": 0, "totalWins": 0, "totalLosses": 0, "lifetimeAccuracy": 0, "bestGenAccuracy": 0, "worstGenAccuracy": 100, "highestWinStreak": 0, "totalGenerations": 1, "snapWins": 0, "snapLosses": 0 },
    "lifetimeStatsSNAP": { "totalPredictions": 0, "totalWins": 0, "totalLosses": 0, "lifetimeAccuracy": 0, "bestGenAccuracy": 0, "worstGenAccuracy": 100, "highestWinStreak": 0, "totalGenerations": 1, "snapWins": 0, "snapLosses": 0 },
    "dailyStatsLIVE": { "date": "", "total": 0, "wins": 0, "losses": 0, "accuracy": 0, "streak": 0, "longestWinStreak": 0, "longestLossStreak": 0, "byTF": { "5m": { "t": 0, "w": 0 }, "15m": { "t": 0, "w": 0 }, "30m": { "t": 0, "w": 0 }, "1h": { "t": 0, "w": 0 } }, "snapshots": { "total": 0, "wins": 0 } },
    "dailyStatsSNAP": { "date": "", "total": 0, "wins": 0, "losses": 0, "accuracy": 0, "streak": 0, "longestWinStreak": 0, "longestLossStreak": 0, "byTF": { "5m": { "t": 0, "w": 0 }, "15m": { "t": 0, "w": 0 }, "30m": { "t": 0, "w": 0 }, "1h": { "t": 0, "w": 0 } }, "snapshots": { "total": 0, "wins": 0 } },
    "snapshots": [], "history": [], "snapshotFiredKeys": [],
    "aiLIVE": { "generation": 1, "startTime": null, "longestWinStreak": 0, "longestLossStreak": 0, "lives": 3, "accuracy": 100, "wins": 0, "losses": 0, "streak": 0, "consecutiveLosses": 0, "totalPredictions": 0, "status": "ALIVE", "confidenceThreshold": 55, "volatilityMode": "AGGRESSIVE", "rolling50Accuracy": 100, "avgConfidence": 0, "upBias": 50, "downBias": 50 },
    "aiSNAP": { "generation": 1, "startTime": null, "longestWinStreak": 0, "longestLossStreak": 0, "lives": 3, "accuracy": 100, "wins": 0, "losses": 0, "streak": 0, "consecutiveLosses": 0, "totalPredictions": 0, "status": "ALIVE", "confidenceThreshold": 55, "volatilityMode": "AGGRESSIVE", "rolling50Accuracy": 100, "avgConfidence": 0, "upBias": 50, "downBias": 50 },
    "mlWeights": { "s_MACD": 0.1, "s_RSI": 0.1, "s_EMA": 0.1, "s_OB": 0.15, "s_VP": 0.1, "s_VWAP": 0.15, "s_VOL": 0.1, "s_MS": 0.1, "s_H": 0.05, "s_OI": 0.0, "s_FR": 0.0, "bias": 0 }
};
fs.writeFileSync(nodeDataPath, JSON.stringify(emptyNodeData, null, 2));

console.log('🧹 Wiping Python Machine Learning datasets and logs...');
const mlDatasetPath = path.join(__dirname, '../dataset/snapshots.csv');
const mlLogPath = path.join(__dirname, '../logs/predictions_ml.csv');
const mlModelPath = path.join(__dirname, '../models/btc_direction_model.json');

if (fs.existsSync(mlDatasetPath)) fs.unlinkSync(mlDatasetPath);
if (fs.existsSync(mlLogPath)) fs.unlinkSync(mlLogPath);
if (fs.existsSync(mlModelPath)) fs.unlinkSync(mlModelPath);

console.log('🟢 Restarting PM2 services...');
try {
    execSync('pm2 restart btc-arena-server btc-arena-python-ml', { stdio: 'inherit' });
} catch (e) {
    console.log('Failed to restart. You may need to run pm2 manually.');
}

console.log('✨ System successfully reset to Generation 1 (Zero Stats)!');
