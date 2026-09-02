#!/usr/bin/env python3
"""Rebuild lib/os/spotify-history.json from pulled S4A files. No invented counts."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


def parse_date(value: str) -> datetime:
    text = value.strip()
    for fmt in ("%b %d, %Y", "%b  %d, %Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {value!r}")


def load(path: Path):
    return json.loads(path.read_text())


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/s4a")
    dest = Path(sys.argv[2] if len(sys.argv) > 2 else "lib/os/spotify-history.json")
    cats = load(src / "categories.json")
    data = load(src / "scraped_data.json")
    earnings = load(src / "earnings_data.json")
    rev = load(src / "revenue_summary.json")
    backup = load(src / "backups/scraped_data_2026-04-15_000853.json")

    own: dict[str, int] = defaultdict(int)
    label: dict[str, int] = defaultdict(int)
    grand: dict[str, int] = defaultdict(int)
    songs = []
    scraped_ats = []

    for sid, song in data.items():
        if song.get("scraped_at"):
            scraped_ats.append(song["scraped_at"])
        cat = cats.get(sid) or song.get("category") or "own"
        points = song.get("data") or []
        nonzero = [point for point in points if point.get("streams")]
        total = sum(int(point.get("streams") or 0) for point in points)
        for point in points:
            day = parse_date(point["date"]).strftime("%Y-%m-%d")
            value = int(point.get("streams") or 0)
            grand[day] += value
            (label if cat == "label" else own)[day] += value
        nz_dates = [parse_date(point["date"]).strftime("%Y-%m-%d") for point in nonzero]
        songs.append(
            {
                "name": song.get("name"),
                "id": sid,
                "streams": total,
                "category": cat,
                "avgDaily": round(total / max(1, len(nonzero)), 1) if nonzero else 0,
                "firstDayStreams": int(nonzero[0]["streams"]) if nonzero else 0,
                "from": nz_dates[0] if nz_dates else None,
                "to": nz_dates[-1] if nz_dates else None,
            }
        )

    days = sorted(grand)
    while days and grand[days[-1]] == 0:
        days.pop()

    months: dict[str, dict[str, int]] = defaultdict(lambda: {"own": 0, "label": 0, "total": 0})
    for day in days:
        key = day[:7]
        months[key]["own"] += own[day]
        months[key]["label"] += label[day]
        months[key]["total"] += grand[day]

    memories = next(song for song in songs if song["id"] == "3v30vhrt2ujqzuUaOUf7vb")

    backup_own: dict[str, int] = defaultdict(int)
    berlin = timezone(timedelta(hours=2))
    for sid, song in backup.items():
        cat = cats.get(sid) or song.get("category") or "own"
        if cat == "label":
            continue
        for point in song.get("data") or []:
            local = parse_date(point["date"]).replace(tzinfo=berlin)
            iso = local.astimezone(timezone.utc).strftime("%Y-%m-%d")
            backup_own[iso] += int(point.get("streams") or 0)
    csv_days = [day for day in sorted(backup_own) if "2025-04-13" <= day <= "2026-04-11"]

    rate = rev["effective_rate_per_spotify_stream"]
    own_sum = sum(own[day] for day in days)
    stores = [
        {"store": name, "qty": row["qty"], "earnUsd": row["earn"]}
        for name, row in rev["stores"].items()
    ]
    stores.sort(key=lambda row: -row["earnUsd"])

    payload = {
        "source": "callewallerstedt/spotifyanalytics",
        "kind": "spotify-for-artists-scrape",
        "pulledVia": "GitHub contents API (chrome_profile not copied)",
        "scrapedAt": max(scraped_ats).split(" ")[0],
        "artistId": "7qBBYMwk5wXAjSXWWhPCxK",
        "from": days[0],
        "to": days[-1],
        "throughLabel": "through Apr 2026",
        "totalStreams": sum(grand[day] for day in days),
        "ownStreams": own_sum,
        "labelStreams": sum(label[day] for day in days),
        "lastCompleteDay": days[-1],
        "lastCompleteOwn": own[days[-1]],
        "last7Own": sum(own[day] for day in days[-7:]),
        "last30Own": sum(own[day] for day in days[-30:]),
        "last7": sum(grand[day] for day in days[-7:]),
        "last30": sum(grand[day] for day in days[-30:]),
        "ratePerStreamUsd": rate,
        "estimatedOwnEarningsUsd": round(own_sum * rate, 2),
        "months": [{"month": key, **months[key]} for key in sorted(months)],
        "daily": [{"date": day, "own": own[day], "label": label[day]} for day in days],
        "top": [
            {key: song[key] for key in ("name", "id", "streams", "category", "avgDaily")}
            for song in sorted(songs, key=lambda item: -item["streams"])[:8]
        ],
        "memories": {
            "name": memories["name"],
            "id": memories["id"],
            "streams": memories["streams"],
            "firstDayStreams": memories["firstDayStreams"],
            "avgDaily": memories["avgDaily"],
            "from": memories["from"],
            "to": memories["to"],
            "category": memories["category"],
        },
        "distrokid": {
            "scrapedAt": earnings["scraped_at"][:10],
            "generated": rev["generated"],
            "totalEarnedUsd": earnings["total_earned_usd"],
            "balanceUsd": earnings["balance_usd"],
            "spotifyQty": rev["stores"]["Spotify"]["qty"],
            "spotifyEarnUsd": rev["stores"]["Spotify"]["earn"],
            "stores": stores[:8],
        },
        "csvVerified": {
            "source": "backups/scraped_data_2026-04-15_000853.json",
            "matches": "Callespc Downloads/spotify_streams.csv (dashboard ISO date shift)",
            "from": csv_days[0],
            "to": csv_days[-1],
            "days": len(csv_days),
            "ownTotal": sum(backup_own[day] for day in csv_days),
            "ownLastDay": backup_own[csv_days[-1]],
        },
    }
    dest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {dest} own={payload['ownStreams']} csv={payload['csvVerified']['ownTotal']}")


if __name__ == "__main__":
    main()
