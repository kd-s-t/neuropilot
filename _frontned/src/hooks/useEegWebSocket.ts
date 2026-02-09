"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

export type EegMessage = Record<string, { power: number; range?: [number, number] }>;

export function useEegWebSocket(options: {
  enabled: boolean;
  onMessage?: (data: EegMessage) => void;
}) {
  const { enabled, onMessage } = options;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) {
      console.log("EEG WebSocket disabled");
      return;
    }

    const wsUrl = `${api.wsBase}/ws/eeg`;
    console.log("Connecting to EEG WebSocket:", wsUrl);
    
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isIntentionallyClosed = false;
    
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log("EEG WebSocket connected successfully");
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
          }
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as EegMessage;
            // Log first message and then every 50th message (every 5 seconds at 0.1s interval)
            const hasData = Object.values(data).some(band => band && typeof band.power === 'number' && band.power > 0);
            if (hasData || Object.keys(data).length === 0) {
              const maxPower = Math.max(...Object.values(data).map(b => b?.power || 0));
              console.log(`EEG data received: ${Object.keys(data).length} bands, max power: ${maxPower.toFixed(2)}`, data);
            }
            onMessageRef.current?.(data);
          } catch (err) {
            console.error("Error parsing EEG message:", err, event.data);
          }
        };
        
        ws.onerror = (e) => {
          console.error("EEG WebSocket error:", e);
          console.error("Make sure the FastAPI backend is running on", api.base);
        };
        
        ws.onclose = (ev) => {
          if (isIntentionallyClosed) {
            console.log("EEG WebSocket closed normally");
            return;
          }
          
          if (ev.code !== 1000) {
            console.error(`EEG WebSocket closed unexpectedly (code: ${ev.code}, reason: ${ev.reason || 'none'})`);
            console.error("Attempting to reconnect in 3 seconds...");
            
            // Attempt to reconnect after 3 seconds
            reconnectTimeout = setTimeout(() => {
              if (enabled && !isIntentionallyClosed) {
                console.log("Reconnecting to EEG WebSocket...");
                connect();
              }
            }, 3000);
          }
        };
      } catch (err) {
        console.error("Failed to create WebSocket:", err);
        console.error("WebSocket URL:", wsUrl);
        console.error("Make sure the FastAPI backend is running on", api.base);
      }
    };
    
    connect();

    return () => {
      isIntentionallyClosed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.log("Closing EEG WebSocket");
        ws.close(1000, "Stop listening");
      }
    };
  }, [enabled]);
}
