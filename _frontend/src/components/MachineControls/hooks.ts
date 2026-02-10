import { useCallback } from "react";
import { api } from "@/lib/api";

export function useFetchSessions(token: string | null | undefined, setSessions: (s: any[]) => void, setLoading: (b: boolean) => void) {
  return useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.training.getSessions(token);
      setSessions(data);
    } catch (err) {
      console.error("Error fetching training sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [token, setSessions, setLoading]);
}

export function useFetchBindings(token: string | null | undefined, machineId: number | null | undefined, setBindings: (b: any[]) => void) {
  return useCallback(async () => {
    if (!token || !machineId) return;
    try {
      const data = await api.machines.getBindings(machineId, token);
      setBindings(data);
    } catch (err) {
      console.error("Error fetching bindings:", err);
    }
  }, [token, machineId, setBindings]);
}

