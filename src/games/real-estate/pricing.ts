/**
 * Deterministic price-drift formula shared by client and server.
 *
 * Both the client (for live animation) and the server (for the authoritative
 * buy-time price) call getCurrentPrice with the same listing + current time
 * and get the same result.
 *
 * Prices are quantized to PRICE_TICK_MS so the value snaps to a new step
 * on tick boundaries instead of drifting continuously.
 */

export const PRICE_TICK_MS = 5000;

export type DriftableListing = {
  basePrice: number;
  listedAt: number; // ms epoch
  driftSeed: number; // 0..1
};

const PRICE_FLOOR_FACTOR = 0.55;
const PRICE_CEIL_FACTOR = 1.35;

function priceAtSeconds(listing: DriftableListing, tSec: number): number {
  const seed = listing.driftSeed * 2 * Math.PI;

  // Slower wobble: primary period ~60s, secondary ~25s.
  const wobble =
    Math.sin(tSec * 0.105 + seed) * 0.16 +
    Math.sin(tSec * 0.25 + seed * 2.3) * 0.08;

  // Slight downward drift rewards patience without making "wait forever" optimal.
  const trend = -0.0015 * tSec;

  const factor = 1 + wobble + trend;
  const clamped = Math.max(PRICE_FLOOR_FACTOR, Math.min(PRICE_CEIL_FACTOR, factor));
  return Math.max(1, Math.round(listing.basePrice * clamped));
}

/**
 * Quantized current price — held constant across each PRICE_TICK_MS window.
 */
export function getCurrentPrice(listing: DriftableListing, nowMs: number): number {
  const elapsedMs = Math.max(0, nowMs - listing.listedAt);
  const tickSec = Math.floor(elapsedMs / PRICE_TICK_MS) * (PRICE_TICK_MS / 1000);
  return priceAtSeconds(listing, tickSec);
}

/**
 * Ms remaining until the next price tick for this listing.
 */
export function msUntilNextTick(listing: DriftableListing, nowMs: number): number {
  const elapsedMs = Math.max(0, nowMs - listing.listedAt);
  const intoTick = elapsedMs % PRICE_TICK_MS;
  return PRICE_TICK_MS - intoTick;
}
