"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

const STATE_LABELS: Record<string, string> = {
  mid: "Mission pad ID",
  x: "X",
  y: "Y",
  z: "Z",
  mpry: "Mission pad roll/yaw",
  pitch: "Pitch (deg)",
  roll: "Roll (deg)",
  yaw: "Yaw (deg)",
  vgx: "Velocity X",
  vgy: "Velocity Y",
  vgz: "Velocity Z",
  templ: "Temp low (C)",
  temph: "Temp high (C)",
  tof: "Time of flight (cm)",
  h: "Height (cm)",
  bat: "Battery (%)",
  baro: "Barometer (m)",
  time: "Flight time (s)",
  agx: "Accel X",
  agy: "Accel Y",
  agz: "Accel Z",
};

export default function DJICameraPage() {
  const testBase = `${api.base}/test`;
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, string>>({});
  const [backendError, setBackendError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(async () => {
      try {
        const [stateRes, statusRes] = await Promise.all([
          fetch(`${testBase}/state`),
          fetch(`${testBase}/status`),
        ]);
        const stateData = await stateRes.json();
        const statusData = await statusRes.json();
        setState(stateData);
        setBackendError(statusData.last_error || null);
      } catch {
        // ignore
      }
    }, 500);
    return () => clearInterval(t);
  }, [connected, testBase]);

  useEffect(() => {
    if (!connected) {
      setBackendError(null);
      setVideoError(null);
    }
  }, [connected]);

  const connectDJI = async () => {
    setError(null);
    setLoading(true);
    const timeoutMs = 12000;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${testBase}/connect`, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(id);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data.detail as string) || String(res.status));
        return;
      }
      setConnected(true);
    } catch (err) {
      clearTimeout(id);
      setError(err instanceof Error && err.name === "AbortError" ? "Connection timed out" : (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const disconnectDJI = async () => {
    try {
      await fetch(`${testBase}/disconnect`, { method: "POST" });
      setConnected(false);
      setState({});
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "40px" }}>
      <h2>DJI Tello Stream</h2>

      <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={connectDJI}
          disabled={loading}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Connecting..." : "Connect DJI"}
        </button>
        {connected && (
          <button
            type="button"
            onClick={disconnectDJI}
            style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer" }}
          >
            Disconnect
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: "12px", color: "#c00" }}>
          {error}
        </div>
      )}

      {connected && backendError && (
        <div style={{ marginTop: "12px", color: "#c00", maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
          {backendError}
        </div>
      )}

      {connected && !error && (
        <div style={{ marginTop: "12px", color: "#0a0" }}>
          Connected
        </div>
      )}

      {connected && (
        <>
          <div
            style={{
              marginTop: "20px",
              width: 720,
              minHeight: 405,
              marginLeft: "auto",
              marginRight: "auto",
              backgroundColor: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {videoError ? (
              <div style={{ color: "#c00", padding: 16 }}>{videoError}</div>
            ) : (
              <img
                key="tello-video"
                src={`${testBase}/video`}
                alt="Tello Stream"
                width={720}
                height={405}
                style={{ display: "block", objectFit: "contain" }}
                onError={() => setVideoError("Video stream failed to load")}
              />
            )}
          </div>
          <div style={{ marginTop: "20px", textAlign: "left", maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
            <h3 style={{ marginBottom: "8px" }}>Drone state</h3>
            {Object.keys(state).length === 0 ? (
              <div style={{ color: "#888" }}>No state yet (drone sends after connect)</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 24px", fontFamily: "monospace", fontSize: "13px" }}>
                {Object.entries(state).map(([key, value]) => (
                  <div key={key}>
                    <span style={{ color: "#888" }}>{STATE_LABELS[key] || key}:</span>{" "}
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
