"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { VoiceOrb } from "@/components/os/voice-orb";
import { namedVoiceAgent, voiceAgentLabel, type VoiceAgentSlug } from "@/lib/os/voice-agents";
import { speechTranscript } from "@/lib/os/voice-transcript";
import { elonResponse, nextVoiceAction } from "@/lib/os/voice-readout";
import { zIndex } from "@/lib/z-index";

type Entry = {
  id: string;
  role: "user" | "assistant" | "agent" | "tool";
  agent?: VoiceAgentSlug;
  text: string;
  images?: string[];
  at: number;
};
type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" ? value as Json : {};
const string = (value: unknown) => typeof value === "string" ? value : "";

function insertEntry(previous: Entry[], next: Entry): Entry[] {
  if (previous.some((entry) => entry.id === next.id)) return previous;
  const index = previous.findIndex((entry) => entry.at > next.at);
  const list = index === -1 ? [...previous, next] : [...previous.slice(0, index), next, ...previous.slice(index)];
  return list.slice(-200);
}

/** Insert a finished user turn by completion time, keeping it above Live replies for the same utterance. */
function insertCompletedUser(previous: Entry[], next: Entry, startedAt: number | undefined): Entry[] {
  const without = previous.filter((entry) => entry.id !== next.id);
  let index = without.findIndex((entry) => entry.at > next.at);
  if (startedAt != null) {
    // Late transcription must still sit before the Live assistant that already started for this turn.
    const assistantIdx = without.findIndex(
      (entry) => entry.role === "assistant" && entry.at >= startedAt && entry.at <= next.at,
    );
    if (assistantIdx !== -1 && (index === -1 || assistantIdx < index)) index = assistantIdx;
  }
  const list = index === -1 ? [...without, next] : [...without.slice(0, index), next, ...without.slice(index)];
  return list.slice(-200);
}

const PREVIEW_AGENTS: { agent: VoiceAgentSlug; text: string }[] = [
  { agent: "elon", text: "Got it — running that now." },
  { agent: "bjorn", text: "I can take the coding side." },
  { agent: "jensen", text: "Books look fine for this week." },
  { agent: "max", text: "New clip idea queued." },
];

async function jsonResponse(response: Response) {
  const body = record(await response.json());
  if (!response.ok) throw new Error(string(body.message) || "Voice request failed. Please try again.");
  return body;
}

export default function VoiceSheet({ accessKey, microphone, onClose, preview = false }: {
  accessKey: string; microphone: Promise<MediaStream>; onClose: () => void; preview?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const media = useRef<MediaStream | null>(null);
  const mutedRef = useRef(false);
  const speaking = useRef(false);
  const connection = useRef<RTCDataChannel | null>(null);
  const flushReplies = useRef<() => void>(() => {});
  const pendingReplies = useRef<{ id: string; text: string; images: string[] }[]>([]);
  const seenReplies = useRef(new Set<string>());
  const pendingInput = useRef(new Set<string>());
  const ignoredInput = useRef(new Set<string>());
  const speechAt = useRef(new Map<string, number>());
  const lastRouted = useRef<VoiceAgentSlug>("elon");
  const persistTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [needsPlayback, setNeedsPlayback] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [spotlight, setSpotlight] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const previewHeard = useRef(false);
  const previewVoiceFrames = useRef(0);
  const base = `/api/os/${encodeURIComponent(accessKey)}/voice`;
  const orbReady = preview ? previewReady : status === "Live" || status === "Reconnecting";

  function persist(entry: Pick<Entry, "id" | "role" | "text"> & Partial<Pick<Entry, "images" | "agent" | "at">>, immediate = false) {
    if (preview) return;
    const text = entry.text.trim();
    const images = (entry.images ?? []).filter((url) => url.startsWith("https://"));
    if (!text && !images.length) return;
    const at = entry.at ?? Date.now();
    const existing = persistTimers.current.get(entry.id);
    if (existing) clearTimeout(existing);
    const save = () => {
      persistTimers.current.delete(entry.id);
      void fetch(`${base}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: entry.id,
          role: entry.role,
          message: text,
          images,
          agent: entry.agent,
          occurredAt: at,
        }),
        keepalive: true,
      }).catch(() => {});
    };
    // Assistant streams in deltas; debounce so we store the final wording once.
    if (!immediate && entry.role === "assistant") {
      persistTimers.current.set(entry.id, setTimeout(save, 900));
      return;
    }
    save();
  }

  function update(id: string, role: Entry["role"], text: string, append = false, at = Date.now()) {
    setEntries((previous) => {
      const existing = previous.find((entry) => entry.id === id);
      // Empty assistant rows reserve a slot once Live starts responding.
      if (existing && !text) return previous;
      if (!existing) {
        // Do not reserve empty user bubbles at speech-start — they steal order from mid-speech inbox replies.
        if (role === "user" && !text.trim()) return previous;
        return insertEntry(previous, { id, role, text, at });
      }
      return previous.map((entry) => entry.id === id ? { ...entry, text: append ? entry.text + text : text } : entry);
    });
  }
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!preview) return;
    setPreviewReady(false);
    const timer = setTimeout(() => {
      setPreviewReady(true);
      setEntries([
        { id: "preview-user", role: "user", text: "Hey Live — ping the crew", at: 1 },
        { id: "preview-live", role: "assistant", text: "On it. Routing to the specialists.", at: 2 },
        ...PREVIEW_AGENTS.map(({ agent, text }, index) => ({ id: `preview-${agent}`, role: "agent" as const, agent, text, at: 3 + index })),
      ]);
    }, 900);
    return () => clearTimeout(timer);
  }, [preview]);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await jsonResponse(await fetch(`${base}/history`, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        }));
        if (controller.signal.aborted) return;
        const loaded: Entry[] = [];
        for (const value of Array.isArray(data.items) ? data.items : []) {
          const item = record(value);
          const id = string(item.clientId) || string(item.id);
          const role = string(item.role);
          const timestamp = item.timestamp;
          if (!id || typeof timestamp !== "number") continue;
          if (role !== "user" && role !== "assistant" && role !== "agent" && role !== "tool") continue;
          const text = (string(item.message) || string(item.text)).trim();
          const images = (Array.isArray(item.images) ? item.images : []).filter((url): url is string => typeof url === "string" && url.startsWith("https://"));
          if (!text && !images.length) continue;
          const agent = role === "agent" || role === "tool" ? namedVoiceAgent(string(item.agent)) : undefined;
          loaded.push({ id, role, agent, text, images, at: timestamp });
        }
        if (!loaded.length) return;
        setEntries((previous) => {
          let next = previous;
          for (const entry of loaded) next = insertEntry(next, entry);
          return next;
        });
      } catch { /* History is best-effort; Live still works without it. */ }
    })();
    return () => {
      controller.abort();
      for (const timer of persistTimers.current.values()) clearTimeout(timer);
      persistTimers.current.clear();
    };
  }, [base, preview]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [entries]);

  useEffect(() => {
    let disposed = false;
    let failed = false;
    let peer: RTCPeerConnection | undefined;
    let channel: RTCDataChannel | undefined;
    let tracks: MediaStream | undefined;
    let playbackResponseId = "";
    let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let responding = false;
    let activeResponseId = "";

    let toolContinuation = false;
    let pendingTools = 0;
    const handledCalls = new Set<string>();
    const playback = audio.current;
    if (preview) {
      setStatus("Live");
      return;
    }
    const timeout = setTimeout(() => fail("Connection timed out. Close Live and try again."), 30_000);
    function cleanup() {
      clearTimeout(timeout);
      clearTimeout(disconnectTimer);
      controller.abort();
      tracks?.getAudioTracks().forEach((track) => { track.onended = null; });
      speaking.current = false;
      pendingInput.current.clear();
      ignoredInput.current.clear();
      speechAt.current.clear();
      connection.current = null;
      flushReplies.current = () => {};
      if (channel) { channel.onclose = null; channel.onerror = null; channel.close(); }
      if (peer) { peer.onconnectionstatechange = null; peer.close(); }
      if (playback) { playback.pause(); playback.srcObject = null; }
    }
    function fail(message: string) {
      if (disposed) return;
      failed = true;
      void microphone.then((stream) => stream.getTracks().forEach((track) => track.stop()), () => {});
      setError(message); setStatus("Error");
      disposed = true;
      cleanup();
    }
    function send(event: Json) {
      if (!disposed && channel?.readyState === "open") channel.send(JSON.stringify(event));
    }
    function syncInput() {
      tracks?.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current; });
    }
    function flush() {
      if (pendingTools) return;
      const action = nextVoiceAction({
        open: !disposed && channel?.readyState === "open", replies: pendingReplies.current.length,
        responding, speaking: speaking.current, pendingInput: pendingInput.current.size, toolContinuation,
      });
      if (action === "wait") return;
      toolContinuation = false;
      activeResponseId = "";
      responding = true;
      // Read a poll batch together so its replies do not interrupt one another.
      send(action === "elon" ? elonResponse(pendingReplies.current.splice(0)) : { type: "response.create" });
    }
    flushReplies.current = flush;
    async function tool(item: Json) {
      const callId = string(item.call_id);
      if (!callId || handledCalls.has(callId)) return;
      handledCalls.add(callId);
      pendingTools++;
      const name = string(item.name);
      let label = name === "send_to_boss" ? "Elon" : "Agent";
      let result: Json;
      try {
        if (name !== "send_to_boss" && name !== "send_to_agent") throw new Error("Unknown tool.");
        const args = record(JSON.parse(string(item.arguments)));
        const agent = name === "send_to_boss" ? "elon" : string(args.agent).trim().toLowerCase();
        if (!agent) throw new Error("Agent name was empty.");
        label = voiceAgentLabel(agent);
        update(callId, "tool", `${label} · Sending…`);
        if (!string(args.message).trim()) throw new Error(`${label} message was empty.`);
        result = await jsonResponse(await fetch(`${base}/agent`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent, message: args.message }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
        }));
        if (result.ok !== true) throw new Error(`${label} did not confirm delivery.`);
        const recipient = string(result.agent) || agent;
        lastRouted.current = namedVoiceAgent(recipient) ?? "elon";
        label = voiceAgentLabel(lastRouted.current);
        if (!disposed) {
          const chip = `Sent to ${label}`;
          update(callId, "tool", chip);
          persist({ id: callId, role: "tool", text: chip }, true);
        }
      } catch (cause) {
        result = { ok: false, message: cause instanceof Error ? cause.message : `${label} could not be reached.` };
        if (!disposed) {
          const chip = `${label} · ${string(result.message)}`;
          update(callId, "tool", chip);
          persist({ id: callId, role: "tool", text: chip }, true);
        }
      }
      pendingTools--;
      send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } });
      toolContinuation = true;
      flush();
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
      if (type === "input_audio_buffer.speech_started" && id) {
        if (mutedRef.current) ignoredInput.current.add(id);
        else {
          pendingInput.current.add(id);
          if (!speechAt.current.has(id)) speechAt.current.set(id, Date.now());
        }
      }
      if (id && /^conversation\.item\.(created|added)$/.test(type) && item.role === "user" && mutedRef.current) ignoredInput.current.add(id);
      if (id && /^conversation\.item\.(created|added)$/.test(type) && item.role === "user" && !ignoredInput.current.has(id) && !speechAt.current.has(id)) {
        speechAt.current.set(id, Date.now());
      }
      if (id && type === "response.output_item.added" && item.role === "assistant") update(id, "assistant", "");
      if (type === "response.created") { responding = true; activeResponseId = string(record(data.response).id); }
      if (type === "output_audio_buffer.started") {
        playbackResponseId = string(data.response_id);
        speaking.current = true;
      }
      if (type === "output_audio_buffer.stopped" || type === "output_audio_buffer.cleared") {
        if (string(data.response_id) === playbackResponseId) {
          speaking.current = false;
          playbackResponseId = "";
          flush();
        }
      }
      if (type === "response.done" && string(record(data.response).id) === activeResponseId) {
        responding = false;
        const response = record(data.response);
        if (response.status === "failed") setError("Live could not complete that reply. Please try speaking again.");
        flush();
      }
      if (id && type === "conversation.item.input_audio_transcription.completed") {
        pendingInput.current.delete(id);
        const text = speechTranscript(string(data.transcript));
        const startedAt = speechAt.current.get(id);
        speechAt.current.delete(id);
        if (!ignoredInput.current.has(id) && text) {
          // Sort by completion time so inbox/agent replies that arrived mid-utterance stay above.
          const completedAt = Date.now();
          setEntries((previous) => insertCompletedUser(previous, { id, role: "user", text, at: completedAt }, startedAt));
          persist({ id, role: "user", text, at: completedAt }, true);
        }
        ignoredInput.current.delete(id);
        flush();
        // VAD owns user responses; flush only resumes queued readouts/tools.
      } else if (id && /response\.(output_audio_transcript|audio_transcript|output_text|text)\.(delta|done)$/.test(type)) {
        {
          const next = string(data.transcript) || string(data.text) || string(data.delta);
          update(id, "assistant", next, type.endsWith("delta"));
          if (next.trim()) persist({ id, role: "assistant", text: next }, !type.endsWith("delta"));
        }
      } else if (id && /^conversation\.item\.(created|added|done)$/.test(type) && item.role === "assistant" && Array.isArray(item.content)) {
        const text = item.content.map((part) => { const content = record(part); return string(content.transcript) || string(content.text); }).join("");
        if (text.trim()) { update(id, "assistant", text); persist({ id, role: "assistant", text }, true); }
      }
      if (type === "conversation.item.input_audio_transcription.failed" && id) {
        pendingInput.current.delete(id);
        speechAt.current.delete(id);
        ignoredInput.current.delete(id);
        setError("Could not transcribe that speech. Please try again.");
        flush();
      }
      if (type === "error") setError("Live encountered an error. If it stops responding, close and reopen the mic.");
    }
    async function connect() {
      try {
        const [stream, session] = await Promise.all([microphone,
          fetch(`${base}/session`, { method: "POST", signal: controller.signal }).then(jsonResponse),
        ]);
        tracks = stream;
        if (disposed) {
          if (failed) tracks.getTracks().forEach((track) => track.stop());
          return;
        }
        if (!tracks.getAudioTracks().some((track) => track.readyState === "live")) throw new Error("Microphone is unavailable. Close Live and try again.");
        tracks.getAudioTracks().forEach((track) => { track.onended = () => fail("Microphone disconnected. Close Live and try again."); });
        media.current = tracks;
        syncInput();
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
        connection.current = channel;
        channel.onmessage = event;
        channel.onopen = () => { clearTimeout(timeout); if (!disposed) { setStatus("Live"); flush(); } };
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
  }, [base, microphone, preview]);

  useEffect(() => {
    if (preview) return;
    let stopped = false;
    const openedAt = Date.now();
    let cursor = openedAt;
    let timer: ReturnType<typeof setTimeout>;
    const seen = seenReplies.current;
    const controller = new AbortController();
    async function poll() {
      try {
        const data = await jsonResponse(await fetch(`${base}/boss/inbox?since=${cursor}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) }));
        if (stopped) return;
        setInboxError("");
        for (const value of Array.isArray(data.items) ? data.items : []) {
          const item = record(value);
          const id = string(item.id);
          const timestamp = item.timestamp;
          if (typeof timestamp !== "number" || timestamp < openedAt) continue;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          cursor = Math.max(cursor, timestamp);
          const images = (Array.isArray(item.images) ? item.images : []).filter((url): url is string => typeof url === "string" && url.startsWith("https://"));
          const text = (string(item.message) || string(item.text)).trim();
          if (!text && !images.length) continue;
          const agent = namedVoiceAgent(string(item.agent), string(item.source)) ?? lastRouted.current;
          setEntries((previous) => insertEntry(previous, { id: `agent-${id}`, role: "agent", agent, text, images, at: timestamp }));
          persist({ id: `agent-${id}`, role: "agent", agent, text, images, at: timestamp }, true);
          pendingReplies.current.push({ id, text, images });
        }
        flushReplies.current();
      } catch { if (!stopped) setInboxError("Agent inbox unavailable — retrying…"); }
      if (!stopped) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [base, preview]);

  // Transcript lines dock the listening orb to the top-right.
  const visibleEntries = entries.filter((entry) => entry.text.trim() || entry.images?.length);
  const hasTranscript = visibleEntries.length > 0;
  const orbMode = !hasTranscript ? "idle" : spotlight ? "spotlight" : "docked";
  const latestInbound = [...visibleEntries].reverse().find((entry) => entry.role === "assistant" || entry.role === "agent");

  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-label="GPT-Live"
    className="os-live-dialog fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-background p-0 text-foreground shadow-none outline-none backdrop:bg-black/70"
    style={{ zIndex: zIndex.overlay }}>
    <div className="os-live-shell relative flex h-full flex-col">
      <p role="status" className="sr-only">{status}{inboxError ? `. ${inboxError}` : ""}</p>
      <div className="relative min-h-0 flex-1">
        <button autoFocus type="button" aria-label="Close Live and stop microphone" onClick={onClose} className="os-live-close">
          <X className="size-5" />
        </button>
        {spotlight ? (
          <div className="os-live-spotlight">
            <VoiceOrb
              mode="spotlight"
              microphone={microphone}
              muted={muted}
              ready={orbReady}
              onToggle={() => setSpotlight(false)}
            />
            {latestInbound && (
              <div className="os-live-focus" role="status">
                <p className="os-live-focus-label">{latestInbound.role === "agent" ? voiceAgentLabel(latestInbound.agent ?? "elon") : "Live"}</p>
                {latestInbound.text.trim() && <p className="os-live-focus-text">{latestInbound.text}</p>}
                {!!latestInbound.images?.length && (
                  <div className="os-live-focus-images">
                    {latestInbound.images.map((url) => (
                      // Remote agent images have arbitrary HTTPS hosts.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <VoiceOrb
              mode={orbMode === "docked" ? "docked" : "idle"}
              microphone={microphone}
              muted={muted}
              ready={orbReady}
              onToggle={hasTranscript ? () => setSpotlight(true) : undefined}
              onVoice={(level) => {
                if (!preview || previewHeard.current) return;
                if (level < 0.22) {
                  previewVoiceFrames.current = 0;
                  return;
                }
                previewVoiceFrames.current += 1;
                if (previewVoiceFrames.current < 18) return;
                previewHeard.current = true;
              }}
            />
            <div className={`os-live-transcript h-full overflow-y-auto overscroll-contain ${hasTranscript ? "os-live-transcript--docked os-enter" : ""}`} role="log" aria-label="Live transcript">
              {visibleEntries.map((entry) => entry.role === "tool" ? <div key={entry.id} className="os-live-tool-chip">{entry.text}</div> :
                entry.role === "agent" ? <article key={entry.id} className="os-live-bubble-agent" data-agent={entry.agent}>
                  <p className="os-live-bubble-agent-label">{voiceAgentLabel(entry.agent ?? "elon")}</p>
                  <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                  {entry.images?.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mt-1.5 block">
                    {/* Remote agent images have arbitrary HTTPS hosts. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Image from ${voiceAgentLabel(entry.agent ?? "elon")} — open full image`} loading="lazy" referrerPolicy="no-referrer" className="max-h-80 max-w-full rounded-lg object-contain" />
                  </a>)}
                </article> :
                <article key={entry.id} className={`os-live-bubble ${entry.role === "user" ? "os-live-bubble--user" : "os-live-bubble--assistant"}`}>
                  {entry.role === "assistant" && <p className="os-live-bubble-live-label">Live</p>}
                  <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                </article>)}
              {hasTranscript && <div ref={bottom} />}
            </div>
          </>
        )}
      </div>
      <footer className="os-live-footer">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {needsPlayback && <button type="button" className="rounded-lg bg-brand px-4 py-2 text-brand-foreground" onClick={() => { void audio.current?.play().then(() => setNeedsPlayback(false)).catch(() => setError("Audio could not play. Check your device audio settings.")); }}>Tap to hear Live</button>}
        <button type="button" disabled={status !== "Live" && status !== "Reconnecting"} aria-label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={muted} className={`os-live-mute ${muted ? "os-live-mute--off" : ""}`} onClick={() => {
          mutedRef.current = !mutedRef.current;
          if (mutedRef.current) {
            pendingInput.current.forEach((id) => ignoredInput.current.add(id));
            pendingInput.current.clear();
            if (connection.current?.readyState === "open") connection.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
          }
          media.current?.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current; });
          setMuted(mutedRef.current);
        }}>{muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}</button>
      </footer>
      <audio ref={audio} autoPlay playsInline />
    </div>
  </dialog>;
}
