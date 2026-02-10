"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type VoiceControlOptions = {
  onStart?: () => void;
  onStop?: () => void;
};

export function useVoiceControl(options: VoiceControlOptions = {}) {
  const { onStart, onStop } = options;
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onStartRef = useRef(onStart);
  const onStopRef = useRef(onStop);

  onStartRef.current = onStart;
  onStopRef.current = onStop;

  useEffect(() => {
    const SpeechRecognition =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    setSupported(!!SpeechRecognition);

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
        recognitionRef.current = null;
      }
      setIsListening(false);
    };
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError("Speech recognition not supported");
      return;
    }

    setError(null);

    // First, explicitly request microphone permission
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we just needed permission
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setError("Microphone permission denied. Please allow microphone access in your browser settings.");
        } else {
          setError(`Failed to access microphone: ${err.message || err.name}`);
        }
        return;
      }
    }

    // Now start speech recognition
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      // Automatically restart recognition if it was intentionally started
      // This keeps listening continuously for "start" and "stop" commands
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch (err) {
          // Recognition might already be starting, ignore error
          setIsListening(false);
          recognitionRef.current = null;
        }
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Don't stop on "no-speech" errors - just keep listening
      if (event.error === "no-speech") return;
      
      // For other errors, show message but try to keep listening if possible
      const msg =
        event.error === "not-allowed"
          ? "Microphone access denied. Please check browser permissions."
          : `Speech recognition error: ${event.error}`;
      setError(msg);
      
      // Only stop on critical errors
      if (event.error === "not-allowed" || event.error === "aborted") {
        setIsListening(false);
        recognitionRef.current = null;
      }
      // For other errors, recognition will try to restart via onend
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Get the latest transcript from the most recent result
      const latestResult = event.results[event.results.length - 1];
      const transcript = latestResult[0].transcript.toLowerCase().trim();
      
      const words = transcript.split(/\s+/);
      const hasRecord = /\brecord\b/i.test(transcript) || words.some((w) => w === "record");
      const hasStop = /\bstop\b/i.test(transcript) || words.some((w) => w === "stop");

      if (hasRecord) {
        onStartRef.current?.();
      } else if (hasStop) {
        onStopRef.current?.();
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setError("Failed to start speech recognition");
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [supported]);

  const stop = useCallback(() => {
    // Clear the ref first to prevent auto-restart in onend
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    
    if (recognition) {
      try {
        recognition.stop();
      } catch (_) {
        // Ignore errors when stopping
      }
    }
    setIsListening(false);
  }, []);

  return { isListening, error, supported, start, stop };
}
