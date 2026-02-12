# FastAPI Backend

## Setup (First Time)

### Windows
1. **Install PostgreSQL** (https://www.postgresql.org/download/windows/). During setup, set password for user `postgres` to `root` (or set `DATABASE_URL` in a `.env` file in `_backend`).
2. **Create the database** (psql or pgAdmin):
   ```sql
   CREATE DATABASE neuropilot;
   ```
3. **Then run:**
```powershell
cd _backend
python3 -m pip install -r requirements.txt
python3 -m alembic upgrade head
```

### Mac (M1/M2) - Fully Supported
```bash
cd _backend
python3 -m pip install -r requirements.txt
python3 -m alembic upgrade head

# Install LSL library via conda (recommended for arm64 compatibility)
conda install -c conda-forge liblsl -y
```

**Note:** The start script (`./start_server.sh`) automatically configures the LSL library path for Mac.

### Linux
```bash
cd _backend
python3 -m pip install -r requirements.txt
python3 -m alembic upgrade head
```


### Raspberry Pi 4 B
```bash
cd _backend
source venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m alembic upgrade head
```

## Run Backend

### Windows
```powershell
python3 -m uvicorn app:app --reload
```

### Mac (M1/M2) - Recommended Method
```bash
./start_server.sh
```

The start script automatically:
- Detects Mac platform
- Configures LSL library path (conda or homebrew)
- Provides platform-specific guidance

**Alternative (manual):**
```bash
uvicorn app:app --reload
```

**Note:** The backend does not search for a Muse stream at startup. When muselsl is running, use `POST /eeg/reconnect` to connect to the EEG stream (or start muselsl before the backend and call reconnect from the app).

**DJI Camera (same env as np camera):** If you run np camera with a different Python (e.g. one where opencv works), use that same interpreter for neuropilot so the Tello stream works. From the np camera backend directory run `which python`, then from neuropilot backend run:
```bash
NEUROPILOT_PYTHON=/path/from/which/python ./start_server.sh
```
That Python must have neuropilot dependencies installed (`pip install -r requirements.txt`).

### Linux
```bash
uvicorn app:app --reload
```


### Raspberry Pi 4 B
```bash
source venv/bin/activate
uvicorn app:app --reload
muselsl stream
```

Server runs at: `http://localhost:8000`

The PostgreSQL database (`neuropilot`) tables will be created automatically on first run.

## Alternative (Windows with venv)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\venv\Scripts\Activate.ps1
uvicorn app:app --reload
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login (returns JWT token)
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user (requires auth)

### Data
- `GET /events` - Get detected events
- `GET /brainwaves` - Get brainwave data
- `GET /log_action` - Get action logs

### WebSocket
- `WS /ws` - WebSocket for raw brainwave data
- `WS /ws/eeg` - WebSocket for frequency band powers

## Environment Variables

Set `BACKEND_URL` (default: `http://localhost:8000`) for the frontend to connect.
