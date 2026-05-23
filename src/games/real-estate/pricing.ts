/**
 * Deterministic price-drift formula shared by client and server.
 *
 * Both the client (for live animation) and the server (for the authoritative
 * buy-time price) call getCurrentPrice with the same listing + current time
 * and get the same result.
 */

export type DriftableListing = {
  basePrice: number;
  listedAt: number; // ms epoch
  driftSeed: number; // 0..1
};

const PRICE_FLOOR_FACTOR = 0.5;
const PRICE_CEIL_FACTOR = 1.4;

export function getCurrentPrice(listing: DriftableListing, nowMs: number): number {
  const t = Math.max(0, (nowMs - listing.listedAt) / 1000);
  const seed = listing.driftSeed * 2 * Math.PI;

  // Two sine waves at different frequencies produce a more "marketlike" drift.
  const wobble =
    Math.sin(t * 0.35 + seed) * 0.14 +
    Math.sin(t * 0.95 + seed * 2.3) * 0.07;

  // Very slight downward drift rewards patience without making "wait forever" optimal.
  const trend = -0.0015 * t;

  const factor = 1 + wobble + trend;
  const clamped = Math.max(PRICE_FLOOR_FACTOR, Math.min(PRICE_CEIL_FACTOR, factor));
  return Math.max(1, Math.round(listing.basePrice * clamped));
}
