#!/usr/bin/env bash
# Pull Calle's Spotify for Artists scrape via the GitHub API (never chrome_profile)
# and rebuild lib/os/spotify-history.json. Does not run the Playwright scraper.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="${1:-/tmp/s4a-pull}"
mkdir -p "$WORKDIR/backups"
REPO="callewallerstedt/spotifyanalytics"

pull() {
  local path="$1"
  mkdir -p "$WORKDIR/$(dirname "$path")"
  gh api "repos/$REPO/contents/$path" --jq .content | base64 --decode > "$WORKDIR/$path"
}

pull scraped_data.json
pull earnings_data.json
pull revenue_summary.json
pull categories.json
pull backups/scraped_data_2026-04-15_000853.json
pull backups/scraped_data_2026-04-15_122230.json
pull backups/scraped_data_2026-04-15_183044.json

python3 "$ROOT/scripts/rebuild-spotify-history.py" "$WORKDIR" "$ROOT/lib/os/spotify-history.json"
