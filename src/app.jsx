import { useState, useEffect, useCallback, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Fuel, RefreshCw, Navigation, AlertCircle, ChevronDown, Clock, Award, ArrowRight } from "lucide-react";

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

const API_BASE = "https://prezzi-carburante.onrender.com/api/distributori";

// Kill switch for the interactive map, independent of code changes: set
// VITE_ENABLE_MAP=false in .env.local (or as a build-time env var in CI) to turn it off
// without touching/reverting this file. Defaults on.
const MAP_ENABLED = import.meta.env.VITE_ENABLE_MAP !== "false";

const FAVORITE_FUEL_KEY = "distributore.favoriteFuel";

function readFavoriteFuel() {
  try {
    const saved = localStorage.getItem(FAVORITE_FUEL_KEY);
    return FUELS.some((f) => f.id === saved) ? saved : null;
  } catch {
    // localStorage can throw in private-browsing modes on some browsers — just skip persistence.
    return null;
  }
}

function saveFavoriteFuel(id) {
  try {
    localStorage.setItem(FAVORITE_FUEL_KEY, id);
  } catch {
    // ignore — see readFavoriteFuel
  }
}

// Universal links (not maps:// / geo: custom schemes) so each also works as a plain
// web fallback when the corresponding app isn't installed, e.g. on desktop.
function mapLinks(lat, lon) {
  return [
    { id: "google", label: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` },
    { id: "waze", label: "Waze", url: `https://waze.com/ul?ll=${lat}%2C${lon}&navigate=yes` },
    { id: "apple", label: "Apple Maps", url: `https://maps.apple.com/?daddr=${lat},${lon}` },
  ];
}

// Stations are legally required to report price changes within 8 days (art. 51 L.99/2009).
// We flag anything older than 5 days as unverified, giving a margin before that legal deadline.
const STALE_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000;

// The API returns "data" as "DD/MM/YYYY HH:mm:ss" (Italian format), which isn't
// reliably parsed by `new Date(string)` across browsers — parse it explicitly.
function parseStationDate(str) {
  if (typeof str !== "string") return null;
  const [datePart, timePart] = str.split(" ");
  const [day, month, year] = (datePart || "").split("/").map(Number);
  const [hour, minute, second] = (timePart || "").split(":").map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
}

function formatRelativeTime(date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "pochi istanti fa";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
}

// Recenters/refits the map whenever the user's position or the station list changes —
// has to live inside <MapContainer> since the Leaflet map instance is only available via context there.
function FitBounds({ coords, stations }) {
  const map = useMap();
  useEffect(() => {
    const points = [
      [coords.lat, coords.lon],
      ...stations.map((s) => [s.latitudine, s.longitudine]),
    ];
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(points, { padding: [28, 28], maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, stations]);
  return null;
}

function StationMap({ coords, stations, cheapest, onMarkerClick }) {
  if (!coords) return null;
  return (
    <div style={styles.mapWrap}>
      <MapContainer
        center={[coords.lat, coords.lon]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds coords={coords} stations={stations} />
        <CircleMarker
          center={[coords.lat, coords.lon]}
          radius={7}
          pathOptions={{ color: "#0F1B2B", weight: 2, fillColor: "#EDE6D6", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            La tua posizione
          </Tooltip>
        </CircleMarker>
        {stations.map((s, i) => {
          const isCheapest = s === cheapest;
          return (
            <CircleMarker
              key={i}
              center={[s.latitudine, s.longitudine]}
              radius={isCheapest ? 10 : 8}
              pathOptions={{
                color: "#0A1420",
                weight: 2,
                fillColor: isCheapest ? "#D2A24C" : "#1B6E71",
                fillOpacity: 0.9,
              }}
              eventHandlers={{ click: () => onMarkerClick(i) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {s.gestore || "Distributore"} · {s.prezzo.toFixed(3).replace(".", ",")} €/L
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function NavigateButton({ station, open, onToggle, onClose, style }) {
  return (
    <div style={{ position: "relative" }}>
      <button onClick={onToggle} style={style}>
        Naviga <ArrowRight size={14} />
      </button>
      {open && (
        <>
          <div style={styles.navMenuOverlay} onClick={onClose} />
          <div style={styles.navMenu}>
            {mapLinks(station.latitudine, station.longitudine).map((m) => (
              <a
                key={m.id}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="nav-menu-item"
                style={styles.navMenuItem}
                onClick={onClose}
              >
                {m.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StationCard({ station, isCheapest, stale, freshnessText, highlighted, navOpen, onToggleNav, onCloseNav, cardRef }) {
  return (
    <div
      ref={cardRef}
      className="station-card"
      style={{
        ...styles.card,
        ...(isCheapest ? styles.cardCheapest : {}),
        ...(highlighted ? styles.cardHighlighted : {}),
      }}
    >
      <div style={styles.cardHeader}>
        {isCheapest ? (
          <span style={styles.badgeCheapest}>
            <Award size={12} /> Più economico
          </span>
        ) : (
          <span />
        )}
        {freshnessText && (
          <span style={{ ...styles.freshnessBadge, ...(stale ? styles.freshnessBadgeStale : {}) }}>
            <Clock size={11} /> {stale ? "Non verificato" : freshnessText}
          </span>
        )}
      </div>

      <h3 style={styles.cardTitle}>{station.gestore || "Distributore"}</h3>
      <p style={styles.cardAddress}>
        <MapPin size={12} /> {parseFloat(station.distanza).toFixed(1)} km · {station.indirizzo}
      </p>

      <div style={styles.cardFooter}>
        <div style={styles.priceContainer}>
          <span style={styles.priceCurrency}>€</span>
          <span style={styles.priceValue}>{station.prezzo.toFixed(3).replace(".", ",")}</span>
          <span style={styles.priceUnit}>/L</span>
        </div>
        <NavigateButton station={station} open={navOpen} onToggle={onToggleNav} onClose={onCloseNav} style={styles.btnNavigate} />
      </div>
    </div>
  );
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

export default function DistributoreApp() {
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
  const abortRef = useRef(null);
  const rowRefs = useRef({});

  const handleMarkerClick = (i) => {
    rowRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedIndex(i);
    setTimeout(() => setHighlightedIndex((cur) => (cur === i ? null : cur)), 2000);
  };

  const locate = useCallback(() => {
    setLocStatus("locating");
    if (!navigator.geolocation) {
      console.error("Geolocation unavailable: navigator.geolocation is not supported by this browser.");
      setLocStatus("denied");
      setStatus("geolocation_denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocLabel("Posizione attuale");
        setLocStatus("ok");
      },
      (error) => {
        console.error("Geolocation failed:", error);
        setLocStatus("denied");
        setStatus("geolocation_denied");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const fetchStations = useCallback(async () => {
    if (!coords) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    try {
      // The API doesn't support filtering by self/servito server-side, and mixes both
      // into one ranking, so we over-fetch and filter+re-sort by price type client-side.
      const url = `${API_BASE}?latitude=${coords.lat}&longitude=${coords.lon}&distance=${radius}&fuel=${fuel}&results=40`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("bad_response");
      const data = await res.json();
      const valid = Array.isArray(data)
        ? data
          .map((s) => ({ ...s, prezzo: typeof s.prezzo === "number" ? s.prezzo : parseFloat(s.prezzo) }))
          .filter((s) => Number.isFinite(s.prezzo))
        : [];

      const hasSelf = valid.some((s) => s.self === true);
      const hasServito = valid.some((s) => s.self === false);
      setPriceAvailability({ self: hasSelf, servito: hasServito });

      // GPL is essentially never self-service in Italy (safety regulation), and some fuels
      // only report one price type in a given area — fall back to whichever is actually offered.
      // This only changes what's *displayed* (effectiveType), never the user's actual
      // `priceType` preference, so switching back to a fuel that supports it restores their choice.
      let effectiveType = priceType;
      if (valid.length > 0) {
        const currentAvailable = priceType === "self" ? hasSelf : hasServito;
        const otherAvailable = priceType === "self" ? hasServito : hasSelf;
        if (!currentAvailable && otherAvailable) effectiveType = priceType === "self" ? "servito" : "self";
      }
      setEffectivePriceType(effectiveType);

      // Sorted by distance, not price: a station saving a couple cents but 20km out of the
      // way isn't actually worth it — the list should reflect what's practical to drive to.
      const filtered = valid
        .filter((s) => s.self === (effectiveType === "self"))
        .sort((a, b) => parseFloat(a.distanza) - parseFloat(b.distanza))
        .slice(0, 15);
      setStations(filtered);
      setStatus("ok");
      setLastUpdated(new Date());
    } catch (err) {
      if (err.name === "AbortError") return;
      setStatus("error");
    }
  }, [coords, radius, fuel, priceType]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  const isStale = (s) => {
    const d = parseStationDate(s.data);
    return !d || Date.now() - d.getTime() > STALE_THRESHOLD_MS;
  };

  // The list is ordered by distance (closest first), so the cheapest station in the zone
  // isn't necessarily #1 — find it separately to still surface it on the pump display.
  // Prefer verified (recently-reported) prices for that headline number: an unverified price
  // that "wins" on paper isn't worth sending someone to if it's stale.
  const freshStations = stations.filter((s) => !isStale(s));
  const cheapest = (freshStations.length ? freshStations : stations).reduce(
    (min, s) => (!min || s.prezzo < min.prezzo ? s : min),
    null
  );
  const odoPrice = useOdometer(cheapest ? cheapest.prezzo : null);

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::selection { background: #D2A24C55; }
        .station-card:hover { border-color: #2A3F5A; }
        .chip { transition: all .15s ease; }
        .chip:active { transform: scale(0.96); }
        .nav-menu-item:hover { background: #1C2E45; }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
        @keyframes rowFlash { 0%, 100% { background: transparent; } 30% { background: #D2A24C22; } }
        .leaflet-container { background: #16263B; font-family: 'Inter', sans-serif; }
        .leaflet-control-zoom a { background: #16263B !important; color: #EDE6D6 !important; border-color: #2A3F5A !important; }
        .leaflet-control-zoom a:hover { background: #1C2E45 !important; }
        .leaflet-control-attribution { background: #0A1420CC !important; color: #5B7091 !important; }
        .leaflet-control-attribution a { color: #8A98AA !important; }
        .leaflet-tooltip { background: #16263B !important; color: #EDE6D6 !important; border: 1px solid #2A3F5A !important; box-shadow: none !important; }
        .leaflet-tooltip-top:before { border-top-color: #2A3F5A !important; }
      `}</style>

      {showFuelPrompt && (
        <div style={styles.fuelPromptOverlay}>
          <div style={styles.fuelPromptCard}>
            <Fuel size={22} color="#D2A24C" />
            <div style={styles.fuelPromptTitle}>Quale carburante usi di solito?</div>
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

      {/* HERO — pump display */}
      <div style={styles.hero}>
        <div style={styles.heroTop}>
          <div style={styles.brand}>
            <Fuel size={18} color="#D2A24C" />
            <span style={styles.brandText}>DISTRIBUTORE</span>
          </div>
          <button onClick={locate} style={styles.locBtn} title="Aggiorna posizione">
            <Navigation size={14} />
          </button>
        </div>

        <div style={styles.pumpPanel}>
          <div style={styles.pumpLabel}>
            {status === "loading" && "AGGIORNAMENTO…"}
            {status === "ok" && cheapest && `PREZZO PIÙ BASSO (${effectivePriceType === "self" ? "SELF" : "SERVITO"}) NELLA ZONA`}
            {status === "ok" && !cheapest && "NESSUN DISTRIBUTORE TROVATO"}
            {status === "error" && "SERVIZIO NON RAGGIUNGIBILE"}
            {status === "geolocation_denied" && "CI DISPIACE, POSIZIONE NON DISPONIBILE"}
            {status === "idle" && "IN ATTESA DI POSIZIONE…"}
          </div>
          <div style={styles.pumpDigits}>
            {cheapest && Number.isFinite(odoPrice) ? (
              <>
                <span>{odoPrice.toFixed(3).replace(".", ",")}</span>
                <span style={styles.pumpUnit}>€/L</span>
              </>
            ) : (
              <span style={{ opacity: 0.3, animation: status === "loading" ? "pulse 1.4s infinite" : "none" }}>
                — , — — —
              </span>
            )}
          </div>
          {cheapest && (
            <>
              <div style={styles.pumpSub}>
                {cheapest.gestore} · a {parseFloat(cheapest.distanza).toFixed(1)} km
                {parseStationDate(cheapest.data) && ` · ${formatRelativeTime(parseStationDate(cheapest.data))}`}
                {isStale(cheapest) && <span style={styles.staleTagHero}>NON VERIFICATO</span>}
              </div>
              <NavigateButton
                station={cheapest}
                open={navMenuIndex === "hero"}
                onToggle={() => setNavMenuIndex(navMenuIndex === "hero" ? null : "hero")}
                onClose={() => setNavMenuIndex(null)}
                style={styles.btnNavigateHero}
              />
            </>
          )}
        </div>
      </div>

      {/* CONTROLS */}
      <div style={styles.controls}>
        <div style={styles.fuelRow}>
          {FUELS.map((f) => (
            <button
              key={f.id}
              className="chip"
              onClick={() => setFuel(f.id)}
              style={{
                ...styles.chip,
                ...(fuel === f.id ? styles.chipActive : {}),
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={styles.toggleRow}>
          {PRICE_TYPES.map((p) => {
            const disabled = status === "ok" && !priceAvailability[p.id];
            return (
              <button
                key={p.id}
                className="chip"
                disabled={disabled}
                onClick={() => setPriceType(p.id)}
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
            <MapPin size={13} color="#8A98AA" />
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
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  entro {r} km
                </option>
              ))}
            </select>
            <ChevronDown size={13} color="#8A98AA" style={styles.selectIcon} />
          </div>

          <button onClick={fetchStations} style={styles.refreshBtn} title="Aggiorna prezzi">
            <RefreshCw size={13} className={status === "loading" ? "spin" : ""} style={{
              animation: status === "loading" ? "spin 0.8s linear infinite" : "none"
            }} />
          </button>
        </div>
      </div>

      {MAP_ENABLED && status === "ok" && stations.length > 0 && (
        <StationMap coords={coords} stations={stations} cheapest={cheapest} onMarkerClick={handleMarkerClick} />
      )}

      {/* LIST */}
      <div style={styles.list}>
        {status === "error" && (
          <div style={styles.errorBox}>
            <AlertCircle size={16} color="#D2A24C" />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Il servizio dati non risponde</div>
              <div style={{ fontSize: 13, color: "#8A98AA", lineHeight: 1.5 }}>
                L'API pubblica che alimenta questa app (basata sugli open data MIMIT) potrebbe essere
                temporaneamente offline o bloccare le richieste dal browser. Riprova tra poco, oppure
                consulta{" "}
                <a href="https://carburanti.mise.gov.it" target="_blank" rel="noreferrer" style={{ color: "#D2A24C" }}>
                  l'Osservaprezzi ufficiale
                </a>
                .
              </div>
            </div>
          </div>
        )}

        {locStatus === "denied" && (
          <div style={{ ...styles.errorBox, marginBottom: 10 }}>
            <AlertCircle size={16} color="#D2A24C" />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Ci dispiace, ci serve la tua posizione</div>
              <div style={{ fontSize: 13, color: "#8A98AA", lineHeight: 1.5, marginBottom: 10 }}>
                Non è stato possibile ottenere la posizione attuale (permesso negato, timeout o sensore non
                disponibile). Senza la tua posizione non possiamo cercare i distributori vicino a te — per
                evitare risultati fuorvianti non usiamo una località predefinita.
              </div>
              <button onClick={locate} style={styles.retryBtn}>
                Riprova
              </button>
            </div>
          </div>
        )}

        {status === "ok" && stations.length === 0 && (
          <div style={styles.emptyBox}>
            Nessun distributore {effectivePriceType === "self" ? "Self" : "Servito"} trovato entro {radius} km.
            {priceAvailability[effectivePriceType === "self" ? "servito" : "self"]
              ? ` Prova a passare a ${effectivePriceType === "self" ? "Servito" : "Self"}.`
              : " Prova ad ampliare il raggio di ricerca."}
          </div>
        )}

        {stations.map((s, i) => {
          const isCheapest = s === cheapest;
          const stationStale = isStale(s);
          const updatedAt = parseStationDate(s.data);
          return (
            <StationCard
              key={i}
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

      <div style={styles.footer}>
        {lastUpdated && <span>Aggiornato alle {lastUpdated.toLocaleTimeString("it-IT")} · </span>}
        Dati: comunicazioni impianti al MIMIT (art. 51 L.99/2009), via API pubblica di terze parti.
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0F1B2B",
    color: "#EDE6D6",
    fontFamily: "'Inter', sans-serif",
    maxWidth: 480,
    margin: "0 auto",
    paddingBottom: 32,
  },
  hero: {
    background: "linear-gradient(160deg, #16263B 0%, #0F1B2B 100%)",
    padding: "20px 20px 26px",
    borderBottom: "1px solid #1C2E45",
  },
  fuelPromptOverlay: {
    position: "fixed",
    inset: 0,
    background: "#0A1420CC",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 100,
  },
  fuelPromptCard: {
    background: "#16263B",
    border: "1px solid #2A3F5A",
    borderRadius: 16,
    padding: "24px 20px",
    maxWidth: 340,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
  },
  fuelPromptTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#EDE6D6",
    marginTop: 10,
  },
  fuelPromptHint: {
    fontSize: 12.5,
    color: "#8A98AA",
    lineHeight: 1.5,
    marginTop: 6,
    marginBottom: 18,
  },
  fuelPromptGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  fuelPromptBtn: {
    background: "#0A1420",
    border: "1px solid #1C2E45",
    borderRadius: 10,
    padding: "14px 8px",
    color: "#EDE6D6",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  fuelPromptSkip: {
    background: "none",
    border: "none",
    color: "#5B7091",
    fontSize: 12.5,
    marginTop: 14,
    cursor: "pointer",
    textDecoration: "underline",
  },
  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandText: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 20,
    letterSpacing: "2px",
    color: "#EDE6D6",
  },
  locBtn: {
    background: "#1C2E45",
    border: "1px solid #2A3F5A",
    borderRadius: 8,
    padding: 8,
    color: "#D2A24C",
    cursor: "pointer",
    display: "flex",
  },
  pumpPanel: {
    background: "#0A1420",
    border: "1px solid #1C2E45",
    borderRadius: 14,
    padding: "20px 18px",
    textAlign: "center",
  },
  pumpLabel: {
    fontSize: 11,
    letterSpacing: "1.5px",
    color: "#5B7091",
    fontWeight: 600,
    marginBottom: 10,
  },
  pumpDigits: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 44,
    fontWeight: 700,
    color: "#D2A24C",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 8,
    textShadow: "0 0 24px #D2A24C33",
  },
  pumpUnit: { fontSize: 16, color: "#8A98AA", fontWeight: 500 },
  pumpSub: { fontSize: 12.5, color: "#8A98AA", marginTop: 8 },
  staleTagHero: {
    marginLeft: 6,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.5px",
    color: "#E28B6D",
    border: "1px solid #E28B6D55",
    borderRadius: 4,
    padding: "1px 4px",
  },
  btnNavigateHero: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    background: "#1B6E71",
    border: "none",
    borderRadius: 10,
    padding: "10px 18px",
    color: "#EDE6D6",
    fontSize: 13.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  controls: { padding: "16px 20px 8px" },
  fuelRow: { display: "flex", gap: 8, marginBottom: 12 },
  chip: {
    flex: 1,
    background: "#16263B",
    border: "1px solid #1C2E45",
    borderRadius: 8,
    padding: "8px 4px",
    color: "#8A98AA",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: "pointer",
  },
  chipActive: {
    background: "#1B6E71",
    borderColor: "#1B6E71",
    color: "#EDE6D6",
  },
  toggleRow: {
    display: "flex",
    gap: 4,
    background: "#0A1420",
    border: "1px solid #1C2E45",
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderRadius: 6,
    padding: "6px 4px",
    color: "#8A98AA",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: "pointer",
  },
  toggleBtnActive: {
    background: "#D2A24C",
    color: "#0F1B2B",
    fontWeight: 700,
  },
  toggleBtnDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
  metaRow: { display: "flex", alignItems: "center", gap: 10 },
  locInfo: { display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 },
  locText: {
    fontSize: 12,
    color: "#8A98AA",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  radiusWrap: { position: "relative", display: "flex", alignItems: "center" },
  select: {
    background: "#16263B",
    border: "1px solid #1C2E45",
    borderRadius: 8,
    color: "#EDE6D6",
    fontSize: 12.5,
    padding: "7px 26px 7px 10px",
    appearance: "none",
    cursor: "pointer",
  },
  selectIcon: { position: "absolute", right: 8, pointerEvents: "none" },
  refreshBtn: {
    background: "#16263B",
    border: "1px solid #1C2E45",
    borderRadius: 8,
    padding: 8,
    color: "#D2A24C",
    cursor: "pointer",
    display: "flex",
  },
  mapWrap: {
    height: 220,
    margin: "0 20px 4px",
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid #1C2E45",
  },
  list: { padding: "10px 20px 0" },
  card: {
    background: "#16263B",
    border: "1px solid #1C2E45",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardCheapest: {
    borderColor: "#D2A24C88",
    background: "linear-gradient(160deg, #1C2E45 0%, #16263B 100%)",
  },
  cardHighlighted: {
    animation: "rowFlash 2s ease",
    boxShadow: "0 0 0 1px #D2A24C88 inset",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 18,
    marginBottom: 6,
  },
  badgeCheapest: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.3px",
    color: "#D2A24C",
  },
  freshnessBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10,
    color: "#5B7091",
  },
  freshnessBadgeStale: { color: "#E28B6D" },
  cardTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#EDE6D6",
  },
  cardAddress: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    margin: "4px 0 12px",
    fontSize: 12,
    color: "#8A98AA",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  priceContainer: {
    display: "flex",
    alignItems: "baseline",
    gap: 2,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#D2A24C",
  },
  priceCurrency: { fontSize: 14, fontWeight: 600 },
  priceValue: { fontSize: 22, fontWeight: 700 },
  priceUnit: { fontSize: 12, color: "#8A98AA", marginLeft: 2 },
  btnNavigate: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: "#1B6E71",
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    color: "#EDE6D6",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  navMenuOverlay: { position: "fixed", inset: 0, zIndex: 10 },
  navMenu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    background: "#16263B",
    border: "1px solid #2A3F5A",
    borderRadius: 10,
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    zIndex: 20,
    minWidth: 150,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  navMenuItem: {
    padding: "8px 10px",
    borderRadius: 6,
    color: "#EDE6D6",
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  errorBox: {
    display: "flex",
    gap: 10,
    background: "#16263B",
    border: "1px solid #2A3F5A",
    borderRadius: 10,
    padding: 14,
  },
  retryBtn: {
    background: "#1B6E71",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    color: "#EDE6D6",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  emptyBox: {
    textAlign: "center",
    color: "#8A98AA",
    fontSize: 13,
    padding: "30px 10px",
  },
  footer: {
    marginTop: 20,
    padding: "0 20px",
    fontSize: 10.5,
    color: "#3D4F6B",
    lineHeight: 1.5,
    textAlign: "center",
  },
};