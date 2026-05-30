#!/usr/bin/env python3
"""
Generates circular GPX cycling routes starting from home,
ranked by flatness and preferring quieter roads.

Usage:
    python route_planner.py --distance 30
    python route_planner.py --distance 50 --compare 8 --all
    python route_planner.py --distance 40 --output my_route.gpx

Get a free OpenRouteService API key at https://openrouteservice.org/dev/#/signup
Then set it via --key KEY or the ORS_API_KEY environment variable.

Import the resulting .gpx file into Ride with GPS:
    Routes → Import → Upload file
"""

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

# ── Home location ─────────────────────────────────────────────────────────────
HOME_LAT = 42.6074567
HOME_LNG = -76.9277306

# ── Constants ─────────────────────────────────────────────────────────────────
MILES_TO_METERS = 1609.344
METERS_TO_FEET  = 3.28084

# cycling-road: optimised for paved roads; avoids motorways and respects cycling infra
ORS_URL = "https://api.openrouteservice.org/v2/directions/cycling-road/geojson"


# ── API call ──────────────────────────────────────────────────────────────────

def fetch_route(api_key: str, meters: int, seed: int) -> dict:
    """Request one round-trip route from OpenRouteService."""
    payload = json.dumps({
        "coordinates": [[HOME_LNG, HOME_LAT]],
        "options": {
            "round_trip": {
                "length": meters,
                "points": 5,   # waypoints injected to shape the loop
                "seed":   seed
            },
            # Avoid motorways, tollways, and ferries — keeps routes on local/back roads
            "avoid_features": ["highways", "tollways", "ferries"]
        },
        "elevation":    True,
        "instructions": False,
    }).encode()

    req = urllib.request.Request(
        ORS_URL,
        data=payload,
        headers={
            "Content-Type":  "application/json",
            "Authorization": api_key,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


# ── Stats helpers ─────────────────────────────────────────────────────────────

def route_stats(feature: dict) -> dict:
    summary = feature["properties"]["summary"]
    return {
        "distance_mi": summary["distance"] / MILES_TO_METERS,
        "ascent_ft":   summary["ascent"]  * METERS_TO_FEET,
        "descent_ft":  summary["descent"] * METERS_TO_FEET,
        "duration_s":  summary["duration"],
    }


def fmt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


def estimate_circularity(coords: list) -> float:
    """
    Rough circularity score: ratio of (max distance from home) to (route radius).
    Higher = more evenly spread out from home = more circular.
    Score of 1.0 is a perfect circle; lower means more out-and-back-ish.
    """
    if len(coords) < 2:
        return 0.0

    # Furthest point from home in straight-line km
    max_dist = max(
        math.sqrt(
            ((c[0] - HOME_LNG) * math.cos(math.radians(HOME_LAT)) * 111.32) ** 2 +
            ((c[1] - HOME_LAT) * 111.32) ** 2
        )
        for c in coords
    )
    if max_dist == 0:
        return 0.0

    # Ideal radius for a circle of this distance
    total_km = sum(
        math.sqrt(
            ((coords[i][0] - coords[i-1][0]) * math.cos(math.radians(HOME_LAT)) * 111.32) ** 2 +
            ((coords[i][1] - coords[i-1][1]) * 111.32) ** 2
        )
        for i in range(1, len(coords))
    )
    ideal_radius = total_km / (2 * math.pi)

    # Closer max_dist is to ideal_radius → more circular
    return min(max_dist, ideal_radius) / max(max_dist, ideal_radius)


# ── GPX output ────────────────────────────────────────────────────────────────

def to_gpx(feature: dict, name: str) -> str:
    coords = feature["geometry"]["coordinates"]
    now    = datetime.now(timezone.utc).isoformat()

    trkpts = []
    for c in coords:
        ele_tag = f"\n        <ele>{c[2]:.1f}</ele>" if len(c) >= 3 else ""
        trkpts.append(
            f'      <trkpt lat="{c[1]:.7f}" lon="{c[0]:.7f}">'
            f"{ele_tag}\n      </trkpt>"
        )

    body = "\n".join(trkpts)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cycling Route Planner"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>{name}</name>
    <time>{now}</time>
  </metadata>
  <trk>
    <name>{name}</name>
    <trkseg>
{body}
    </trkseg>
  </trk>
</gpx>"""


# ── Scoring ───────────────────────────────────────────────────────────────────

def score(stats: dict, circularity: float) -> float:
    """
    Combined score for route quality (lower is better).
    Weighted: 70% elevation gain, 30% circularity penalty.
    """
    elev_score   = stats["ascent_ft"]
    circle_score = (1.0 - circularity) * stats["ascent_ft"] * 0.3  # penalty for non-circular
    return elev_score + circle_score


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate a circular GPX cycling route from home, optimised for flatness.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--distance", type=float, default=30,
        metavar="MILES", help="Target distance in miles (default: 30)"
    )
    parser.add_argument(
        "--compare", type=int, default=5,
        metavar="N", help="Route variants to generate and compare (default: 5)"
    )
    parser.add_argument(
        "--all", dest="save_all", action="store_true",
        help="Save all variants as separate GPX files, not just the best one"
    )
    parser.add_argument(
        "--key", metavar="API_KEY",
        default=os.environ.get("ORS_API_KEY"),
        help="OpenRouteService API key (or set ORS_API_KEY env var)"
    )
    parser.add_argument(
        "--output", metavar="FILE",
        help="Output filename for the best route (default: cycling_NNmi.gpx)"
    )
    args = parser.parse_args()

    if not args.key:
        print(
            "Error: OpenRouteService API key required.\n"
            "  Get a free key at https://openrouteservice.org/dev/#/signup\n"
            "  Then use --key KEY or set ORS_API_KEY=KEY in your environment.",
            file=sys.stderr,
        )
        sys.exit(1)

    meters = int(args.distance * MILES_TO_METERS)
    # Spread seeds across a wide range for maximum route diversity
    seeds  = [i * 17 + 3 for i in range(args.compare)]
    routes = []

    print(f"Generating {args.compare} circular route options (~{args.distance:.0f} mi each)…")
    print(f"Start/end: {HOME_LAT}, {HOME_LNG}")
    print()

    for i, seed in enumerate(seeds):
        try:
            geojson     = fetch_route(args.key, meters, seed)
            feature     = geojson["features"][0]
            stats       = route_stats(feature)
            coords      = feature["geometry"]["coordinates"]
            circularity = estimate_circularity(coords)
            combined    = score(stats, circularity)

            routes.append({
                "feature":     feature,
                "stats":       stats,
                "circularity": circularity,
                "score":       combined,
                "seed":        seed,
            })
            circle_pct = int(circularity * 100)
            print(
                f"  [{i+1}/{args.compare}]  "
                f"{stats['distance_mi']:5.1f} mi  "
                f"+{stats['ascent_ft']:5.0f} ft  "
                f"~{fmt_time(stats['duration_s'])}  "
                f"circularity {circle_pct}%"
            )
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            print(f"  [{i+1}/{args.compare}]  Failed (HTTP {e.code}): {body[:120]}", file=sys.stderr)
        except Exception as e:
            print(f"  [{i+1}/{args.compare}]  Failed: {e}", file=sys.stderr)

    if not routes:
        print("\nNo routes generated. Check your API key and network connection.", file=sys.stderr)
        sys.exit(1)

    # Sort by combined score (flattest + most circular wins)
    routes.sort(key=lambda r: r["score"])

    print()
    print("Ranked by flatness + circularity (best first):")
    print(f"  {'#':<3}  {'Distance':>8}  {'Gain':>7}  {'Loss':>7}  {'Time':>6}  {'Circular':>8}  {'Score':>7}")
    for rank, r in enumerate(routes, 1):
        s = r["stats"]
        marker = "  ← best" if rank == 1 else ""
        print(
            f"  #{rank:<2}  "
            f"{s['distance_mi']:7.1f} mi  "
            f"+{s['ascent_ft']:5.0f} ft  "
            f"-{s['descent_ft']:5.0f} ft  "
            f"{fmt_time(s['duration_s']):>6}  "
            f"{int(r['circularity']*100):>6}%  "
            f"{r['score']:7.0f}"
            f"{marker}"
        )

    print()
    to_save = routes if args.save_all else [routes[0]]

    for rank, r in enumerate(to_save, 1):
        s = r["stats"]
        if args.output and not args.save_all:
            path = args.output
        elif args.save_all:
            path = f"cycling_{args.distance:.0f}mi_rank{rank}.gpx"
        else:
            path = f"cycling_{args.distance:.0f}mi.gpx"

        name = f"Cycling {s['distance_mi']:.1f} mi (+{s['ascent_ft']:.0f} ft)"
        with open(path, "w", encoding="utf-8") as f:
            f.write(to_gpx(r["feature"], name))
        print(f"Saved: {path}")

    print()
    print("To import into Ride with GPS:")
    print("  Routes → Import → Upload file → select the .gpx file")


if __name__ == "__main__":
    main()
