# BTC Prediction Arena

BTC Prediction Arena is a real-time cryptocurrency prediction engine, visualization dashboard, and automated machine learning environment. The system actively watches live Bitcoin prices from the Coinbase Advanced Trade WebSockets API, processes multiple technical indicators across various timeframes, and predicts price movements. 

It uniquely combines a proprietary Weighted Probability Scoring model (Logistic Regression) in a Node.js backend with an isolated Python-based Machine Learning service (Random Forest) that continuously trains itself on historical snapshot data. The engine enforces quality through a strict "AI Survival" mechanic, killing and reviving prediction models based on real-time accuracy.

## Core Architecture and Workflows

### 1. Data Ingestion & Live Processing
The system maintains a persistent connection to Coinbase WebSockets, receiving instant tick updates. Rather than waiting for 1-minute candles to close, the Node.js backend broadcasts these ticks to the React frontend at a throttled rate (max 10Hz) to provide zero-delay price tracking. It simultaneously constructs 1m, 5m, 15m, 30m, and 1h candlestick arrays in memory.

### 2. Time-Locked IST Snapshot Engine
To ensure absolute accountability and prevent "repainting" (the common flaw in trading algorithms where past indicators change after the fact), the system utilizes an IST (Indian Standard Time) locking mechanism. 
At exact clock boundaries (e.g., the exact turn of a 5-minute mark), the server takes a hard snapshot of the current price, the current technical indicators, and issues a locked prediction. When the timeframe concludes, the actual price is compared against the snapshot price to permanently log a WIN, LOSS, or DRAW.

### 3. The Backend Mathematical Model (Logistic Regression)
Before integrating deep learning, the Node.js server generates a baseline prediction using a purely mathematical Weighted Probability Scoring system. Raw indicators are normalized using formulas (like Tanh) and fed into a logistic regression equation.
The features tracked include:
- Trend Alignment (EMA 50 vs EMA 200)
- MACD Momentum and Histogram Expansion
- Relative Strength Index (RSI) Zones
- Order Block/Imbalance Detection
- Volume Profile Point of Control (POC) Distance
- VWAP Deviation
- Volatility Ratio (ATR vs SMA of ATR)
- Market Structure Breakouts (BOS)
- Hurst Exponent (Trend vs Mean-Reverting classification)

If the resulting probability exceeds an adaptive threshold (typically 55%, but rising to 65% in Strict Mode during low accuracy periods), a directional prediction is issued.

### 4. The Python Machine Learning Next-Candle Engine
Running as an independent microservice via Flask, the Machine Learning module brings continuous adaptation to the system. 
- Snapshot Storage: Every 5 minutes, the Node server sends the current normalized indicator matrix to the Python API. The Python script stores this in memory.
- Multi-Snapshot Feature Engineering: The ML model does not look at a single moment in time. It flattens the last 5 continuous snapshots (t-4, t-3, t-2, t-1, and t0) into a single large feature vector. This provides the AI with temporal context, allowing it to "see" momentum changes and indicator evolution over the last 25 minutes.
- Auto-Labeling and Retraining: As 5-minute candles close, the Node server informs Python of the final result (UP or DOWN). Python labels its dataset and saves it to a CSV. Once enough data is accumulated featuring both upward and downward market movement, it automatically retrains its Scikit-Learn RandomForestClassifier in the background.
- Live Confidence: While the Node server manages the mathematical baseline, the Python ML engine feeds an independent "Next 5M Model Confidence" score directly into the React UI.

### 5. AI Survival Game Logic
The engine is held to a high standard through a gamified survival mechanic:
- Lives: The active AI begins with 3 lives. Every sequential loss burns a life. Winning restores momentum.
- Rolling Thresholds: The system tracks a Rolling 50 Prediction Accuracy.
- Death and Generation Archiving: If lives fall to zero, or if the rolling accuracy drops below critical thresholds, the active AI "dies". Its performance, highest win streak, and survival duration are permanently archived into the Generation History. A new Generation is spawned to take its place.

## Tech Stack

### Frontend UI
- Next.js (App Router)
- React & TypeScript
- Tailwind CSS (Deep dark mode, glassmorphism UI)
- Lightweight Charts (by TradingView) for raw candle rendering
- Lucide React for iconography

### Backend Node.js Server
- Node.js
- WebSockets (`ws`)
- Real-time internal state management, mathematical evaluation, and client broadcasting.

### Backend Python ML Service
- Python 3
- Flask & Flask-CORS (Microservice API)
- Pandas & NumPy (Data manipulation)
- Scikit-Learn (RandomForestClassifier for ML Predictions)
- Joblib (Model serialization)

### Process Management
- PM2 (Production Process Manager)
- An `ecosystem.config.js` file handles the 24/7 background operation of the Next.js frontend, the Node.js websocket engine, and the Python ML service simultaneously with automatic restart logic on failure.

## Getting Started

Because the architecture requires three separate environments running simultaneously, PM2 is the standard approach for booting the Arena.

1. Install Node Dependencies:
   npm install

2. Install Python Dependencies:
   pip install pandas numpy scikit-learn flask flask-cors websockets

3. Start the Ecosystem via PM2:
   pm2 start ecosystem.config.js
   
4. Access the Application:
   Navigate to HTTP://localhost:3000

The UI will initially say "GATHERING SNAPSHOTS" for the ML section until the Python engine has witnessed 5 full 5-minute candles. The Node mathematical predictions, real-time chart, and live tracking will perform immediately.
