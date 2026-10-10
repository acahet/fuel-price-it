// Decides how the IP-based lookup and the browser's GPS fix race each other. IP usually answers
// first and shows an approximate location straight away; GPS then upgrades it once, and IP never
// overwrites a GPS fix. The "no location" outcome only happens when both sources fail.
// Kept free of React so the rules can be unit tested; the caller passes in the state setters.

export function approximateLabel(city) {
  const cityPart = city ? ` (${city})` : "";
  return `Posizione approssimativa${cityPart}`;
}

export function createLocationRace({ onFix, onFailed }) {
  let gpsWon = false; // true once a real GPS fix has been applied — IP must never overwrite it after this
  let anyFix = false;
  let ipSettled = false;
  let gpsSettled = false;

  const failIfBothSettled = () => {
    if (!anyFix && ipSettled && gpsSettled) onFailed();
  };

  const applyFix = (coords, label) => {
    anyFix = true;
    onFix(coords, label);
  };

  return {
    // Result of the IP lookup (ipwho.is): { success, latitude, longitude, city }.
    ipResult(data) {
      ipSettled = true;
      if (!gpsWon && data.success) {
        applyFix({ lat: data.latitude, lon: data.longitude }, approximateLabel(data.city));
      } else {
        failIfBothSettled();
      }
    },

    // The IP request itself failed (network error, bad JSON).
    ipFailed() {
      ipSettled = true;
      failIfBothSettled();
    },

    gpsResult(coords) {
      gpsSettled = true;
      gpsWon = true;
      applyFix({ lat: coords.latitude, lon: coords.longitude }, "Posizione attuale");
    },

    // GPS was denied, timed out, or the browser has no geolocation.
    gpsFailed() {
      gpsSettled = true;
      failIfBothSettled();
    },
  };
}
