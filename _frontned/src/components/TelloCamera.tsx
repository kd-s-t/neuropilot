"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const TELLO_UNAVAILABLE_KEY = "tello_unavailable_ts";
const TELLO_BACKOFF_MS = 60_000; // skip auto-start for 60s after 503

type TelloCameraProps = {
  className?: string;
  autoStart?: boolean;
  onHide?: () => void;
};

export default function TelloCamera({ className = "", autoStart = true, onHide }: TelloCameraProps) {
  const [error, setError] = useState<string | null>(null);
  const [streamStarted, setStreamStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [noFramesYet, setNoFramesYet] = useState(false);
  const [battery, setBattery] = useState<number | null>(null);
  const autoStarted = useRef(false);

  const startStream = useCallback(async () => {
    setStarting(true);
    setError(null);
    setNoFramesYet(false);
    try {
      const result = await api.tello.startStream();
      if (result.success) {
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(TELLO_UNAVAILABLE_KEY);
        setStreamStarted(true);
      } else {
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(TELLO_UNAVAILABLE_KEY, String(Date.now()));
        setError(result.message ?? "Failed to start stream");
      }
    } catch (e) {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(TELLO_UNAVAILABLE_KEY, String(Date.now()));
      setError("No DJI Tello detected");
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!autoStart || streamStarted || error || autoStarted.current) return;
    const ts = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(TELLO_UNAVAILABLE_KEY) : null;
    if (ts && Date.now() - Number(ts) < TELLO_BACKOFF_MS) {
      setError("Tello offline. Connect to Tello WiFi for live feed.");
      return;
    }
    autoStarted.current = true;
    startStream();
  }, [autoStart, streamStarted, error, startStream]);

  useEffect(() => {
    if (!streamStarted) return;
    const id = setInterval(async () => {
      const h = await api.tello.health();
      if (h?.video_has_frames) setNoFramesYet(false);
      else if (h?.tello_connected) setNoFramesYet(true);
    }, 3000);
    return () => clearInterval(id);
  }, [streamStarted]);

  useEffect(() => {
    if (!streamStarted) return;
    const fetchBattery = async () => {
      const r = await api.tello.battery();
      if (r.battery != null) setBattery(r.battery);
    };
    fetchBattery();
    const id = setInterval(fetchBattery, 10000);
    return () => clearInterval(id);
  }, [streamStarted]);

  const videoUrl = api.tello.videoUrl();
  const offline = error && !streamStarted;

  return (
    <div className={`flex flex-col min-w-[280px] rounded-lg border border-border overflow-hidden ${offline ? "bg-muted/30" : "bg-black"} ${className}`}>
      <div className="px-2 py-1 bg-muted/50 border-b border-border">
        <span className="text-xs text-black">Tello camera</span>
      </div>
      <div className="relative flex-1 min-h-[200px] flex items-center justify-center">
        {offline ? (
          <div className="relative flex flex-col items-center justify-center gap-3 p-6 text-center w-full">
            <div className="w-full max-w-[200px] aspect-video rounded bg-muted flex items-center justify-center border border-border">
              <span className="text-xs text-muted-foreground">No feed</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-sm">
              Tello offline. Connect this device to Tello WiFi when you want live feed.
            </p>
            <Button variant="outline" size="sm" onClick={startStream} disabled={starting}>
              {starting ? "Connecting..." : "Try again"}
            </Button>
          </div>
        ) : (
          <>
            <img
              src={videoUrl}
              alt="Tello camera s"
              className="w-full h-full object-contain"
              onError={() => setError("No DJI Tello detected")}
            />
            {!streamStarted && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <Button size="sm" onClick={startStream} disabled={starting}>
                  {starting ? "Starting..." : "Start camera"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <p className="text-[10px] text-black px-2 py-1 bg-muted/50 border-t border-border flex justify-between items-center gap-2">
          <span>
            {offline
              ? "Connect to Tello WiFi and run DJI server (8888) for live stream."
              : noFramesYet
                ? battery != null
                  ? "Stream on. Video decoding not available for this Tello stream."
                  : "No video received. This device must be on Tello WiFi (192.168.10.x)."
                : streamStarted
                  ? "Stream on."
                  : "Start camera sends streamon to Tello. Then MJPEG from http://localhost:8888/video"}
          </span>
          {battery != null && <span>Battery: {battery}%</span>}
        </p>
    </div>
  );
}
