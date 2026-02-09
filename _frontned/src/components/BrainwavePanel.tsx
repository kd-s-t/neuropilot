"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import EEGChart from "./EEGChart";
import { useEegWebSocket } from "@/hooks";
import { api } from "@/lib/api";

const INITIAL_EEG = {
  Delta: { power: [] as number[], range: [0.5, 4] as [number, number] },
  Theta: { power: [] as number[], range: [4, 8] as [number, number] },
  Alpha: { power: [] as number[], range: [8, 13] as [number, number] },
  Beta: { power: [] as number[], range: [13, 30] as [number, number] },
  Gamma: { power: [] as number[], range: [30, 100] as [number, number] },
};

type BrainwavePanelProps = {
  className?: string;
  enabled?: boolean;
};

export default function BrainwavePanel({ className = "", enabled = true }: BrainwavePanelProps) {
  const [eegData, setEegData] = useState(INITIAL_EEG);
  const [status, setStatus] = useState<{
    connected: boolean;
    message: string;
    has_data: boolean;
  } | null>(null);
  const [listening, setListening] = useState(false);

  const handleMessage = useCallback(
    (data: Record<string, { power: number; range?: [number, number] }>) => {
      const hasValid = Object.values(data).some((b) => b && typeof b.power === "number");
      if (!hasValid) return;
      setEegData((prev) => ({
        Delta: { ...prev.Delta, power: [...prev.Delta.power, data.Delta?.power ?? 0].slice(-100) },
        Theta: { ...prev.Theta, power: [...prev.Theta.power, data.Theta?.power ?? 0].slice(-100) },
        Alpha: { ...prev.Alpha, power: [...prev.Alpha.power, data.Alpha?.power ?? 0].slice(-100) },
        Beta: { ...prev.Beta, power: [...prev.Beta.power, data.Beta?.power ?? 0].slice(-100) },
        Gamma: { ...prev.Gamma, power: [...prev.Gamma.power, data.Gamma?.power ?? 0].slice(-100) },
      }));
    },
    []
  );

  useEegWebSocket({ enabled: enabled && listening, onMessage: handleMessage });

  useEffect(() => {
    if (!enabled) return;
    const check = async () => {
      try {
        const s = await api.eeg.getStatus();
        setStatus({ connected: s.connected, message: s.message, has_data: s.has_data });
      } catch {
        setStatus({ connected: false, message: "Backend unreachable", has_data: false });
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [enabled]);

  const noMuse = status !== null && !status.connected;

  if (status === null && enabled) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 p-6 ${className}`}
      >
        <p className="text-sm text-muted-foreground">Checking...</p>
      </div>
    );
  }

  if (noMuse && !listening) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 p-6 ${className}`}
      >
        <p className="text-sm text-muted-foreground text-center">No Muse detected</p>
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Start muselsl or BlueMuse and connect your Muse headband.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={async () => {
            try {
              await api.eeg.reconnect();
              const s = await api.eeg.getStatus();
              setStatus({ connected: s.connected, message: s.message, has_data: s.has_data });
              if (s.connected) setListening(true);
            } catch {
              setStatus({ connected: false, message: "Reconnect failed", has_data: false });
            }
          }}
        >
          Reconnect
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col rounded-lg border border-border overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-sm font-medium">Brainwave</span>
        {status?.connected && (
          <span className="text-xs text-muted-foreground">
            {status.has_data ? "Live" : "Waiting for data"}
          </span>
        )}
        {!listening && status?.connected && (
          <Button size="sm" variant="outline" onClick={() => setListening(true)}>
            Start
          </Button>
        )}
        {listening && (
          <Button size="sm" variant="ghost" onClick={() => setListening(false)}>
            Stop
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-[200px] p-2 flex flex-col">
        {listening && (
          <div className="h-[200px] w-full">
            <EEGChart eegData={eegData} />
          </div>
        )}
        {status?.connected && (
          <p className="text-xs text-muted-foreground mt-2">
            When your brainwave pattern matches a control, the backend will call the webhook.
          </p>
        )}
      </div>
    </div>
  );
}
