"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type TrainingSessionItem = {
  id: number;
  user_id: number;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  data: Record<string, unknown>;
  notes: string | null;
  created_at: string;
};

export function useTrainingHistory(token: string | null | undefined) {
  const [history, setHistory] = useState<TrainingSessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!token) {
      setHistory([]);
      return;
    }
    setLoading(true);
    try {
      const sessions = await api.training.getSessions(token);
      setHistory(sessions);
    } catch (err) {
      const error = err as Error;
      const isAuthError =
        error.message === "UNAUTHORIZED" ||
        error.message.includes("credentials") ||
        error.message.includes("Could not validate");
      if (isAuthError) {
        setHistory([]);
      } else {
        console.error("Error loading training history:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { history, loading, refetch };
}
