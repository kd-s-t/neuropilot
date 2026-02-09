"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MachineControls from "@/components/MachineControls";
import { api } from "@/lib/api";
import React from "react";
import DroneScene from "@/components/DroneScene";
import TelloCamera from "@/components/TelloCamera";
import BrainwavePanel from "@/components/BrainwavePanel";
import Image from "next/image";
import { Plus, Drone, Battery, BatteryLow, BatteryMedium, BatteryFull, WifiOff, RadioTower } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Machine = {
  id: number;
  name: string;
  type: string;
  control_positions?: Array<{ id: string; description?: string; x: number; y: number; webhook_url?: string }> | null;
  blueprint?: string | null;
  created_at: string;
};

export default function MachinePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? null;

  const [machine, setMachine] = useState<Machine | null>(null);
  const [machineState, setMachineState] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showControlsDialog, setShowControlsDialog] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showTelloColumn, setShowTelloColumn] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [machineLogs, setMachineLogs] = useState<Array<{ id: number; machine_id: number; control_id: string; webhook_url: string; value: number | null; success: boolean; status_code: number | null; error_message: string | null; response_data: string | null; created_at: string }>>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [bindings, setBindings] = useState<string[]>([]);
  const [connectBattery, setConnectBattery] = useState<number | null>(null);

  const machineId = params?.id ? parseInt(params.id as string) : null;

  useEffect(() => {
    if (!token || !machineId) {
      setLoading(false);
      return;
    }

    const fetchMachine = async () => {
      try {
        const data = await api.machines.get(machineId, token);
        setMachine(data);
        setMachineState(data);
      } catch (err) {
        console.error("Error fetching machine:", err);
        setError("Machine not found");
      } finally {
        setLoading(false);
      }
    };

    fetchMachine();
  }, [token, machineId]);

  useEffect(() => {
    if (!showConnectModal) return;
    const fetchBattery = async () => {
      const r = await api.tello.battery();
      if (r.battery != null) setConnectBattery(r.battery);
    };
    fetchBattery();
    const id = setInterval(fetchBattery, 10000);
    return () => clearInterval(id);
  }, [showConnectModal]);

  // Fetch control bindings for this machine so simulator can consider them present
  useEffect(() => {
    if (!token || !machineId) return;
    const loadBindings = async () => {
      try {
        const data = await api.machines.getBindings(machineId, token);
        // data is expected to be array of binding objects with control_id
        setBindings(data.map((b: any) => String(b.control_id)));
      } catch (e) {
        console.error("Failed to load machine bindings:", e);
      }
    };
    loadBindings();
  }, [token, machineId]);

  useEffect(() => {
    if (!showLogsModal || !machineId || !token) return;
    setLogsLoading(true);
    api.machines
      .getLogs(machineId, 100, token)
      .then((list) => setMachineLogs(list ?? []))
      .catch(() => setMachineLogs([]))
      .finally(() => setLogsLoading(false));
  }, [showLogsModal, machineId, token]);

  const handleBlueprintUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token || !machine) {
      return;
    }

    setUploading(true);
    setUploadSuccess(false);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const url = `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/machines/${machine.id}/blueprint`;
      
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        setUploadError(errorText || "Failed to upload blueprint");
        return;
      }

      const updatedMachine = await res.json();
      setMachine(updatedMachine);
      setMachineState(updatedMachine);
      setUploadSuccess(true);
      
      // Auto-dismiss success message after 3 seconds
      setTimeout(() => {
        setUploadSuccess(false);
      }, 3000);
      
      // Reset file input
      e.target.value = "";
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload blueprint");
    } finally {
      setUploading(false);
    }
  };

  if (loading || !machine || !machineState) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="h-10 w-32 bg-muted animate-pulse rounded" />
          <div className="flex items-center gap-4">
            <div>
              <div className="h-8 w-32 bg-muted animate-pulse rounded mb-2" />
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-10 w-36 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="h-[600px] w-full border rounded-lg bg-muted/20 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || "Machine not found"}</p>
          <Button onClick={() => router.push("/machines")}>Back to Machines</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <motion.div 
        className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <h2 className="text-2xl font-bold">{machineState.name}</h2>
              <p className="text-sm text-muted-foreground">Type: {machineState.type}</p>
            </motion.div>
            <div className="flex gap-2">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <input
                  id="blueprint-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleBlueprintUpload}
                  className="hidden"
                  disabled={uploading}
                />
                <Button 
                  variant="outline" 
                  type="button"
                  onClick={() => document.getElementById("blueprint-upload")?.click()}
                  disabled={uploading}
                >
                  <Image src="/blueprint.png" alt="" width={20} height={20} className="mr-2 h-5 w-5 object-contain" />
                  {uploading ? "Uploading..." : "Upload Blueprint"}
                </Button>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  variant="outline" 
                  type="button"
                  onClick={() => setShowControlsDialog(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add New Control
                </Button>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.28 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button
                  variant="outline"
                  onClick={() => setShowSimulator(true)}
                >
                  Start Simulator
                </Button>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button 
                  variant="outline" 
                  type="button"
                  onClick={() => setShowConnectModal(true)}>
                  <Drone className="mr-2 h-5 w-5" />
                  Connect
                </Button>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.32 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button variant="outline" onClick={() => setShowLogsModal(true)}>
                  All logs
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div 
        className="container mx-auto p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
      {(uploadSuccess || uploadError) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {uploadSuccess && (
            <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950 relative pr-8">
              <AlertDescription className="text-green-800 dark:text-green-200">
                Blueprint uploaded successfully
              </AlertDescription>
              <button
                onClick={() => setUploadSuccess(false)}
                className="absolute right-4 top-4 text-green-800 dark:text-green-200 hover:text-green-900 dark:hover:text-green-100"
              >
                ×
              </button>
            </Alert>
          )}
          {uploadError && (
            <Alert variant="destructive" className="mb-4 relative pr-8">
              <AlertDescription>
                {uploadError}
              </AlertDescription>
              <button
                onClick={() => setUploadError(null)}
                className="absolute right-4 top-4 text-destructive hover:text-destructive/80"
              >
                ×
              </button>
            </Alert>
          )}
        </motion.div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <MachineControls 
          machine={machineState} 
          onMachineUpdate={(updatedMachine: Machine) => {
            setMachine(updatedMachine);
            setMachineState(updatedMachine);
          }}
          openControlsDialog={showControlsDialog}
          onControlsDialogChange={setShowControlsDialog}
        />
      </motion.div>
      <Dialog open={showSimulator} onOpenChange={setShowSimulator}>
        <DialogContent className="max-w-6xl w-[90vw] h-[80vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DialogTitle>Simulator</DialogTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowSimulator(false)} className="h-8 w-8 p-0">×</Button>
            </div>
          </DialogHeader>
          <div className="w-full h-[calc(100%-80px)]">
            <div className="w-full h-full rounded border border-border overflow-hidden">
              <DroneScene className="w-full h-full" controls={machineState.control_positions && machineState.control_positions.length > 0 ? "eeg" : "keyboard"} />
            </div>
            {/* If required controls missing, show a small red log below.
                Consider both saved control_positions and machine bindings, normalize ids and map synonyms. */}
            {(() => {
              const normalize = (id?: string) => {
                if (!id) return "";
                const l = id.toLowerCase().replace(/\s+/g, "");
                const synonyms: Record<string, string> = {
                  reverse: "back",
                  backward: "back",
                  back: "back",
                  fw: "forward",
                  fwd: "forward",
                  forward: "forward",
                  r: "right",
                  l: "left",
                  uptilt: "up",
                  downtilt: "down",
                  // camelCase variants will be lowercased without spaces (turnleft -> turnleft)
                };
                return synonyms[l] ?? l;
              };

              const required = ["forward","back","left","right","up","down","turnleft","turnright"];

              const presentIds = new Set<string>();
              (machineState.control_positions || []).forEach((c: any) => {
                presentIds.add(normalize(String(c.id)));
              });
              (bindings || []).forEach((b) => {
                presentIds.add(normalize(String(b)));
              });

              const missing = required.filter(r => !presentIds.has(r));
              if (missing.length > 0) {
                // display in readable form (turnleft -> turnLeft)
                const pretty = missing.map(m => m === "turnleft" ? "turnLeft" : m === "turnright" ? "turnRight" : m);
                return (
                  <div className="mt-2">
                    <p className="text-[12px] text-red-600">
                      Missing controls: {pretty.join(", ")}.
                    </p>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2">
              {connectBattery != null ? (() => {
                const pct = connectBattery;
                const color = pct > 66 ? "text-green-500" : pct > 33 ? "text-yellow-500" : "text-red-500";
                return (
                  <span className={`${color} animate-pulse`} aria-label="Live">
                    <RadioTower className="h-4 w-4" />
                  </span>
                );
              })() : (
                <span title="Disconnected" aria-label="Disconnected"><WifiOff className="h-4 w-4 text-muted-foreground" /></span>
              )}
              {connectBattery != null && (() => {
                const pct = connectBattery;
                const Icon = pct <= 25 ? BatteryLow : pct <= 50 ? BatteryMedium : BatteryFull;
                return (
                  <span className="flex items-center gap-1 ml-1 text-muted-foreground" title={`${pct}%`}>
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-normal">{pct}%</span>
                  </span>
                );
              })()}
            </DialogTitle>
            {!showTelloColumn && (
              <Button variant="outline" size="sm" onClick={() => setShowTelloColumn(true)}>
                Show Tello camera
              </Button>
            )}
          </DialogHeader>
          {showTelloColumn ? (
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="flex flex-col min-h-0 min-w-0">
                <TelloCamera className="flex-1 min-h-[280px]" autoStart={true} onHide={() => setShowTelloColumn(false)} />
              </div>
              <div className="flex flex-col min-h-0 min-w-0">
                <BrainwavePanel className="flex-1 min-h-[280px]" enabled={showConnectModal} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 min-w-0">
              <BrainwavePanel className="flex-1 min-h-[280px]" enabled={showConnectModal} />
            </div>
          )}
        </DialogContent>
      </Dialog>
      </motion.div>
      <Dialog open={showLogsModal} onOpenChange={setShowLogsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>All logs</DialogTitle>
            <DialogDescription>
              Webhook execution logs from machine_logs for this machine.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto rounded border border-border bg-muted/30 p-3 font-mono text-xs">
            {logsLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : machineLogs.length === 0 ? (
              <p className="text-muted-foreground">No logs yet.</p>
            ) : (
              <ul className="space-y-2">
                {machineLogs.map((log) => (
                  <li key={log.id} className="break-all border-b border-border/50 pb-2 last:border-0">
                    <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                    {" "}
                    <span className={log.success ? "text-green-600" : "text-red-600"}>{log.control_id}</span>
                    {log.status_code != null && ` ${log.status_code}`}
                    {log.error_message && ` — ${log.error_message}`}
                    {log.response_data && !log.error_message && ` — ${log.response_data}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
