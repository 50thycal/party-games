"use client";

import { useEffect, useRef, useState } from "react";
import type { GameViewProps } from "@/games/views";
import {
  HOUSE_CATEGORIES,
  REAL_ESTATE_CONFIG,
  type HouseCategory,
  type Listing,
  type RealEstateLogEntry,
  type RealEstateState,
} from "./config";
import { getCurrentPrice, PRICE_TICK_MS } from "./pricing";

const CATEGORY_LABEL: Record<HouseCategory, string> = {
  condo: "Condo",
  suburban: "Suburban",
  mansion: "Mansion",
  waterfront: "Waterfront",
};

const CATEGORY_EMOJI: Record<HouseCategory, string> = {
  condo: "🏢",
  suburban: "🏡",
  mansion: "🏰",
  waterfront: "🌊",
};

const CATEGORY_ACCENT: Record<HouseCategory, string> = {
  condo: "border-cyan-700 bg-cyan-950/40",
  suburban: "border-emerald-700 bg-emerald-950/40",
  mansion: "border-amber-700 bg-amber-950/40",
  waterfront: "border-blue-700 bg-blue-950/40",
};

// Tick the local clock for the turn countdown and the next-price-tick indicator.
// 250ms is enough — prices only step every PRICE_TICK_MS, and the countdown is
// in whole seconds.
function useLiveClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function RealEstateGameView({
  state,
  room,
  playerId,
  isHost,
  dispatchAction,
}: GameViewProps<RealEstateState>) {
  const game = state as RealEstateState | null;
  const phase = game?.phase ?? "lobby";
  const now = useLiveClock(phase === "playing");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  // ---- LOBBY ----
  if (!game || phase === "lobby") {
    return (
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-2">Open House</h2>
        <p className="text-sm text-gray-400 mb-4">
          The market is live. Prices drift in real time across {" "}
          {HOUSE_CATEGORIES.length} categories. On your turn, buy a listing at the
          current price, or pass. Everyone draws from one shared bank — every
          purchase makes the next round harder for the whole table. Game ends
          when the listings run out or the bank can&apos;t afford the cheapest
          house. Highest profit (true value − price paid) wins.
        </p>
        {isHost ? (
          <button
            onClick={async () => {
              setPendingActionId("start");
              try {
                await dispatchAction("START_GAME");
              } finally {
                setPendingActionId(null);
              }
            }}
            disabled={pendingActionId !== null || room.players.length < 2}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {pendingActionId === "start"
              ? "Starting…"
              : room.players.length < 2
                ? "Need at least 2 players"
                : "Start Game"}
          </button>
        ) : (
          <p className="text-sm text-gray-500">
            Waiting for the host to start the game…
          </p>
        )}
      </section>
    );
  }

  // ---- RESULTS ----
  if (phase === "results") {
    const scores = game.scores ?? {};
    const winnerId = game.winnerId;
    const sorted = [...room.players].sort(
      (a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0)
    );
    return (
      <>
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Final Results</h2>
          {winnerId && (
            <div className="text-center py-4 bg-green-900/30 border border-green-700 rounded-lg mb-4">
              <p className="text-gray-400 text-sm mb-1">Winner</p>
              <p className="text-2xl font-bold text-green-400">
                {game.players[winnerId]?.name ?? "—"}
                {winnerId === playerId && " (You!)"}
              </p>
              <p className="text-gray-300 text-sm mt-1">
                Profit: ${scores[winnerId] ?? 0}
              </p>
            </div>
          )}
          <ul className="space-y-3">
            {sorted.map((p) => {
              const ps = game.players[p.id];
              if (!ps) return null;
              return (
                <li
                  key={p.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-3"
                >
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="font-semibold">
                      {p.name}
                      {p.id === playerId && " (You)"}
                    </span>
                    <span
                      className={`text-lg font-bold ${
                        (scores[p.id] ?? 0) >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      ${scores[p.id] ?? 0}
                    </span>
                  </div>
                  {ps.houses.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      No houses purchased
                    </p>
                  ) : (
                    <ul className="text-xs space-y-1">
                      {ps.houses.map((h) => (
                        <li
                          key={h.id}
                          className="flex justify-between text-gray-300"
                        >
                          <span>
                            {CATEGORY_EMOJI[h.category]}{" "}
                            {CATEGORY_LABEL[h.category]}
                          </span>
                          <span className="text-gray-400">
                            Paid ${h.pricePaid} · Worth ${h.trueValue} ·
                            <span
                              className={
                                h.trueValue - h.pricePaid >= 0
                                  ? " text-green-400"
                                  : " text-red-400"
                              }
                            >
                              {" "}
                              {h.trueValue - h.pricePaid >= 0 ? "+" : ""}
                              {h.trueValue - h.pricePaid}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {isHost && (
          <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <button
              onClick={async () => {
                setPendingActionId("again");
                try {
                  await dispatchAction("PLAY_AGAIN");
                } finally {
                  setPendingActionId(null);
                }
              }}
              disabled={pendingActionId !== null}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {pendingActionId === "again" ? "Resetting…" : "Play Again"}
            </button>
          </section>
        )}
      </>
    );
  }

  // ---- PLAYING ----
  const activePlayerId = game.playerOrder[game.currentTurnIndex];
  const activePlayer = game.players[activePlayerId];
  const isMyTurn = activePlayerId === playerId;
  const cashFrac = game.initialCashPool > 0
    ? Math.max(0, game.cashPool / game.initialCashPool)
    : 0;
  const myHouses = game.players[playerId]?.houses ?? [];

  // Turn timer
  const turnDeadline = game.turnStartedAt + REAL_ESTATE_CONFIG.TURN_TIMEOUT_MS;
  const msLeft = Math.max(0, turnDeadline - now);
  const secondsLeft = Math.ceil(msLeft / 1000);
  const timeoutFiredFor = useRef<number>(0);
  useEffect(() => {
    // Only the active player's client auto-fires the timeout so the room doesn't
    // get spammed. Server validates the deadline regardless.
    if (!isMyTurn) return;
    if (msLeft > 0) return;
    if (timeoutFiredFor.current === game.turnStartedAt) return;
    timeoutFiredFor.current = game.turnStartedAt;
    dispatchAction("TURN_TIMEOUT").catch(() => {
      // If it fails (turn already advanced), let the next poll resync state.
    });
  }, [isMyTurn, msLeft, game.turnStartedAt, dispatchAction]);

  return (
    <>
      {/* Shared bank */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-baseline mb-2">
          <h2 className="text-sm font-semibold text-gray-300">Shared Bank</h2>
          <span className="text-xl font-bold text-green-400">
            ${game.cashPool}
            <span className="text-xs text-gray-500 font-normal">
              {" "}
              / ${game.initialCashPool}
            </span>
          </span>
        </div>
        <div className="w-full bg-gray-900 h-2 rounded overflow-hidden">
          <div
            className={`h-full transition-all ${
              cashFrac > 0.5
                ? "bg-green-500"
                : cashFrac > 0.25
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${cashFrac * 100}%` }}
          />
        </div>
        {cashFrac <= 0.25 && (
          <p className="text-xs text-red-400 mt-2">⚠ Market closing soon</p>
        )}
      </section>

      {/* Turn indicator */}
      <section
        className={`border rounded-lg p-3 mb-4 ${
          isMyTurn
            ? "bg-blue-900/40 border-blue-600"
            : "bg-gray-800 border-gray-700"
        }`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">
              Current Turn
            </p>
            <p
              className={`text-lg font-bold ${
                isMyTurn ? "text-blue-300" : "text-gray-200"
              }`}
            >
              {isMyTurn
                ? "Your Turn"
                : activePlayer
                  ? `${activePlayer.name}'s turn`
                  : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">
              Time
            </p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                secondsLeft <= 5
                  ? "text-red-400"
                  : secondsLeft <= 10
                    ? "text-yellow-300"
                    : "text-gray-200"
              }`}
            >
              {secondsLeft}s
            </p>
          </div>
        </div>
        <div className="mt-2 w-full bg-gray-900 h-1 rounded overflow-hidden">
          <div
            className={`h-full ${
              secondsLeft <= 5
                ? "bg-red-500"
                : secondsLeft <= 10
                  ? "bg-yellow-500"
                  : "bg-blue-500"
            }`}
            style={{
              width: `${(msLeft / REAL_ESTATE_CONFIG.TURN_TIMEOUT_MS) * 100}%`,
            }}
          />
        </div>
      </section>

      {/* Market */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Live Market</h2>
          <span className="text-xs text-gray-500">
            {game.deck.length} listing{game.deck.length === 1 ? "" : "s"} in the
            pipeline
          </span>
        </div>
        {game.market.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No listings on the market.
          </p>
        ) : (
          <ul className="space-y-3">
            {game.market.map((listing) => (
              <MarketListing
                key={listing.id}
                listing={listing}
                now={now}
                cashPool={game.cashPool}
                isMyTurn={isMyTurn}
                pendingActionId={pendingActionId}
                onBuy={async () => {
                  setPendingActionId(`buy-${listing.id}`);
                  try {
                    await dispatchAction("BUY_HOUSE", {
                      listingId: listing.id,
                    });
                  } finally {
                    setPendingActionId(null);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Pass button */}
      {isMyTurn && (
        <section className="mb-4">
          <button
            onClick={async () => {
              setPendingActionId("pass");
              try {
                await dispatchAction("PASS");
              } finally {
                setPendingActionId(null);
              }
            }}
            disabled={pendingActionId !== null}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            {pendingActionId === "pass" ? "Passing…" : "Pass"}
          </button>
        </section>
      )}

      {/* My portfolio */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-2">
          Your Portfolio
        </h2>
        {myHouses.length === 0 ? (
          <p className="text-xs text-gray-500">No houses yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {myHouses.map((h) => (
              <li
                key={h.id}
                className="flex justify-between py-1 px-2 bg-gray-900 rounded"
              >
                <span>
                  {CATEGORY_EMOJI[h.category]} {CATEGORY_LABEL[h.category]}
                </span>
                <span className="text-gray-400">Paid ${h.pricePaid}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Other players brief */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-2">Players</h2>
        <ul className="space-y-1 text-xs">
          {game.playerOrder.map((pid, idx) => {
            const p = game.players[pid];
            if (!p) return null;
            const isActive = idx === game.currentTurnIndex;
            return (
              <li
                key={pid}
                className={`flex justify-between py-1 px-2 rounded ${
                  isActive ? "bg-blue-900/40" : "bg-gray-900"
                }`}
              >
                <span>
                  {isActive && "▶ "}
                  {p.name}
                  {pid === playerId && " (You)"}
                </span>
                <span className="text-gray-400">
                  {p.houses.length} house
                  {p.houses.length === 1 ? "" : "s"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Activity log */}
      {game.log.length > 0 && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-2">
            Recent Activity
          </h2>
          <ul className="space-y-1 text-xs">
            {game.log.slice().reverse().slice(0, 8).map((entry, i) => (
              <li key={i} className="text-gray-400">
                {formatLogEntry(entry, game)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function MarketListing({
  listing,
  now,
  cashPool,
  isMyTurn,
  pendingActionId,
  onBuy,
}: {
  listing: Listing;
  now: number;
  cashPool: number;
  isMyTurn: boolean;
  pendingActionId: string | null;
  onBuy: () => void;
}) {
  const price = getCurrentPrice(listing, now);
  const canAfford = price <= cashPool;
  const buying = pendingActionId === `buy-${listing.id}`;
  const elapsed = Math.max(0, now - listing.listedAt);
  const intoTick = elapsed % PRICE_TICK_MS;
  const secondsToNextTick = Math.max(
    1,
    Math.ceil((PRICE_TICK_MS - intoTick) / 1000)
  );
  return (
    <li
      className={`border rounded-lg p-3 ${
        CATEGORY_ACCENT[listing.category]
      }`}
    >
      <div className="flex justify-between items-center">
        <div>
          <p className="font-semibold text-sm">
            {CATEGORY_EMOJI[listing.category]} {CATEGORY_LABEL[listing.category]}
          </p>
          <p className="text-xs text-gray-400">
            Listed at ${listing.basePrice} · next price in {secondsToNextTick}s
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">
            ${price}
          </p>
          <PriceDelta listing={listing} now={now} />
        </div>
      </div>
      {isMyTurn && (
        <button
          onClick={onBuy}
          disabled={pendingActionId !== null || !canAfford}
          className="mt-3 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-3 rounded transition-colors"
        >
          {buying
            ? "Buying…"
            : !canAfford
              ? "Bank too low"
              : `Buy for $${price}`}
        </button>
      )}
    </li>
  );
}

function PriceDelta({ listing, now }: { listing: Listing; now: number }) {
  // Show change from the previous tick. With quantized pricing this is the
  // last step direction and stays stable across the whole current tick window.
  const current = getCurrentPrice(listing, now);
  const previous = getCurrentPrice(listing, now - PRICE_TICK_MS);
  const delta = current - previous;
  if (delta === 0) {
    return <p className="text-xs text-gray-500">→ steady</p>;
  }
  return (
    <p
      className={`text-xs ${
        delta < 0 ? "text-green-400" : "text-red-400"
      }`}
    >
      {delta < 0 ? "▼" : "▲"} {Math.abs(delta)}
    </p>
  );
}

function formatLogEntry(
  entry: RealEstateLogEntry,
  game: RealEstateState
): string {
  if (entry.type === "buy") {
    const name = game.players[entry.playerId]?.name ?? "Someone";
    return `${name} bought a ${CATEGORY_LABEL[entry.category]} for $${entry.pricePaid}`;
  }
  if (entry.type === "pass") {
    const name = game.players[entry.playerId]?.name ?? "Someone";
    return entry.auto ? `${name} ran out of time` : `${name} passed`;
  }
  if (entry.type === "round_ended") {
    return entry.reason === "cash_depleted"
      ? "Bank ran out — market closed"
      : "Listings exhausted — market closed";
  }
  return "";
}
