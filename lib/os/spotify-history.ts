import history from "./spotify-history.json";
import type { SpotifyHistory } from "./types";

export function loadSpotifyHistory(): SpotifyHistory {
  return history;
}
