"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { OsBrandMark } from "@/components/os/brand";
import { zIndex } from "@/lib/z-index";
import { cn } from "@/lib/utils";

export type CompanyField = {
  label: string;
  value: string;
  /** Long prose reads better as a block than as a single truncated line. */
  block?: boolean;
};

/**
 * The logo is the only thing in the header. Pressing it drops the registry
 * details down, each one copyable, because these are the numbers that get typed
 * into invoices and forms.
 */
export function CompanyMenu({ fields }: { fields: CompanyField[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  async function copy(field: CompanyField) {
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(field.label);
      window.setTimeout(() => setCopied((current) => (current === field.label ? null : current)), 1400);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="relative" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Company details"
        className="flex items-center rounded-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <OsBrandMark size={26} />
      </button>

      {open ? (
        <div
          aria-label="Company details"
          className="absolute top-full left-1/2 mt-2 w-[min(21rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-xl bg-card shadow-lg ring-1 ring-foreground/15"
          role="dialog"
          style={{ zIndex: zIndex.overlay }}
        >
          {fields.map((field) => (
            <div
              key={field.label}
              className={cn(
                "flex gap-2 border-t border-border px-3 py-2 first:border-t-0",
                field.block ? "flex-col items-start" : "items-center",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                  {field.label}
                </p>
                <p
                  className={cn(
                    "text-sm font-medium",
                    field.block ? "mt-0.5 leading-snug" : "truncate",
                  )}
                >
                  {field.value}
                </p>
              </div>
              <button
                aria-label={`Copy ${field.label}`}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center self-start rounded-lg ring-1 ring-foreground/15",
                  copied === field.label ? "text-brand" : "text-muted-foreground hover:text-foreground",
                  field.block && "self-end",
                )}
                onClick={() => copy(field)}
                type="button"
              >
                {copied === field.label ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
