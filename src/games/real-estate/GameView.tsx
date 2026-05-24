"use client";

import { useEffect, useRef, useState } from "react";
import type { GameViewProps } from "@/games/views";
import {
  cumulativeScores,
  DEFAULT_SETTINGS,
  HOUSE_CATEGORIES,
  SETTINGS_BOUNDS,
  type HouseCategory,
  type Listing,
  type OwnedHouse,
  type RealEstateLogEntry,
  type RealEstateSettings,
  type RealEstateState,
  type RoundSnapshot,
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
  const timeoutFiredFor = useRef<number>(0);

  // Turn-timer values are derived here so the auto-timeout effect below can
  // sit above the early returns (Rules of Hooks).
  const activePlayerIdForTimer =
    game && phase === "playing"
      ? game.playerOrder[game.currentTurnIndex]
      : null;
  const isMyTurnForTimer =
    activePlayerIdForTimer !== null && activePlayerIdForTimer === playerId;
  const turnStartedAt = game?.turnStartedAt ?? 0;
  const turnTimeoutMs =
    game?.settings?.turnTimeoutMs ?? DEFAULT_SETTINGS.turnTimeoutMs;
  const msLeft =
    phase === "playing"
      ? Math.max(0, turnStartedAt + turnTimeoutMs - now)
      : turnTimeoutMs;

  useEffect(() => {
    // Only the active player's client auto-fires the timeout so the room doesn't
    // get spammed. Server validates the deadline regardless.
    if (phase !== "playing") return;
    if (!isMyTurnForTimer) return;
    if (msLeft > 0) return;
    if (timeoutFiredFor.current === turnStartedAt) return;
    timeoutFiredFor.current = turnStartedAt;
    dispatchAction("TURN_TIMEOUT").catch(() => {
      // If it fails (turn already advanced), let the next poll resync state.
    });
  }, [phase, isMyTurnForTimer, msLeft, turnStartedAt, dispatchAction]);

  // ---- LOBBY ----
  if (!game || phase === "lobby") {
    const settings = game?.settings ?? DEFAULT_SETTINGS;
    const turnSeconds = Math.round(settings.turnTimeoutMs / 1000);
    return (
      <>
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-4">
          <h2 className="font-semibold mb-2">Open House</h2>
          <p className="text-sm text-gray-400 mb-4">
            The market is live. Prices drift across {" "}
            {HOUSE_CATEGORIES.length} categories — every 5 seconds they step to a
            new value. On your turn ({turnSeconds}s), pick one action:{" "}
            <strong>buy</strong> a listing at the current price,{" "}
            <strong>inspect</strong> one to privately reveal its true value, or{" "}
            <strong>pass</strong>. The table shares one bank and one pool of
            inspectors, so every move makes things tighter for everyone. Game
            ends when the listings run out or the bank can&apos;t afford the
            cheapest house. Highest profit (true value − price paid) wins.
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

        <SettingsPanel
          settings={settings}
          isHost={isHost}
          disabled={pendingActionId !== null}
          dispatchAction={dispatchAction}
        />
      </>
    );
  }

  // ---- RESULTS ----
  // ---- ROUND RESULTS (between rounds) ----
  if (phase === "round_results") {
    const snapshot = game.roundHistory[game.roundHistory.length - 1];
    if (!snapshot) return null;
    const totals = cumulativeScores(game.roundHistory);
    const sortedRound = [...room.players].sort(
      (a, b) =>
        (snapshot.players[b.id]?.score ?? 0) -
        (snapshot.players[a.id]?.score ?? 0)
    );
    const reasonText =
      snapshot.endedBecause === "deck_empty"
        ? "All houses sold."
        : "Bank ran dry.";
    return (
      <>
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Round {snapshot.round} of {game.totalRounds}
          </p>
          <h2 className="text-xl font-bold mb-1">Round Complete</h2>
          <p className="text-sm text-gray-400">{reasonText}</p>
        </section>

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            This round
          </h3>
          <ul className="space-y-3">
            {sortedRound.map((p, idx) => {
              const ps = snapshot.players[p.id];
              if (!ps) return null;
              return (
                <PlayerRoundRow
                  key={p.id}
                  rank={idx + 1}
                  name={p.name}
                  isMe={p.id === playerId}
                  score={ps.score}
                  houses={ps.houses}
                />
              );
            })}
          </ul>
        </section>

        <RunningTotalsCard
          players={room.players}
          totals={totals}
          throughRound={snapshot.round}
          totalRounds={game.totalRounds}
          playerId={playerId}
        />

        {isHost ? (
          <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
            <button
              onClick={async () => {
                setPendingActionId("next-round");
                try {
                  await dispatchAction("NEXT_ROUND");
                } finally {
                  setPendingActionId(null);
                }
              }}
              disabled={pendingActionId !== null}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {pendingActionId === "next-round"
                ? "Starting…"
                : `Start Round ${snapshot.round + 1}`}
            </button>
          </section>
        ) : (
          <p className="text-sm text-gray-500 text-center mb-6">
            Waiting for the host to start round {snapshot.round + 1}…
          </p>
        )}
      </>
    );
  }

  if (phase === "results") {
    const totals = game.scores ?? cumulativeScores(game.roundHistory);
    const winnerId = game.winnerId;
    const sorted = [...room.players].sort(
      (a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0)
    );
    return (
      <>
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-4">
          <h2 className="font-semibold mb-4">Final Results</h2>
          {winnerId && (
            <div className="text-center py-4 bg-green-900/30 border border-green-700 rounded-lg mb-4">
              <p className="text-gray-400 text-sm mb-1">Winner</p>
              <p className="text-2xl font-bold text-green-400">
                {room.players.find((p) => p.id === winnerId)?.name ?? "—"}
                {winnerId === playerId && " (You!)"}
              </p>
              <p className="text-gray-300 text-sm mt-1">
                Total profit: ${totals[winnerId] ?? 0}
              </p>
            </div>
          )}
          <ul className="space-y-2">
            {sorted.map((p, idx) => (
              <li
                key={p.id}
                className={`flex items-baseline justify-between bg-gray-900 border rounded-lg px-3 py-2 ${
                  p.id === winnerId
                    ? "border-green-700"
                    : "border-gray-800"
                }`}
              >
                <span className="font-semibold">
                  <span className="text-gray-500 text-sm mr-2">
                    {idx + 1}.
                  </span>
                  {p.name}
                  {p.id === playerId && " (You)"}
                </span>
                <span
                  className={`text-lg font-bold ${
                    (totals[p.id] ?? 0) >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  ${totals[p.id] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {game.roundHistory.length > 1 && (
          <RoundBreakdownTable
            players={room.players}
            history={game.roundHistory}
            playerId={playerId}
          />
        )}

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
  const myInspections = new Set(game.inspections[playerId] ?? []);
  const secondsLeft = Math.ceil(msLeft / 1000);

  return (
    <>
      {/* Round indicator */}
      {game.totalRounds > 1 && (
        <div className="flex justify-between items-baseline mb-3 px-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Round {game.currentRound} of {game.totalRounds}
          </span>
          {game.roundHistory.length > 0 && (
            <span className="text-xs text-gray-500">
              You so far: $
              {cumulativeScores(game.roundHistory)[playerId] ?? 0}
            </span>
          )}
        </div>
      )}

      {/* Shared resources: bank + inspectors */}
      <section className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <div className="flex justify-between items-baseline mb-2">
            <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              Bank
            </h2>
            <span className="text-lg font-bold text-green-400 tabular-nums">
              ${game.cashPool}
              <span className="text-xs text-gray-500 font-normal">
                {" "}/ ${game.initialCashPool}
              </span>
            </span>
          </div>
          <div className="w-full bg-gray-900 h-1.5 rounded overflow-hidden">
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
            <p className="text-[10px] text-red-400 mt-1">⚠ Closing soon</p>
          )}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <div className="flex justify-between items-baseline mb-2">
            <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              Inspectors
            </h2>
            <span className="text-lg font-bold text-purple-300 tabular-nums">
              👁 {game.inspectorPool}
              <span className="text-xs text-gray-500 font-normal">
                {" "}/ {game.initialInspectorPool}
              </span>
            </span>
          </div>
          <div className="w-full bg-gray-900 h-1.5 rounded overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{
                width: `${
                  game.initialInspectorPool > 0
                    ? (game.inspectorPool / game.initialInspectorPool) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          {game.inspectorPool === 0 && (
            <p className="text-[10px] text-red-400 mt-1">⚠ Pool empty</p>
          )}
        </div>
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
              width: `${(msLeft / turnTimeoutMs) * 100}%`,
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
            {game.market.map((listing) => {
              const inspectorsOnThis = Object.entries(game.inspections)
                .filter(([, ids]) => ids.includes(listing.id))
                .map(([pid]) => game.players[pid]?.name ?? "?");
              const iInspected = myInspections.has(listing.id);
              const canInspect = game.inspectorPool > 0 && !iInspected;
              return (
                <MarketListing
                  key={listing.id}
                  listing={listing}
                  now={now}
                  cashPool={game.cashPool}
                  isMyTurn={isMyTurn}
                  pendingActionId={pendingActionId}
                  iInspected={iInspected}
                  inspectorsOnThis={inspectorsOnThis}
                  canInspect={canInspect}
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
                  onInspect={async () => {
                    setPendingActionId(`inspect-${listing.id}`);
                    try {
                      await dispatchAction("INSPECT", {
                        listingId: listing.id,
                      });
                    } finally {
                      setPendingActionId(null);
                    }
                  }}
                />
              );
            })}
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

type SettingFieldKey = keyof RealEstateSettings;

const SETTING_FIELDS: ReadonlyArray<{
  key: SettingFieldKey;
  label: string;
  // For display + edit only. Internal storage may differ (e.g. turnTimeoutMs).
  toDisplay: (v: number) => number;
  fromDisplay: (v: number) => number;
  displayMin: number;
  displayMax: number;
  suffix?: string;
  step?: number;
  help?: string;
}> = [
  {
    key: "startingCashPerPlayer",
    label: "Starting cash per player",
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    displayMin: SETTINGS_BOUNDS.startingCashPerPlayer.min,
    displayMax: SETTINGS_BOUNDS.startingCashPerPlayer.max,
    suffix: "$",
    step: 10,
  },
  {
    key: "startingInspectors",
    label: "Inspectors",
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    displayMin: SETTINGS_BOUNDS.startingInspectors.min,
    displayMax: SETTINGS_BOUNDS.startingInspectors.max,
    step: 1,
    help: "0 disables inspection",
  },
  {
    key: "turnTimeoutMs",
    label: "Turn time",
    toDisplay: (v) => Math.round(v / 1000),
    fromDisplay: (v) => v * 1000,
    displayMin: Math.round(SETTINGS_BOUNDS.turnTimeoutMs.min / 1000),
    displayMax: Math.round(SETTINGS_BOUNDS.turnTimeoutMs.max / 1000),
    suffix: "s",
    step: 1,
  },
  {
    key: "marketSize",
    label: "Listings visible",
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    displayMin: SETTINGS_BOUNDS.marketSize.min,
    displayMax: SETTINGS_BOUNDS.marketSize.max,
    step: 1,
  },
  {
    key: "deckSize",
    label: "Houses in deck",
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    displayMin: SETTINGS_BOUNDS.deckSize.min,
    displayMax: SETTINGS_BOUNDS.deckSize.max,
    step: 1,
    help: "Per round",
  },
  {
    key: "roundsTotal",
    label: "Rounds",
    toDisplay: (v) => v,
    fromDisplay: (v) => v,
    displayMin: SETTINGS_BOUNDS.roundsTotal.min,
    displayMax: SETTINGS_BOUNDS.roundsTotal.max,
    step: 1,
  },
];

function SettingsPanel({
  settings,
  isHost,
  disabled,
  dispatchAction,
}: {
  settings: RealEstateSettings;
  isHost: boolean;
  disabled: boolean;
  dispatchAction: (
    type: string,
    payload?: Record<string, unknown>
  ) => Promise<void>;
}) {
  // Local input state. Server is the source of truth — we mirror it and only
  // dispatch on commit (Enter / blur).
  const [draft, setDraft] = useState<Record<SettingFieldKey, string>>(() =>
    Object.fromEntries(
      SETTING_FIELDS.map((f) => [
        f.key,
        String(f.toDisplay(settings[f.key])),
      ])
    ) as Record<SettingFieldKey, string>
  );

  // If the server settings change (e.g. host edited from another device, or
  // PLAY_AGAIN restored), re-sync the draft.
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        SETTING_FIELDS.map((f) => [
          f.key,
          String(f.toDisplay(settings[f.key])),
        ])
      ) as Record<SettingFieldKey, string>
    );
  }, [settings]);

  async function commit(field: (typeof SETTING_FIELDS)[number], raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft((d) => ({
        ...d,
        [field.key]: String(field.toDisplay(settings[field.key])),
      }));
      return;
    }
    const clamped = Math.max(
      field.displayMin,
      Math.min(field.displayMax, Math.round(parsed))
    );
    const stored = field.fromDisplay(clamped);
    if (stored === settings[field.key]) {
      setDraft((d) => ({ ...d, [field.key]: String(clamped) }));
      return;
    }
    await dispatchAction("UPDATE_SETTINGS", {
      settings: { [field.key]: stored },
    });
  }

  async function resetDefaults() {
    await dispatchAction("UPDATE_SETTINGS", { settings: DEFAULT_SETTINGS });
  }

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="text-sm font-semibold text-gray-300">Game Settings</h2>
        {isHost && (
          <button
            onClick={resetDefaults}
            disabled={disabled}
            className="text-xs text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            Reset defaults
          </button>
        )}
      </div>
      {!isHost && (
        <p className="text-xs text-gray-500 mb-3">
          Only the host can change these.
        </p>
      )}
      <ul className="space-y-2">
        {SETTING_FIELDS.map((field) => {
          const displayed = field.toDisplay(settings[field.key]);
          return (
            <li
              key={field.key}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200">{field.label}</p>
                {field.help && (
                  <p className="text-[10px] text-gray-500">{field.help}</p>
                )}
              </div>
              {isHost ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={field.displayMin}
                    max={field.displayMax}
                    step={field.step ?? 1}
                    value={draft[field.key]}
                    disabled={disabled}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [field.key]: e.target.value }))
                    }
                    onBlur={(e) => {
                      void commit(field, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:border-blue-500"
                  />
                  {field.suffix && (
                    <span className="text-sm text-gray-400">
                      {field.suffix}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm font-semibold text-gray-200 tabular-nums">
                  {displayed}
                  {field.suffix ?? ""}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlayerRoundRow({
  rank,
  name,
  isMe,
  score,
  houses,
}: {
  rank: number;
  name: string;
  isMe: boolean;
  score: number;
  houses: OwnedHouse[];
}) {
  const bestBuy = houses.reduce<OwnedHouse | null>(
    (best, h) =>
      !best || h.trueValue - h.pricePaid > best.trueValue - best.pricePaid
        ? h
        : best,
    null
  );
  const worstBuy = houses.reduce<OwnedHouse | null>(
    (worst, h) =>
      !worst || h.trueValue - h.pricePaid < worst.trueValue - worst.pricePaid
        ? h
        : worst,
    null
  );
  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex justify-between items-baseline mb-2">
        <span className="font-semibold">
          <span className="text-gray-500 text-sm mr-2">{rank}.</span>
          {name}
          {isMe && " (You)"}
        </span>
        <span
          className={`text-lg font-bold tabular-nums ${
            score >= 0 ? "text-green-400" : "text-red-400"
          }`}
        >
          {score >= 0 ? "+" : ""}${score}
        </span>
      </div>
      {houses.length === 0 ? (
        <p className="text-xs text-gray-500">No houses bought this round</p>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-2">
            {houses.length} {houses.length === 1 ? "house" : "houses"}
            {bestBuy && bestBuy.trueValue - bestBuy.pricePaid > 0 && (
              <>
                {" · best steal: "}
                <span className="text-green-400">
                  {CATEGORY_EMOJI[bestBuy.category]} +$
                  {bestBuy.trueValue - bestBuy.pricePaid}
                </span>
              </>
            )}
            {worstBuy && worstBuy.trueValue - worstBuy.pricePaid < 0 && (
              <>
                {" · worst dud: "}
                <span className="text-red-400">
                  {CATEGORY_EMOJI[worstBuy.category]} $
                  {worstBuy.trueValue - worstBuy.pricePaid}
                </span>
              </>
            )}
          </p>
          <ul className="text-xs space-y-1">
            {houses.map((h) => {
              const margin = h.trueValue - h.pricePaid;
              return (
                <li
                  key={h.id}
                  className="flex justify-between text-gray-300"
                >
                  <span>
                    {CATEGORY_EMOJI[h.category]} {CATEGORY_LABEL[h.category]}
                  </span>
                  <span className="text-gray-400 tabular-nums">
                    ${h.pricePaid} → ${h.trueValue}
                    <span
                      className={
                        margin >= 0 ? " text-green-400" : " text-red-400"
                      }
                    >
                      {" "}
                      ({margin >= 0 ? "+" : ""}
                      {margin})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </li>
  );
}

function RunningTotalsCard({
  players,
  totals,
  throughRound,
  totalRounds,
  playerId,
}: {
  players: { id: string; name: string }[];
  totals: Record<string, number>;
  throughRound: number;
  totalRounds: number;
  playerId: string;
}) {
  const sorted = [...players].sort(
    (a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0)
  );
  const leaderScore = totals[sorted[0]?.id ?? ""] ?? 0;
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        After round {throughRound} of {totalRounds}
      </h3>
      <ul className="space-y-1">
        {sorted.map((p, idx) => {
          const total = totals[p.id] ?? 0;
          const isLeader = idx === 0 && total === leaderScore;
          return (
            <li
              key={p.id}
              className={`flex justify-between items-baseline px-2 py-1.5 rounded ${
                isLeader ? "bg-green-900/20" : ""
              }`}
            >
              <span className="text-sm">
                <span className="text-gray-500 mr-2">{idx + 1}.</span>
                {p.name}
                {p.id === playerId && " (You)"}
              </span>
              <span
                className={`font-bold tabular-nums ${
                  total >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                ${total}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RoundBreakdownTable({
  players,
  history,
  playerId,
}: {
  players: { id: string; name: string }[];
  history: RoundSnapshot[];
  playerId: string;
}) {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        Round-by-round
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-700">
              <th className="text-left py-2 pr-2 font-normal">Player</th>
              {history.map((h) => (
                <th
                  key={h.round}
                  className="text-right py-2 px-2 font-normal tabular-nums"
                >
                  R{h.round}
                </th>
              ))}
              <th className="text-right py-2 pl-2 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const total = history.reduce(
                (acc, h) => acc + (h.players[p.id]?.score ?? 0),
                0
              );
              return (
                <tr key={p.id} className="border-b border-gray-800 last:border-0">
                  <td className="py-2 pr-2">
                    {p.name}
                    {p.id === playerId && (
                      <span className="text-gray-500"> (You)</span>
                    )}
                  </td>
                  {history.map((h) => {
                    const s = h.players[p.id]?.score ?? 0;
                    return (
                      <td
                        key={h.round}
                        className={`text-right py-2 px-2 tabular-nums ${
                          s >= 0 ? "text-gray-300" : "text-red-400"
                        }`}
                      >
                        {s >= 0 ? "+" : ""}
                        {s}
                      </td>
                    );
                  })}
                  <td
                    className={`text-right py-2 pl-2 font-bold tabular-nums ${
                      total >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    ${total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MarketListing({
  listing,
  now,
  cashPool,
  isMyTurn,
  pendingActionId,
  iInspected,
  inspectorsOnThis,
  canInspect,
  onBuy,
  onInspect,
}: {
  listing: Listing;
  now: number;
  cashPool: number;
  isMyTurn: boolean;
  pendingActionId: string | null;
  iInspected: boolean;
  inspectorsOnThis: string[];
  canInspect: boolean;
  onBuy: () => void;
  onInspect: () => void;
}) {
  const price = getCurrentPrice(listing, now);
  const canAfford = price <= cashPool;
  const buying = pendingActionId === `buy-${listing.id}`;
  const inspecting = pendingActionId === `inspect-${listing.id}`;
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

      {/* Inspection: private value (only if you inspected) */}
      {iInspected && (
        <p className="mt-2 text-xs text-purple-300 bg-purple-950/40 border border-purple-800 rounded px-2 py-1">
          💎 True value: ${listing.trueValue}
        </p>
      )}

      {/* Inspection: public knowledge of WHO has inspected */}
      {inspectorsOnThis.length > 0 && (
        <p className="mt-1 text-[11px] text-gray-400">
          👁 Inspected by {inspectorsOnThis.join(", ")}
        </p>
      )}

      {isMyTurn && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onBuy}
            disabled={pendingActionId !== null || !canAfford}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-3 rounded transition-colors"
          >
            {buying
              ? "Buying…"
              : !canAfford
                ? "Bank too low"
                : `Buy $${price}`}
          </button>
          <button
            onClick={onInspect}
            disabled={pendingActionId !== null || !canInspect}
            className="bg-purple-700 hover:bg-purple-800 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-3 rounded transition-colors"
            title={
              iInspected
                ? "Already inspected"
                : !canInspect
                  ? "No inspectors left"
                  : "Reveal true value (uses 1 inspector + ends your turn)"
            }
          >
            {inspecting ? "…" : iInspected ? "👁 ✓" : "👁 Inspect"}
          </button>
        </div>
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
  if (entry.type === "inspect") {
    const name = game.players[entry.playerId]?.name ?? "Someone";
    return `${name} inspected a ${CATEGORY_LABEL[entry.category]}`;
  }
  if (entry.type === "round_ended") {
    return entry.reason === "cash_depleted"
      ? "Bank ran out — market closed"
      : "Listings exhausted — market closed";
  }
  return "";
}
