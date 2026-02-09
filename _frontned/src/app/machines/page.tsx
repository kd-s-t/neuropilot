"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@heroui/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type Machine = {
  id: number;
  name: string;
  type: string;
  created_at: string;
};

export default function MachinesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? null;
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [machineToDelete, setMachineToDelete] = useState<Machine | null>(null);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineType, setNewMachineType] = useState("drone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchMachines = useCallback(async () => {
    if (!token) return;
    setFetchError(null);
    setLoading(true);
    try {
      const data = await api.machines.getAll(token);
      setMachines(data);
    } catch (err) {
      const e = err as Error;
      if (e.message?.includes("credentials") || e.message?.includes("401") || e.message?.includes("Could not validate")) {
        await signOut({ redirect: true, callbackUrl: "/login" });
        return;
      }
      const isNetwork = e.message === "Failed to fetch" || e.name === "TypeError";
      setFetchError(isNetwork ? `Cannot connect to API at ${api.base}. Is the backend running?` : e.message || "Failed to load machines");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (status === "authenticated" && token) {
      fetchMachines();
    } else if (status === "authenticated" && !token) {
      console.error("Session is authenticated but token is missing");
    }
  }, [status, token, fetchMachines]);

  const handleCreateMachine = async () => {
    if (!token) {
      setError("Please log in to create a machine");
      return;
    }
    if (!newMachineName.trim()) {
      setError("Machine name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const machine = await api.machines.create(
        { name: newMachineName.trim(), type: newMachineType },
        token
      );
      setMachines([machine, ...machines]);
      setIsCreateDialogOpen(false);
      setNewMachineName("");
      setNewMachineType("drone");
      setError(null);
    } catch (err) {
      const error = err as Error;
      if (error.message.includes("credentials") || error.message.includes("401") || error.message.includes("Could not validate")) {
        await signOut({ redirect: true, callbackUrl: "/login" });
        return;
      }
      setError(error.message || "Failed to create machine");
      console.error("Error creating machine:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (machine: Machine, e: React.MouseEvent) => {
    e.stopPropagation();
    setMachineToDelete(machine);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteMachine = async () => {
    if (!token || !machineToDelete) return;
    try {
      await api.machines.delete(machineToDelete.id, token);
      setMachines(machines.filter((m) => m.id !== machineToDelete.id));
      setError(null);
      setIsDeleteDialogOpen(false);
      setMachineToDelete(null);
    } catch (err) {
      const error = err as Error;
      if (error.message.includes("credentials") || error.message.includes("401") || error.message.includes("Could not validate")) {
        await signOut({ redirect: true, callbackUrl: "/login" });
        return;
      }
      setError(error.message || "Failed to delete machine");
      console.error("Error deleting machine:", err);
    }
  };

  const handleMachineClick = (machineId: number) => {
    router.push(`/machines/${machineId}`);
  };

  if (status === "loading") {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64 rounded-lg" />
            <Skeleton className="h-4 w-48 rounded-lg" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="w-full space-y-4 rounded-lg border border-border bg-muted/20 p-4">
              <Skeleton className="h-6 w-3/5 rounded-lg" />
              <div className="space-y-3">
                <Skeleton className="h-3 w-4/5 rounded-lg" />
                <Skeleton className="h-3 w-2/5 rounded-lg" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <Skeleton className="h-3 w-24 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="container mx-auto p-4">
      {fetchError && (
        <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-4">
          <span>{fetchError}</span>
          <Button variant="outline" size="sm" onClick={() => fetchMachines()}>
            Retry
          </Button>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-4">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setError(null)}>
            ×
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Machine Controls</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and control your machines
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          Add Machine
        </Button>
      </div>

      {loading && machines.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="w-full space-y-4 rounded-lg border border-border bg-muted/20 p-4">
              <Skeleton className="h-6 w-3/5 rounded-lg" />
              <div className="space-y-3">
                <Skeleton className="h-3 w-4/5 rounded-lg" />
                <Skeleton className="h-3 w-2/5 rounded-lg" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <Skeleton className="h-3 w-24 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : machines.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No machines yet.</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              Create Your First Machine
            </Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div 
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
        >
          <AnimatePresence mode="popLayout">
            {machines.map((machine, index) => (
              <motion.div
                key={machine.id}
                variants={{
                  hidden: { opacity: 0, y: 20, scale: 0.95 },
                  visible: { 
                    opacity: 1, 
                    y: 0, 
                    scale: 1,
                    transition: {
                      type: "spring",
                      stiffness: 300,
                      damping: 24
                    }
                  }
                }}
                exit={{ 
                  opacity: 0, 
                  scale: 0.8,
                  transition: { duration: 0.2 }
                }}
                whileHover={{ 
                  scale: 1.02,
                  transition: { duration: 0.2 }
                }}
                layout
              >
                <Card
                  className="cursor-pointer hover:bg-muted/50 transition-colors h-full"
                  onClick={() => handleMachineClick(machine.id)}
                >
                  <CardHeader>
                    <CardTitle>{machine.name}</CardTitle>
                    <CardDescription>{machine.type}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Created {new Date(machine.created_at).toLocaleDateString()}
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => handleDeleteClick(machine, e)}
                      >
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        setIsCreateDialogOpen(open);
        if (!open) {
          setError(null);
          setNewMachineName("");
          setNewMachineType("drone");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Machine</DialogTitle>
            <DialogDescription>
              Add a new machine to control with your brainwaves
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newMachineName}
                onChange={(e) => setNewMachineName(e.target.value)}
                placeholder="e.g., My Drone"
              />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Input
                id="type"
                value={newMachineType}
                onChange={(e) => setNewMachineType(e.target.value)}
                placeholder="e.g., drone"
              />
            </div>
            {error && (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateMachine} disabled={loading || !newMachineName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Machine</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{machineToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setMachineToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteMachine}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
