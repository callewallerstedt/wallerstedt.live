"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useEffect, useCallback } from "react";
import { Mic } from "lucide-react";
import { zIndex } from "@/lib/z-index";

const VoiceSheet = dynamic(() => import("./voice-sheet"), { ssr: false });

export function VoiceLive({ accessKey, autoStart = false }: { accessKey: string; autoStart?: boolean }) {
  const [open, setOpen] = useState(false);
  const [microphone, setMicrophone] = useState<Promise<MediaStream> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);
  useEffect(() => () => { stop(); }, [stop]);
  const start = useCallback(() => {
    stop();
    const attempt = generation.current;
    // Request permission in the tap handler, before loading the sheet on iOS.
    const pending = navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) ?? Promise.reject(new Error("Microphone requires HTTPS and a supported browser."));
    void pending.then((media) => {
      if (generation.current !== attempt) media.getTracks().forEach((track) => track.stop());
      else stream.current = media;
    }, () => {});
    setMicrophone(pending);
    setOpen(true);
  }, [stop]);
  useEffect(() => { if (autoStart) start(); }, [autoStart, start]);
  return <>
    <button
      type="button"
      aria-label={open ? "Cancel opening Live" : "Open GPT-Live microphone"}
      onClick={() => { if (open) { stop(); setOpen(false); } else start(); }}
      className="os-live-fab"
      style={{ zIndex: zIndex.sticky }}
    >
      <span className="os-live-fab-pulse" aria-hidden />
      <span className="os-live-fab-ring" aria-hidden>
        <span className="os-live-fab-face">
          <Mic className="size-6" />
        </span>
      </span>
    </button>
    {open && microphone && <VoiceSheet accessKey={accessKey} microphone={microphone} onClose={() => { stop(); setOpen(false); }} />}
  </>;
}
