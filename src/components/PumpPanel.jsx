import { isStaleStation, parseStationDate, pumpLabelText } from "../stationSelection.js";
import { formatRelativeTime } from "../formatters.js";
import { styles } from "../styles.js";
import { NavigateButton } from "./NavigateButton.jsx";

// The hero block above the list: the cheapest verified price and its station.
export function PumpPanel({ status, cheapest, effectivePriceType, odoPrice, navOpen, onToggleNav, onCloseNav }) {
  return (
      <div className="pump-panel" style={styles.pumpPanel}>
        <div style={styles.pumpLabel}>
          {pumpLabelText(status, cheapest, effectivePriceType)}
        </div>
        <div className="price-summary-row">
          <div>
            <div className="pump-digits" style={styles.pumpDigits}>
              {cheapest && Number.isFinite(odoPrice) ? (
                <>
                  <span>€ {odoPrice.toFixed(3).replace(".", ",")}</span>
                  <span style={styles.pumpUnit}>/L</span>
                </>
              ) : (
                <span style={{ opacity: 0.3, animation: status === "loading" ? "pulse 1.4s infinite" : "none" }}>
                  —,———
                </span>
              )}
            </div>
            {cheapest && (
              <div style={styles.pumpSub}>
                {cheapest.gestore} · {parseFloat(cheapest.distanza).toFixed(1)} km
                {parseStationDate(cheapest.data) && ` · ${formatRelativeTime(parseStationDate(cheapest.data))}`}
                {isStaleStation(cheapest) && <span style={styles.staleTagHero}>NON VERIFICATO</span>}
              </div>
            )}
          </div>
          {cheapest && (
            <NavigateButton
              station={cheapest}
              open={navOpen}
              onToggle={onToggleNav}
              onClose={onCloseNav}
              style={styles.btnNavigateHero}
            />
          )}
        </div>
      </div>
  );
}
