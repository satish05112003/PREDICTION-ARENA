import os
import time
import json
import logging
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

DATASET_PATH = '../../dataset/snapshots.csv'
LOG_PATH = '../../logs/predictions_ml.csv'
MODEL_PATH = '../../models/btc_direction_model.json'

os.makedirs('../../dataset', exist_ok=True)
os.makedirs('../../logs', exist_ok=True)
os.makedirs('../../models', exist_ok=True)

# Memory for last 5 snapshots
recent_snapshots = []

KEYS = ['rsi', 'macd_hist', 'ema_bias', 'vwap_dev', 'poc_distance', 
        'momentum_slope', 'orderbook_imbalance', 'hurst', 'atr', 'oi_delta']

def init_csv():
    if not os.path.exists(DATASET_PATH):
        df = pd.DataFrame(columns=['timestamp', 'price'] + KEYS + ['label'])
        df.to_csv(DATASET_PATH, index=False)
    if not os.path.exists(LOG_PATH):
        df = pd.DataFrame(columns=['timestamp', 'snapshot_price', 'prediction', 'confidence', 'actual_result', 'correct'])
        df.to_csv(LOG_PATH, index=False)

init_csv()

def build_feature_vector(snaps):
    # Flatten the last 5 snapshots (must have length 5)
    features = []
    for s in snaps:
        for k in KEYS:
            features.append(s.get(k, 0.0))
    return np.array(features).reshape(1, -1)

@app.route('/snapshot', methods=['POST'])
def handle_snapshot():
    global recent_snapshots
    data = request.json
    
    timestamp = data.get('timestamp')
    price = data.get('price')
    ind = data.get('indicators', {})
    
    # Store snapshot raw data
    snap = {
        'id': data.get('id', str(time.time())),
        'timestamp': timestamp,
        'price': price,
        'rsi': ind.get('s_RSI', 0),
        'macd_hist': ind.get('s_MACD', 0),
        'ema_bias': ind.get('s_EMA', 0),
        'vwap_dev': ind.get('s_VWAP', 0),
        'poc_distance': ind.get('s_VP', 0),
        'momentum_slope': ind.get('s_MS', 0),
        'orderbook_imbalance': ind.get('s_OB', 0),
        'hurst': ind.get('s_H', 0),
        'atr': ind.get('s_VOL', 0),
        'oi_delta': ind.get('s_OI', 0),
        'label': None  # To be filled when next candle closes
    }
    
    recent_snapshots.append(snap)
    if len(recent_snapshots) > 5:
        # Before we pop, if the 6th oldest has a label, save it to CSV!
        oldest = recent_snapshots.pop(0)
        if oldest['label'] is not None:
            df = pd.DataFrame([oldest])
            df.drop(columns=['id'], inplace=True, errors='ignore')
            df.to_csv(DATASET_PATH, mode='a', header=False, index=False)

    # Predict Next Direction if we have 5 snapshots
    prediction_result = None
    if len(recent_snapshots) == 5:
        try:
            if os.path.exists(MODEL_PATH):
                clf = joblib.load(MODEL_PATH)
                features = build_feature_vector(recent_snapshots)
                
                # Safely map probabilities according to what the model actually knows
                classes = list(clf.classes_)
                if 1 in classes:
                    idx = classes.index(1)
                    conf = float(prob_classes[idx])
                else:
                    conf = 0.0 # Only knows DOWN

                
                if conf > 0.55:
                    direction = 'UP'
                elif conf < 0.45:
                    direction = 'DOWN'
                    conf = 1.0 - conf
                else:
                    direction = 'NEUTRAL'
                    conf = max(conf, 1.0 - conf)
                    
                prediction_result = {
                    'prediction': direction,
                    'confidence': round(conf * 100, 1),
                    'timestamp': timestamp,
                    'price': price,
                    'id': snap['id']
                }
            else:
                # Mock ML if it's not trained yet to let UI work
                prediction_result = {
                    'prediction': 'READY_WAITING_DATA',
                    'confidence': 50.0,
                    'timestamp': timestamp,
                    'price': price,
                    'id': snap['id']
                }
        except Exception as e:
            logging.error(f"Prediction error: {e}")
            prediction_result = {'prediction': 'ERROR', 'confidence': 0}
            
    return jsonify({"status": "ok", "prediction": prediction_result})

@app.route('/resolve', methods=['POST'])
def handle_resolve():
    data = request.json
    record_id = data.get('id')
    close_price = data.get('close_price')
    ml_pred = data.get('ml_prediction') # if it had one
    ml_conf = data.get('ml_confidence')
    
    label = "DOWN"
    
    # Find snapshot in memory and label it
    for s in recent_snapshots:
        if s['id'] == record_id:
            label = "UP" if close_price > s['price'] else "DOWN"
            s['label'] = label
            break
            
    # Log prediction accuracy if there was a prediction
    if ml_pred and ml_pred != 'READY_WAITING_DATA' and ml_pred != 'NEUTRAL' and ml_pred != 'ERROR':
        log_entry = pd.DataFrame([{
            'timestamp': data.get('timestamp', datetime.now().isoformat()),
            'snapshot_price': data.get('snapshot_price', 0),
            'prediction': ml_pred,
            'confidence': ml_conf,
            'actual_result': label,
            'correct': 'YES' if label == ml_pred else 'NO'
        }])
        log_entry.to_csv(LOG_PATH, mode='a', header=False, index=False)
        
    # Auto-Retrain if dataset is big enough
    if os.path.exists(DATASET_PATH):
        df = pd.read_csv(DATASET_PATH)
        if len(df) >= 20 and len(df) % 10 == 0: # Retrain every 10 new samples
            train_model()
            
    return jsonify({"status": "ok"})

def train_model():
    """Retrain the XGBoost model using back history of 5 snapshots"""
    try:
        df = pd.read_csv(DATASET_PATH)
        if len(df) < 5: return False
        
        # We need to build the multi-snapshot dataset
        # For each row i (where i >= 4), the features are row[i-4], row[i-3], row[i-2], row[i-1], row[i]
        X, y = [], []
        for i in range(4, len(df)):
            if pd.isna(df.iloc[i]['label']): continue
            
            feat = []
            for j in range(i-4, i+1):
                row_vals = df.iloc[j][KEYS].values
                feat.extend(row_vals)
                
            X.append(feat)
            y.append(1 if df.iloc[i]['label'] == 'UP' else 0)
            
        if len(X) < 10: return False # not enough data
        
        X = np.array(X, dtype=float)
        y = np.array(y, dtype=int)
        
        # Don't train if we only have one outcome (it will just predict that outcome forever)
        if len(np.unique(y)) < 2:
            logging.info("Only 1 class present in labels. Waiting for both UP and DOWN before training.")
            return False
        
        # Train RandomForest
        clf = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42)
        clf.fit(X, y)
        
        joblib.dump(clf, MODEL_PATH)
        logging.info("Model retrained successfully.")
        return True
    except Exception as e:
        logging.error(f"Retrain error: {e}")
        return False

@app.route('/train', methods=['POST'])
def force_train():
    res = train_model()
    return jsonify({"status": "ok" if res else "failed"})

if __name__ == '__main__':
    app.run(port=5000, host='0.0.0.0')
