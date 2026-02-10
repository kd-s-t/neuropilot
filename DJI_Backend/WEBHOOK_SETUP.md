# DJI Webhook Setup Guide

## Overview

The DJI integration uses a **webhook architecture** where:
- **FastAPI** detects brainwave patterns and calls webhooks
- **DJI Webhook Server** receives commands and executes them on Tello

## Setup Steps

### 1. Start DJI Webhook Server

```bash
cd dji
python3 -m pip install -r requirements.txt
./start_webhook.sh
```

Server runs on: `http://localhost:8888`

### 2. Connect to Tello WiFi

1. Power on Tello drone
2. Connect computer to `TELLO-XXXXXX` WiFi
3. Verify: `ping 192.168.10.1`

### 3. Configure Machine in Web UI

1. Go to `http://localhost:3000/machines`
2. Create or edit your machine (ID: 1)
3. Set webhook URL: `http://localhost:8888/command`

**Via API:**
```bash
curl -X PUT "http://localhost:8000/machines/1/webhook?webhook_url=http://localhost:8888/command" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Set Up Controls & Bindings

1. Add controls to machine (forward, back, takeoff, land, etc.)
2. Train brainwave patterns in Training page
3. Bind training sessions to controls

### 5. Start FastAPI Backend

```bash
cd FastAPI
python3 -m alembic upgrade head  # Run migration for webhook_url
python3 -m uvicorn app:app --reload
```

## How It Works

1. **FastAPI** processes brainwave data every 100ms
2. Compares patterns against training session bindings
3. When pattern matches → **HTTP POST** to webhook URL:
   ```json
   {
     "control_id": "forward",
     "value": 20
   }
   ```
4. **DJI Webhook Server** receives command
5. Converts `control_id` to Tello command (`forward 20`)
6. Executes command on Tello drone

## Testing

### Test Webhook Server Directly

```bash
curl -X POST http://localhost:8888/command \
  -H "Content-Type: application/json" \
  -d '{"control_id": "takeoff"}'
```

### Check Health

```bash
curl http://localhost:8888/health
```

## Architecture

```
┌─────────────┐
│  Muse       │
│  Headset    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  FastAPI    │ ← Detects patterns
│  Backend    │ ← Calls webhook
└──────┬──────┘
       │ HTTP POST
       │ {control_id: "forward"}
       ▼
┌─────────────┐
│  DJI        │ ← Receives command
│  Webhook    │ ← Executes on Tello
│  Server     │
└──────┬──────┘
       │ UDP
       ▼
┌─────────────┐
│  Tello      │
│  Drone      │
└─────────────┘
```

## Troubleshooting

### Webhook not receiving calls
- Check FastAPI logs for webhook calls
- Verify webhook_url is set in machine config
- Test webhook directly with curl

### Tello not responding
- Check WiFi connection
- Verify Tello IP: `ping 192.168.10.1`
- Check webhook server logs

### Patterns not matching
- Verify bindings exist in database
- Check training session data
- Review pattern matching thresholds
