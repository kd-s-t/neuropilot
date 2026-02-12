"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WifiOff, RadioTower } from "lucide-react";
import { api } from "@/lib/api";

const TELLO_UNAVAILABLE_KEY = "tello_unavailable_ts";
const TELLO_BACKOFF_MS = 60_000;

const DRONE_STATE_LABELS: Record<string, string> = {
  mid: "Mission pad ID", x: "X", y: "Y", z: "Z", mpry: "Mission pad roll/yaw",
  pitch: "Pitch (deg)", roll: "Roll (deg)", yaw: "Yaw (deg)",
  vgx: "Velocity X", vgy: "Velocity Y", vgz: "Velocity Z",
  templ: "Temp low (C)", temph: "Temp high (C)", tof: "Time of flight (cm)",
  h: "Height (cm)", bat: "Battery (%)", baro: "Barometer (m)", time: "Flight time (s)",
  agx: "Accel X", agy: "Accel Y", agz: "Accel Z",
};

type TelloCameraProps = {
  className?: string;
  autoStart?: boolean;
  onHide?: () => void;
  useTestApi?: boolean;
};

export default function TelloCamera({ className = "", autoStart = true, onHide, useTestApi = false }: TelloCameraProps) {
  const [error, setError] = useState<string | null>(null);
  const [streamStarted, setStreamStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [noFramesYet, setNoFramesYet] = useState(false);
  const [battery, setBattery] = useState<number | null>(null);
  const [telloConnected, setTelloConnected] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [droneState, setDroneState] = useState<Record<string, string>>({});
  const autoStarted = useRef(false);

  const openInfo = useCallback(async () => {
    if (useTestApi) {
      const state = await api.test.getState();
      setDroneState(state);
    } else {
      const [health, battery] = await Promise.all([api.tello.health(), api.tello.battery()]);
      setDroneState({
        ...(health ? { tello_connected: String(health.tello_connected), video_has_frames: String(health.video_has_frames ?? false) } : {}),
        ...(battery.battery != null ? { battery: String(battery.battery) } : {}),
      });
    }
    setShowInfoDialog(true);
  }, [useTestApi]);

  const connectAndStart = useCallback(async () => {
    setStarting(true);
    setError(null);
    setBackendError(null);
    setNoFramesYet(false);
    try {
      if (useTestApi) {
        await api.test.connect();
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(TELLO_UNAVAILABLE_KEY);
        setStreamStarted(true);
        setTelloConnected(true);
      } else {
        await api.tello.connect();
        const result = await api.tello.startStream();
        if (result.success) {
          if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(TELLO_UNAVAILABLE_KEY);
          setStreamStarted(true);
          setTelloConnected(true);
        } else {
          if (typeof sessionStorage !== "undefined") sessionStorage.setItem(TELLO_UNAVAILABLE_KEY, String(Date.now()));
          setError(result.message ?? "Failed to start stream");
        }
      }
    } catch (e) {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(TELLO_UNAVAILABLE_KEY, String(Date.now()));
      setError(useTestApi ? "Connect failed. Connect to Tello WiFi first." : "No DJI Tello detected. Connect to Tello WiFi first.");
    } finally {
      setStarting(false);
    }
  }, [useTestApi]);

  const startStream = useCallback(async () => {
    if (useTestApi) return;
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
  }, [useTestApi]);

  const disconnect = useCallback(async () => {
    setDisconnecting(true);
    setError(null);
    setBackendError(null);
    try {
      if (useTestApi) {
        await api.test.disconnect();
      } else {
        await api.tello.stopStream();
        await api.tello.disconnect();
      }
      setStreamStarted(false);
      setTelloConnected(false);
    } catch {
      setTelloConnected(false);
      setStreamStarted(false);
    } finally {
      setDisconnecting(false);
    }
  }, [useTestApi]);

  useEffect(() => {
    if (!useTestApi) {
      let cancelled = false;
      const check = async () => {
        const h = await api.tello.health();
        if (!cancelled && h) setTelloConnected(h.tello_connected ?? false);
      };
      check();
      return () => { cancelled = true; };
    }
  }, [useTestApi]);

  useEffect(() => {
    if (useTestApi && telloConnected) {
      const id = setInterval(async () => {
        const st = await api.test.getStatus();
        if (st.last_error) setBackendError(st.last_error);
        else setBackendError(null);
        const state = await api.test.getState();
        if (state.bat != null) setBattery(Number(state.bat));
      }, 500);
      return () => clearInterval(id);
    }
  }, [useTestApi, telloConnected]);

  useEffect(() => {
    if (autoStart !== true || streamStarted || error || autoStarted.current) return;
    const ts = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(TELLO_UNAVAILABLE_KEY) : null;
    if (ts && Date.now() - Number(ts) < TELLO_BACKOFF_MS) {
      setError("Tello offline. Connect to Tello WiFi for live feed.");
      return;
    }
    autoStarted.current = true;
    connectAndStart();
  }, [autoStart, streamStarted, error, connectAndStart]);

  useEffect(() => {
    if (!streamStarted || useTestApi) return;
    const id = setInterval(async () => {
      const h = await api.tello.health();
      if (h?.video_has_frames) setNoFramesYet(false);
      else if (h?.tello_connected) setNoFramesYet(true);
    }, 3000);
    return () => clearInterval(id);
  }, [streamStarted, useTestApi]);

  useEffect(() => {
    if (!streamStarted || useTestApi) return;
    const fetchBattery = async () => {
      const r = await api.tello.battery();
      if (r.battery != null) setBattery(r.battery);
    };
    fetchBattery();
    const id = setInterval(fetchBattery, 10000);
    return () => clearInterval(id);
  }, [streamStarted, useTestApi]);

  const videoUrl = useTestApi ? api.test.videoUrl() : api.tello.videoUrl();
  const offline = !streamStarted && (useTestApi || error);

  return (
    <div className={`flex flex-col min-w-[280px] rounded-lg border border-border overflow-hidden ${offline ? "bg-muted/30" : "bg-black"} ${className}`}>
      <div className="px-2 py-1 bg-muted/50 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {telloConnected ? (
            <RadioTower className="h-3.5 w-3.5 text-green-500 shrink-0" aria-label="Connected" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Disconnected" />
          )}
          <div className="flex items-center gap-1">
          {telloConnected && (
            <Button variant="outline" size="sm" onClick={openInfo}>
              Info
            </Button>
          )}
          {telloConnected ? (
            <Button variant="outline" size="sm" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={connectAndStart} disabled={starting}>
              {starting ? "Connecting..." : "Connect"}
            </Button>
          )}
          </div>
        </div>
        <span className="text-xs text-black">Tello camera</span>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {offline ? (
          <div className="relative flex flex-col items-center justify-center gap-3 p-6 text-center w-full">
            <div className="w-full max-w-[200px] aspect-video rounded bg-muted flex items-center justify-center border border-border">
              <span className="text-xs text-muted-foreground">No feed</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-sm">
              Connect this device to Tello WiFi, then click Connect above for live feed.
            </p>
          </div>
        ) : (
          <>
            {((useTestApi && streamStarted) || !useTestApi) && (
              <img
                key={useTestApi ? `test-video-${streamStarted}` : "tello-video"}
                src={videoUrl}
                alt="Tello camera s"
                className="w-full h-full object-contain"
                onError={() => setError(useTestApi ? "Video stream failed to load" : "No DJI Tello detected")}
              />
            )}
            {!useTestApi && !streamStarted && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <Button size="sm" onClick={startStream} disabled={starting}>
                  {starting ? "Starting..." : "Start camera"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <p className="text-[10px] text-black px-2 py-1 bg-muted/50 border-t border-border flex flex-col gap-1">
          <span className="flex justify-between items-center gap-2">
            <span>
              {offline
                ? "Connect to Tello WiFi, then click Connect."
                : backendError
                  ? backendError
                  : noFramesYet
                    ? "No video received. This device must be on Tello WiFi (192.168.10.x)."
                    : streamStarted
                      ? "Stream on."
                      : "Start camera sends streamon to Tello."}
            </span>
            {battery != null && <span>Battery: {battery}%</span>}
          </span>
        </p>
      <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Drone state</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
            {Object.keys(droneState).length === 0 ? (
              <span className="text-muted-foreground col-span-2">No state yet</span>
            ) : (
              Object.entries(droneState).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-muted-foreground">{DRONE_STATE_LABELS[key] ?? key}:</span>
                  <span>{value}</span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
