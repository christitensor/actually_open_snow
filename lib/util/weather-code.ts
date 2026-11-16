// WMO weather interpretation codes, as returned in Open-Meteo `weather_code`.
// Emoji keep this dependency- and asset-free; they render slightly
// differently per platform, which is fine for an at-a-glance icon.
export function describeWeather(code: number, night = false): { icon: string; label: string } {
  if (code === 0) return night ? { icon: "🌙", label: "Clear" } : { icon: "☀️", label: "Sunny" };
  if (code === 1) return night ? { icon: "🌙", label: "Mostly clear" } : { icon: "🌤️", label: "Mostly sunny" };
  if (code === 2) return night ? { icon: "☁️", label: "Partly cloudy" } : { icon: "⛅", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code === 66 || code === 67) return { icon: "🧊", label: "Freezing rain" };
  if (code >= 61 && code <= 65) return { icon: "🌧️", label: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "🌦️", label: "Showers" };
  if (code === 85 || code === 86) return { icon: "🌨️", label: "Snow showers" };
  if (code >= 95) return { icon: "⛈️", label: "Thunderstorms" };
  return { icon: "·", label: "—" };
}
