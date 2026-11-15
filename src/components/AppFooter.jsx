import { formatRelativeTime } from "../formatters.js";
import { styles } from "../styles.js";

// Footer line with the latest report time, last refresh, and the data source.
export function AppFooter({ latestPriceUpdate, lastUpdated, manifest }) {
  return (
  <div className="app-footer" style={styles.footer}>
    {latestPriceUpdate && (
      <span className="footer-item">
        <strong>Ultimo prezzo comunicato</strong> {formatRelativeTime(latestPriceUpdate)} · {latestPriceUpdate.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    )}
    {lastUpdated && (
      <span className="footer-item">
        <strong>Ricerca aggiornata</strong> {lastUpdated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
      </span>
    )}
    <span className="footer-item">
      <strong>Fonte MIMIT</strong> estrazione giornaliera
      {manifest?.extraction ? ` · ${manifest.extraction.replace("Estrazione del ", "")}` : ""}
    </span>
  </div>
  );
}
