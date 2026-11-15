import { MapPin, Fuel, Clock, Award } from "lucide-react";
import { styles } from "../styles.js";
import { NavigateButton } from "./NavigateButton.jsx";

const OPERATOR_BADGES = [
  { matches: [" q8 ", "kuwait"], label: "Q8", background: "#FFFFFF", color: "#2446A8", border: "#E5E8ED" },
  { matches: [" eni ", "agip"], label: "Eni", background: "#FFD63D", color: "#171717", border: "#E8BD18" },
  { matches: ["tamoil"], label: "T", background: "#0674B9", color: "#FFFFFF", border: "#0674B9" },
  { matches: [" esso "], label: "Esso", background: "#FFFFFF", color: "#D71920", border: "#D9E0E5" },
  { matches: ["total", "totalerg"], label: "TE", background: "#E1242D", color: "#FFFFFF", border: "#E1242D" },
  { matches: [" shell "], label: "S", background: "#FFD500", color: "#D71920", border: "#E8BE00" },
  { matches: [" repsol "], label: "R", background: "#F58220", color: "#FFFFFF", border: "#F58220" },
  { matches: [" api ", "anonima petroli"], label: "api", background: "#124DA0", color: "#FF8A25", border: "#124DA0" },
  { matches: [" ip ", "italiana petroli", "ip-gruppo"], label: "IP", background: "#075AB5", color: "#FF8626", border: "#075AB5" },
];

function StationBrand({ name }) {
  const normalized = ` ${String(name || "").toLowerCase()} `;
  const badge = OPERATOR_BADGES.find((item) => item.matches.some((match) => normalized.includes(match)));

  return (
    <span
      aria-hidden="true"
      style={{
        ...styles.stationBrand,
        ...(badge
          ? { background: badge.background, color: badge.color, borderColor: badge.border }
          : {}),
      }}
    >
      {badge ? badge.label : <Fuel size={18} />}
    </span>
  );
}

export function StationCard({ station, rank, isCheapest, stale, freshnessText, highlighted, navOpen, onToggleNav, onCloseNav, cardRef }) {
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
        <span style={styles.cardRank}>#{rank} · {parseFloat(station.distanza).toFixed(1)} km</span>
        <span style={styles.cardMeta}>
          {isCheapest && (
            <span style={styles.badgeCheapest}>
              <Award size={12} /> Più economico
            </span>
          )}
          {freshnessText && (
            <span style={{ ...styles.freshnessBadge, ...(stale ? styles.freshnessBadgeStale : {}) }}>
              <Clock size={11} /> {stale ? "Non verificato" : freshnessText}
            </span>
          )}
        </span>
      </div>

      <div style={styles.stationIdentity}>
        <StationBrand name={station.gestore} />
        <div style={styles.stationIdentityText}>
          <h3 style={styles.cardTitle}>{station.gestore || "Distributore"}</h3>
          <p style={styles.cardAddress}>
            <MapPin size={12} /> {station.indirizzo}
          </p>
        </div>
      </div>

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
