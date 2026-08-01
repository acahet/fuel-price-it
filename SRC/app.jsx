import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Fuel, RefreshCw, Navigation, AlertCircle, ChevronDown } from "lucide-react";

const FUELS = [
  { id: "benzina", label: "Benzina", short: "B" },
  { id: "gasolio", label: "Gasolio", short: "D" },
  { id: "gpl", label: "GPL", short: "G" },
  { id: "metano", label: "Metano", short: "M" },
];

const RADII = [3, 5, 10, 20, 30];

// Fallback: Manduria, Puglia (used if geolocation is denied/unavailable)
const FALLBACK_COORDS = { lat: 40.4062, lon: 17.6335, label: "Manduria (posizione predefinita)" };

const API_BASE = "https://prezzi-carburante.onrender.com/api/distributori";

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
  const [fuel, setFuel] = useState("benzina");
  const [radius, setRadius] = useState(10);
  const [coords, setCoords] = useState(null);
  const [locLabel, setLocLabel] = useState("");
  const [locStatus, setLocStatus] = useState("idle"); // idle | locating | ok | denied
  const [stations, setStations] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error | cors
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);

  const locate = useCallback(() => {
    setLocStatus("locating");
    if (!navigator.geolocation) {
      setCoords(FALLBACK_COORDS);
      setLocLabel(FALLBACK_COORDS.label);
      setLocStatus("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocLabel("Posizione attuale");
        setLocStatus("ok");
      },
      () => {
        setCoords(FALLBACK_COORDS);
        setLocLabel(FALLBACK_COORDS.label);
        setLocStatus("denied");
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
      const url = `${API_BASE}?latitude=${coords.lat}&longitude=${coords.lon}&distance=${radius}&fuel=${fuel}&results=15`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("bad_response");
      const data = await res.json();
      setStations(Array.isArray(data) ? data : []);
      setStatus("ok");
      setLastUpdated(new Date());
    } catch (err) {
      if (err.name === "AbortError") return;
      setStatus("error");
    }
  }, [coords, radius, fuel]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  const cheapest = stations[0];
  const odoPrice = useOdometer(cheapest ? cheapest.prezzo : null);

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::selection { background: #D2A24C55; }
        .station-row:hover { background: #1C2E45; }
        .chip { transition: all .15s ease; }
        .chip:active { transform: scale(0.96); }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
      `}</style>

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
            {status === "ok" && cheapest && "PREZZO PIÙ BASSO NELLA ZONA"}
            {status === "ok" && !cheapest && "NESSUN DISTRIBUTORE TROVATO"}
            {status === "error" && "SERVIZIO NON RAGGIUNGIBILE"}
            {status === "idle" && "IN ATTESA DI POSIZIONE…"}
          </div>
          <div style={styles.pumpDigits}>
            {cheapest ? (
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
            <div style={styles.pumpSub}>
              {cheapest.gestore} · a {parseFloat(cheapest.distanza).toFixed(1)} km
            </div>
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

        <div style={styles.metaRow}>
          <div style={styles.locInfo}>
            <MapPin size={13} color="#8A98AA" />
            <span style={styles.locText}>
              {locStatus === "locating" ? "Localizzazione…" : locLabel}
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

        {status === "ok" && stations.length === 0 && (
          <div style={styles.emptyBox}>
            Nessun distributore trovato entro {radius} km. Prova ad ampliare il raggio di ricerca.
          </div>
        )}

        {stations.map((s, i) => (
          <div key={i} className="station-row" style={styles.row}>
            <div style={styles.rank}>{i + 1}</div>
            <div style={styles.rowMain}>
              <div style={styles.gestore}>{s.gestore || "Distributore"}</div>
              <div style={styles.indirizzo}>{s.indirizzo}</div>
            </div>
            <div style={styles.rowRight}>
              <div style={{ ...styles.rowPrice, color: i === 0 ? "#D2A24C" : "#EDE6D6" }}>
                {s.prezzo.toFixed(3).replace(".", ",")}
              </div>
              <div style={styles.rowDist}>{parseFloat(s.distanza).toFixed(1)} km</div>
            </div>
          </div>
        ))}
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
  list: { padding: "10px 20px 0" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 10px",
    borderBottom: "1px solid #16263B",
    borderRadius: 8,
  },
  rank: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "#5B7091",
    width: 16,
    textAlign: "center",
  },
  rowMain: { flex: 1, minWidth: 0 },
  gestore: { fontSize: 14, fontWeight: 600, marginBottom: 2 },
  indirizzo: {
    fontSize: 11.5,
    color: "#8A98AA",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowRight: { textAlign: "right" },
  rowPrice: { fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700 },
  rowDist: { fontSize: 11, color: "#5B7091", marginTop: 2 },
  errorBox: {
    display: "flex",
    gap: 10,
    background: "#16263B",
    border: "1px solid #2A3F5A",
    borderRadius: 10,
    padding: 14,
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