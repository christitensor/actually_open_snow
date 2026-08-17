// FC-08: wet-bulb temperature, used by resorts for snowmaking calls.
// Stull (2011) approximation — accurate to ~1°C across normal winter
// ranges, doesn't require barometric pressure like the psychrometric
// formula does. https://doi.org/10.1175/JAMC-D-11-0143.1

export function wetBulbF(temperatureF: number, relativeHumidityPct: number): number {
  const tC = ((temperatureF - 32) * 5) / 9;
  const rh = relativeHumidityPct;

  const twC =
    tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;

  return (twC * 9) / 5 + 32;
}
