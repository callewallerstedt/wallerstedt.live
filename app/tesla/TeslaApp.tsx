"use client";

import { useCallback, useMemo, useState } from "react";
import { AppLauncher } from "./AppLauncher";
import { DriveNav, type DriveTab } from "./DriveNav";
import { DriveView } from "./DriveView";
import { SettingsSheet } from "./SettingsSheet";
import { StatusHeader } from "./StatusHeader";
import { TripsView } from "./TripsView";
import { useDriveEnvironment } from "./useDriveEnvironment";
import { usePersistentSettings } from "./usePersistentSettings";
import { useTeslaData } from "./useTeslaData";
import { useVoiceControl } from "./useVoiceControl";
import { parseLocalCommand } from "./voiceCommands";
import type { DataSource, TeslaSettings } from "./types";

export function TeslaApp() {
  const [tab, setTab] = useState<DriveTab>("drive");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, hydrated, saveSettings } = usePersistentSettings();
  const environment = useDriveEnvironment({ gpsEnabled: settings.gpsFallback, keepAwake: settings.keepAwake });
  const data = useTeslaData(settings, hydrated, environment.online);

  const display = useMemo(() => {
    if (data.usingPreview || data.connection === "empty" || !data.lastSuccessAt) return { source: "demo" as DataSource, speed: data.live.speed_kmh, preview: true };
    if (data.connection === "live" && !data.live.stale) return { source: "car" as DataSource, speed: data.live.speed_kmh, preview: false };
    if (settings.gpsFallback && environment.phoneLocation?.speedKmh != null) return { source: "iphone" as DataSource, speed: environment.phoneLocation.speedKmh, preview: false };
    return { source: "cached" as DataSource, speed: data.live.speed_kmh, preview: false };
  }, [data.connection, data.lastSuccessAt, data.live.speed_kmh, data.live.stale, data.usingPreview, environment.phoneLocation?.speedKmh, settings.gpsFallback]);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const runVoiceCommand = useCallback(async (command: string) => {
    const action = parseLocalCommand(command, data.live, display.speed);
    if (action.kind === "reply") return action.reply;
    if (action.kind === "tab") {
      setTab(action.tab);
      return action.reply;
    }
    if (action.kind === "settings") {
      setSettingsOpen(true);
      return action.reply;
    }
    if (action.kind === "refresh") {
      await data.refreshAll();
      return action.reply;
    }
    if (action.kind === "url") {
      let url = action.url;
      if (url === "maps://" && environment.phoneLocation) url = `maps://?ll=${environment.phoneLocation.latitude},${environment.phoneLocation.longitude}`;
      window.location.href = url;
      return action.reply;
    }

    if (!settings.token || settings.demo) {
      return "I can answer speed, battery, range, temperature, status, trips, apps, maps, and refresh. Connect the dashboard to enable open-ended questions.";
    }
    try {
      const response = await fetch("/api/tesla/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Aios-Token": settings.token,
          ...(settings.openAiKey ? { "X-OpenAI-Key": settings.openAiKey } : {}),
        },
        body: JSON.stringify({
          command,
          live: {
            speed_kmh: display.speed,
            gear: data.live.gear,
            battery_percent: data.live.battery_percent,
            range_km: data.live.range_km,
            outside_temp_c: data.live.outside_temp_c,
            destination_name: data.live.destination_name,
            connected: data.live.connected,
          },
        }),
      });
      const result = await response.json() as { reply?: string };
      if (response.status === 401) return "The connection token was rejected. Open Setup and check it.";
      return result.reply || "I did not understand that. Try asking for speed, battery, range, trips, apps, or maps.";
    } catch {
      return "The optional voice agent is unreachable. Core driving commands still work locally.";
    }
  }, [data, display.speed, environment.phoneLocation, settings.demo, settings.openAiKey, settings.token]);

  const voice = useVoiceControl({ settings, onCommand: runVoiceCommand });

  const handleSaveSettings = useCallback((next: TeslaSettings) => {
    saveSettings(next);
    setSettingsOpen(false);
  }, [saveSettings]);

  const changeTab = useCallback((next: DriveTab) => {
    const transitionDocument = document as Document & { startViewTransition?: (callback: () => void) => void };
    if (transitionDocument.startViewTransition) transitionDocument.startViewTransition(() => setTab(next));
    else setTab(next);
  }, []);

  return (
    <main className="tesla-shell-v2">
      <StatusHeader
        connection={data.connection}
        message={data.message}
        ageSeconds={data.live.age_sec}
        clock={environment.clock}
        refreshing={data.refreshing}
        onRefresh={() => void data.refreshAll()}
      />

      <div className={`drive-content active-${tab}`}>
        {tab === "drive" && (
          <DriveView
            live={data.live}
            speedKmh={display.speed}
            source={display.source}
            phoneLocation={environment.phoneLocation}
            locationError={environment.locationError}
            needsSetup={!settings.token && !settings.demo}
            previewData={display.preview}
            onOpenSettings={openSettings}
          />
        )}
        {tab === "trips" && (
          <TripsView
            trips={data.trips}
            selectedTripId={data.selectedTripId}
            tripDetail={data.tripDetail}
            previewData={data.usingPreview}
            onSelectTrip={data.setSelectedTripId}
          />
        )}
        {tab === "apps" && <AppLauncher live={data.live} onOpenSettings={openSettings} />}
      </div>

      <div className={`voice-hud phase-${voice.phase}`} role="status" aria-live="polite">
        <span className="voice-hud-dot" />
        <span>{voice.transcript}</span>
      </div>

      <DriveNav
        tab={tab}
        voiceArmed={voice.armed}
        voicePhase={voice.phase}
        onTab={changeTab}
        onVoice={voice.toggle}
        onSettings={openSettings}
      />

      <SettingsSheet open={settingsOpen} settings={settings} onClose={closeSettings} onSave={handleSaveSettings} />
    </main>
  );
}
