import type { LiveState } from "./types";

export type VoiceAction =
  | { kind: "reply"; reply: string }
  | { kind: "tab"; tab: "drive" | "trips" | "apps"; reply: string }
  | { kind: "settings"; reply: string }
  | { kind: "refresh"; reply: string }
  | { kind: "url"; url: string; reply?: string }
  | { kind: "ai" };

export function parseLocalCommand(command: string, live: LiveState, speedKmh: number): VoiceAction {
  const value = command.toLowerCase().trim();
  const battery = live.battery_percent >= 0 ? live.battery_percent : null;
  const range = live.range_km >= 0 ? live.range_km : null;

  if (/\b(speed|how fast|hastighet|hur fort)\b/.test(value)) {
    return { kind: "reply", reply: `${Math.round(speedKmh)} kilometers per hour` };
  }
  if (/\b(battery|charge level|batteri|laddning)\b/.test(value)) {
    return { kind: "reply", reply: battery == null ? "Battery level is not available" : `Battery is ${battery} percent${range == null ? "" : `, with about ${range} kilometers remaining`}` };
  }
  if (/\b(range|remaining distance|räckvidd)\b/.test(value)) {
    return { kind: "reply", reply: range == null ? "Estimated range is not available" : `Estimated range is ${range} kilometers` };
  }
  if (/\b(temperature|outside temp|weather|temperatur)\b/.test(value)) {
    return { kind: "reply", reply: live.outside_temp_c == null ? "Outside temperature is not available" : `Outside temperature is ${Math.round(live.outside_temp_c)} degrees` };
  }
  if (/\b(status|summary|overview|översikt|sammanfattning)\b/.test(value)) {
    return { kind: "reply", reply: `${Math.round(speedKmh)} kilometers per hour. Battery ${battery ?? "unknown"} percent. Range ${range ?? "unknown"} kilometers.` };
  }
  if (/\b(show|open|go to|visa|öppna)\b.*\b(trips|journeys|history|resor|historik)\b/.test(value)) {
    return { kind: "tab", tab: "trips", reply: "Showing trip history" };
  }
  if (/\b(show|open|go to|visa|öppna)\b.*\b(apps|launcher|appar)\b/.test(value)) {
    return { kind: "tab", tab: "apps", reply: "Showing apps" };
  }
  if (/\b(show|open|go to|visa|öppna)\b.*\b(drive|dashboard|speedometer|körning)\b/.test(value)) {
    return { kind: "tab", tab: "drive", reply: "Showing drive view" };
  }
  if (/\b(settings|setup|inställningar)\b/.test(value)) {
    return { kind: "settings", reply: "Opening settings" };
  }
  if (/\b(refresh|update|sync|uppdatera)\b/.test(value)) {
    return { kind: "refresh", reply: "Dashboard updated" };
  }
  if (/\b(open|start|launch|öppna|starta)\b.*\bspotify\b/.test(value)) {
    return { kind: "url", url: "spotify://" };
  }
  if (/\b(open|start|launch|öppna|starta)\b.*\btesla(?: app)?\b/.test(value)) {
    return { kind: "url", url: "tesla://" };
  }
  if (/\b(open|start|launch|öppna|starta)\b.*\b(apple )?maps\b/.test(value)) {
    return { kind: "url", url: "maps://" };
  }
  if (/\b(open|start|launch|öppna|starta)\b.*\bgoogle maps\b/.test(value)) {
    return { kind: "url", url: "https://maps.google.com" };
  }
  if (/\b(open|start|launch|öppna|starta)\b.*\bwaze\b/.test(value)) {
    return { kind: "url", url: "https://waze.com/ul" };
  }
  return { kind: "ai" };
}
