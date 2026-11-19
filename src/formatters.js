// Universal links (not maps:// / geo: custom schemes) so each also works as a plain
// web fallback when the corresponding app isn't installed, e.g. on desktop.
export function mapLinks(lat, lon) {
  return [
    { id: "google", label: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` },
    { id: "waze", label: "Waze", url: `https://waze.com/ul?ll=${lat}%2C${lon}&navigate=yes` },
    { id: "apple", label: "Apple Maps", url: `https://maps.apple.com/?daddr=${lat},${lon}` },
  ];
}

export function formatRelativeTime(date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "pochi istanti fa";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
}
