"use client";

import { useEffect, useState } from "react";

import VoiceSheet from "@/components/os/voice-sheet";
import { VoiceLive } from "@/components/os/voice-live";

export default function VoicePreviewPage() {
  const [open, setOpen] = useState(true);
  const [microphone, setMicrophone] = useState<Promise<MediaStream> | null>(null);
  useEffect(() => {
    document.documentElement.classList.add("dark");
    const pending = navigator.mediaDevices?.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }) ?? Promise.reject(new Error("Microphone requires HTTPS and a supported browser."));
    setMicrophone(pending);
    return () => {
      document.documentElement.classList.remove("dark");
      void pending.then((stream) => stream.getTracks().forEach((track) => track.stop()), () => {});
    };
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {open && microphone ? (
        <VoiceSheet accessKey="dev" microphone={microphone} onClose={() => setOpen(false)} preview />
      ) : (
        <VoiceLive accessKey="dev" />
      )}
    </div>
  );
}
