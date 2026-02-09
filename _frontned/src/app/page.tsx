"use client";

import Image from "next/image";
import { Card } from "@heroui/react";

export default function Home() {
  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Welcome to Neuro<span className="text-accent">Pilot</span></h1>
        <p className="text-muted-foreground">
          Use your Muse 2 to stream EEG to the backend; the app shows live brainwave data. Practice in the Lab (3D simulation), record training sessions, bind them to machine controls, then trigger webhooks from the machine page or with your brainwaves to fly a real DJI Tello (takeoff, land, move).
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <Card.Header className="text-foreground">
            <Card.Title className="text-foreground">Step 1: Install and Start Muse Streamer</Card.Title>
            <Card.Description className="text-foreground">Install the platform-specific tool and start streaming EEG from your Muse 2. Keep it running for the next steps.</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4 text-foreground">
            <div className="flex justify-center">
              <div className="relative h-36 w-44 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
                <Image
                  src="/muse2.png"
                  alt="Muse 2 headband"
                  fill
                  className="object-contain p-2"
                  sizes="176px"
                />
              </div>
            </div>
            
            <div>
              <h3 className="mb-2 font-semibold">Windows 10 - BlueMuse:</h3>
              <div className="mb-4">
                <h4 className="mb-1 text-sm font-medium">Installation:</h4>
                <ol className="list-inside list-decimal space-y-2 text-sm">
                  <li>Download the BlueMuse installer and open the BlueMuse folder.</li>
                  <li>Run the Windows installer (launch the installer as Administrator).</li>
                  <li>If the installer fails, try the alternate installer included in the same folder.</li>
                </ol>
              </div>
              <div>
                <h4 className="mb-1 text-sm font-medium">Starting BlueMuse:</h4>
                <ol className="list-inside list-decimal space-y-2 text-sm">
                  <li>Open BlueMuse from the Start menu or launch the installed app</li>
                  <li>Ensure your Muse 2 headband is powered on and in pairing mode</li>
                  <li>BlueMuse will automatically detect and connect to your Muse 2 device</li>
                  <li>Verify the connection by checking that EEG data is streaming in BlueMuse</li>
                </ol>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="mb-2 font-semibold">Mac (M1/M2) - muselsl:</h3>
              <div className="mb-4">
                <h4 className="mb-1 text-sm font-medium">Installation:</h4>
                <ol className="list-inside list-decimal space-y-2 text-sm">
                  <li>Navigate to: <code className="rounded bg-muted px-1.5 py-0.5">Mac</code></li>
                  <li>Install muselsl: <code className="rounded bg-muted px-1.5 py-0.5">python3 -m pip install -r requirements.txt</code></li>
                  <li>Install LSL library: <code className="rounded bg-muted px-1.5 py-0.5">conda install -c conda-forge liblsl -y</code> (for arm64 compatibility)</li>
                </ol>
              </div>
              <div>
                <h4 className="mb-1 text-sm font-medium">Starting muselsl:</h4>
                <ol className="list-inside list-decimal space-y-2 text-sm">
                  <li>Start the muselsl streamer (follow the muselsl README for exact commands on your machine).</li>
                  <li>Ensure your Muse headband is powered on and in pairing mode.</li>
                  <li>muselsl will search for and connect to your Muse device via Bluetooth.</li>
                  <li>Keep the streamer running while using the app so EEG data is available.</li>
                  <li>See the Muselsl README for detailed setup instructions specific to your OS.</li>
                </ol>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Both BlueMuse (Windows) and muselsl (Mac) stream data to LSL, which our app reads via WebSocket.
              <br />
              <strong>Platform support:</strong> Both BlueMuse (Windows) and muselsl (Mac M1/M2) are fully working and tested. The FastAPI backend automatically detects Mac and configures the LSL library for arm64 compatibility.
            </p>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="text-foreground">
            <Card.Title className="text-foreground">Step 2: Run NeuroPilot and Connect Muse 2</Card.Title>
            <Card.Description className="text-foreground">Start the NeuroPilot backend and frontend, then connect your Muse 2 so the app shows live EEG.</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4 text-foreground">
            <ol className="list-inside list-decimal space-y-2 text-sm">
              <li>Start the NeuroPilot backend (e.g. <code className="rounded bg-muted px-1 py-0.5">_backend</code>, port 8000).</li>
              <li>Start the frontend (e.g. <code className="rounded bg-muted px-1 py-0.5">_frontned</code>, <code className="rounded bg-muted px-1 py-0.5">npm run dev</code>, port 3000).</li>
              <li>With the Muse streamer running (Step 1), put on your Muse 2 and connect it in BlueMuse or muselsl.</li>
              <li>Open <strong>EEG Device Calibration</strong> in the app to confirm live brainwave data from the backend.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              If you use muselsl on Mac and the backend did not auto-connect to the stream, call <code className="rounded bg-muted px-1 py-0.5">POST /eeg/reconnect</code> after the streamer is running.
            </p>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="text-foreground">
            <Card.Title className="text-foreground">Step 3: Practice and Train in Simulation, Then Bind Controls to DJI</Card.Title>
            <Card.Description className="text-foreground">Use Lab for 3D simulation, record Training sessions, then bind those sessions to machine controls for the DJI Tello.</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4 text-foreground">
            <ol className="list-inside list-decimal space-y-2 text-sm">
              <li>Open <strong>Lab</strong>, start listening, and practice controlling the 3D character with your brainwaves (simulation only).</li>
              <li>Open <strong>Training</strong> and record one or more sessions for the actions you want (e.g. takeoff, land, forward).</li>
              <li>Go to <strong>Machines</strong>, create or select a machine, and add control buttons (takeoff, land, forward, etc.).</li>
              <li>Bind each recorded Training session to the matching control (e.g. session “takeoff” → takeoff control). You will set each control’s webhook URL in Step 4.</li>
            </ol>
            <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4">
              <h4 className="mb-2 font-semibold">Brainwave Controls (Lab):</h4>
              <ul className="space-y-1 text-sm">
                <li>• <strong>Delta</strong> (deep focus): Move up (Power &gt; 1M)</li>
                <li>• <strong>Theta</strong>: Move left (Power &gt; 200k)</li>
                <li>• <strong>Alpha</strong>: Move right (Power &gt; 200k)</li>
                <li>• <strong>Beta</strong>: Move down (Power &gt; 100k)</li>
              </ul>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="text-foreground">
            <Card.Title className="text-foreground">Step 4: Run DJI Backend and Set Webhooks on Bind Controls</Card.Title>
            <Card.Description className="text-foreground">Start the DJI backend, connect to Tello Wi‑Fi, then set the webhook URL on each bound control.</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4 text-foreground">
            <div className="flex justify-center">
              <div className="relative h-36 w-44 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
                <Image
                  src="/djitello.png"
                  alt="DJI Tello drone"
                  fill
                  className="object-contain p-2"
                  sizes="176px"
                />
              </div>
            </div>
            <ol className="list-inside list-decimal space-y-2 text-sm">
              <li>Power on the Tello and connect your laptop to Tello Wi‑Fi (SSID e.g. "TELLO‑...").</li>
              <li>Start the DJI backend (e.g. <code className="rounded bg-muted px-1 py-0.5">python3 webhook_server.py</code> in <code className="rounded bg-muted px-1 py-0.5">dji_backend</code>). It listens at <code className="rounded bg-muted px-1 py-0.5">http://localhost:8888/command</code> and forwards commands to the Tello via UDP.</li>
              <li>In <strong>Machines</strong>, open your machine and edit each control (takeoff, land, forward, etc.). Set the webhook URL to <code className="rounded bg-muted px-1 py-0.5">http://localhost:8888/command</code> and save.</li>
              <li>Optional: on the machine page, click a control’s webhook button to test — the NeuroPilot backend POSTs to the DJI backend and the Tello should takeoff, land, or move.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              The frontend never calls 8888 directly; the NeuroPilot backend (port 8000) proxies webhook calls to the DJI backend.
            </p>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="text-foreground">
            <Card.Title className="text-foreground">Step 5: Connect with DJI and Tello — Brainwave Triggers Webhook</Card.Title>
            <Card.Description className="text-foreground">Open Connect on the machine page with the DJI backend and Tello running; when your brainwave matches a bound control, the backend calls the webhook and the Tello responds.</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4 text-foreground">
            <ol className="list-inside list-decimal space-y-2 text-sm">
              <li>Ensure the DJI backend is running and the Tello is connected (Step 4), and that your Muse 2 and NeuroPilot backend are running (Steps 1–2).</li>
              <li>Go to your machine page and click <strong>Connect</strong> to open the Connect view (live status and optional Tello camera).</li>
              <li>Start listening so the backend uses your live EEG. When your brainwave pattern matches a control you bound in Step 3, the backend fires that control’s webhook.</li>
              <li>The NeuroPilot backend POSTs to <code className="rounded bg-muted px-1 py-0.5">http://localhost:8888/command</code>; the DJI backend sends the command to the Tello. The real drone takes off, lands, or moves.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Safety: use small distances, keep line-of-sight, and be ready to land if the drone misbehaves.
            </p>
          </Card.Content>
        </Card>

        <Card className="border-destructive/50 bg-destructive/5">
          <Card.Header>
            <Card.Title className="text-destructive">Troubleshooting</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-2 text-sm text-foreground">
            <p><strong>Muse streamer not connecting?</strong> Check that your Muse is charged and in pairing mode. Restart BlueMuse (Windows) or muselsl (Mac) if needed.</p>
            <p><strong>No EEG data?</strong> Verify your streamer (BlueMuse or muselsl) is running and connected. Check console for error messages.</p>
            <p><strong>Machine not responding?</strong> Ensure your machine is properly configured in the Machines page and that training sessions are bound to controls.</p>
            <p><strong>WebSocket errors?</strong> Make sure the FastAPI backend is running on <code className="rounded bg-muted px-1.5 py-0.5">http://localhost:8000</code></p>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
