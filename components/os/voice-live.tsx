"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useEffect } from "react";
import { Mic } from "lucide-react";
import { zIndex } from "@/lib/z-index";

const VoiceSheet = dynamic(() => import("./voice-sheet"), { ssr: false });

export function VoiceLive({ accessKey }: { accessKey: string }) {
  const [open, setOpen] = useState(false);
  const [microphone, setMicrophone] = useState<Promise<MediaStream> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  useEffect(() => () => { stop(); }, []);
  function start() {
    stop();
    const attempt = generation.current;
    // Request permission in the tap handler, before loading the sheet on iOS.
    const pending = navigator.mediaDevices?.getUserMedia({ audio: true }) ?? Promise.reject(new Error("Microphone requires HTTPS and a supported browser."));
    void pending.then((media) => {
      if (generation.current !== attempt) media.getTracks().forEach((track) => track.stop());
      else stream.current = media;
    }, () => {});
    setMicrophone(pending);
    setOpen(true);
  }
  return <>
    <button type="button" aria-label={open ? "Cancel opening Live" : "Open GPT-Live microphone"} onClick={() => { if (open) { stop(); setOpen(false); } else start(); }}
      className="fixed flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ right: "calc(1rem + env(safe-area-inset-right))", bottom: "calc(4.5rem + env(safe-area-inset-bottom))", zIndex: zIndex.sticky }}>
      <Mic className="size-6" />
    </button>
    {open && microphone && <VoiceSheet accessKey={accessKey} microphone={microphone} onClose={() => { stop(); setOpen(false); }} />}
  </>;
}
