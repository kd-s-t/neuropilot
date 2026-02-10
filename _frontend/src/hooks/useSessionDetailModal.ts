"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import type { TrainingSessionItem } from "./useTrainingHistory";

export function useSessionDetailModal(token: string | null | undefined) {
  const [selectedSession, setSelectedSession] = useState<TrainingSessionItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const viewSession = useCallback(
    async (sessionId: number) => {
      if (!token) return;
      try {
        const data = await api.training.getSession(sessionId, token);
        setSelectedSession(data);
        setIsOpen(true);
      } catch (err) {
        const error = err as Error;
        const isAuthError =
          error.message === "UNAUTHORIZED" ||
          error.message.includes("credentials") ||
          error.message.includes("Could not validate");
        if (isAuthError) {
          return;
        }
        console.error("Error fetching session:", err);
      }
    },
    [token]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedSession(null);
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSelectedSession(null);
    }
  }, []);

  return { selectedSession, isOpen, viewSession, close, setOpen };
}
