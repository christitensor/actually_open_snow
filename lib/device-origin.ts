// The viewer's precise location, once they've shared it (the "My location"
// button or the list's "Use precise location"): kept on this device only,
// so the home list's distances use it on later visits without asking again.

const KEY = "aos:device-origin";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export function readDeviceOrigin(): { lat: number; lon: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { lat: number; lon: number; at: number };
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon) || Date.now() - v.at > MAX_AGE_MS) return null;
    return { lat: v.lat, lon: v.lon };
  } catch {
    return null;
  }
}

export function saveDeviceOrigin(lat: number, lon: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lat, lon, at: Date.now() }));
  } catch {
    // Private mode / blocked storage: distances just fall back to the approximate origin.
  }
}

/** Asks the browser for a position (prompts the first time). Resolves null on denial or timeout. */
export function requestDeviceOrigin(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        saveDeviceOrigin(lat, lon);
        resolve({ lat, lon });
      },
      () => resolve(null),
      { timeout: 10_000, maximumAge: 10 * 60_000 }
    );
  });
}
