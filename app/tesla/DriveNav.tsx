import { Icons } from "./TeslaIcons";
import type { VoicePhase } from "./types";

export type DriveTab = "drive" | "trips" | "apps";

type DriveNavProps = {
  tab: DriveTab;
  voiceArmed: boolean;
  voicePhase: VoicePhase;
  onTab: (tab: DriveTab) => void;
  onVoice: () => void;
  onSettings: () => void;
};

export function DriveNav({ tab, voiceArmed, voicePhase, onTab, onVoice, onSettings }: DriveNavProps) {
  const voiceActive = voiceArmed || ["arming", "awake", "thinking", "speaking"].includes(voicePhase);
  return (
    <nav className="drive-nav" aria-label="Drive dashboard navigation">
      <button className={tab === "drive" ? "is-active" : ""} onClick={() => onTab("drive")} aria-current={tab === "drive" ? "page" : undefined}><Icons.Drive /><span>Drive</span></button>
      <button className={tab === "trips" ? "is-active" : ""} onClick={() => onTab("trips")} aria-current={tab === "trips" ? "page" : undefined}><Icons.Trips /><span>Trips</span></button>
      <button className={`nav-voice ${voiceActive ? "is-listening" : ""}`} onClick={onVoice} aria-label={voiceArmed ? "Pause voice control" : "Start voice control"} aria-pressed={voiceArmed}>
        <span className="nav-mic"><Icons.Mic size={26} /><i /><b /></span><small>{voicePhase === "thinking" ? "Thinking" : voiceArmed ? "Listening" : "Voice"}</small>
      </button>
      <button className={tab === "apps" ? "is-active" : ""} onClick={() => onTab("apps")} aria-current={tab === "apps" ? "page" : undefined}><Icons.Apps /><span>Apps</span></button>
      <button onClick={onSettings}><Icons.Settings /><span>Setup</span></button>
    </nav>
  );
}
