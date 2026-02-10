"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";
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

function formatNumber(num: number) {
  if (num >= 1e6) return (num / 1e6).toFixed(1) + "m";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "k";
  if (num >= 100) return num.toFixed(0);
  return num.toFixed(2);
}

interface RealtimeProps {
  hideControls?: boolean;
  externalListening?: boolean;
  onListeningChange?: (listening: boolean) => void;
}

export default function EEGDeviceCalibration(props: RealtimeProps = {}) {
  const { hideControls = false, externalListening, onListeningChange } = props;
  const [eegData, setEegData] = useState(INITIAL_EEG);
  const [internalListening, setInternalListening] = useState(false);
  const [backendStatus, setBackendStatus] = useState<{ connected: boolean; message: string; has_data: boolean } | null>(null);

  const isListening = externalListening !== undefined ? externalListening : internalListening;
  
  const setIsListening = useCallback(
    (value: boolean) => {
      if (externalListening !== undefined) {
        // When externally controlled, notify parent
        if (onListeningChange) {
          onListeningChange(value);
        }
      } else {
        // Internal control
        setInternalListening(value);
      }
    },
    [externalListening, onListeningChange]
  );

  const handleMessage = useCallback(
    (data: Record<string, { power: number; range?: [number, number] }>) => {
      // Update data even if power is 0, but validate the structure
      const hasValidStructure = Object.values(data).some(band => band && typeof band.power === 'number');
      
      if (hasValidStructure) {
        // Log first few messages to debug
        const maxPower = Math.max(...Object.values(data).map(b => b?.power || 0));
        if (maxPower > 0) {
          console.log("Realtime: Received EEG data with non-zero values", data);
        }
        
        setEegData((prev) => {
          const newData = {
            Delta: { ...prev.Delta, power: [...prev.Delta.power, data.Delta?.power ?? 0].slice(-100) },
            Theta: { ...prev.Theta, power: [...prev.Theta.power, data.Theta?.power ?? 0].slice(-100) },
            Alpha: { ...prev.Alpha, power: [...prev.Alpha.power, data.Alpha?.power ?? 0].slice(-100) },
            Beta: { ...prev.Beta, power: [...prev.Beta.power, data.Beta?.power ?? 0].slice(-100) },
            Gamma: { ...prev.Gamma, power: [...prev.Gamma.power, data.Gamma?.power ?? 0].slice(-100) },
          };
          
          return newData;
        });
      } else {
        console.warn("Realtime: Received invalid EEG data structure", data);
      }
    },
    []
  );

  useEegWebSocket({ enabled: isListening, onMessage: handleMessage });

  // Reset data when starting to listen
  useEffect(() => {
    if (isListening) {
      setEegData(INITIAL_EEG);
    }
  }, [isListening]);

  // Check backend status periodically
  useEffect(() => {
    if (!isListening) return;
    
    const checkStatus = async () => {
      try {
        const status = await api.eeg.getStatus();
        setBackendStatus(status);
        if (!status.connected) {
          console.warn("Backend not connected to EEG stream:", status.message);
        } else if (!status.has_data) {
          console.warn("Backend connected but no data received yet");
        }
      } catch (err) {
        console.error("Failed to check EEG status:", err);
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [isListening]);

  const handleStart = useCallback(() => {
    console.log('Start listening clicked, current state:', isListening);
    setIsListening(true);
  }, [setIsListening, isListening]);
  
  const handleStop = useCallback(() => {
    console.log('Stop listening clicked');
    setIsListening(false);
  }, [setIsListening]);

  const handleReconnect = useCallback(async () => {
    try {
      console.log('Attempting to reconnect backend to EEG stream...');
      const result = await api.eeg.reconnect();
      if (result.success) {
        console.log('Reconnect successful:', result.message);
        // Check status again after a short delay
        setTimeout(async () => {
          try {
            const status = await api.eeg.getStatus();
            setBackendStatus(status);
          } catch (err) {
            console.error("Failed to check status after reconnect:", err);
          }
        }, 1000);
      } else {
        console.error('Reconnect failed:', result.message);
        alert(`Failed to connect: ${result.message}\n\nMake sure muselsl is running and streaming.`);
      }
    } catch (err) {
      console.error('Error reconnecting:', err);
      alert('Failed to reconnect. Check console for details.');
    }
  }, []);

  const bandEntries = useMemo(() => Object.entries(eegData), [eegData]);

  return (
    <div className="space-y-6">
      {!hideControls && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">EEG Device Calibration</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect, calibrate, and test your EEG device in real time.
            </p>
            {isListening && backendStatus && (
              <div className="mt-1 flex items-center gap-2">
                <p className={`text-xs ${backendStatus.connected && backendStatus.has_data ? 'text-green-600' : 'text-yellow-600'}`}>
                  Backend: {backendStatus.message}
                  {backendStatus.connected && !backendStatus.has_data && " (waiting for data...)"}
                </p>
                {!backendStatus.connected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReconnect}
                    className="h-6 text-xs"
                  >
                    Reconnect
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isListening && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <span className="text-sm font-medium">Recording</span>
              </div>
            )}
            <Button
              onClick={handleStart}
              disabled={isListening}
              size="lg"
              className="min-w-[140px] bg-green-600 hover:bg-green-700 text-white"
            >
              <Play className="mr-2 h-4 w-4" />
              {isListening ? "Listening..." : "Start listening"}
            </Button>
            <Button
              variant="outline"
              onClick={handleStop}
              disabled={!isListening}
              size="lg"
              className="min-w-[140px] border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
            >
              <Square className="mr-2 h-4 w-4" />
              Stop listening
            </Button>
          </div>
        </div>
      )}
      <EEGChart eegData={eegData} />
      <ul className="mt-4 grid list-disc grid-cols-2 gap-x-6 gap-y-1 pl-6">
        {bandEntries.map(([band, { power, range }]) => (
          <li key={band}>
            {band}: {power.length ? formatNumber(power[power.length - 1]) : "N/A"} (
            {range[0]}–{range[1]} Hz)
          </li>
        ))}
      </ul>
    </div>
  );
}
