"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TeslaSettings, VoicePhase } from "./types";

type RecognitionResultLike = { transcript: string };
type RecognitionEventLike = {
  results: ArrayLike<{ 0: RecognitionResultLike; isFinal?: boolean; length: number }>;
  resultIndex: number;
};
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => RecognitionLike;

type UseVoiceControlOptions = {
  settings: TeslaSettings;
  onCommand: (command: string) => Promise<string | void>;
};

export function useVoiceControl({ settings, onCommand }: UseVoiceControlOptions) {
  const [armed, setArmed] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("Tap Voice once to start");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const armedRef = useRef(false);
  const awakeUntilRef = useRef(0);
  const restartTimerRef = useRef(0);
  const suppressRestartRef = useRef(false);
  const commandRef = useRef(onCommand);
  const settingsRef = useRef(settings);

  useEffect(() => { commandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const haptic = useCallback((pattern: number | number[]) => {
    if (settingsRef.current.haptics && "vibrate" in navigator) navigator.vibrate(pattern);
  }, []);

  const resumeRecognition = useCallback(() => {
    if (!armedRef.current || document.visibilityState !== "visible") return;
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      try {
        recognitionRef.current?.start();
        setPhase("listening");
      } catch {
        // Recognition is already active or Safari is still resetting it.
      }
    }, 220);
  }, []);

  const speak = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setTranscript(clean);
    if (!settingsRef.current.speak || !("speechSynthesis" in window)) {
      setPhase(armedRef.current ? "listening" : "idle");
      return;
    }
    suppressRestartRef.current = true;
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = settingsRef.current.language;
    utterance.rate = 1.03;
    utterance.pitch = 0.98;
    utterance.onstart = () => setPhase("speaking");
    utterance.onend = () => {
      suppressRestartRef.current = false;
      resumeRecognition();
    };
    utterance.onerror = () => {
      suppressRestartRef.current = false;
      resumeRecognition();
    };
    window.speechSynthesis.speak(utterance);
  }, [resumeRecognition]);

  const consumeCommand = useCallback(async (command: string) => {
    const clean = command.trim();
    if (!clean) {
      speak("Ready");
      return;
    }
    setTranscript(clean);
    setPhase("thinking");
    haptic(14);
    try {
      const reply = await commandRef.current(clean);
      if (reply) speak(reply);
      else resumeRecognition();
    } catch {
      speak("I could not complete that. Core dashboard commands are still available.");
    }
  }, [haptic, resumeRecognition, speak]);

  useEffect(() => {
    const browser = window as typeof window & {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) {
      setPhase("unsupported");
      setTranscript("Voice recognition needs Safari on iPhone");
      return;
    }

    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = settings.language;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const heard = event.results[index][0]?.transcript?.trim() || "";
        if (!heard) continue;
        setTranscript(heard);
        const wakeWord = settingsRef.current.wakeWord.toLowerCase().trim();
        const lower = heard.toLowerCase();
        const wakeIndex = wakeWord ? lower.indexOf(wakeWord) : -1;
        if (wakeIndex >= 0) {
          awakeUntilRef.current = Date.now() + 9000;
          setPhase("awake");
          haptic([18, 45, 18]);
          const rest = heard.slice(wakeIndex + wakeWord.length).replace(/^[\s,.:;!?-]+/, "").trim();
          if (rest) {
            awakeUntilRef.current = 0;
            void consumeCommand(rest);
          } else {
            speak("Ready");
          }
        } else if (Date.now() < awakeUntilRef.current) {
          awakeUntilRef.current = 0;
          void consumeCommand(heard);
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        armedRef.current = false;
        setArmed(false);
        setPhase("error");
        setTranscript("Allow Microphone and Speech Recognition in iPhone Settings");
        return;
      }
      setPhase("error");
      setTranscript(`Voice paused: ${event.error}`);
    };
    recognition.onend = () => {
      if (!suppressRestartRef.current) resumeRecognition();
    };
    recognitionRef.current = recognition;

    const onVisibility = () => {
      if (document.visibilityState === "visible") resumeRecognition();
      else recognition.stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(restartTimerRef.current);
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
      window.speechSynthesis?.cancel();
    };
  }, [consumeCommand, haptic, resumeRecognition, settings.language, speak]);

  const toggle = useCallback(() => {
    if (phase === "unsupported") return;
    const next = !armedRef.current;
    armedRef.current = next;
    setArmed(next);
    if (next) {
      awakeUntilRef.current = Date.now() + 9000;
      setPhase("arming");
      setTranscript(`Listening for “${settingsRef.current.wakeWord}”`);
      haptic(20);
      try {
        recognitionRef.current?.start();
        setPhase("listening");
      } catch {
        resumeRecognition();
      }
    } else {
      awakeUntilRef.current = 0;
      suppressRestartRef.current = true;
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      suppressRestartRef.current = false;
      setPhase("idle");
      setTranscript("Voice paused");
    }
  }, [haptic, phase, resumeRecognition]);

  return { armed, phase, transcript, toggle, speak };
}
