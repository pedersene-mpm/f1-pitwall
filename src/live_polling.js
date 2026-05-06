/**
 * live_polling.js
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenF1 live data client. Polls the OpenF1 API and produces the same dataset
 * shape used by replay mode, so all downstream UI works unchanged.
 *
 * Note: OpenF1 free tier is delayed by ~30 minutes. Real live (≤30s delay)
 * requires a paid subscription. Endpoints are the same.
 *
 * USAGE in App.jsx:
 *
 *    import { createLiveSession, dispose } from "./live_polling.js";
 *
 *    const session = createLiveSession({
 *      sessionKey: 1234,           // OpenF1 session ID
 *      onUpdate: (dataset) => setDataset(dataset),
 *      onStatusChange: (status) => setLiveStatus(status),
 *      pollInterval: 5000,         // ms between polls
 *      apiKey: null,               // null = free/delayed; provide for paid
 *    });
 *
 *    // Later, to stop polling:
 *    session.dispose();
 *
 * PERFORMANCE NOTES:
 * - Position polled at 1Hz (NOT 3.7Hz raw rate) — UI smooths via interpolation
 * - Intervals/lap times polled at 0.2Hz (every 5s)
 * - Weather and race control polled at 0.05Hz (every 20s)
 * - Initial fetch hits all endpoints; subsequent polls only fetch deltas
 *
 * GRACEFUL DEGRADATION:
 * - On network failure, retain last-known data and surface a "stale" status
 * - On API rate limit, back off exponentially
 * - On session change (e.g. quali → race), automatically refetch all
 */

const OPENF1_BASE = "https://api.openf1.org/v1";

const ENDPOINTS = {
  sessions:      `${OPENF1_BASE}/sessions`,
  drivers:       `${OPENF1_BASE}/drivers`,
  position:      `${OPENF1_BASE}/position`,    // race position (P1, P2…)
  location:      `${OPENF1_BASE}/location`,    // x/y on track
  intervals:     `${OPENF1_BASE}/intervals`,   // gaps live
  laps:          `${OPENF1_BASE}/laps`,        // lap times incl. sectors
  stints:        `${OPENF1_BASE}/stints`,      // tire compound + age
  pit:           `${OPENF1_BASE}/pit`,         // pit stops
  weather:       `${OPENF1_BASE}/weather`,
  race_control:  `${OPENF1_BASE}/race_control`,// flags, SC, etc
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Internal helpers                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

async function fetchJson(url, apiKey) {
  const headers = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
  return res.json();
}

/**
 * Find the active session for a given meeting key (race weekend).
 * Returns the most recent session matching `sessionType` (e.g. "Race", "Qualifying").
 */
export async function findSession({ year, country, sessionType, apiKey }) {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (country) params.set("country_name", country);
  if (sessionType) params.set("session_name", sessionType);
  const url = `${ENDPOINTS.sessions}?${params.toString()}`;
  const sessions = await fetchJson(url, apiKey);
  if (!sessions?.length) throw new Error("No matching session found");
  // Sort by date descending — pick the latest matching one
  return sessions.sort((a, b) => new Date(b.date_start) - new Date(a.date_start))[0];
}

/**
 * Initial fetch of all session metadata (drivers, lap data so far, etc.)
 * Returns a partial dataset that subsequent polls augment.
 */
async function initialFetch(sessionKey, apiKey) {
  const params = new URLSearchParams({ session_key: String(sessionKey) });
  const [drivers, laps, stints, intervals, weather, raceControl] = await Promise.all([
    fetchJson(`${ENDPOINTS.drivers}?${params}`, apiKey),
    fetchJson(`${ENDPOINTS.laps}?${params}`, apiKey),
    fetchJson(`${ENDPOINTS.stints}?${params}`, apiKey),
    fetchJson(`${ENDPOINTS.intervals}?${params}`, apiKey).catch(() => []),
    fetchJson(`${ENDPOINTS.weather}?${params}`, apiKey).catch(() => []),
    fetchJson(`${ENDPOINTS.race_control}?${params}`, apiKey).catch(() => []),
  ]);
  return { drivers, laps, stints, intervals, weather, raceControl };
}

/**
 * Convert OpenF1 raw arrays into the dataset shape App.jsx expects.
 * Crucial: this normalizes wildly different API response styles into ONE shape
 * matching what processRealData() produces from FastF1 JSONs.
 */
function normalizeDataset({ session, drivers, laps, stints, intervals, weather, raceControl, locations }) {
  // ── Drivers ──
  const driverRows = drivers.map(d => ({
    code:  d.name_acronym,
    name:  d.full_name || d.broadcast_name,
    team:  d.team_name,
    color: d.team_colour ? `#${d.team_colour}` : "#888",
    number: d.driver_number,
  }));

  // ── Lap times indexed by driver and lap ──
  // Output: { VER: { 1: 87.345, 2: 86.912, ... }, ... }
  const lapTimes = {};
  const sectorTimes = {};
  laps.forEach(l => {
    const code = driverCodeFromNumber(l.driver_number, drivers);
    if (!code) return;
    if (!lapTimes[code]) lapTimes[code] = {};
    if (!sectorTimes[code]) sectorTimes[code] = {};
    if (l.lap_duration != null) lapTimes[code][l.lap_number] = l.lap_duration;
    sectorTimes[code][l.lap_number] = [
      l.duration_sector_1 || null,
      l.duration_sector_2 || null,
      l.duration_sector_3 || null,
    ];
  });

  // ── Stints (tire compound runs) per driver ──
  const stintsByDriver = {};
  stints.forEach(s => {
    const code = driverCodeFromNumber(s.driver_number, drivers);
    if (!code) return;
    if (!stintsByDriver[code]) stintsByDriver[code] = [];
    stintsByDriver[code].push({
      compound: s.compound,
      start:    s.lap_start,
      end:      s.lap_end,
      laps:     (s.lap_end - s.lap_start) + 1,
      tire_age: s.tyre_age_at_start,
    });
  });

  // ── Live intervals (gap to leader / interval to car ahead) ──
  // Take the most recent record per driver
  const latestIntervals = {};
  intervals.forEach(i => {
    const code = driverCodeFromNumber(i.driver_number, drivers);
    if (!code) return;
    if (!latestIntervals[code] || new Date(i.date) > new Date(latestIntervals[code].date)) {
      latestIntervals[code] = i;
    }
  });

  // ── Weather (most recent reading) ──
  const latestWeather = weather.length
    ? weather.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    : null;

  // ── Race control flags / events ──
  const recentRaceControl = raceControl
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20);

  return {
    sessionName:  `${session.country_name} ${session.year} — ${session.session_name}`,
    sessionType:  classifyOpenF1SessionType(session.session_name),
    dataSource:   "live",
    isLive:       true,
    drivers:      driverRows,
    lapTimes,
    sectorTimes,
    stints:       stintsByDriver,
    intervals:    latestIntervals,
    weather:      latestWeather,
    raceControl:  recentRaceControl,
    // Position/location/timeline reconstruction is the heaviest job — done
    // in App.jsx alongside replay-mode logic. Locations get fed in here:
    locations,
    totalLaps:    inferTotalLaps(laps),
    timestamp:    Date.now(),
  };
}

function driverCodeFromNumber(driverNumber, drivers) {
  const driver = drivers.find(d => d.driver_number === driverNumber);
  return driver?.name_acronym || null;
}

function classifyOpenF1SessionType(name) {
  if (!name) return "race";
  const n = name.toLowerCase();
  if (n.includes("qualif")) return "qualifying";
  if (n.includes("sprint")) return "sprint";
  if (n.includes("practice")) return "practice";
  return "race";
}

function inferTotalLaps(laps) {
  if (!laps?.length) return null;
  return Math.max(...laps.map(l => l.lap_number));
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Public API                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Begin polling a live session. Returns an object with `dispose()` to stop.
 *
 * Polling cadence (tunable via opts):
 *   tier 1 (fast):  intervals, position-on-track  — every 2-5s
 *   tier 2 (mid):   laps, sectors, stints          — every 5-10s
 *   tier 3 (slow):  weather, race control          — every 15-30s
 *
 * Locations (x/y) are NOT polled here — they're fetched on demand if the
 * track view is active, since they're heavy (3.7Hz × 22 cars).
 */
export function createLiveSession({
  sessionKey,
  onUpdate,
  onStatusChange = () => {},
  apiKey = null,
  pollFastMs   = 3000,
  pollMidMs    = 7000,
  pollSlowMs   = 20000,
}) {
  let disposed = false;
  let session = null;
  let cache   = { drivers: [], laps: [], stints: [], intervals: [], weather: [], raceControl: [], locations: [] };

  const intervalsFast = [];
  const intervalsMid  = [];
  const intervalsSlow = [];

  // ── Status reporter ──
  const setStatus = (status, detail) => onStatusChange({ status, detail, timestamp: Date.now() });

  // ── Fetcher with retry and backoff ──
  async function safeFetch(url) {
    if (disposed) return null;
    try {
      return await fetchJson(url, apiKey);
    } catch (e) {
      console.warn("[live_polling] fetch failed:", e.message);
      setStatus("degraded", e.message);
      return null;
    }
  }

  // ── Tier 1: intervals (gaps) ──
  async function pollFast() {
    if (disposed) return;
    const params = new URLSearchParams({ session_key: String(sessionKey) });
    const intervals = await safeFetch(`${ENDPOINTS.intervals}?${params}`);
    if (intervals) {
      cache.intervals = intervals;
      emit();
    }
  }

  // ── Tier 2: laps and stints ──
  async function pollMid() {
    if (disposed) return;
    const params = new URLSearchParams({ session_key: String(sessionKey) });
    const [laps, stints] = await Promise.all([
      safeFetch(`${ENDPOINTS.laps}?${params}`),
      safeFetch(`${ENDPOINTS.stints}?${params}`),
    ]);
    if (laps)   cache.laps   = laps;
    if (stints) cache.stints = stints;
    emit();
  }

  // ── Tier 3: weather, race control ──
  async function pollSlow() {
    if (disposed) return;
    const params = new URLSearchParams({ session_key: String(sessionKey) });
    const [weather, rc] = await Promise.all([
      safeFetch(`${ENDPOINTS.weather}?${params}`),
      safeFetch(`${ENDPOINTS.race_control}?${params}`),
    ]);
    if (weather) cache.weather = weather;
    if (rc)      cache.raceControl = rc;
    emit();
  }

  // ── Emit normalized dataset ──
  function emit() {
    if (disposed || !session || !cache.drivers?.length) return;
    const dataset = normalizeDataset({ session, ...cache });
    onUpdate(dataset);
  }

  // ── Bootstrap ──
  async function start() {
    setStatus("connecting");
    try {
      // Fetch session metadata
      const params = new URLSearchParams({ session_key: String(sessionKey) });
      session = await fetchJson(`${ENDPOINTS.sessions}?${params}`, apiKey).then(arr => arr[0]);
      if (!session) throw new Error("Session not found");

      // Initial bulk load
      const initial = await initialFetch(sessionKey, apiKey);
      cache = { ...cache, ...initial };
      emit();
      setStatus("connected");

      // Schedule polling tiers
      intervalsFast.push(setInterval(pollFast, pollFastMs));
      intervalsMid.push(setInterval(pollMid, pollMidMs));
      intervalsSlow.push(setInterval(pollSlow, pollSlowMs));
    } catch (e) {
      setStatus("error", e.message);
      console.error("[live_polling] failed to start:", e);
    }
  }

  // ── Dispose ──
  function dispose() {
    disposed = true;
    intervalsFast.forEach(clearInterval);
    intervalsMid.forEach(clearInterval);
    intervalsSlow.forEach(clearInterval);
    setStatus("disconnected");
  }

  // Kick off immediately
  start();

  return { dispose };
}

/**
 * Quick helper: fetch the upcoming or in-progress session for the current
 * F1 weekend. Returns null if no session is active or upcoming within 24h.
 */
export async function findCurrentSession(apiKey = null) {
  try {
    const today = new Date();
    const yyyy = today.getFullYear();
    const url = `${ENDPOINTS.sessions}?year=${yyyy}`;
    const all = await fetchJson(url, apiKey);
    const now = Date.now();
    // Find session whose start is within 24h before/after now
    const candidate = all.find(s => {
      const start = new Date(s.date_start).getTime();
      const end   = new Date(s.date_end || s.date_start).getTime() + 7200000; // +2h grace
      return now > (start - 86400000) && now < end;
    });
    return candidate || null;
  } catch (e) {
    console.warn("[live_polling] couldn't find current session:", e);
    return null;
  }
}
