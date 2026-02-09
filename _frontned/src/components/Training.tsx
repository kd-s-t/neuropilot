"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Play, Square, Mic, MicOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import EEGDeviceCalibration from "./Realtime";
import TrainingSessionViz from "./TrainingSessionViz";
import DroneScene, { type EegCommand } from "./DroneScene";
import { api } from "@/lib/api";
import { useSession } from "next-auth/react";
import {
  useTrainingHistory,
  useSessionDetailModal,
  useEegWebSocket,
  useCanvasGame,
  useVoiceControl,
} from "@/hooks";

const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 500;
const BOX_SIZE = 20;
type Derived = { dAb: string | null; tAa: string | null; gD: string | null };
const BRAINWAVE_COMBINATIONS: { id: string; label: string; check: (d: number, t: number, a: number, b: number, g: number, derived: Derived) => boolean }[] = [
  { id: "start", label: "Delta > Beta → start", check: (d, _t, _a, b) => d > b },
  { id: "forward", label: "Delta > Beta, Theta > Alpha → forward", check: (d, _t, _a, b, _g, der) => d > b && der.tAa === "T" },
  { id: "up", label: "Gamma > Delta → rise", check: (_d, _t, _a, _b, _g, der) => der.gD === "G" },
  { id: "down", label: "Beta > Delta → descend", check: (_d, _t, _a, _b, _g, der) => der.dAb === "B" },
  { id: "turnLeft", label: "Theta > Alpha, Delta≈Beta → turn left", check: (_d, _t, _a, _b, _g, der) => der.dAb === null && der.tAa === "T" },
  { id: "turnRight", label: "Alpha > Theta → turn right", check: (_d, _t, _a, _b, _g, der) => der.tAa === "A" },
  { id: "back", label: "Beta > Delta, Alpha > Theta → back", check: (_d, _t, _a, _b, _g, der) => der.dAb === "B" && der.tAa === "A" },
  { id: "left", label: "Beta > Delta, Theta > Alpha → strafe left", check: (_d, _t, _a, _b, _g, der) => der.dAb === "B" && der.tAa === "T" },
  { id: "right", label: "Delta > Beta, Alpha > Theta → strafe right", check: (_d, _t, _a, _b, _g, der) => der.dAb === "D" && der.tAa === "A" },
  { id: "theta_gt_alpha", label: "Theta > Alpha", check: (_d, t, a) => t > a },
  { id: "theta_gt_beta", label: "Theta > Beta", check: (_d, t, _a, b) => t > b },
  { id: "theta_gt_gamma", label: "Theta > Gamma", check: (_d, t, _a, _b, g) => t > g },
  { id: "alpha_gt_beta", label: "Alpha > Beta", check: (_d, _t, a, b) => a > b },
  { id: "alpha_gt_gamma", label: "Alpha > Gamma", check: (_d, _t, a, _b, g) => a > g },
  { id: "beta_gt_gamma", label: "Beta > Gamma", check: (_d, _t, _a, b, g) => b > g },
  { id: "d_gt_t_gt_a", label: "Delta > Theta > Alpha", check: (d, t, a) => d > t && t > a },
  { id: "d_gt_t_gt_b", label: "Delta > Theta > Beta", check: (d, t, _a, b) => d > t && t > b },
  { id: "d_gt_a_gt_b", label: "Delta > Alpha > Beta", check: (d, _t, a, b) => d > a && a > b },
  { id: "t_gt_a_gt_b", label: "Theta > Alpha > Beta", check: (_d, t, a, b) => t > a && a > b },
  { id: "d_gt_b_gt_g", label: "Delta > Beta > Gamma", check: (d, _t, _a, b, g) => d > b && b > g },
  { id: "t_gt_b_gt_g", label: "Theta > Beta > Gamma", check: (_d, t, _a, b, g) => t > b && b > g },
  { id: "a_gt_b_gt_g", label: "Alpha > Beta > Gamma", check: (_d, _t, a, b, g) => a > b && b > g },
  { id: "d_gt_t_gt_g", label: "Delta > Theta > Gamma", check: (d, t, _a, _b, g) => d > t && t > g },
  { id: "d_gt_a_gt_g", label: "Delta > Alpha > Gamma", check: (d, _t, a, _b, g) => d > a && a > g },
  { id: "t_gt_a_gt_g", label: "Theta > Alpha > Gamma", check: (_d, t, a, _b, g) => t > a && a > g },
  { id: "delta_max", label: "Delta highest", check: (d, t, a, b, g) => d > t && d > a && d > b && d > g },
  { id: "theta_max", label: "Theta highest", check: (d, t, a, b, g) => t > d && t > a && t > b && t > g },
  { id: "alpha_max", label: "Alpha highest", check: (d, t, a, b, g) => a > d && a > t && a > b && a > g },
  { id: "beta_max", label: "Beta highest", check: (d, t, a, b, g) => b > d && b > t && b > a && b > g },
  { id: "gamma_max", label: "Gamma highest", check: (d, t, a, b, g) => g > d && g > t && g > a && g > b },
];

const CONTROL_IDS = ["start", "forward", "up", "down", "turnLeft", "turnRight", "back", "left", "right"] as const;
const SUGGESTION_STORAGE_KEY = "neuropilot_suggestion";

function controlShortName(label: string): string {
  const afterArrow = label.split(" → ").pop();
  return afterArrow?.trim() ?? label;
}

function getSuggestions(counts: Record<string, number>): { top: { id: string; label: string; count: number }[]; rare: { id: string; label: string; count: number }[]; sentence: string } {
  const withCount = BRAINWAVE_COMBINATIONS.map((c) => ({ ...c, count: counts[c.id] ?? 0 }));
  const controlEntries = withCount.filter((x) => CONTROL_IDS.includes(x.id as (typeof CONTROL_IDS)[number]));
  const goodFor = controlEntries.filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
  const practiceMore = controlEntries.filter((x) => x.count === 0);
  const top = withCount.filter((x) => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
  const rare = practiceMore;

  let sentence: string;
  if (goodFor.length === 0) {
    sentence = "";
  } else {
    const goodNames = goodFor.map((x) => controlShortName(x.label)).join(", ");
    const practiceNames = practiceMore.length > 0 ? practiceMore.map((x) => controlShortName(x.label)).join(", ") : "";
    sentence = practiceNames
      ? `Good for: ${goodNames}. Practice more: ${practiceNames}.`
      : `Good for: ${goodNames}.`;
  }
  return { top, rare, sentence };
}

type SessionDataPoint = {
  timestamp: number;
  position: { x: number; y: number };
  bandPowers: Record<string, { power: number }>;
};

type SessionVizData = {
  initial_position?: { x: number; y: number };
  positions?: { x: number; y: number }[];
  bandPowers?: Record<string, { power: number; range: [number, number] }>[];
  timestamps?: number[];
  final_position?: { x: number; y: number };
};

export default function Lab() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? null;

  const { history, refetch } = useTrainingHistory(token);
  const modal = useSessionDetailModal(token);

  const [position, setPosition] = useState({ 
    x: (CANVAS_WIDTH - BOX_SIZE) / 2, 
    y: (CANVAS_HEIGHT - BOX_SIZE) / 2 
  });
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [sessionData, setSessionData] = useState<SessionDataPoint[]>([]);
  const [arenaMode, setArenaMode] = useState<"2d" | "3d">("2d");
  const [modalEditName, setModalEditName] = useState("");
  const [modalEditNotes, setModalEditNotes] = useState("");
  const [modalSaveStatus, setModalSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [modalSaveMessage, setModalSaveMessage] = useState("");

  useEffect(() => {
    if (modal.selectedSession) {
      setModalEditName(modal.selectedSession.name ?? "");
      setModalEditNotes(modal.selectedSession.notes ?? "");
      setModalSaveStatus("idle");
      setModalSaveMessage("");
    }
  }, [modal.selectedSession?.id, modal.selectedSession?.name, modal.selectedSession?.notes]);

  const positionRef = useRef(position);
  const lastBandPowersRef = useRef<Record<string, { power: number }>>({});
  const dataCollectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSessionIdRef = useRef<number | null>(null);
  const handleStopListeningRef = useRef<(() => Promise<void>) | null>(null);
  const eegCommandRef = useRef<EegCommand | null>({
    start: false,
    up: false,
    down: false,
    left: false,
    right: false,
    forward: false,
    back: false,
    turnLeft: false,
    turnRight: false,
  });
  const lastEegCommandRef = useRef<EegCommand | null>(null);
  const [combinationCounts, setCombinationCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(BRAINWAVE_COMBINATIONS.map((c) => [c.id, 0]))
  );
  const [aiProvider, setAiProvider] = useState<"openai" | "gemini_flash" | "gemini_pro">("gemini_flash");
  const [openaiSuggestion, setOpenaiSuggestion] = useState<{ use_fallback: boolean; sentence?: string; top?: string[]; rare?: string[]; provider?: "openai" | "gemini_flash" | "gemini_pro"; error?: string } | null>(null);
  const [savedSuggestion, setSavedSuggestion] = useState<string | null>(null);
  const [pinnedSuggestion, setPinnedSuggestion] = useState<string | null>(null);
  useEffect(() => {
    setSavedSuggestion(localStorage.getItem(SUGGESTION_STORAGE_KEY));
  }, []);
  const lastOpenaiCallRef = useRef<number>(0);
  const OPENAI_DEBOUNCE_MS = 5000;
  const OPENAI_THROTTLE_MS = 60000;

  const suggestion = useMemo(() => getSuggestions(combinationCounts), [combinationCounts]);
  useEffect(() => {
    setPinnedSuggestion(null);
  }, [combinationCounts]);

  useEffect(() => {
    if (arenaMode !== "3d") return;
    const hasCounts = Object.values(combinationCounts).some((n) => n > 0);
    if (!hasCounts) {
      setOpenaiSuggestion(null);
      return;
    }
    const t = setTimeout(() => {
      const now = Date.now();
      if (now - lastOpenaiCallRef.current < OPENAI_THROTTLE_MS) return;
      lastOpenaiCallRef.current = now;
      api.suggestions
        .getSuggestions(combinationCounts, aiProvider)
        .then(setOpenaiSuggestion)
        .catch(() => setOpenaiSuggestion({ use_fallback: true, error: "Request failed." }));
    }, OPENAI_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [arenaMode, combinationCounts, aiProvider]);

  const displaySuggestion = openaiSuggestion && !openaiSuggestion.use_fallback ? openaiSuggestion : suggestion;
  const suggestionText = savedSuggestion ?? pinnedSuggestion ?? displaySuggestion.sentence ?? "";

  const handleMakeSuggestions = useCallback(() => {
    const text = suggestion.sentence?.trim() ?? "";
    if (text) setPinnedSuggestion(text);
  }, [suggestion.sentence]);

  const handleUseSuggestion = useCallback(() => {
    if (!suggestionText.trim()) return;
    localStorage.setItem(SUGGESTION_STORAGE_KEY, suggestionText);
    setSavedSuggestion(suggestionText);
  }, [suggestionText]);

  const handleClearSuggestion = useCallback(() => {
    localStorage.removeItem(SUGGESTION_STORAGE_KEY);
    setSavedSuggestion(null);
    setPinnedSuggestion(null);
  }, []);

  positionRef.current = position;

  useCanvasGame("gameCanvas", position, "/tello.png");

  const handleEegMessage = useCallback(
    (data: Record<string, { power: number }>) => {
      lastBandPowersRef.current = data;
      const d = data.Delta?.power ?? 0;
      const t = data.Theta?.power ?? 0;
      const a = data.Alpha?.power ?? 0;
      const b = data.Beta?.power ?? 0;
      const g = data.Gamma?.power ?? 0;

      if (arenaMode === "2d") {
        setPosition((pos) => {
          let { x, y } = pos;
          if (d > 1_000_000) y = Math.max(y - 10, 0);
          if (t > 200_000) x = Math.max(x - 10, 0);
          if (a > 200_000) x = Math.min(x + 10, CANVAS_WIDTH - BOX_SIZE);
          if (b > 100_000) y = Math.min(y + 10, CANVAS_HEIGHT - BOX_SIZE);
          positionRef.current = { x, y };
          return { x, y };
        });
        return;
      }

      const M = 80_000;
      const relTol = 0.35;
      const approx = (x: number, y: number) =>
        Math.abs(x - y) <= M || (Math.max(x, y, 1) > M && Math.abs(x - y) / Math.max(x, y, 1) < relTol);
      const dAb = !approx(d, b) ? (d > b ? "D" : "B") : null;
      const tAa = !approx(t, a) ? (t > a ? "T" : "A") : null;
      const gD = !approx(g, d) ? (g > d ? "G" : "D") : null;
      const next: EegCommand = {
        start: d > b,
        up: gD === "G",
        down: dAb === "B",
        left: dAb === "B" && tAa === "T",
        right: dAb === "D" && tAa === "A",
        forward: dAb === "D" && tAa === "T",
        back: dAb === "B" && tAa === "A",
        turnLeft: dAb === null && tAa === "T",
        turnRight: tAa === "A",
      };
      eegCommandRef.current = next;
      lastEegCommandRef.current = { ...next };

    },
    [arenaMode]
  );

  useEegWebSocket({ enabled: isListening || arenaMode === "3d", onMessage: handleEegMessage });

  useEffect(() => {
    if (!isListening || !isRecording) {
      if (dataCollectionIntervalRef.current) {
        clearInterval(dataCollectionIntervalRef.current);
        dataCollectionIntervalRef.current = null;
      }
      if (!isRecording) currentSessionIdRef.current = null;
      return;
    }

    const startRecording = async () => {
      if (!token) {
        console.error("Not authenticated");
        return;
      }
      try {
        const newSession = await api.training.createSession(
          { data: { initial_position: positionRef.current } },
          token
        );
        setCurrentSessionId(newSession.id);
        currentSessionIdRef.current = newSession.id;
        setSessionData([]);

        dataCollectionIntervalRef.current = setInterval(() => {
          setSessionData((prev) => [
            ...prev,
            {
              timestamp: Date.now(),
              position: { ...positionRef.current },
              bandPowers: { ...lastBandPowersRef.current },
            },
          ]);
        }, 1000);
      } catch (err) {
        console.error("Error creating training session:", err);
      }
    };

    startRecording();

    return () => {
      if (dataCollectionIntervalRef.current) {
        clearInterval(dataCollectionIntervalRef.current);
        dataCollectionIntervalRef.current = null;
      }
      currentSessionIdRef.current = null;
    };
  }, [isListening, isRecording, token]);

  const handleVoiceStart = useCallback(() => {
    if (!isListening && !currentSessionId) {
      setIsListening(true);
    }
  }, [isListening, currentSessionId]);

  const stopSessionOnly = useCallback(async () => {
    const sessionIdToEnd = currentSessionIdRef.current ?? currentSessionId;
    const dataToSend = sessionData;
    const hasToken = !!token;

    setIsListening(false);
    setIsRecording(false);
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    setSessionData([]);

    if (sessionIdToEnd && hasToken) {
      try {
        const trimMs = 2000;
        const firstTs = dataToSend[0]?.timestamp ?? 0;
        const trimmed = dataToSend.filter((d) => d.timestamp - firstTs >= trimMs);
        const payload = {
          positions: trimmed.map((d) => d.position),
          bandPowers: trimmed.map((d) => d.bandPowers),
          timestamps: trimmed.map((d) => d.timestamp),
          final_position: position,
        };
        await api.training.endSession(sessionIdToEnd, payload, token ?? undefined);
        await refetch();
      } catch (err) {
        const error = err as Error;
        const isAuthError =
          error.message === "UNAUTHORIZED" ||
          error.message.includes("credentials") ||
          error.message.includes("Could not validate");
        if (!isAuthError) {
          console.error("Error ending training session:", err);
        }
      }
    }
  }, [currentSessionId, token, sessionData, position, refetch]);

  const stopSessionOnlyRef = useRef(stopSessionOnly);
  stopSessionOnlyRef.current = stopSessionOnly;

  const {
    isListening: isVoiceListening,
    error: voiceError,
    supported: voiceSupported,
    start: startVoiceControl,
    stop: stopVoiceControl,
  } = useVoiceControl({
    onStart: handleVoiceStart,
    onStop: () => {
      if (isListening) {
        stopSessionOnlyRef.current?.();
      }
    },
  });

  const handleStopListening = useCallback(async () => {
    await stopSessionOnly();
    stopVoiceControl();
  }, [stopSessionOnly, stopVoiceControl]);

  handleStopListeningRef.current = handleStopListening;

  const handleViewSession = useCallback(
    (sessionId: number) => {
      modal.viewSession(sessionId);
    },
    [modal.viewSession]
  );

  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      modal.setOpen(open);
    },
    [modal.setOpen]
  );

  const sessionDuration = currentSessionId
    ? Math.floor((Date.now() - (sessionData[0]?.timestamp ?? Date.now())) / 1000)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lab</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Practice controlling the drone using your brainwaves
          </p>
          {isVoiceListening && (
            <p className="mt-1 text-xs text-muted-foreground">
              Voice control active – say &quot;record&quot; or &quot;stop&quot;
            </p>
          )}
          {voiceError && (
            <p className="mt-1 text-xs text-destructive">{voiceError}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {voiceSupported !== false &&
            (isVoiceListening ? (
              <Button
                variant="outline"
                size="lg"
                onClick={stopVoiceControl}
                className="w-[160px] h-11"
              >
                <MicOff className="mr-2 h-4 w-4" />
                Disable voice
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={startVoiceControl}
                disabled={isVoiceListening}
                size="lg"
                className="w-[160px] h-11"
              >
                <Mic className="mr-2 h-4 w-4" />
                Enable voice
              </Button>
            ))}
          {isRecording && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-sm font-medium">Recording</span>
              {sessionDuration > 0 && (
                <span className="text-xs text-muted-foreground">
                  {Math.floor(sessionDuration / 60)}m {sessionDuration % 60}s
                </span>
              )}
            </div>
          )}
          {!isRecording && (
            <Button
              onClick={() => {
                setIsListening(true);
                setIsRecording(true);
              }}
              disabled={isListening}
              size="lg"
              className="w-[140px] h-11 bg-green-600 hover:bg-green-700 text-white"
            >
              <Play className="mr-2 h-4 w-4" />
              Record
            </Button>
          )}
          <Button
            onClick={() => {
              setIsListening(true);
              setIsRecording(false);
            }}
            disabled={isListening}
            size="lg"
            variant="outline"
            className="w-[140px] h-11"
          >
            <Play className="mr-2 h-4 w-4" />
            Start
          </Button>
          <Button
            variant="outline"
            onClick={handleStopListening}
            disabled={!isListening}
            size="lg"
            className="w-[140px] h-11 border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
          >
            <Square className="mr-2 h-4 w-4" />
            Stop
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="!pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Simulation Arena</CardTitle>
                <CardDescription>Control the character using your brainwave patterns</CardDescription>
              </div>
              <div className="flex rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setArenaMode("2d")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    arenaMode === "2d"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  2D
                </button>
                <button
                  type="button"
                  onClick={() => setArenaMode("3d")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    arenaMode === "3d"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  3D
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="!pt-2 !pb-2">
            <div className="flex w-full justify-center">
              <div
                className={`h-[420px] w-full ${arenaMode !== "2d" ? "hidden" : ""}`}
              >
                <canvas
                  id="gameCanvas"
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  className="h-full w-full rounded border border-border bg-muted/50 object-contain"
                />
              </div>
              {arenaMode === "3d" && (
                <div className="h-[420px] w-full overflow-hidden rounded border border-border">
                  <DroneScene
                    className="h-full w-full"
                    controls={isListening || arenaMode === "3d" ? "eeg" : "keyboard"}
                    eegCommandRef={eegCommandRef}
                  />
                </div>
              )}
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-medium">Brainwave controls</h3>
              {arenaMode === "2d" ? (
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <li><span className="font-medium text-foreground">Delta</span> (deep focus) → <strong>up</strong> · Power &gt; 1M</li>
                  <li><span className="font-medium text-foreground">Theta</span> → <strong>left</strong> · Power &gt; 200k</li>
                  <li><span className="font-medium text-foreground">Alpha</span> → <strong>right</strong> · Power &gt; 200k</li>
                  <li><span className="font-medium text-foreground">Beta</span> → <strong>down</strong> · Power &gt; 100k</li>
                </ul>
              ) : savedSuggestion ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="text-muted-foreground">{savedSuggestion}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={handleClearSuggestion}>
                    Clear (show controls)
                  </Button>
                </div>
              ) : (
                <>
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                    {BRAINWAVE_COMBINATIONS.map((c) => (
                      <li key={c.id}>
                        {c.label} ({combinationCounts[c.id] ?? 0})
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <div className="font-medium text-foreground mb-1 flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        Suggestions
                        {openaiSuggestion && !openaiSuggestion.use_fallback && openaiSuggestion.provider && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({openaiSuggestion.provider === "openai" ? "gpt-4o-mini" : openaiSuggestion.provider === "gemini_flash" ? "Gemini 3 Flash" : "Gemini 3 Pro"})
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <Label htmlFor="ai-provider" className="text-xs font-normal text-muted-foreground whitespace-nowrap">Model</Label>
                        <select
                          id="ai-provider"
                          value={aiProvider}
                          onChange={(e) => setAiProvider(e.target.value as "openai" | "gemini_flash" | "gemini_pro")}
                          className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-medium text-foreground"
                        >
                          <option value="gemini_flash">Gemini 3 Flash</option>
                          <option value="gemini_pro">Gemini 3 Pro</option>
                          <option value="openai">gpt-4o-mini</option>
                        </select>
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs mb-2">
                        {BRAINWAVE_COMBINATIONS.filter((c) => CONTROL_IDS.includes(c.id as (typeof CONTROL_IDS)[number])).map((c) => c.label).join(" · ")}
                      </p>
                      {openaiSuggestion?.use_fallback && openaiSuggestion?.error && (
                        <p className="mb-2 text-sm text-destructive">
                          {openaiSuggestion.error}
                        </p>
                      )}
                      <p className="text-muted-foreground">
                        {suggestionText}
                      </p>
                      {(!openaiSuggestion || openaiSuggestion.use_fallback) && (
                        <>
                          {suggestion.top.length > 0 && (
                            <p className="mt-2 text-muted-foreground">
                              <span className="font-medium text-foreground">Top patterns:</span> {suggestion.top.map((x) => x.label).join(", ")}
                            </p>
                          )}
                          {suggestion.rare.length > 0 && (
                            <p className="mt-1 text-muted-foreground">
                              <span className="font-medium text-foreground">Practice more:</span> {suggestion.rare.map((x) => x.label).join(", ")}
                            </p>
                          )}
                        </>
                      )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMakeSuggestions}
                        disabled={!suggestion.sentence?.trim()}
                      >
                        Make suggestions
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUseSuggestion}
                        disabled={!suggestionText.trim()}
                      >
                        Use
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="!pb-2">
            <CardTitle>EEG Data Stream</CardTitle>
            <CardDescription>Real-time brainwave monitoring</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 !pt-2 !pb-2">
            <EEGDeviceCalibration
              hideControls
              externalListening={isListening}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Training Sessions</CardTitle>
              <CardDescription>View and analyze your past training sessions</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {history.length > 0 && (
                <span className="text-sm text-muted-foreground">{history.length} sessions</span>
              )}
              {token && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
                  onClick={async () => {
                    try {
                      await api.training.deleteAllSessions(token);
                      await refetch();
                    } catch (_) {}
                  }}
                >
                  Delete all
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              No training sessions yet. Start a session to begin recording.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
                  onClick={() => handleViewSession(s.id)}
                  onKeyDown={(e) => e.key === "Enter" && handleViewSession(s.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">#{s.id}</span>
                    <span className="min-w-[100px] font-bold">
                      {s.name?.trim() || "(no name)"}
                    </span>
                    <span className="font-medium">
                      {new Date(s.started_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(s.started_at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.duration_seconds != null && (
                      <span className="text-sm text-muted-foreground">
                        {Math.floor(s.duration_seconds / 60)}m {s.duration_seconds % 60}s
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">View details →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modal.isOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="max-h-[90vh] !max-w-[95vw] w-[95vw]">
            <DialogHeader>
            <DialogTitle>Lab Session Details</DialogTitle>
            <DialogDescription>
              {modal.selectedSession &&
                new Date(modal.selectedSession.started_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {modal.selectedSession && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2 min-w-[140px]">
                  <Label htmlFor="session-name">Name</Label>
                  <Input
                    id="session-name"
                    value={modalEditName}
                    onChange={(e) => setModalEditName(e.target.value)}
                    placeholder="Session name"
                  />
                </div>
                <div className="space-y-2 flex-1 min-w-[160px]">
                  <Label htmlFor="session-notes">Notes</Label>
                  <Input
                    id="session-notes"
                    value={modalEditNotes}
                    onChange={(e) => setModalEditNotes(e.target.value)}
                    placeholder="Notes"
                  />
                </div>
                {token && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={modalSaveStatus === "saving"}
                      onClick={async () => {
                        setModalSaveStatus("saving");
                        setModalSaveMessage("");
                        try {
                          await api.training.updateSession(
                            modal.selectedSession!.id,
                            { name: modalEditName || null, notes: modalEditNotes || null },
                            token
                          );
                          await refetch();
                          await modal.viewSession(modal.selectedSession!.id);
                          setModalSaveStatus("success");
                          setModalSaveMessage("Saved");
                          setTimeout(() => {
                            setModalSaveStatus("idle");
                            setModalSaveMessage("");
                          }, 2000);
                        } catch (err) {
                          setModalSaveStatus("error");
                          setModalSaveMessage(err instanceof Error ? err.message : "Save failed");
                        }
                      }}
                    >
                      {modalSaveStatus === "saving" ? "Saving..." : "Save"}
                    </Button>
                    {modalSaveStatus === "success" && (
                      <span className="text-sm text-green-600">{modalSaveMessage}</span>
                    )}
                    {modalSaveStatus === "error" && (
                      <span className="text-sm text-destructive">{modalSaveMessage}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Session</p>
                  <p className="font-semibold">#{modal.selectedSession.id}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Started</p>
                  <p>{new Date(modal.selectedSession.started_at).toLocaleString()}</p>
                </div>
                {modal.selectedSession.ended_at && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Ended</p>
                    <p>{new Date(modal.selectedSession.ended_at).toLocaleString()}</p>
                  </div>
                )}
                {modal.selectedSession.duration_seconds != null && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Duration</p>
                    <p className="font-semibold">
                      {Math.floor(modal.selectedSession.duration_seconds / 60)}m{" "}
                      {modal.selectedSession.duration_seconds % 60}s
                    </p>
                  </div>
                )}
              </div>
              <TrainingSessionViz data={modal.selectedSession.data as SessionVizData} />
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Raw JSON Data
                </summary>
                <pre className="mt-2 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-4 text-xs">
                  {JSON.stringify(modal.selectedSession.data, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
