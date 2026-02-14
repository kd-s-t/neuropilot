"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import * as Icons from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import ReactFlow, { Node, Edge, Background, Controls, MiniMap, NodeTypes, applyNodeChanges, OnNodesChange, ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { api } from "@/lib/api";
import { toast } from "@heroui/react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

import type { Machine, MachineControlsProps, TrainingSession, Binding, Control } from "./MachineControls/types";
import { ICON_LIST } from "./MachineControls/consts";
import { useFetchSessions, useFetchBindings } from "./MachineControls/hooks";

import ControlNode from "./MachineControls/ControlNode";
import MiniSessionGraph from "./MachineControls/MiniSessionGraph";

// Define nodeTypes outside component to prevent recreation - this is the recommended approach
const nodeTypes: NodeTypes = {
  controlNode: ControlNode,
};

// MiniSessionGraph moved to separate file and imported above

export default function MachineControls({ machine: initialMachine, onMachineUpdate, openControlsDialog: externalOpenControlsDialog, onControlsDialogChange }: MachineControlsProps) {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? null;
  const [machine, setMachine] = useState<Machine>(initialMachine);
  const [selectedControl, setSelectedControl] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [internalShowControlsDialog, setInternalShowControlsDialog] = useState(false);
  const [showControlChoiceDialog, setShowControlChoiceDialog] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [pendingControlId, setPendingControlId] = useState<string | null>(null);
  
  const showControlsDialog = externalOpenControlsDialog !== undefined ? externalOpenControlsDialog : internalShowControlsDialog;
  const setShowControlsDialog = externalOpenControlsDialog !== undefined && onControlsDialogChange ? onControlsDialogChange : setInternalShowControlsDialog;
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(false);
  const [bindingLoading, setBindingLoading] = useState<number | null>(null);
  const [unbindingId, setUnbindingId] = useState<number | null>(null);
  const [boundSessions, setBoundSessions] = useState<Record<string, TrainingSession>>({});
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [controlToDelete, setControlToDelete] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingControl, setEditingControl] = useState<Control | null>(null);
  const [newControlId, setNewControlId] = useState("");
  const [newControlDescription, setNewControlDescription] = useState("");
  const [newControlIcon, setNewControlIcon] = useState("");
  const [newControlBgColor, setNewControlBgColor] = useState("");
  const [savingControls, setSavingControls] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [controlIdError, setControlIdError] = useState<string | null>(null);
  const [hasUnsavedPositions, setHasUnsavedPositions] = useState(false);
  const [savingPositions, setSavingPositions] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState<string | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [machineLogs, setMachineLogs] = useState<Array<{ id: number; machine_id: number; control_id: string; webhook_url: string; value: number | null; success: boolean; status_code: number | null; error_message: string | null; response_data: string | null; created_at: string }>>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const savedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const prevMachineRef = useRef<Machine | null>(null);
  const rfInstanceRef = useRef<any>(null);
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const viewportChangedRef = useRef(false);

  // Normalize webhook URL - fix common mistakes
  const normalizeWebhookUrl = (url: string): string => {
    if (!url.trim()) return url;
    
    // Fix common typos: /foward, /forward, /back, /left, /right, etc. -> /command
    const urlLower = url.toLowerCase();
    const commonControlPaths = ['/foward', '/forward', '/back', '/left', '/right', '/up', '/down', '/takeoff', '/land', '/start', '/stop'];
    
    for (const path of commonControlPaths) {
      if (urlLower.includes(path) && !urlLower.includes('/command') && !urlLower.includes('/controls')) {
        // Replace the control path with /command
        const urlObj = new URL(url);
        urlObj.pathname = '/command';
        return urlObj.toString();
      }
    }
    
    return url;
  };

  // Validate webhook URL format
  const validateWebhookUrl = (url: string): string | null => {
    if (!url.trim()) return null; // Optional field
    
    try {
      const normalized = normalizeWebhookUrl(url);
      const urlObj = new URL(normalized);
      
      // Check if path is /command or /controls
      if (urlObj.pathname !== '/command' && urlObj.pathname !== '/controls') {
        return `Webhook URL should end with /command or /controls. The control_id goes in the JSON body, not the URL path.`;
      }
      
      return null; // Valid
    } catch (e) {
      return 'Invalid webhook URL format. Leave empty for built-in Tello, or use an external URL ending with /command or /controls.';
    }
  };

  const iconList = ICON_LIST;

  const fetchSessions = useFetchSessions(token, setSessions, setLoading);
  const fetchBindings = useFetchBindings(token, machine.id, setBindings);


  useEffect(() => {
    const prevMachine = prevMachineRef.current;
    if (!prevMachine || 
        prevMachine.id !== initialMachine.id ||
        JSON.stringify(prevMachine.control_positions || []) !== JSON.stringify(initialMachine.control_positions || []) ||
        prevMachine.blueprint !== initialMachine.blueprint) {
      setMachine(initialMachine);
      prevMachineRef.current = initialMachine;
    }
  }, [initialMachine]);

  useEffect(() => {
    fetchBindings();
  }, [fetchBindings]);

  useEffect(() => {
    // Fetch bound sessions for all controls with bindings
    const fetchAllBoundSessions = async () => {
      const sessions: Record<string, TrainingSession> = {};
      for (const binding of bindings) {
        if (binding.training_session_id && token) {
          try {
            const session = await api.training.getSession(binding.training_session_id, token);
            sessions[binding.control_id] = session;
          } catch (err) {
            console.error(`Error fetching session for ${binding.control_id}:`, err);
          }
        }
      }
      setBoundSessions(sessions);
    };
    
    if (bindings.length > 0 && token) {
      fetchAllBoundSessions();
    } else {
      setBoundSessions({});
    }
  }, [bindings, token]);

  // Memoize blueprint URL so it doesn't change every render (avoids flicker)
  const blueprintUrl = useMemo(() => {
    if (!machine.blueprint) return null;
    return `${process.env.NEXT_PUBLIC_BACKEND_URL}${machine.blueprint}`;
  }, [machine.blueprint]);

  const handleControlClick = useCallback((controlId: string) => {
    setPendingControlId(controlId);
    setShowControlChoiceDialog(true);
  }, []);

  const handleManageControl = (controlId: string) => {
    const control = controls.find(c => c.id === controlId);
    if (control) {
      handleEditControl(control);
      setShowControlsDialog(true);
    }
    setShowControlChoiceDialog(false);
    // Keep pendingControlId so back button can return to choice dialog
  };

  const handleBindControl = (controlId: string) => {
    setSelectedControl(controlId);
    fetchSessions();
    setShowControlChoiceDialog(false);
    // Keep pendingControlId so back button can return to choice dialog
  };

  const fetchMachineLogs = useCallback(async (controlId: string) => {
    if (!token) return;
    setLoadingLogs(true);
    try {
      const logs = await api.machines.getLogs(machine.id, 50, token);
      // Filter logs for this specific control
      const controlLogs = logs.filter(log => log.control_id === controlId);
      setMachineLogs(controlLogs);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch logs";
      console.error("Error fetching machine logs:", err);
      setMachineLogs([]);
      toast.danger(errorMessage);
    } finally {
      setLoadingLogs(false);
    }
  }, [token, machine.id]);

  const handleWebhookTrigger = useCallback(async (control: Control) => {
    if (!token) return;

    setWebhookLoading(control.id);
    try {
      const rawUrl = (control as any).webhook_url ?? "";
      const useInternal = !rawUrl.trim() || rawUrl === "internal://tello";
      const log = await api.machines.triggerWebhook(machine.id, {
        control_id: control.id,
        webhook_url: useInternal ? "internal://tello" : rawUrl.trim(),
        value: control.value,
      }, token);
      
      if (!log.success) {
        throw new Error(log.error_message || "Command failed");
      }
      
      console.log(`Webhook triggered for ${control.id}:`, log);
      const controlName = control.description || control.id;
      toast.success(`Command triggered successfully for ${controlName}`);
      // Refresh logs after triggering webhook
      if (pendingControlId === control.id) {
        await fetchMachineLogs(control.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error triggering command for ${control.id}:`, error);
      const fullMessage = `Failed to trigger command: ${errorMessage}`;
      toast.danger(fullMessage);
    } finally {
      setWebhookLoading(null);
    }
  }, [token, machine.id, pendingControlId, fetchMachineLogs]);

  const isAddingNewControl = !editingControl && !pendingControlId;

  const handleBindSession = async (sessionId: number) => {
    if (!token || !selectedControl) return;
    
    // Check if this session is already bound to another control
    const existingBinding = bindings.find(b => 
      b.training_session_id === sessionId && b.control_id !== selectedControl
    );
    
    if (existingBinding) {
      const errorMessage = `This training session is already bound to the "${existingBinding.control_id}" control.`;
      setBindingError(errorMessage);
      toast.danger(errorMessage);
      return;
    }
    
    setBindingLoading(sessionId);
    setBindingError(null);
    try {
      await api.machines.createBinding(machine.id, {
        control_id: selectedControl,
        training_session_id: sessionId,
      }, token);
      await fetchBindings();
      setSelectedControl(null);
    } catch (err) {
      const error = err as Error;
      const errorMessage = error.message || String(err);
      console.error("Error binding session:", errorMessage);
      setBindingError(errorMessage);
      toast.danger(`Failed to bind session: ${errorMessage}`);
    } finally {
      setBindingLoading(null);
    }
  };

  const handleUnbind = useCallback(async (bindingId: number) => {
    if (!token) return;
    setUnbindingId(bindingId);
    setBindingError(null);
    try {
      await api.machines.deleteBinding(bindingId, token);
      await fetchBindings();
      toast.success("Unbound");
    } catch (err) {
      const error = err as Error;
      setBindingError(error.message || String(err));
      toast.danger(`Failed to unbind: ${error.message || String(err)}`);
    } finally {
      setUnbindingId(null);
    }
  }, [token, fetchBindings]);

  // Extract controls from control_positions only
  const controls = useMemo(() => {
    if (machine.control_positions && machine.control_positions.length > 0) {
      return machine.control_positions;
    }
    return [];
  }, [machine.control_positions]);

  const handleSaveControls = async (updatedControls: Control[], opts?: { silent?: boolean }) => {
    if (!token) return;
    setSavingControls(true);
    try {
      // Get current controls with positions
      const currentControlsWithPositions = machine.control_positions || [];
      
      // Build new controls with positions
      const newControlsWithPositions = updatedControls.map(control => {
        // Find existing position for this control
        const existing = currentControlsWithPositions.find((c: any) => c.id === control.id);
        const baseControl: any = {
          id: control.id,
          ...(control.description ? { description: control.description } : {}),
          ...(control.icon ? { icon: control.icon } : {}),
          ...(control.bgColor ? { bgColor: control.bgColor } : {}),
          ...(control.webhook_url ? { webhook_url: control.webhook_url } : {}),
          ...(control.value !== undefined ? { value: control.value } : {}),
        };
        
        if (existing && typeof existing === 'object' && 'x' in existing && 'y' in existing) {
          // Keep existing position
          return {
            ...baseControl,
            x: existing.x,
            y: existing.y,
          };
        } else {
          // New controls default to (1,1)
          return {
            ...baseControl,
            x: 1,
            y: 1,
          };
        }
      });
      
      // Update control_positions with the new structure
      // Try to include current viewport when saving controls
      let vp: any = undefined;
      try {
        vp = rfInstanceRef.current?.getViewport();
      } catch {}
      if (!vp) {
        try {
          const saved = localStorage.getItem(`machine_${machine.id}_viewport`);
          if (saved) vp = JSON.parse(saved);
        } catch {}
      }
      const updatedMachine = await api.machines.updatePositions(machine.id, newControlsWithPositions, vp, token);
      setMachine(updatedMachine);
      if (onMachineUpdate) {
        onMachineUpdate(updatedMachine);
      }
      
      // Determine which controls were added (if any) before updating saved positions
      const prevIds = (machine.control_positions || []).map((c: any) => c.id);
      const addedIds = newControlsWithPositions.map((c: any) => c.id).filter((id: string) => !prevIds.includes(id));

      // Update saved positions after controls are saved
      const newSavedPositions: Record<string, { x: number; y: number }> = {};
      newControlsWithPositions.forEach(control => {
        newSavedPositions[control.id] = { x: control.x, y: control.y };
      });
      savedPositionsRef.current = newSavedPositions;
      setHasUnsavedPositions(false);
      
      setShowControlsDialog(false);
      setEditingControl(null);
      setNewControlId("");
      setNewControlDescription("");
      setNewControlIcon("");
      setNewControlBgColor("");
      setControlIdError(null);

      // Show success toast for add/update (unless caller requested silent)
      if (!opts?.silent) {
        if (addedIds.length > 0) {
          toast.success(addedIds.length === 1 ? `Control "${addedIds[0]}" added` : `${addedIds.length} controls added`);
        } else {
          toast.success("Controls saved");
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save controls";
      console.error("Error saving controls:", err);
      setSaveError(errorMessage);
      toast.danger(errorMessage);
    } finally {
      setSavingControls(false);
    }
  };

  const handleAddControl = () => {
    setControlIdError(null);
    if (!newControlId.trim()) {
      setControlIdError("Control ID is required");
      return;
    }
    if (controls.some(c => c.id === newControlId)) {
      setControlIdError("Control ID already exists");
      return;
    }
    const newControl: Control = {
      id: newControlId.trim(),
      x: 1,
      y: 1,
      ...(newControlDescription.trim() ? { description: newControlDescription.trim() } : {}),
      ...(newControlIcon.trim() ? { icon: newControlIcon.trim() } : {}),
      ...(newControlBgColor.trim() ? { bgColor: newControlBgColor.trim() } : {}),
    };
    handleSaveControls([...controls, newControl]);
  };

  const handleEditControl = (control: Control) => {
    setEditingControl(control);
    setNewControlId(control.id);
    setNewControlDescription(control.description || "");
    setNewControlIcon(control.icon || "");
    setNewControlBgColor(control.bgColor || "");
    setControlIdError(null);
  };

  const handleUpdateControl = () => {
    setControlIdError(null);
    if (!editingControl || !newControlId.trim()) {
      setControlIdError("Control ID is required");
      return;
    }
    if (controls.some(c => c.id === newControlId && c.id !== editingControl.id)) {
      setControlIdError("Control ID already exists");
      return;
    }
    const updatedControls = controls.map(c =>
      c.id === editingControl.id
        ? {
            ...c,
            id: newControlId.trim(),
            x: c.x,
            y: c.y,
            ...(newControlDescription.trim() ? { description: newControlDescription.trim() } : {}),
            ...(newControlIcon.trim() ? { icon: newControlIcon.trim() } : {}),
            ...(newControlBgColor.trim() ? { bgColor: newControlBgColor.trim() } : {}),
          }
        : c
    );
    handleSaveControls(updatedControls);
  };

  const handleDeleteControl = (controlId: string) => {
    // open confirmation dialog (we avoid window.confirm)
    setControlToDelete(controlId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    const controlId = controlToDelete;
    if (!controlId) return;
    const control = controls.find(c => c.id === controlId);
    const controlName = control?.description || control?.id || "this control";
    setShowDeleteConfirm(false);
    setControlToDelete(null);

    const updatedControls: Control[] = controls.filter(c => c.id !== controlId);
    try {
      await handleSaveControls(updatedControls, { silent: true });
      const bindingsToRemove = bindings.filter((b) => b.control_id === controlId);
      for (const b of bindingsToRemove) {
        await api.machines.deleteBinding(b.id, token);
      }
      if (bindingsToRemove.length > 0) {
        await fetchBindings();
      }
      toast.success(`Control "${controlName}" deleted`);
      if (pendingControlId === controlId) {
        setShowControlChoiceDialog(false);
        setPendingControlId(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.danger(`Failed to delete control: ${msg}`);
    }
  };


  // Fetch logs when control choice dialog or logs modal opens
  useEffect(() => {
    if ((showControlChoiceDialog || showLogsModal) && pendingControlId && token) {
      fetchMachineLogs(pendingControlId);
    } else if (!showControlChoiceDialog && !showLogsModal) {
      setMachineLogs([]);
    }
  }, [showControlChoiceDialog, showLogsModal, pendingControlId, token, fetchMachineLogs]);

  // Initialize nodes with saved or default positions
  useEffect(() => {
    setNodes((currentNodes) => {
      // Check if controls have actually changed (new controls added/removed or IDs changed)
      const currentControlIds = new Set(controls.map(c => c.id));
      const nodeControlIds = new Set(currentNodes.map(n => n.id));
      const controlsChanged = 
        currentControlIds.size !== nodeControlIds.size ||
        !Array.from(currentControlIds).every(id => nodeControlIds.has(id));
      
      // If controls haven't changed, preserve current positions and only update data
      if (!controlsChanged && currentNodes.length > 0) {
        const mapped = currentNodes.map(node => {
          const control = controls.find(c => c.id === node.id);
          if (!control) return node;
          
          const binding = bindings.find((b) => b.control_id === control.id);
          return {
            ...node,
            data: {
              control: { 
                id: control.id, 
                description: control.description,
                icon: control.icon,
                bgColor: control.bgColor,
                webhook_url: (control as any).webhook_url,
                value: (control as any).value,
              },
              binding,
              boundSession: boundSessions[control.id],
              onControlClick: handleControlClick,
              selectedControl,
              onWebhookTrigger: handleWebhookTrigger,
              webhookLoading: webhookLoading === control.id,
              onUnbind: handleUnbind,
              unbindLoading: unbindingId === binding?.id,
            },
          };
        });

        return mapped;
      }
      
      // Controls changed, create new nodes with saved positions
        const initialNodes: Node[] = controls.map((control) => {
        const binding = bindings.find((b) => b.control_id === control.id);
        // Try to preserve position from current nodes if control still exists
        const existingNode = currentNodes.find(n => n.id === control.id);
        const position = existingNode?.position || { x: control.x, y: control.y };

        return {
          id: control.id,
          type: "controlNode",
          position,
          data: {
            control: { 
              id: control.id, 
              description: control.description,
              icon: control.icon,
              bgColor: control.bgColor,
              webhook_url: (control as any).webhook_url,
              value: (control as any).value,
            },
            binding,
            boundSession: boundSessions[control.id],
            onControlClick: handleControlClick,
            selectedControl,
            onWebhookTrigger: handleWebhookTrigger,
            webhookLoading: webhookLoading === control.id,
            onUnbind: handleUnbind,
            unbindLoading: unbindingId === binding?.id,
              // per-node framer-motion options (can be customized per control)
              motion: {
                initial: { scale: 0.97, opacity: 0 },
                animate: { scale: 1, opacity: 1 },
                whileHover: { scale: 1.03 },
                whileTap: { scale: 0.98 },
              },
          },
        };
      });
      
      // Save initial positions for comparison (only if controls changed)
      if (controlsChanged) {
        const initialPositions: Record<string, { x: number; y: number }> = {};
        controls.forEach(control => {
          initialPositions[control.id] = { x: control.x, y: control.y };
        });
        savedPositionsRef.current = initialPositions;
        setHasUnsavedPositions(false);
      }
      
      return initialNodes;
    });
  }, [bindings, boundSessions, selectedControl, handleControlClick, controls, webhookLoading, handleWebhookTrigger, handleUnbind, unbindingId]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => {
      const updatedNodes = applyNodeChanges(changes, nds);
      
      // Only mark as changed when we have saved positions and they differ (avoids card on initial load)
      const hasChanges = updatedNodes.some((node: Node) => {
        const saved = savedPositionsRef.current[node.id];
        if (!saved) return false;
        return saved.x !== node.position.x || saved.y !== node.position.y;
      });
      
      setHasUnsavedPositions(hasChanges);
      
      return updatedNodes;
    });
  }, []);

  const handleSavePositions = async () => {
    if (!token) return;
    setSavingPositions(true);
    try {
      const controlsWithPositions = nodes.map((node) => {
        const control = controls.find(c => c.id === node.id);
        return {
          id: node.id,
          ...(control?.description ? { description: control.description } : {}),
          ...(control?.icon ? { icon: control.icon } : {}),
          ...(control?.bgColor ? { bgColor: control.bgColor } : {}),
          ...((control as any)?.webhook_url ? { webhook_url: (control as any).webhook_url } : {}),
          ...((control as any)?.value !== undefined ? { value: (control as any).value } : {}),
          x: node.position.x,
          y: node.position.y,
        };
      });
      
      // include current viewport when saving positions
      let vp: any = undefined;
      try {
        vp = rfInstanceRef.current?.getViewport();
      } catch {}
      if (!vp) {
        try {
          const saved = localStorage.getItem(`machine_${machine.id}_viewport`);
          if (saved) vp = JSON.parse(saved);
        } catch {}
      }
      const updatedMachine = await api.machines.updatePositions(machine.id, controlsWithPositions, vp, token);
      setMachine(updatedMachine);
      if (onMachineUpdate) {
        onMachineUpdate(updatedMachine);
      }
      
      // Update saved positions
      const newSavedPositions: Record<string, { x: number; y: number }> = {};
      nodes.forEach(node => {
        newSavedPositions[node.id] = { x: node.position.x, y: node.position.y };
      });
      savedPositionsRef.current = newSavedPositions;
      setHasUnsavedPositions(false);
      // Update saved viewport state
      try {
        const vp = rfInstanceRef.current?.getViewport();
        if (vp) {
          savedViewportRef.current = vp;
          viewportChangedRef.current = false;
        }
      } catch {}
      // Show success toast when positions are saved (styled as success)
      toast.success("Positions saved");
      // Save current ReactFlow viewport (zoom/position) to localStorage so it can be restored
      try {
        const inst = rfInstanceRef.current;
        if (inst && typeof inst.getViewport === "function") {
          const vp = inst.getViewport();
          localStorage.setItem(`machine_${machine.id}_viewport`, JSON.stringify(vp));
        }
      } catch (e) {
        console.warn("Failed to save viewport:", e);
      }
    } catch (err) {
      console.error("Error saving positions:", err);
    } finally {
      setSavingPositions(false);
    }
  };

  const handleDiscardPositions = () => {
    // Reset nodes to saved positions
    const resetNodes = nodes.map(node => {
      const saved = savedPositionsRef.current[node.id];
      if (saved) {
        return { ...node, position: { x: saved.x, y: saved.y } };
      }
      return node;
    });
    setNodes(resetNodes);
    setHasUnsavedPositions(false);
    // restore saved viewport if available
    try {
      const saved = savedViewportRef.current;
      const inst = rfInstanceRef.current;
      if (saved && inst && typeof inst.setViewport === "function") {
        inst.setViewport(saved);
        viewportChangedRef.current = false;
      }
    } catch (e) {
      console.warn("Failed to restore viewport on discard:", e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="h-[600px] w-full border rounded-lg relative">
        {blueprintUrl && (
          <div
            key={`blueprint-${machine.id}-${machine.blueprint}`}
            className="absolute inset-0 pointer-events-none opacity-30 z-0"
            style={{
              backgroundImage: `url('${blueprintUrl}')`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              willChange: "transform",
              backfaceVisibility: "hidden",
              transform: "translateZ(0)",
            }}
          />
        )}
        <ReactFlow
          key={`${machine.id}-${machine.blueprint || 'no-blueprint'}-${nodes.length}`}
          nodes={nodes}
          edges={edges}
          onInit={(inst: ReactFlowInstance) => {
            rfInstanceRef.current = inst;
            // restore saved viewport if present (from DB first, then localStorage)
            try {
              const savedFromDB = (machine as any)?.viewport;
              let vp = null;
              if (savedFromDB && typeof savedFromDB === "object") {
                vp = savedFromDB;
              } else {
                const saved = localStorage.getItem(`machine_${machine.id}_viewport`);
                if (saved) vp = JSON.parse(saved);
              }
              if (vp && typeof inst.setViewport === "function") {
                inst.setViewport(vp);
                savedViewportRef.current = vp;
                viewportChangedRef.current = false;
              }
            } catch (e) {
              console.warn("Failed to restore viewport:", e);
            }
          }}
          onMove={(vp: any) => {
            // detect viewport change vs saved (for save; not used for showing card)
            try {
              const saved = savedViewportRef.current;
              const changed = !saved || Math.abs((saved.x ?? 0) - (vp.x ?? 0)) > 0.5 || Math.abs((saved.y ?? 0) - (vp.y ?? 0)) > 0.5 || Math.abs((saved.zoom ?? 0) - (vp.zoom ?? 0)) > 0.01;
              viewportChangedRef.current = changed;
            } catch {
              viewportChangedRef.current = true;
            }
            // only show "unsaved" when node positions actually changed (not viewport-only, e.g. fitView on load)
            const nodesChanged = nodes.some((node) => {
              const saved = savedPositionsRef.current[node.id];
              if (!saved) return false;
              return saved.x !== node.position.x || saved.y !== node.position.y;
            });
            setHasUnsavedPositions(nodesChanged);
          }}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          fitView
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {hasUnsavedPositions && (
        <div className="flex items-center justify-between rounded-lg border border-yellow-500 bg-yellow-50 dark:bg-yellow-950 p-3">
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            You have unsaved position changes
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscardPositions}
              disabled={savingPositions}
            >
              Discard Changes
            </Button>
            <Button
              size="sm"
              onClick={handleSavePositions}
              disabled={savingPositions}
            >
              {savingPositions ? "Saving..." : "Save Positions"}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showIconPicker} onOpenChange={setShowIconPicker}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Icon</DialogTitle>
            <DialogDescription>
              Choose an icon for this control
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-2 p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNewControlIcon("");
                setShowIconPicker(false);
              }}
              className="h-12 w-12 p-0"
            >
              None
            </Button>
            {iconList.map((iconName) => {
              const IconComponent = (Icons as any)[iconName];
              if (!IconComponent) return null;
              return (
                <Button
                  key={iconName}
                  type="button"
                  variant={newControlIcon === iconName ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setNewControlIcon(iconName);
                    setShowIconPicker(false);
                  }}
                  className="h-12 w-12 p-0"
                >
                  <IconComponent className="h-5 w-5" />
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showControlChoiceDialog} onOpenChange={setShowControlChoiceDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DialogTitle>
                  {pendingControlId ? (controls.find((c) => c.id === pendingControlId)?.description || controls.find((c) => c.id === pendingControlId)?.id || pendingControlId) : "Control Options"}
                </DialogTitle>
                <DialogDescription>
                  Choose an action for this control
                </DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowControlChoiceDialog(false);
                  setPendingControlId(null);
                }}
                className="h-8 w-8 p-0"
              >
                ×
              </Button>
            </div>
          </DialogHeader>
          <motion.div
            className="flex flex-col gap-3 mt-4"
            key={pendingControlId ?? "control-choice"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            {pendingControlId && (
              <>
                <Button
                  onClick={() => handleManageControl(pendingControlId)}
                  variant="outline"
                  className="w-full "
                >
                  Manage Control
                </Button>
                <Button
                  onClick={() => handleBindControl(pendingControlId)}
                  className="w-full "
                  variant="outline"
                >
                  Bind Training Sessions
                </Button>
                <Button
                  onClick={() => {
                    setShowControlChoiceDialog(false);
                    setShowLogsModal(true);
                  }}
                  variant="outline"
                  className="w-full "
                >
                  View Logs
                </Button>
                <Button
                  onClick={async () => {
                    if (!pendingControlId) return;
                    await handleDeleteControl(pendingControlId);
                  }}
                  variant="destructive"
                  className="w-full text-white"
                >
                  Delete 
                </Button>
                
              </>
            )}
          </motion.div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete control</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{controlToDelete ? (controls.find(c => c.id === controlToDelete)?.description || controlToDelete) : ""}</strong>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setControlToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLogsModal} onOpenChange={(open) => {
        if (!open) {
          setShowLogsModal(false);
          // Return to control choice dialog if we had one open
          if (pendingControlId) {
            setShowControlChoiceDialog(true);
          }
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowLogsModal(false);
                    setShowControlChoiceDialog(true);
                  }}
                  className="h-8 w-8 p-0"
                >
                  ←
                </Button>
                <div className="flex-1">
                  <DialogTitle>
                    Machine Logs - {pendingControlId ? (controls.find((c) => c.id === pendingControlId)?.description || controls.find((c) => c.id === pendingControlId)?.id || pendingControlId) : "Control"}
                  </DialogTitle>
                  <DialogDescription>
                    Complete webhook execution details for this control
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowLogsModal(false);
                  setShowControlChoiceDialog(true);
                }}
                className="h-8 w-8 p-0"
              >
                ×
              </Button>
            </div>
          </DialogHeader>
          {loadingLogs ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading logs...</p>
          ) : machineLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No logs for this control yet.</p>
          ) : (
            <div className="space-y-4 mt-4">
              {machineLogs.map((log) => {
                let payload = null;
                let response = null;
                
                try {
                  if (log.response_data) {
                    response = JSON.parse(log.response_data);
                  }
                } catch {
                  response = log.response_data;
                }
                
                payload = {
                  control_id: log.control_id,
                  value: log.value
                };
                
                return (
                  <Card key={log.id} className="p-4">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`text-sm font-semibold ${log.success ? 'text-green-600' : 'text-red-600'}`}>
                              {log.success ? 'Success' : 'Failed'}
                            </span>
                            {log.status_code && (
                              <span className="text-sm text-muted-foreground">
                                HTTP {log.status_code}
                              </span>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-3 border-t pt-3">
                        <div>
                          <Label className="text-xs font-semibold mb-1 block">Webhook URL</Label>
                          <div className="p-2 bg-muted rounded text-sm font-mono break-all">
                            {log.webhook_url}
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-xs font-semibold mb-1 block">Payload</Label>
                          <div className="p-2 bg-muted rounded text-sm font-mono">
                            <pre className="whitespace-pre-wrap break-all">
                              {JSON.stringify(payload, null, 2)}
                            </pre>
                          </div>
                        </div>
                        
                        {log.error_message && (
                          <div>
                            <Label className="text-xs font-semibold mb-1 block text-red-600">Error Message</Label>
                            <div className="p-2 bg-red-50 dark:bg-red-950 rounded text-sm text-red-600 break-all">
                              {log.error_message}
                            </div>
                          </div>
                        )}
                        
                        {log.response_data && (
                          <div>
                            <Label className="text-xs font-semibold mb-1 block">Response</Label>
                            <div className="p-2 bg-muted rounded text-sm font-mono max-h-[300px] overflow-y-auto">
                              <pre className="whitespace-pre-wrap break-all">
                                {typeof response === 'object' ? JSON.stringify(response, null, 2) : String(response)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showControlsDialog} onOpenChange={(open) => {
        setShowControlsDialog(open);
        if (!open) {
          setSaveError(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            {editingControl ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowControlsDialog(false);
                    setEditingControl(null);
                    setNewControlId("");
                    setNewControlDescription("");
                    setNewControlIcon("");
                    setNewControlBgColor("");
                    setControlIdError(null);
                    // Return to choice dialog if we came from there
                    if (pendingControlId) {
                      setShowControlChoiceDialog(true);
                    }
                  }}
                  className="h-8 w-8 p-0"
                >
                  ←
                </Button>
                <div className="flex-1">
                  <DialogTitle>Manage Controls</DialogTitle>
                  <DialogDescription>
                    Edit control for this machine
                  </DialogDescription>
                </div>
              </div>
            ) : (
              <div>
                <DialogTitle>Create New Control</DialogTitle>
                <DialogDescription>
                  Create a new control for this machine
                </DialogDescription>
              </div>
            )}
          </DialogHeader>
          {saveError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Control ID</Label>
              <Input
                value={newControlId}
                onChange={(e) => {
                  setNewControlId(e.target.value);
                  setControlIdError(null);
                }}
                placeholder="e.g., forward, lift, rotate"
                disabled={savingControls}
                className={controlIdError ? "border-destructive" : ""}
              />
              {controlIdError && (
                <p className="text-sm text-destructive">{controlIdError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                value={newControlDescription}
                onChange={(e) => setNewControlDescription(e.target.value)}
                placeholder="e.g., Forward, Lift, Rotate"
                disabled={savingControls}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon (Optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowIconPicker(true)}
                  disabled={savingControls}
                  className="w-full justify-start h-10"
                >
                  {newControlIcon ? (
                    (() => {
                      const IconComponent = (Icons as any)[newControlIcon];
                      return IconComponent ? (
                        <IconComponent className="h-4 w-4" />
                      ) : (
                        <span className="text-lg">{newControlIcon}</span>
                      );
                    })()
                  ) : (
                    <span className="text-muted-foreground">Select icon</span>
                  )}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Background Color (Optional)</Label>
                <Input
                  type="color"
                  value={newControlBgColor || "#000000"}
                  onChange={(e) => setNewControlBgColor(e.target.value)}
                  disabled={savingControls}
                  className="h-10 w-full"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {editingControl ? (
                <>
                  <Button onClick={handleUpdateControl} disabled={savingControls}>
                    Update Control
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Reset editing state
                      setEditingControl(null);
                      setNewControlId("");
                      setNewControlDescription("");
                      setNewControlIcon("");
                      setNewControlBgColor("");
                      setControlIdError(null);

                      // If we opened Manage Control from the control choice dialog,
                      // return to the choice menu (Manage / Bind / Logs). Otherwise, close the dialog.
                      if (pendingControlId) {
                        setShowControlsDialog(false);
                        setShowControlChoiceDialog(true);
                      } else {
                        setShowControlsDialog(false);
                      }
                    }}
                    disabled={savingControls}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button onClick={handleAddControl} disabled={savingControls}>
                  Add Control
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedControl !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedControl(null);
          setBindingError(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-4xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedControl(null);
                  // Return to choice dialog if we came from there
                  if (pendingControlId) {
                    setShowControlChoiceDialog(true);
                  }
                }}
                className="h-8 w-8 p-0"
              >
                ←
              </Button>
              <div className="flex-1">
                <DialogTitle>
                  {selectedControl ? (controls.find((c) => c.id === selectedControl)?.description || controls.find((c) => c.id === selectedControl)?.id) : ""}
                </DialogTitle>
                <DialogDescription>
                  View training sessions for this control
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {bindingError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{bindingError}</AlertDescription>
            </Alert>
          )}
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Loading...</p>
          ) : sessions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No training sessions yet.</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => {
                const bindingToCurrent = bindings.find(
                  (b) => b.control_id === selectedControl && b.training_session_id === session.id
                );
                const isBoundToCurrent = !!bindingToCurrent;
                const boundToOther = bindings.find(
                  (b) => b.training_session_id === session.id && b.control_id !== selectedControl
                );
                const isBound = isBoundToCurrent || !!boundToOther;
                const unbindingThis = bindingToCurrent && unbindingId === bindingToCurrent.id;

                return (
                  <Card key={session.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {session.name?.trim() ? (
                              <span className="font-bold">{session.name}</span>
                            ) : null}
                            {session.name?.trim() ? " " : ""}Session #{session.id}
                          </CardTitle>
                          <CardDescription>
                            {new Date(session.started_at).toLocaleString()}
                            {session.duration_seconds != null && (
                              <span className="ml-2">
                                · {Math.floor(session.duration_seconds / 60)}m {session.duration_seconds % 60}s
                              </span>
                            )}
                            {isBoundToCurrent && (
                              <span className="ml-2 text-green-600">· Bound to this control</span>
                            )}
                            {boundToOther && (
                              <span className="ml-2 text-orange-600">· Bound to "{boundToOther.control_id}"</span>
                            )}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {isBoundToCurrent ? (
                            <Button
                              onClick={() => bindingToCurrent && handleUnbind(bindingToCurrent.id)}
                              disabled={unbindingThis}
                              size="sm"
                              variant="outline"
                            >
                              {unbindingThis ? "Unbinding..." : "Unbind"}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleBindSession(session.id)}
                              disabled={!!boundToOther || bindingLoading === session.id}
                              size="sm"
                              variant={boundToOther ? "outline" : "default"}
                            >
                              {bindingLoading === session.id ? "Binding..." : boundToOther ? "Already Bound" : "Bind"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <MiniSessionGraph data={session.data} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
