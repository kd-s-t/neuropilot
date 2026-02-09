# Next.js Frontend

Modern React application for NeuroPilot - a brain-computer interface system that enables hands-free machine and robotics control using real-time EEG brainwave signals. Train your brainwave patterns and bind them to machine controls for drones, robots, or any automated system.

## Setup (First Time)

1. **Use correct Node version** (if using nvm):
```powershell
cd _Frontned
nvm use
```

2. **Install dependencies**:
```powershell
npm install
```

If installation fails, try:
```powershell
npm install --legacy-peer-deps
```

## Environment (optional)

Defaults: `BACKEND_URL=http://localhost:8000`, `NEXTAUTH_SECRET=dev-secret`. Override via `.env.local`:

```env
BACKEND_URL=http://localhost:8000
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000
```

## Run Development Server

```powershell
npm run dev
```

Frontend at `http://localhost:3000`

**Troubleshooting:**
- If port 3000 is in use, Next.js will use the next available port
- Check Node version: `node --version` (should be >=18.17.0)
- Clear cache: `rm -rf .next node_modules && npm install`

## Build for Production

```powershell
npm run build
npm start
```

## First Time Setup

1. Register a new user at `/login`
2. Login with your credentials
3. You'll be redirected to the Realtime page

## Pages

- `/` - Introduction and 5-step setup (Muse streamer, NeuroPilot, practice/bind, DJI webhooks, Connect)
- `/login` - Login/Register
- `/realtime` - Real-time EEG visualization
- `/training` - Brainwave-controlled training game (simulation)
- `/machines` - Machine management - create and manage machines
- `/machines/[id]` - Machine control interface with visual control mapping
- `/events` - Action logs table
- `/websocket` - Raw brainwave data chart
- `/events-component` - Detected events list

## Tech Stack

- **Next.js 15** - React framework with App Router
- **NextAuth** - Authentication with JWT
- **shadcn/ui** - UI components
- **Tailwind CSS** - Styling
- **Chart.js** - EEG charts and brainwave visualization
- **Recharts** - WebSocket data visualization
- **React Flow** - Visual control mapping interface for machines

## Platform Support

**Windows 10** - Use BlueMuse (included in `BlueMuse2/` directory)  
**Mac (M1/M2)** - Use muselsl (see `Muselsl/` directory for setup)

Both BlueMuse and muselsl are fully supported and tested.
