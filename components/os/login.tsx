"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldIcon } from "lucide-react";

import { OsBrandLockup } from "@/components/os/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function OsLogin({ accessKey }: { accessKey: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError("Skriv ditt lösenord.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/accounting/${encodeURIComponent(accessKey)}/session/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        setError(body?.message || body?.error || "Inloggningen misslyckades.");
        return;
      }
      router.refresh();
    } catch {
      setError("Inloggningen misslyckades.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-[max(0.5rem,env(safe-area-inset-left))] py-[max(0.5rem,env(safe-area-inset-bottom))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))]">
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-3">
          <OsBrandLockup />
          <CardTitle>Wallerstedt Productions AB</CardTitle>
          <p className="text-sm text-muted-foreground">Same owner session as bokföring.</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-2" onSubmit={submit}>
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="os-password">
              Lösenord
              <Input
                autoComplete="current-password"
                autoFocus
                className="min-h-11 md:min-h-8"
                disabled={submitting}
                id="os-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button className="min-h-11 md:min-h-8" disabled={submitting} type="submit" variant="brand">
              <ShieldIcon />
              {submitting ? "Loggar in…" : "Öppna"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
