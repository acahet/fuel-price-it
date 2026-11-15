import { useState, useEffect, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { MapPin, Fuel, RefreshCw, Navigation, ChevronDown, List, Map as MapIcon, Sun, Moon } from "lucide-react";
import { cellsForQuery } from "./geoGrid.js";
import { createLocationRace } from "./locationRace.js";
import {
  cheapestStation,
  expandStations,
  isStaleStation,
  parseStationDate,
  latestReportedAt,
  listForDisplay,
  resolvePriceTypes,
} from "./stationSelection.js";
import { supabase } from "./supabaseClient.js";
import { readString, writeString } from "./preferences.js";
import { styles } from "./styles.js";
import { StationMap } from "./components/StationMap.jsx";
import { StationCard } from "./components/StationCard.jsx";
import { PumpPanel } from "./components/PumpPanel.jsx";
import { ResultsNotices } from "./components/ResultsNotices.jsx";
import { AppFooter } from "./components/AppFooter.jsx";
import { formatRelativeTime } from "./formatters.js";

const FUELS = [
  { id: "benzina", label: "Benzina", short: "B" },
  { id: "gasolio", label: "Gasolio", short: "D" },
  { id: "gpl", label: "GPL", short: "G" },
  { id: "metano", label: "Metano", short: "M" },
];

const PRICE_TYPES = [
  { id: "self", label: "Self" },
  { id: "servito", label: "Servito" },
];

const RADII = [3, 5, 10, 20, 30];

// Static snapshot built by scripts/fetch-mimit-data.js (see .github/workflows/deploy.yml,
// which runs it as a build step on a daily schedule) directly from MIMIT's official open data,
// replacing the third-party
// prezzi-carburante.onrender.com API — that API was found to lag MIMIT by ~2 days on average
// and to be missing at least one live station outright. Sharded into a lat/lon grid (geoGrid.js)
// so a query only ever downloads the handful of cells near the user, not all ~21k stations
// in Italy — see MANIFEST_URL/cellUrl below.
const DATA_DIR = `${import.meta.env.BASE_URL}data/stazioni`;
const MANIFEST_URL = `${DATA_DIR}/index.json`;
const cellUrl = (key) => `${DATA_DIR}/${key}.json`;

// Cell responses are cached via the Cache API (not localStorage — the unzipped dataset would
// blow past Safari's ~5MB localStorage cap) keyed by extraction date, so a new day's data
// never serves stale cells and old days get swept automatically (see loadManifest below).
const CACHE_PREFIX = "stazioni-";

// Kill switch for the interactive map. Supabase's `feature_flags` table (supabase/schema.sql)
// is authoritative whenever it's configured — flip it from the Supabase dashboard and it's off
// for everyone, no release/redeploy required, no local override can bring it back. Only a
// request that actually fails (network error, or Supabase not configured at all — e.g. a fresh
// clone with no credentials yet) falls back to VITE_ENABLE_MAP / the default-on, and only
// because there's nothing else to go on at that point — not because local ever outranks it.
const MAP_ENABLED_OVERRIDE = import.meta.env.VITE_ENABLE_MAP;

const FAVORITE_FUEL_KEY = "distributore.favoriteFuel";
const THEME_KEY = "distributore.theme";

function readTheme() {
  const saved = readString(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readFavoriteFuel() {
  const saved = readString(FAVORITE_FUEL_KEY);
  return FUELS.some((f) => f.id === saved) ? saved : null;
}

function saveFavoriteFuel(id) {
  writeString(FAVORITE_FUEL_KEY, id);
}

function useOdometer(value) {
  // returns a display string that "rolls" briefly when value changes
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (value == null) return;
    let frame;
    const target = value;
    const start = performance.now();
    const dur = 550;
    const from = typeof display === "number" ? display : target;
    function tick(t) {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else setDisplay(target);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return display;
}

// Runtime kill switch: once Supabase answers, its flag overrides the local default.
function useMapFlag() {
  const [mapEnabled, setMapEnabled] = useState(MAP_ENABLED_OVERRIDE !== "false");
  useEffect(() => {
    if (!supabase) return; // not configured at all — nothing to defer to, keep the local default
    let cancelled = false;
    supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "map")
      .maybeSingle()
      .then(({ data, error }) => {
        // A real answer from Supabase always wins, local override or not — that's the point
        // of it being the kill switch. Only an actual failure (network error, no row) falls
        // through to whatever the local default already is.
        if (cancelled || error || !data) return;
        setMapEnabled(data.enabled);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return mapEnabled;
}

// Metadata for the geo-sharded station data (extraction date, counts), loaded once up front.
function useManifest(setStatus) {
  const [manifest, setManifest] = useState(null); // { generatedAt, extraction, stationCount, cellCount }
  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((res) => {
        if (!res.ok) throw new Error("bad_response");
        return res.json();
      })
      .then(async (data) => {
        if (cancelled) return;
        setManifest(data);
        // Cell responses are immutable once written under a given extraction date, so old
        // days' buckets are pure dead weight — sweep them instead of letting them accumulate.
        if ("caches" in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(
              keys
                .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_PREFIX + data.extraction)
                .map((k) => caches.delete(k))
            );
          } catch {
            // Cache Storage can be unavailable (e.g. some private-browsing modes) — fine,
            // loadCell falls back to a plain uncached fetch in that case too.
          }
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [setStatus]);
  return manifest;
}

// The refresh icon spins only while a lookup is running.
function refreshIconProps(status) {
  const spinning = status === "loading";
  return {
    className: spinning ? "spin" : "",
    style: { animation: spinning ? "spin 0.8s linear infinite" : "none" },
  };
}

export default function DistributoreApp() {
  const [theme, setTheme] = useState(readTheme);
  const [favoriteFuel] = useState(readFavoriteFuel);
  const [fuel, setFuel] = useState(favoriteFuel || "benzina");
  const [showFuelPrompt, setShowFuelPrompt] = useState(!favoriteFuel);
  const [priceType, setPriceType] = useState("self");
  // What's actually shown/filtered on — usually equal to `priceType`, but can diverge when
  // that preference isn't offered for the current fuel (see fetchStations). Kept separate so
  // switching fuel never permanently overwrites the user's actual Self/Servito preference.
  const [effectivePriceType, setEffectivePriceType] = useState("self");
  const [priceAvailability, setPriceAvailability] = useState({ self: true, servito: true });
  const [radius, setRadius] = useState(3);
  const [coords, setCoords] = useState(null);
  const [locLabel, setLocLabel] = useState("");
  const [locStatus, setLocStatus] = useState("idle"); // idle | locating | ok | denied
  const [stations, setStations] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error | geolocation_denied | cors
  const [lastUpdated, setLastUpdated] = useState(null);
  const [navMenuIndex, setNavMenuIndex] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const [mobileView, setMobileView] = useState("list");
  const manifest = useManifest(setStatus);
  const mapEnabled = useMapFlag();
  const cellCacheRef = useRef(new Map()); // cellKey -> station[], populated for this page load
  const rowRefs = useRef({});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeString(THEME_KEY, theme);
  }, [theme]);

  const handleMarkerClick = (i) => {
    rowRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedIndex(i);
    setTimeout(() => setHighlightedIndex((cur) => (cur === i ? null : cur)), 2000);
  };

  // Smart geolocation: IP-based lookup (ipwho.is — fast, ~city-level accuracy) races the
  // browser's real GPS fix. IP almost always answers first and shows *something* immediately
  // (labeled honestly as approximate — this is a real location signal, never a disguised
  // default, per the earlier removed-Manduria-fallback decision), then GPS silently upgrades
  // to a precise fix the moment it resolves and is never overwritten by IP again. Only shows
  // the "no location" error if BOTH sources fail — a GPS denial no longer nukes results that
  // IP already provided, and an IP failure no longer blocks GPS from working normally.
  const locate = useCallback(() => {
    setLocStatus("locating");
    const race = createLocationRace({
      onFix: (fix, label) => {
        setCoords(fix);
        setLocLabel(label);
        setLocStatus("ok");
      },
      onFailed: () => {
        setLocStatus("denied");
        setStatus("geolocation_denied");
      },
    });

    fetch("https://ipwho.is/")
      .then((res) => res.json())
      .then((data) => race.ipResult(data))
      .catch(() => race.ipFailed());

    if (!navigator.geolocation) {
      console.error("Geolocation unavailable: navigator.geolocation is not supported by this browser.");
      race.gpsFailed();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => race.gpsResult(pos.coords),
      (error) => {
        console.error("Geolocation failed:", error);
        race.gpsFailed();
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  // The manifest is tiny (a few hundred bytes) and only carries metadata (extraction date,
  // counts) — fetched once up front so we know which Cache Storage bucket today's cells
  // belong in. Actual station data is loaded per-cell, lazily, once coords are known (see
  // fetchStations) — there's no point downloading anything before we know where to look.

  // Loads one geo cell's stations, preferring (in order): this page load's in-memory cache,
  // the Cache Storage bucket for today's extraction, then the network — persisting to both
  // caches as it goes. A 404 means the cell simply has no stations (common — most of the grid
  // is sea/uninhabited), not a failure.
  const loadCell = useCallback(
    async (key) => {
      if (cellCacheRef.current.has(key)) return cellCacheRef.current.get(key);
      const url = cellUrl(key);
      let cache = null;
      if ("caches" in window && manifest) {
        try {
          cache = await caches.open(CACHE_PREFIX + manifest.extraction);
        } catch {
          cache = null;
        }
      }
      let res = cache ? await cache.match(url) : null;
      if (!res) {
        res = await fetch(url);
        // A missing cell (most of the grid — sea, mountains, empty land) should 404, but
        // Vite's dev server SPA-fallback serves index.html (200, text/html) for unmatched
        // static paths instead — check content-type too so dev behaves like production.
        const isJson = res.headers.get("content-type")?.includes("json");
        if (!res.ok || !isJson) {
          cellCacheRef.current.set(key, []);
          return [];
        }
        if (cache) cache.put(url, res.clone());
      }
      const stations = await res.json();
      cellCacheRef.current.set(key, stations);
      return stations;
    },
    [manifest]
  );

  const fetchStations = useCallback(async () => {
    if (!coords) return;
    if (!manifest) {
      setStatus("loading");
      return;
    }
    setStatus("loading");
    try {
      const cells = cellsForQuery(coords.lat, coords.lon, radius);
      const cellStationLists = await Promise.all(cells.map((key) => loadCell(key)));

      // Expanded to one entry per price type; the availability fallback only changes what is
      // displayed (effectiveType), never the user's actual `priceType` preference.
      const valid = expandStations(cellStationLists, fuel, coords, radius);
      const { availability, effectiveType } = resolvePriceTypes(priceType, valid);
      setPriceAvailability(availability);
      setEffectivePriceType(effectiveType);
      setStations(listForDisplay(valid, effectiveType));
      setStatus("ok");
      setLastUpdated(new Date());
    } catch {
      setStatus("error");
    }
  }, [coords, manifest, radius, fuel, priceType, loadCell]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  // The headline station is the cheapest verified one (see cheapestStation), not the first in the list.
  const cheapest = cheapestStation(stations);
  const odoPrice = useOdometer(cheapest ? cheapest.prezzo : null);

  // Labels for the "no stations" message: the type being shown, and the one to suggest instead.
  const currentLabel = effectivePriceType === "self" ? "Self" : "Servito";
  const otherType = effectivePriceType === "self" ? "servito" : "self";
  const otherLabel = otherType === "self" ? "Self" : "Servito";
  const hasMapResults = mapEnabled && status === "ok" && stations.length > 0;
  const latestPriceUpdate = latestReportedAt(stations);

  return (
    <div className="app-shell" data-theme={theme} style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        :root, .app-shell[data-theme="light"] {
          color-scheme: light;
          --bg: #f6f7f4;
          --surface: #ffffff;
          --surface-alt: #eef2f1;
          --surface-hover: #eef6f4;
          --text: #17212b;
          --muted: #64717e;
          --subtle: #89949d;
          --border: #dde3e8;
          --border-strong: #b8c4cc;
          --primary: #16a89b;
          --primary-soft: #ddf6f2;
          --primary-text: #0e8e83;
          --best: #a8d94a;
          --best-text: #6f9b25;
          --best-border: #c9e49b;
          --warning: #d97706;
          --warning-bg: #fff9ed;
          --warning-border: #f2d9a9;
          --shadow: rgba(23,33,43,.08);
          --overlay: rgba(23,33,43,.48);
        }
        html[data-theme="dark"], .app-shell[data-theme="dark"] {
          color-scheme: dark;
          --bg: #0b1118;
          --surface: #121c27;
          --surface-alt: #192631;
          --surface-hover: #1b3034;
          --text: #f3f6f7;
          --muted: #9aabb7;
          --subtle: #748693;
          --border: #283946;
          --border-strong: #405563;
          --primary: #29c7b8;
          --primary-soft: #163b3a;
          --primary-text: #70ddd3;
          --best: #b8e85a;
          --best-text: #b8e85a;
          --best-border: #526a2f;
          --warning: #f0a35a;
          --warning-bg: #2b2118;
          --warning-border: #60452c;
          --shadow: rgba(0,0,0,.28);
          --overlay: rgba(0,0,0,.68);
        }
        html, body { background: var(--bg); }
        body { margin: 0; transition: background .2s ease; }
        button, select { font: inherit; }
        button:focus-visible, select:focus-visible, a:focus-visible {
          outline: 3px solid rgba(22, 168, 155, .28);
          outline-offset: 3px;
        }
        ::selection { background: rgba(22, 168, 155, .2); }
        .app-shell { max-width: none !important; overflow: hidden; }
        .app-main { width: min(1180px, 100%); margin: 0 auto; }
        .station-card { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .station-card:hover { border-color: var(--border-strong) !important; transform: translateY(-1px); box-shadow: 0 12px 28px var(--shadow); }
        .chip { transition: all .15s ease; min-height: 42px; }
        .chip:active { transform: scale(0.96); }
        .nav-menu-item:hover { background: var(--surface-hover); }
        .price-summary-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
        .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding: 4px 0 14px; }
        .section-eyebrow { margin: 0 0 4px; color: var(--primary-text); font-size: 10px; font-weight: 700; letter-spacing: 1.35px; text-transform: uppercase; }
        .section-title { margin: 0; color: var(--text); font-size: 20px; line-height: 1.2; letter-spacing: -.3px; }
        .result-count { color: var(--muted); font-size: 12px; white-space: nowrap; }
        .mobile-view-switch { display: none; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rowFlash { 0%, 100% { background: transparent; } 30% { background: rgba(168,217,74,.2); } }
        .leaflet-container { background: var(--surface-alt); font-family: 'Inter', sans-serif; }
        .leaflet-tile-pane { filter: saturate(.72) brightness(1.04); }
        html[data-theme="dark"] .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(.68) saturate(.55) contrast(.92); }
        .leaflet-control-zoom { border: 1px solid var(--border) !important; box-shadow: 0 8px 18px var(--shadow) !important; }
        .leaflet-control-zoom a { background: var(--surface) !important; color: var(--text) !important; border-color: var(--border) !important; }
        .leaflet-control-zoom a:hover { background: var(--surface-alt) !important; }
        .leaflet-control-attribution { background: var(--surface) !important; color: var(--muted) !important; opacity: .88; }
        .leaflet-control-attribution a { color: var(--primary-text) !important; }
        .leaflet-tooltip { background: var(--surface) !important; color: var(--text) !important; border: 1px solid var(--border) !important; box-shadow: 0 8px 18px var(--shadow) !important; }
        .leaflet-tooltip-top:before { border-top-color: var(--border) !important; }
        .leaflet-tooltip.price-marker { padding: 5px 8px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; line-height: 1; white-space: nowrap; }
        .leaflet-tooltip.price-marker--best { background: var(--best) !important; color: #17212b !important; border-color: var(--best) !important; transform-origin: bottom center; }
        .leaflet-tooltip.price-marker--best.leaflet-tooltip-top:before { border-top-color: var(--best) !important; }
        .footer-item { display: inline-flex; align-items: center; gap: 4px; }
        .footer-item strong { color: var(--muted); font-weight: 600; }
        @media (min-width: 760px) {
          .mobile-view-hidden { display: block !important; }
          .app-hero { padding: 16px max(32px, calc((100vw - 1180px) / 2)) !important; }
          .app-hero .hero-top { margin-bottom: 0 !important; }
          .app-controls { margin: 22px 20px 18px; padding: 14px !important; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; display: grid; grid-template-columns: 1.35fr .8fr 1.1fr; gap: 16px; align-items: center; box-shadow: 0 10px 32px var(--shadow); }
          .app-controls .fuel-row, .app-controls .toggle-row { margin: 0 !important; }
          .results-grid { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(360px, .88fr); gap: 20px; padding: 0 20px; align-items: start; }
          .results-grid--single { grid-template-columns: minmax(0, 760px); justify-content: center; }
          .map-wrap { height: min(72vh, 740px) !important; min-height: 560px; margin: 0 !important; position: sticky; top: 20px; border-radius: 18px !important; box-shadow: 0 12px 32px var(--shadow); }
          .pump-panel { margin-bottom: 20px; }
          .results-list { padding: 0 !important; max-height: min(52vh, 540px); overflow-y: auto; padding-right: 5px !important; scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
          .results-pane { min-width: 0; }
          .station-card { padding: 16px !important; }
          .app-footer { padding-bottom: 8px !important; }
        }
        @media (min-width: 1100px) {
          .app-controls { margin-left: 20px; margin-right: 20px; }
          .pump-digits { font-size: 38px !important; }
        }
        @media (max-width: 759px) {
          .app-hero .hero-top { margin-bottom: 0 !important; }
          .app-controls { padding-bottom: 14px !important; }
          .results-grid { display: flex; flex-direction: column; }
          .results-pane { display: contents; }
          .pump-panel { order: 1; margin: 0 20px 12px; }
          .mobile-view-switch { order: 2; display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 0 20px 8px; padding: 4px; background: var(--surface-alt); border: 1px solid var(--border); border-radius: 12px; }
          .mobile-view-switch button { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: var(--muted); background: transparent; border: 0; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
          .mobile-view-switch button.active { color: #fff; background: var(--primary); box-shadow: 0 5px 12px rgba(22,168,155,.2); }
          .map-wrap { order: 3; height: 430px !important; }
          .results-pane .section-heading { order: 4; padding: 12px 20px 8px; width: 100%; }
          .results-list { order: 5; width: 100%; }
          .mobile-view-hidden { display: none !important; }
          .mobile-view-active { display: block; }
          .results-pane .section-heading { padding: 12px 20px 8px; }
          .section-title { font-size: 18px; }
          .price-summary-row { align-items: center; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
        }
      `}</style>

      {showFuelPrompt && (
        <div style={styles.fuelPromptOverlay}>
          <div style={styles.fuelPromptCard} role="dialog" aria-modal="true" aria-labelledby="fuel-prompt-title">
            <Fuel size={22} color="var(--primary)" />
            <div id="fuel-prompt-title" style={styles.fuelPromptTitle}>Quale carburante usi di solito?</div>
            <div style={styles.fuelPromptHint}>
              Lo useremo come predefinito ogni volta che apri l'app. Puoi cambiarlo quando vuoi.
            </div>
            <div style={styles.fuelPromptGrid}>
              {FUELS.map((f) => (
                <button
                  key={f.id}
                  className="chip"
                  style={styles.fuelPromptBtn}
                  onClick={() => {
                    setFuel(f.id);
                    saveFavoriteFuel(f.id);
                    setShowFuelPrompt(false);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button style={styles.fuelPromptSkip} onClick={() => setShowFuelPrompt(false)}>
              Salta, decido dopo
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="app-hero" style={styles.hero}>
        <div className="hero-top" style={styles.heroTop}>
          <div style={styles.brand}>
            <span style={styles.brandMark}><Fuel size={19} /></span>
            <span style={styles.brandText}>Distributore</span>
          </div>
          <div style={styles.headerActions}>
            <button
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              style={styles.themeBtn}
              title={theme === "light" ? "Attiva tema scuro" : "Attiva tema chiaro"}
              aria-label={theme === "light" ? "Attiva tema scuro" : "Attiva tema chiaro"}
            >
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button onClick={locate} style={styles.locBtn} title="Aggiorna posizione" aria-label="Aggiorna posizione">
              <Navigation size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* CONTROLS */}
      <main className="app-main">
      <div className="app-controls" style={styles.controls}>
        <div className="fuel-row" style={styles.fuelRow} role="group" aria-label="Tipo di carburante">
          {FUELS.map((f) => (
            <button
              key={f.id}
              className="chip"
              onClick={() => setFuel(f.id)}
              aria-pressed={fuel === f.id}
              style={{
                ...styles.chip,
                ...(fuel === f.id ? styles.chipActive : {}),
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="toggle-row" style={styles.toggleRow} role="group" aria-label="Tipo di servizio">
          {PRICE_TYPES.map((p) => {
            const disabled = status === "ok" && !priceAvailability[p.id];
            return (
              <button
                key={p.id}
                className="chip"
                disabled={disabled}
                onClick={() => setPriceType(p.id)}
                aria-pressed={effectivePriceType === p.id}
                title={disabled ? `${p.label} non disponibile in questa zona` : undefined}
                style={{
                  ...styles.toggleBtn,
                  ...(effectivePriceType === p.id ? styles.toggleBtnActive : {}),
                  ...(disabled ? styles.toggleBtnDisabled : {}),
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div style={styles.metaRow}>
          <div style={styles.locInfo}>
            <MapPin size={13} color="var(--muted)" />
            <span style={styles.locText}>
              {locStatus === "locating" && "Localizzazione…"}
              {locStatus === "denied" && "Posizione non disponibile"}
              {locStatus === "ok" && locLabel}
              {locStatus === "idle" && ""}
            </span>
          </div>

          <div style={styles.radiusWrap}>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              style={styles.select}
              aria-label="Raggio di ricerca"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  entro {r} km
                </option>
              ))}
            </select>
            <ChevronDown size={13} color="var(--muted)" style={styles.selectIcon} />
          </div>

          <button onClick={fetchStations} style={styles.refreshBtn} title="Aggiorna prezzi" aria-label="Aggiorna prezzi">
            <RefreshCw size={13} {...refreshIconProps(status)} />
          </button>
        </div>
      </div>

      <div className={`results-grid ${!hasMapResults ? "results-grid--single" : ""}`}>
        {hasMapResults && (
          <StationMap
            coords={coords}
            stations={stations}
            cheapest={cheapest}
            onMarkerClick={handleMarkerClick}
            className={mobileView === "map" ? "mobile-view-active" : "mobile-view-hidden"}
          />
        )}

      {/* LIST */}
      <section className="results-pane" aria-labelledby="results-title">
        <PumpPanel
          status={status}
          cheapest={cheapest}
          effectivePriceType={effectivePriceType}
          odoPrice={odoPrice}
          navOpen={navMenuIndex === "hero"}
          onToggleNav={() => setNavMenuIndex(navMenuIndex === "hero" ? null : "hero")}
          onCloseNav={() => setNavMenuIndex(null)}
        />

        {hasMapResults && (
          <div className="mobile-view-switch" role="group" aria-label="Visualizzazione risultati">
            <button
              type="button"
              className={mobileView === "list" ? "active" : ""}
              aria-pressed={mobileView === "list"}
              onClick={() => setMobileView("list")}
            >
              <List size={15} /> Lista
            </button>
            <button
              type="button"
              className={mobileView === "map" ? "active" : ""}
              aria-pressed={mobileView === "map"}
              onClick={() => setMobileView("map")}
            >
              <MapIcon size={15} /> Mappa
            </button>
          </div>
        )}

        <div className={`section-heading ${!hasMapResults || mobileView === "list" ? "mobile-view-active" : "mobile-view-hidden"}`}>
          <div>
            <p className="section-eyebrow">Nelle vicinanze</p>
            <h2 className="section-title" id="results-title">Distributori più vicini</h2>
          </div>
          {status === "ok" && <span className="result-count">{stations.length} risultati</span>}
        </div>
      <div className={`results-list ${!hasMapResults || mobileView === "list" ? "mobile-view-active" : "mobile-view-hidden"}`} style={styles.list} aria-live="polite" aria-busy={status === "loading"}>
        <ResultsNotices
          status={status}
          locStatus={locStatus}
          stations={stations}
          currentLabel={currentLabel}
          otherLabel={otherLabel}
          otherType={otherType}
          radius={radius}
          priceAvailability={priceAvailability}
          onRetry={locate}
        />

        {stations.map((s, i) => {
          const isCheapest = s === cheapest;
          const stationStale = isStaleStation(s);
          const updatedAt = parseStationDate(s.data);
          return (
            <StationCard
              key={`${s.id}-${s.self ? "self" : "servito"}`}
              rank={i + 1}
              cardRef={(el) => {
                rowRefs.current[i] = el;
              }}
              station={s}
              isCheapest={isCheapest}
              stale={stationStale}
              freshnessText={updatedAt ? formatRelativeTime(updatedAt) : null}
              highlighted={highlightedIndex === i}
              navOpen={navMenuIndex === i}
              onToggleNav={() => setNavMenuIndex(navMenuIndex === i ? null : i)}
              onCloseNav={() => setNavMenuIndex(null)}
            />
          );
        })}
      </div>
      </section>
      </div>
      </main>

      <AppFooter latestPriceUpdate={latestPriceUpdate} lastUpdated={lastUpdated} manifest={manifest} />
    </div>
  );
}
