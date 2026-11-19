import { AlertCircle } from "lucide-react";
import { styles } from "../styles.js";

// Notices above the station list: lookup failed, location missing, or nothing nearby.
export function ResultsNotices({ status, locStatus, stations, currentLabel, otherLabel, otherType, radius, priceAvailability, onRetry }) {
  return (
    <>
    {status === "error" && (
      <div style={styles.errorBox}>
        <AlertCircle size={16} color="var(--warning)" />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Il servizio dati non risponde</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            I dati ufficiali MIMIT usati da questa app potrebbero essere temporaneamente
            irraggiungibili. Riprova tra poco, oppure consulta{" "}
            <a href="https://carburanti.mise.gov.it" target="_blank" rel="noreferrer" style={{ color: "var(--primary-text)" }}>
              l'Osservaprezzi ufficiale
            </a>
            .
          </div>
        </div>
      </div>
    )}

    {locStatus === "denied" && (
      <div style={{ ...styles.errorBox, marginBottom: 10 }}>
        <AlertCircle size={16} color="var(--warning)" />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Ci dispiace, ci serve la tua posizione</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
            Non è stato possibile ottenere la posizione attuale (permesso negato, timeout o sensore non
            disponibile). Senza la tua posizione non possiamo cercare i distributori vicino a te — per
            evitare risultati fuorvianti non usiamo una località predefinita.
          </div>
          <button onClick={onRetry} style={styles.retryBtn}>
            Riprova
          </button>
        </div>
      </div>
    )}

    {status === "ok" && stations.length === 0 && (
      <div style={styles.emptyBox}>
        Nessun distributore {currentLabel} trovato entro {radius} km.
        {priceAvailability[otherType]
          ? ` Prova a passare a ${otherLabel}.`
          : " Prova ad ampliare il raggio di ricerca."}
      </div>
    )}
    </>
  );
}
