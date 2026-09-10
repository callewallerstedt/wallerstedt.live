"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { zIndex } from "@/lib/z-index";

type Entry = { id: string; role: "user" | "assistant" | "Boss" | "tool"; text: string; images?: string[] };
type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" ? value as Json : {};
const string = (value: unknown) => typeof value === "string" ? value : "";

async function jsonResponse(response: Response) {
  const body = record(await response.json());
  if (!response.ok) throw new Error(string(body.message) || "Voice request failed. Please try again.");
  return body;
}

export default function VoiceSheet({ accessKey, microphone, onClose }: {
  accessKey: string; microphone: Promise<MediaStream>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const media = useRef<MediaStream | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [needsPlayback, setNeedsPlayback] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const base = `/api/os/${encodeURIComponent(accessKey)}/voice`;

  function update(id: string, role: Entry["role"], text: string, append = false) {
    setEntries((previous) => {
      const existing = previous.find((entry) => entry.id === id);
      if (!existing) return [...previous, { id, role, text }].slice(-200);
      return previous.map((entry) => entry.id === id ? { ...entry, text: append ? entry.text + text : text } : entry);
    });
  }
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [entries]);

  useEffect(() => {
    let disposed = false;
    let failed = false;
    let peer: RTCPeerConnection | undefined;
    let channel: RTCDataChannel | undefined;
    let tracks: MediaStream | undefined;
    let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const handledCalls = new Set<string>();
    const playback = audio.current;
    const timeout = setTimeout(() => fail("Connection timed out. Close Live and try again."), 30_000);
    function cleanup() {
      clearTimeout(timeout);
      clearTimeout(disconnectTimer);
      controller.abort();
      if (channel) { channel.onclose = null; channel.onerror = null; channel.close(); }
      if (peer) { peer.onconnectionstatechange = null; peer.close(); }
      if (playback) { playback.pause(); playback.srcObject = null; }
    }
    function fail(message: string) {
      if (disposed) return;
      failed = true;
      tracks?.getTracks().forEach((track) => track.stop());
      setError(message); setStatus("Error");
      disposed = true;
      cleanup();
    }
    function send(event: Json) {
      if (!disposed && channel?.readyState === "open") channel.send(JSON.stringify(event));
    }
    async function tool(item: Json) {
      const callId = string(item.call_id);
      if (!callId || handledCalls.has(callId)) return;
      handledCalls.add(callId);
      const name = string(item.name);
      update(callId, "tool", `${name || "Tool"} · Sending…`);
      let result: Json;
      try {
        if (name !== "send_to_boss") throw new Error("Unknown tool.");
        const args = record(JSON.parse(string(item.arguments)));
        if (!string(args.message).trim()) throw new Error("Boss message was empty.");
        result = await jsonResponse(await fetch(`${base}/boss`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: args.message }), signal: controller.signal,
        }));
        if (result.ok !== true) throw new Error("Boss did not confirm delivery.");
        if (!disposed) update(callId, "tool", "Sent to Boss");
      } catch (cause) {
        result = { ok: false, message: cause instanceof Error ? cause.message : "Boss could not be reached." };
        if (!disposed) update(callId, "tool", `Boss · ${string(result.message)}`);
      }
      send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } });
      send({ type: "response.create" });
    }
    function event(raw: MessageEvent) {
      if (disposed) return;
      let data: Json;
      try { data = record(JSON.parse(raw.data)); } catch { return; }
      const type = string(data.type);
      const item = record(data.item);
      if (type === "response.function_call_arguments.done") void tool(data);
      if (type === "response.output_item.done" && item.type === "function_call") void tool(item);
      const id = string(data.item_id) || string(item.id);
      if (id && /input_audio_transcription\.(delta|completed)$/.test(type)) {
        update(id, "user", string(data.transcript) || string(data.delta), type.endsWith("delta"));
      } else if (id && /response\.(output_audio_transcript|audio_transcript|output_text|text)\.(delta|done)$/.test(type)) {
        update(id, "assistant", string(data.transcript) || string(data.text) || string(data.delta), type.endsWith("delta"));
      } else if (id && /^conversation\.item\.(created|added|done)$/.test(type) && Array.isArray(item.content)) {
        const text = item.content.map((part) => { const content = record(part); return string(content.transcript) || string(content.text); }).join("");
        if (text || item.role === "user") update(id, item.role === "user" ? "user" : "assistant", text);
      }
      if (type === "conversation.item.input_audio_transcription.failed" && id) update(id, "user", "[Transcription unavailable]");
      if (type === "error") setError("Live encountered an error. If it stops responding, close and reopen the mic.");
    }
    async function connect() {
      try {
        tracks = await microphone;
        if (disposed) {
          if (failed) tracks.getTracks().forEach((track) => track.stop());
          return;
        }
        media.current = tracks;
        const session = await jsonResponse(await fetch(`${base}/session`, { method: "POST", signal: controller.signal }));
        if (disposed) return;
        if (!string(session.value)) throw new Error("Invalid Live session.");
        peer = new RTCPeerConnection();
        peer.ontrack = ({ track, streams }) => {
          if (!playback || disposed) return;
          playback.srcObject = streams[0] ?? new MediaStream([track]);
          void playback.play().catch(() => { if (!disposed) setNeedsPlayback(true); });
        };
        peer.onconnectionstatechange = () => {
          if (disposed) return;
          if (peer?.connectionState === "failed") fail("Connection lost. Close Live and try again.");
          if (peer?.connectionState === "disconnected") {
            setStatus("Reconnecting");
            clearTimeout(disconnectTimer);
            disconnectTimer = setTimeout(() => fail("Connection lost. Close Live and try again."), 10_000);
          }
          if (peer?.connectionState === "connected") { clearTimeout(disconnectTimer); setStatus("Live"); }
        };
        tracks.getTracks().forEach((track) => peer!.addTrack(track, tracks!));
        channel = peer.createDataChannel("oai-events");
        channel.onmessage = event;
        channel.onopen = () => { clearTimeout(timeout); if (!disposed) setStatus("Live"); };
        channel.onerror = () => fail("Live data connection failed. Close and try again.");
        channel.onclose = () => fail("Live session ended. Close and reopen the mic.");
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const response = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST", headers: { Authorization: `Bearer ${session.value}`, "Content-Type": "application/sdp" },
          body: offer.sdp, signal: controller.signal,
        });
        if (!response.ok) throw new Error("GPT-Live connection failed. Please try again.");
        const sdp = await response.text();
        if (!disposed) await peer.setRemoteDescription({ type: "answer", sdp });
      } catch (cause) { fail(cause instanceof Error ? cause.message : "Could not start Live."); }
    }
    void connect();
    return () => { disposed = true; cleanup(); };
  }, [base, microphone]);

  useEffect(() => {
    let stopped = false;
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout>;
    const seen = new Set<string>();
    const controller = new AbortController();
    async function poll() {
      try {
        const data = await jsonResponse(await fetch(`${base}/boss/inbox?since=${cursor}`, { cache: "no-store", signal: controller.signal }));
        if (stopped) return;
        setInboxError("");
        for (const value of Array.isArray(data.items) ? data.items : []) {
          const item = record(value);
          const id = string(item.id);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          if (typeof item.timestamp === "number") cursor = Math.max(cursor, item.timestamp);
          const images = (Array.isArray(item.images) ? item.images : []).filter((url): url is string => typeof url === "string" && url.startsWith("https://"));
          setEntries((previous) => [...previous, { id, role: "Boss" as const, text: string(item.message), images }].slice(-200));
        }
      } catch { if (!stopped) setInboxError("Boss inbox unavailable — retrying…"); }
      if (!stopped) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [base]);

  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="voice-title"
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-background p-0 text-foreground backdrop:bg-black/70"
    style={{ zIndex: zIndex.overlay }}>
    <div className="flex h-full flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
      <header className="flex items-center justify-between border-b border-border p-4">
        <div><h2 id="voice-title" className="font-semibold">GPT-Live</h2><p role="status" className="text-sm text-brand">{status}</p></div>
        <button autoFocus type="button" aria-label="Close Live and stop microphone" onClick={onClose} className="rounded-full p-3 hover:bg-muted"><X /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4" role="log" aria-label="Live transcript">
        {!entries.length && <p className="mx-auto max-w-md py-12 text-center text-muted-foreground">Talk to Live in Swedish or English. Ask to send a message to Boss.</p>}
        {entries.map((entry) => entry.role === "tool" ? <div key={entry.id} className="mx-auto w-fit max-w-full rounded-full border border-brand/40 bg-brand-soft px-3 py-1 text-sm text-brand">{entry.text}</div> :
          <article key={entry.id} className={`max-w-xl rounded-xl p-3 ${entry.role === "user" ? "ml-auto bg-brand-soft" : "mr-auto bg-card"}`}>
            <p className="mb-1 text-xs text-muted-foreground">{entry.role === "user" ? "You" : entry.role === "assistant" ? "Live" : "Boss"}</p>
            <p className="whitespace-pre-wrap break-words">{entry.text || "Listening…"}</p>
            {entry.images?.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
              {/* Remote Boss images have arbitrary HTTPS hosts. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Image from Boss — open full image" loading="lazy" referrerPolicy="no-referrer" className="max-h-80 max-w-full rounded-lg object-contain" />
            </a>)}
          </article>)}
        <div ref={bottom} />
      </div>
      <footer className="space-y-2 border-t border-border p-4 text-center">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {inboxError && <p className="text-xs text-muted-foreground">{inboxError}</p>}
        {needsPlayback && <button type="button" className="rounded-lg bg-brand px-4 py-2 text-brand-foreground" onClick={() => { void audio.current?.play().then(() => setNeedsPlayback(false)).catch(() => setError("Audio could not play. Check your device audio settings.")); }}>Tap to hear Live</button>}
        <button type="button" disabled={status !== "Live" && status !== "Reconnecting"} aria-label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={muted} className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground disabled:opacity-40" onClick={() => {
          media.current?.getAudioTracks().forEach((track) => { track.enabled = muted; }); setMuted(!muted);
        }}>{muted ? <MicOff /> : <Mic />}</button>
        <p className="text-xs text-muted-foreground">{muted ? "Microphone muted" : "Voice is shared with OpenAI while connected"}</p>
      </footer>
      <audio ref={audio} autoPlay playsInline />
    </div>
  </dialog>;
}
