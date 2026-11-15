import { ArrowRight } from "lucide-react";
import { mapLinks } from "../formatters.js";
import { styles } from "../styles.js";

export function NavigateButton({ station, open, onToggle, onClose, style }) {
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
