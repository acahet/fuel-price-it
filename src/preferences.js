// Thin wrapper over localStorage shared by every persisted preference (theme, favorite fuel,
// vehicle, ...). localStorage can throw in private-browsing modes on some browsers, so every
// access is guarded and persistence is simply skipped when it fails. Values read back are
// untrusted — callers must validate them.

export function readString(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — see top of file
  }
}

// null when missing, unreadable or not valid JSON.
export function readJson(key) {
  const raw = readString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(key, value) {
  writeString(key, JSON.stringify(value));
}
