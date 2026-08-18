const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function degToCompass(deg: number): string {
  return COMPASS_POINTS[Math.round(deg / 22.5) % 16];
}
