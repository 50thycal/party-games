export type Location = { name: string; latitude: number; longitude: number };

export function isLocation(value: unknown): value is Location {
  if (!value || typeof value !== "object") return false;
  const place = value as Location;
  return typeof place.name === "string" && place.name.trim().length > 0 &&
    place.name.trim().length <= 80 && Number.isFinite(place.latitude) &&
    Math.abs(place.latitude) < 90 && Number.isFinite(place.longitude) &&
    Math.abs(place.longitude) <= 180;
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

/** Initial great-circle azimuth, clockwise from true north, on a spherical Earth. */
export function initialBearing(from: Location, to: Location): number | null {
  const radians = Math.PI / 180;
  const a = from.latitude * radians;
  const b = to.latitude * radians;
  const d = (to.longitude - from.longitude) * radians;
  const y = Math.sin(d) * Math.cos(b);
  const x = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d);
  // Coincident and antipodal points have no unique initial bearing.
  if (Math.hypot(x, y) < 1e-10) return null;
  return normalizeDegrees(Math.atan2(y, x) / radians);
}

export function angularError(guess: number, answer: number): number {
  const difference = Math.abs(normalizeDegrees(guess) - normalizeDegrees(answer));
  return Math.min(difference, 360 - difference);
}

export function compassDirection(degrees: number): string {
  return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][
    Math.round(normalizeDegrees(degrees) / 22.5) % 16
  ];
}
