#!/usr/bin/env python3
"""
fastf1_backend.py  — F1 Pitwall Data Pipeline
===============================================
Generates a combined.json for any F1 session and writes it
directly into your Vite project's public/data/ folder.

Usage:
    python3 fastf1_backend.py --event "British Grand Prix"  --year 2024 --session R
    python3 fastf1_backend.py --event "Monaco Grand Prix"   --year 2024 --session R
    python3 fastf1_backend.py --event "Miami Grand Prix"    --year 2026 --session R

Each run writes one file to --output-dir (default: ~/Desktop/f1-pitwall/public/data/).
The filename is derived automatically, e.g. british_gp_2024_race.json

Install once:
    pip3 install fastf1 numpy pandas
"""

import fastf1
import numpy as np
import pandas as pd
import json, re, argparse
from pathlib import Path

# ─── CLI ─────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--event",      default="British Grand Prix", help="Full event name")
parser.add_argument("--year",       default=2024, type=int)
parser.add_argument("--session",    default="R",  help="R=Race  Q=Qualifying  FP1/FP2/FP3")
parser.add_argument("--output-dir", default=str(Path.home()/"Desktop/f1-pitwall/public/data"))
parser.add_argument("--drivers",    default=22,   type=int, help="Max drivers (22 for full grid)")
args = parser.parse_args()

YEAR        = args.year
EVENT       = args.event
SESSION     = args.session
MAX_DRIVERS = args.drivers
OUT         = Path(args.output_dir)
CACHE       = Path.home() / "Desktop/f1_cache"

SVG_W, SVG_H = 800, 500
MARGIN       = 55
LAP_TIMES    = {   # approximate average lap times in seconds per circuit
    "Bahrain":         95, "Saudi Arabia":    90, "Australia":       87,
    "Japan":           93, "China":           98, "Miami":           91,
    "Emilia Romagna":  80, "Monaco":          75, "Canada":          75,
    "Spain":           83, "Austria":         67, "British":         89,
    "Hungary":         81, "Belgium":         107,"Netherlands":     74,
    "Italian":         82, "Singapore":       103,"Japanese":        93,
    "Qatar":           84, "United States":   97, "Mexico":          98,
    "Brazilian":       74, "Las Vegas":       100,"Abu Dhabi":       88,
}

def lap_time_for(event_name):
    for key, val in LAP_TIMES.items():
        if key.lower() in event_name.lower():
            return val
    return 88  # sensible default

SESSION_LABELS = {"R":"Race","Q":"Qualifying","FP1":"Practice 1","FP2":"Practice 2","FP3":"Practice 3","S":"Sprint"}

def slugify(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")

OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE))

print("=" * 60)
print(f"  {YEAR} {EVENT} — {SESSION_LABELS.get(SESSION, SESSION)}")
print("=" * 60)

# ─── HELPERS ─────────────────────────────────────────────────────────────────
def rotate(x, y, deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    return c*x - s*y, s*x + c*y

def normalise(x, y):
    xmn, xmx = x.min(), x.max()
    ymn, ymx = y.min(), y.max()
    uw, uh = SVG_W - 2*MARGIN, SVG_H - 2*MARGIN
    sc = min(uw/(xmx-xmn), uh/(ymx-ymn))
    xo = MARGIN + (uw - (xmx-xmn)*sc) / 2
    xs = (x - xmn)*sc + xo
    ys = SVG_H - MARGIN - (y - ymn)*sc    # flip Y (north = top)
    return xs, ys, (xmn, xmx, ymn, ymx, sc, xo)

def pt_to_svg(px, py, tf):
    xmn, xmx, ymn, ymx, sc, xo = tf
    return (round(float((px-xmn)*sc + xo), 1),
            round(float(SVG_H - MARGIN - (py-ymn)*sc), 1))

def rel_dist(x, y):
    dx = np.diff(x, prepend=x[0])
    dy = np.diff(y, prepend=y[0])
    cum = np.cumsum(np.sqrt(dx**2 + dy**2))
    tot = cum[-1]
    return cum/tot if tot > 500 else None

# ─── STEP 1: TRACK SHAPE ─────────────────────────────────────────────────────
# Always use qualifying for the track shape — cleaner reference lap.
print("\n[1/3] Loading qualifying session for track shape…")
try:
    quali = fastf1.get_session(YEAR, EVENT, "Q")
    quali.load(telemetry=True, laps=True, weather=False)
    pole = quali.laps.pick_fastest()
    print(f"      Pole: {pole['Driver']}  {pole['LapTime']}")
    shape_session = quali
    shape_lap     = pole
except Exception as e:
    print(f"      Qualifying unavailable ({e}), using requested session for shape.")
    shape_session = None
    shape_lap     = None

if shape_lap is not None:
    pos_data = shape_lap.get_pos_data()
    ci       = shape_session.get_circuit_info()
    rot      = ci.rotation
    xr, yr   = rotate(pos_data["X"].values.astype(float),
                      pos_data["Y"].values.astype(float), rot)
    xs, ys, tf = normalise(xr, yr)
    step       = max(1, len(xs)//400)
    track_points = [[round(float(xs[i]),1), round(float(ys[i]),1)]
                    for i in range(0, len(xs), step)]

    corners_out = []
    for _, row in ci.corners.iterrows():
        cxr, cyr = rotate(float(row["X"]), float(row["Y"]), rot)
        sx, sy   = pt_to_svg(cxr, cyr, tf)
        corners_out.append({"number":int(row["Number"]),"letter":str(row["Letter"]),
                             "x":sx,"y":sy,"angle_deg":float(row["Angle"])})
    print(f"      {len(track_points)} track points, {len(corners_out)} corners, rotation {rot:.1f}°")
else:
    track_points, corners_out, rot = [], [], 0.0
    tf = (0,1,0,1,1,MARGIN)

track_export = {
    "circuit": EVENT, "year": YEAR,
    "session": "Qualifying — pole lap",
    "svg_width": SVG_W, "svg_height": SVG_H,
    "points": track_points, "corners": corners_out,
    "rotation_deg": float(rot),
}

# ─── STEP 2: RACE DATA ────────────────────────────────────────────────────────
print(f"\n[2/3] Loading {SESSION_LABELS.get(SESSION,'session')} data…")
race = fastf1.get_session(YEAR, EVENT, SESSION)
race.load(telemetry=True, laps=True, weather=False)

total_laps = int(race.total_laps) if race.total_laps else 60
lap_time_s = lap_time_for(EVENT)
print(f"      Total laps: {total_laps}  |  Avg lap: {lap_time_s}s")

results = (race.results
           .sort_values("Position")
           .head(MAX_DRIVERS)
          )[["Abbreviation","FullName","TeamName","TeamColor","Position"]].copy()

drivers_meta = []
for _, row in results.iterrows():
    col = str(row["TeamColor"])
    if not col.startswith("#"): col = "#" + col
    drivers_meta.append({
        "code":             row["Abbreviation"],
        "name":             str(row["FullName"]),
        "team":             str(row["TeamName"]),
        "color":            col,
        "finish_position":  int(row["Position"]) if pd.notna(row["Position"]) else None,
    })

print(f"      Drivers: {[d['code'] for d in drivers_meta]}")

# ─── STEP 3: POSITION TIMELINE ───────────────────────────────────────────────
print("\n[3/3] Building position timeline…")
TIMELINE_N = 2000
tl         = np.linspace(0, 1, TIMELINE_N)
positions  = {}

for drv in drivers_meta:
    code = drv["code"]
    try:
        drv_laps = race.laps.pick_driver(code)
        records  = []
        for _, lap in drv_laps.iterrows():
            ln = int(lap["LapNumber"])
            try:
                tel = lap.get_pos_data()
                if tel is None or len(tel) < 20: raise ValueError("short")
                x = tel["X"].values.astype(float)
                y = tel["Y"].values.astype(float)
                xr2, yr2 = rotate(x, y, rot)
                rd = rel_dist(xr2, yr2)
                if rd is None: raise ValueError("short dist")
                t_s = tel["SessionTime"].dt.total_seconds().values
                cum = (ln - 1 + rd) / total_laps
                for i in range(len(t_s)):
                    records.append((t_s[i], float(cum[i])))
            except Exception:
                # Fallback: timing only
                try:
                    st = lap["LapStartTime"]; lt = lap["LapTime"]
                    if pd.isna(st) or pd.isna(lt): continue
                    st_s = st.total_seconds(); lt_s = lt.total_seconds()
                    if lt_s < 40: continue
                    records.append((st_s,        (ln-1)/total_laps))
                    records.append((st_s + lt_s, ln/total_laps))
                except Exception: continue

        if not records: continue
        records.sort(key=lambda r: r[0])
        t_arr   = np.array([r[0] for r in records])
        cum_arr = np.array([r[1] for r in records])
        t_min, t_max = t_arr[0], t_arr[-1]
        if t_max <= t_min: continue
        t_norm  = (t_arr - t_min) / (t_max - t_min)
        cum_re  = np.interp(tl, t_norm, cum_arr)
        track_p = (cum_re * total_laps % 1 + 1) % 1
        positions[code] = track_p.round(4).tolist()
        print(f"      {code}: {len(positions[code])} samples ✓")
    except Exception as e:
        print(f"      {code}: skipped — {e}")

print(f"\n      {len(positions)}/{len(drivers_meta)} drivers with data")

# ─── EXPORT ──────────────────────────────────────────────────────────────────
race_export = {
    "circuit": EVENT, "event": EVENT, "year": YEAR,
    "session": SESSION_LABELS.get(SESSION, SESSION),
    "total_laps": total_laps, "lap_time_s": lap_time_s,
    "drivers": drivers_meta,
    "timeline_length": TIMELINE_N,
    "positions": positions,
}

combined = {"track": track_export, "race": race_export}

sess_slug = slugify(SESSION_LABELS.get(SESSION, SESSION))
event_slug = slugify(EVENT.replace(" Grand Prix","").replace(" GP",""))
filename  = f"{event_slug}_{YEAR}_{sess_slug}.json"
out_path  = OUT / filename

with open(out_path, "w") as f:
    json.dump(combined, f, separators=(",", ":"))

size_kb = out_path.stat().st_size / 1024
print(f"\n✅  {out_path}  ({size_kb:.0f} KB)")
print(f"\n    Add to the app's session list:")
print(f'    {{ key: "{event_slug}_{YEAR}_{sess_slug}", name: "...", file: "/data/{filename}" }}')
print("\nDone.\n")
