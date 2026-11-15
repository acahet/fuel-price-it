import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import { styles } from "../styles.js";

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

export function StationMap({ coords, stations, cheapest, onMarkerClick, className = "" }) {
  if (!coords) return null;
  return (
    <div className={`map-wrap ${className}`} style={styles.mapWrap}>
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
          pathOptions={{ color: "#FFFFFF", weight: 2, fillColor: "#17212B", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            La tua posizione
          </Tooltip>
        </CircleMarker>
        {stations.map((s, i) => {
          const isCheapest = s === cheapest;
          return (
            <CircleMarker
              key={`${s.id}-${s.self ? "self" : "servito"}`}
              center={[s.latitudine, s.longitudine]}
              radius={isCheapest ? 10 : 8}
              pathOptions={{
                color: "#FFFFFF",
                weight: 2,
                fillColor: isCheapest ? "#A8D94A" : "#16A89B",
                fillOpacity: 0.9,
              }}
              eventHandlers={{ click: () => onMarkerClick(i) }}
            >
              <Tooltip
                permanent
                direction="top"
                offset={[0, -8]}
                className={`price-marker ${isCheapest ? "price-marker--best" : ""}`}
              >
                € {s.prezzo.toFixed(3).replace(".", ",")}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
