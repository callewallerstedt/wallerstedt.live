"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, Loader2Icon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CAPTION_PROMPT_MAX } from "@/lib/os/tiktok-caption";
import { cn } from "@/lib/utils";

export function CaptionTipsField({
  value,
  onChange,
  onBlur,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 border-t border-border px-3 py-2.5">
      <span className="text-xs font-medium text-foreground">Caption tips</span>
      <span className="text-[0.7rem] leading-snug text-muted-foreground">
        Shared instructions for every generated caption — tone, hashtags to prefer, things to avoid.
      </span>
      <textarea
        aria-label="Caption tips"
        className="mt-1 min-h-16 w-full rounded-lg bg-background px-2.5 py-2 text-sm text-foreground ring-1 ring-foreground/15"
        disabled={disabled}
        maxLength={CAPTION_PROMPT_MAX}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value.slice(0, CAPTION_PROMPT_MAX))}
        placeholder="e.g. Keep hashtags lowercase. Prefer #piano #coversong. No emojis."
        rows={2}
        value={value}
      />
    </label>
  );
}

export function GenerateCaptionButton({
  busy,
  disabled,
  onClick,
  title,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-busy={busy}
      aria-label={`Generate caption for ${title}`}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-foreground/12",
        busy ? "text-brand" : "text-muted-foreground hover:text-brand",
      )}
      disabled={disabled || busy}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      title="Generate caption"
      type="button"
    >
      {busy ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <SparklesIcon className="size-3.5" />
      )}
    </button>
  );
}

export function VideoCaptionBox({
  caption,
  busy,
  error,
  onGenerate,
}: {
  caption: string;
  busy: boolean;
  error: string;
  onGenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="min-h-11 w-full md:min-h-9 md:w-auto"
        disabled={busy}
        onClick={onGenerate}
        onPointerDown={(event) => event.stopPropagation()}
        size="sm"
        type="button"
        variant="outline"
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <SparklesIcon className="size-4" />
        )}
        {busy ? "Generating…" : caption ? "Regenerate caption" : "Generate caption"}
      </Button>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {caption ? (
        <div className="flex items-start gap-2 rounded-lg bg-card px-2.5 py-2 ring-1 ring-foreground/10">
          <p className="min-w-0 flex-1 text-sm leading-relaxed break-words">{caption}</p>
          <button
            aria-label={copied ? "Caption copied" : "Copy caption"}
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/15",
              copied ? "text-brand" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => void copy()}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </button>
        </div>
      ) : null}
    </div>
  );
}
