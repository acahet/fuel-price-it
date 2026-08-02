import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Fuel, RefreshCw, Navigation, AlertCircle, ChevronDown } from "lucide-react";

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
  const [priceType, setPriceType] = useState("self");
  const [priceAvailability, setPriceAvailability] = useState({ self: true, servito: true });
  const [radius, setRadius] = useState(10);
  const [coords, setCoords] = useState(null);
  const [locLabel, setLocLabel] = useState("");
  const [locStatus, setLocStatus] = useState("idle"); // idle | locating | ok | denied
  const [stations, setStations] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error | geolocation_denied | cors
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);

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
      let effectiveType = priceType;
      if (valid.length > 0) {
        const currentAvailable = priceType === "self" ? hasSelf : hasServito;
        const otherAvailable = priceType === "self" ? hasServito : hasSelf;
        if (!currentAvailable && otherAvailable) effectiveType = priceType === "self" ? "servito" : "self";
      }
      if (effectiveType !== priceType) setPriceType(effectiveType);

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

  // The list is ordered by distance (closest first), so the cheapest station in the zone
  // isn't necessarily #1 — find it separately to still surface it on the pump display.
  const cheapest = stations.reduce((min, s) => (!min || s.prezzo < min.prezzo ? s : min), null);
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
            {status === "ok" && cheapest && `PREZZO PIÙ BASSO (${priceType === "self" ? "SELF" : "SERVITO"}) NELLA ZONA`}
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
                  ...(priceType === p.id ? styles.toggleBtnActive : {}),
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
            Nessun distributore {priceType === "self" ? "Self" : "Servito"} trovato entro {radius} km.
            {priceAvailability[priceType === "self" ? "servito" : "self"]
              ? ` Prova a passare a ${priceType === "self" ? "Servito" : "Self"}.`
              : " Prova ad ampliare il raggio di ricerca."}
          </div>
        )}

        {stations.map((s, i) => {
          const isCheapest = s === cheapest;
          return (
            <div key={i} className="station-row" style={styles.row}>
              <div style={styles.rank}>{i + 1}</div>
              <div style={styles.rowMain}>
                <div style={styles.gestore}>
                  {s.gestore || "Distributore"}
                  {isCheapest && <span style={styles.cheapestTag}>PIÙ ECONOMICO</span>}
                </div>
                <div style={styles.indirizzo}>{s.indirizzo}</div>
              </div>
              <div style={styles.rowRight}>
                <div style={{ ...styles.rowPrice, color: isCheapest ? "#D2A24C" : "#EDE6D6" }}>
                  {s.prezzo.toFixed(3).replace(".", ",")}
                </div>
                <div style={styles.rowDist}>{parseFloat(s.distanza).toFixed(1)} km</div>
              </div>
            </div>
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
  cheapestTag: {
    marginLeft: 6,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.5px",
    color: "#D2A24C",
    border: "1px solid #D2A24C55",
    borderRadius: 4,
    padding: "1px 4px",
    verticalAlign: "middle",
  },
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