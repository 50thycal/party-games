"use client";

import type { GameViewProps } from "@/games/views";
import {
  SUPPLY_COST,
  CUSTOMER_ARCHETYPES,
  getCardArchetype,
  type CafeState,
  type CafePlayerState,
  type CustomerCard,
  type CafeUpgradeType,
  type SupplyType,
} from "./config";
import { useState } from "react";

export function CafeGameView({
  state,
  room,
  playerId,
  isHost,
  dispatchAction,
}: GameViewProps<CafeState>) {
  const [isLoading, setIsLoading] = useState(false);

  const gameState = state as CafeState;
  const phase = gameState?.phase ?? "lobby";
  const player = playerId ? gameState?.players?.[playerId] : null;

  async function dispatch(action: string, payload?: Record<string, unknown>) {
    setIsLoading(true);
    try {
      await dispatchAction(action, payload);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Round & Phase Header */}
      <header className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">Cafe</h1>
            <p className="text-gray-400 text-sm">
              Phase: <span className="text-white capitalize">{phase}</span>
              {phase !== "lobby" && phase !== "gameOver" && (
                <span className="ml-2">
                  | Round {gameState.round} of 5
                </span>
              )}
            </p>
          </div>
          {player && (
            <div className="text-right">
              <p className="text-yellow-400 font-bold">${player.money}</p>
              <p className="text-purple-400 text-sm">
                {player.prestige} prestige
              </p>
            </div>
          )}
        </div>
      </header>

      {/* Host Controls */}
      {isHost && <HostControls phase={phase} gameState={gameState} dispatch={dispatch} isLoading={isLoading} />}

      {/* Phase-specific content */}
      {phase === "lobby" && <LobbyView />}
      {phase === "planning" && player && (
        <PlanningView player={player} />
      )}
      {phase === "investment" && player && (
        <InvestmentView
          player={player}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "customerDraft" && player && (
        <CustomerDraftView
          gameState={gameState}
          player={player}
          playerId={playerId!}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "customerResolution" && (
        <CustomerResolutionView gameState={gameState} playerId={playerId!} />
      )}
      {phase === "cleanup" && player && (
        <CleanupView player={player} round={gameState.round} />
      )}
      {phase === "gameOver" && (
        <GameOverView gameState={gameState} playerId={playerId!} room={room} />
      )}

      {/* Player Status Grid */}
      {phase !== "lobby" && phase !== "gameOver" && (
        <PlayerStatusGrid
          players={gameState.players}
          playerOrder={gameState.playerOrder}
          currentPlayerId={playerId!}
        />
      )}
    </div>
  );
}

// =============================================================================
// HOST CONTROLS
// =============================================================================

function HostControls({
  phase,
  gameState,
  dispatch,
  isLoading,
}: {
  phase: string;
  gameState: CafeState;
  dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}) {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h2 className="font-semibold mb-3">Host Controls</h2>
      <div className="flex flex-wrap gap-2">
        {phase === "lobby" && (
          <button
            onClick={() => dispatch("START_GAME")}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Start Game
          </button>
        )}

        {phase === "planning" && (
          <button
            onClick={() => dispatch("END_PLANNING")}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Begin Investment Phase
          </button>
        )}

        {phase === "investment" && (
          <button
            onClick={() => dispatch("END_INVESTMENT")}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Start Customer Draft
          </button>
        )}

        {phase === "customerResolution" && (
          <button
            onClick={() => dispatch("RESOLVE_CUSTOMERS")}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Resolve & Collect Rewards
          </button>
        )}

        {phase === "cleanup" && (
          <button
            onClick={() => dispatch("END_ROUND")}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            End Round
          </button>
        )}

        {phase === "gameOver" && (
          <button
            onClick={() => dispatch("PLAY_AGAIN")}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Play Again
          </button>
        )}
      </div>
    </section>
  );
}

// =============================================================================
// PHASE VIEWS
// =============================================================================

function LobbyView() {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
      <h2 className="text-xl font-bold mb-2">Welcome to Cafe!</h2>
      <p className="text-gray-400">
        Draft customers and fulfill their orders. Buy supplies, take customers
        you can serve, and pass on ones you cannot!
      </p>
      <p className="text-gray-500 text-sm mt-4">
        Waiting for the host to start the game...
      </p>
    </section>
  );
}

function PlanningView({ player }: { player: CafePlayerState }) {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Planning Phase</h2>
      <p className="text-gray-400 mb-4">
        Review your resources before investing.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Supplies (Tier 1)</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Coffee Beans:</span>
              <span className="text-amber-400">{player.supplies.coffeeBeans}</span>
            </div>
            <div className="flex justify-between">
              <span>Tea:</span>
              <span className="text-green-400">{player.supplies.tea}</span>
            </div>
            <div className="flex justify-between">
              <span>Milk:</span>
              <span className="text-blue-200">{player.supplies.milk}</span>
            </div>
            <div className="flex justify-between">
              <span>Syrup:</span>
              <span className="text-pink-400">{player.supplies.syrup}</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Upgrades</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Seating:</span>
              <span>Lv.{player.upgrades.seating}</span>
            </div>
            <div className="flex justify-between">
              <span>Ambiance:</span>
              <span>Lv.{player.upgrades.ambiance}</span>
            </div>
            <div className="flex justify-between">
              <span>Equipment:</span>
              <span>Lv.{player.upgrades.equipment}</span>
            </div>
            <div className="flex justify-between">
              <span>Menu:</span>
              <span>Lv.{player.upgrades.menu}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Supply display configuration
const SUPPLY_INFO: Record<SupplyType, { label: string; color: string }> = {
  coffeeBeans: { label: "Coffee Beans", color: "text-amber-400" },
  tea: { label: "Tea", color: "text-green-400" },
  milk: { label: "Milk", color: "text-blue-200" },
  syrup: { label: "Syrup", color: "text-pink-400" },
};

function InvestmentView({
  player,
  dispatch,
  isLoading,
}: {
  player: CafePlayerState;
  dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}) {
  const upgradeTypes: CafeUpgradeType[] = ["seating", "ambiance", "equipment", "menu"];
  const supplyTypes: SupplyType[] = ["coffeeBeans", "tea", "milk", "syrup"];

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Investment Phase</h2>
      <p className="text-gray-400 mb-4">
        Spend money to prepare for customers. Money: <span className="text-yellow-400 font-bold">${player.money}</span>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tier 1 Supplies */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Buy Supplies (Tier 1)</h3>
          <p className="text-gray-500 text-xs mb-3">${SUPPLY_COST} each</p>
          <div className="space-y-2">
            {supplyTypes.map((type) => {
              const info = SUPPLY_INFO[type];
              const canBuy = player.money >= SUPPLY_COST;
              return (
                <div key={type} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className={`${info.color} font-medium`}>{player.supplies[type]}</span>
                    <span className="text-sm text-gray-300">{info.label}</span>
                  </div>
                  <button
                    onClick={() => dispatch("PURCHASE_SUPPLY", { supplyType: type })}
                    disabled={isLoading || !canBuy}
                    className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-3 py-1 rounded transition-colors"
                  >
                    +1
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upgrades */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Cafe Upgrades</h3>
          <div className="space-y-2">
            {upgradeTypes.map((type) => {
              const level = player.upgrades[type];
              const cost = (level + 1) * 3;
              const canUpgrade = level < 3 && player.money >= cost;
              return (
                <div key={type} className="flex justify-between items-center">
                  <span className="capitalize text-sm">
                    {type}: Lv.{level}
                  </span>
                  <button
                    onClick={() => dispatch("UPGRADE_CAFE", { upgradeType: type })}
                    disabled={isLoading || !canUpgrade}
                    className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-2 py-1 rounded transition-colors"
                  >
                    ${cost}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomerDraftView({
  gameState,
  player,
  playerId,
  dispatch,
  isLoading,
}: {
  gameState: CafeState;
  player: CafePlayerState;
  playerId: string;
  dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}) {
  const currentCustomer = gameState.currentCustomer;
  const drawerId = gameState.playerOrder[gameState.currentDrawerIndex];
  const deciderId = gameState.playerOrder[gameState.currentDeciderIndex];
  const drawerName = gameState.players[drawerId]?.name || "Unknown";
  const deciderName = gameState.players[deciderId]?.name || "Unknown";
  const playerCount = gameState.playerOrder.length;

  const isDrawer = playerId === drawerId;
  const isDecider = playerId === deciderId;

  // Calculate if this is a forced take situation
  const isForcedTake = gameState.passCount >= playerCount - 1;

  // Progress indicator
  const customersRemaining = gameState.currentRoundCustomers.length - gameState.customersDealtThisRound;

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">
        Customer Draft - {gameState.customersDealtThisRound} of {gameState.currentRoundCustomers.length} dealt
      </h2>

      {!currentCustomer && (
        <div className="bg-gray-900 rounded-lg p-6 text-center">
          {customersRemaining > 0 ? (
            <>
              <p className="text-gray-400 mb-4">
                {isDrawer ? (
                  <span className="text-yellow-400">Your turn to draw a customer!</span>
                ) : (
                  <span>Waiting for <span className="text-yellow-400">{drawerName}</span> to draw...</span>
                )}
              </p>
              {isDrawer && (
                <button
                  onClick={() => dispatch("DRAW_CUSTOMER")}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  Draw Customer
                </button>
              )}
            </>
          ) : (
            <p className="text-gray-400">All customers have been dealt this round.</p>
          )}
        </div>
      )}

      {currentCustomer && (
        <div className="space-y-4">
          {/* Customer Card - Full Display */}
          <CustomerCardFullDisplay customer={currentCustomer} />

          {/* Pass Counter */}
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">
                Drawn by: <span className="text-white">{drawerName}</span>
              </span>
              <span className="text-gray-400">
                Passed: <span className={isForcedTake ? "text-red-400 font-bold" : "text-white"}>
                  {gameState.passCount} / {playerCount - 1}
                </span>
              </span>
            </div>
          </div>

          {/* Decision UI */}
          <div className={`rounded-lg p-4 ${
            isDecider
              ? "bg-yellow-900/30 border border-yellow-700"
              : "bg-gray-900"
          }`}>
            {isDecider ? (
              <div className="space-y-3">
                <p className="font-semibold text-yellow-400">
                  {isForcedTake
                    ? "Customer returned to you - you must take them!"
                    : "It's your decision!"}
                </p>

                {/* Supply Check */}
                <SupplyCheckDisplay player={player} customer={currentCustomer} />

                <div className="flex gap-3">
                  <button
                    onClick={() => dispatch("TAKE_CUSTOMER")}
                    disabled={isLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Take Customer
                  </button>
                  {!isForcedTake && (
                    <button
                      onClick={() => dispatch("PASS_CUSTOMER")}
                      disabled={isLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 px-4 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Pass
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-center">
                Waiting for <span className="text-yellow-400">{deciderName}</span> to decide...
              </p>
            )}
          </div>

          {/* Your current customers this round */}
          {player.customerLine.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="font-semibold mb-2">Your Customers ({player.customerLine.length})</h3>
              <div className="flex flex-wrap gap-2">
                {player.customerLine.map((c, i) => {
                  const arch = getCardArchetype(c);
                  return (
                    <span key={i} className="text-xs bg-gray-700 px-2 py-1 rounded">
                      {arch.name}: {c.back.orderName}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Full customer card display (both sides visible in draft)
function CustomerCardFullDisplay({ customer }: { customer: CustomerCard }) {
  const archetype = getCardArchetype(customer);
  const { back } = customer;

  // Format required supplies
  const suppliesNeeded = Object.entries(back.requiresSupplies)
    .filter(([_, qty]) => qty && qty > 0)
    .map(([supply, qty]) => {
      const label = SUPPLY_INFO[supply as SupplyType]?.label || supply;
      return `${qty} ${label}`;
    });

  const failRuleText = {
    no_penalty: "No penalty if unfulfilled",
    lose_prestige: "Lose 1 prestige if unfulfilled",
    pay_penalty: "Pay $2 penalty if unfulfilled",
  }[back.failRule];

  return (
    <div className="bg-gradient-to-br from-amber-900/40 to-purple-900/40 border border-amber-600 rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs text-amber-400 uppercase tracking-wide">{archetype.name}</p>
          <h3 className="text-lg font-bold text-white">{back.orderName}</h3>
        </div>
        <div className="flex gap-2">
          <span className="text-yellow-400 font-bold">${back.reward.money}</span>
          <span className="text-purple-400 font-bold">+{back.reward.prestige} prestige</span>
        </div>
      </div>

      <p className="text-gray-300 text-sm mb-3">{archetype.description}</p>

      {/* Required Supplies */}
      <div className="bg-gray-900/50 rounded p-3 mb-2">
        <p className="text-xs text-gray-400 mb-2">Requires:</p>
        <div className="flex flex-wrap gap-2">
          {suppliesNeeded.length > 0 ? (
            suppliesNeeded.map((supply, i) => (
              <span key={i} className="text-sm text-white bg-gray-700 px-2 py-1 rounded">
                {supply}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-500">No supplies needed</span>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">{failRuleText}</p>
    </div>
  );
}

// Shows if player can fulfill the order
function SupplyCheckDisplay({ player, customer }: { player: CafePlayerState; customer: CustomerCard }) {
  const required = customer.back.requiresSupplies;
  const checks: { supply: string; have: number; need: number; ok: boolean }[] = [];

  for (const [supply, need] of Object.entries(required)) {
    if (need && need > 0) {
      const have = player.supplies[supply as SupplyType] || 0;
      checks.push({
        supply: SUPPLY_INFO[supply as SupplyType]?.label || supply,
        have,
        need,
        ok: have >= need,
      });
    }
  }

  const canFulfill = checks.every(c => c.ok);

  return (
    <div className={`rounded p-2 text-sm ${canFulfill ? "bg-green-900/30" : "bg-red-900/30"}`}>
      <p className={canFulfill ? "text-green-400" : "text-red-400"}>
        {canFulfill ? "You can fulfill this order!" : "Missing supplies:"}
      </p>
      {!canFulfill && (
        <div className="flex flex-wrap gap-2 mt-1">
          {checks.filter(c => !c.ok).map((c, i) => (
            <span key={i} className="text-xs text-red-300">
              {c.supply}: {c.have}/{c.need}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerResolutionView({
  gameState,
  playerId,
}: {
  gameState: CafeState;
  playerId: string;
}) {
  const player = gameState.players[playerId];

  // Calculate what will happen
  const results = player.customerLine.map(customer => {
    const required = customer.back.requiresSupplies;
    let canFulfill = true;
    for (const [supply, need] of Object.entries(required)) {
      if (need && need > 0 && (player.supplies[supply as SupplyType] || 0) < need) {
        canFulfill = false;
        break;
      }
    }
    return { customer, canFulfill };
  });

  const totalMoney = results
    .filter(r => r.canFulfill)
    .reduce((sum, r) => sum + r.customer.back.reward.money, 0);
  const totalPrestige = results
    .filter(r => r.canFulfill)
    .reduce((sum, r) => sum + r.customer.back.reward.prestige, 0);

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Customer Resolution</h2>
      <p className="text-gray-400 mb-4">
        Time to serve your customers and collect rewards!
      </p>

      {player.customerLine.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-500">No customers to serve this round</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-gray-900 rounded-lg p-3 mb-4 flex justify-between items-center">
            <span className="text-gray-400">
              {player.customerLine.length} customer{player.customerLine.length > 1 ? "s" : ""} to serve
            </span>
            <div className="flex gap-4">
              <span className="text-yellow-400">${totalMoney} potential</span>
              <span className="text-purple-400">+{totalPrestige} prestige</span>
            </div>
          </div>

          {/* Customer results */}
          <div className="space-y-3">
            {results.map(({ customer, canFulfill }, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 border ${
                  canFulfill
                    ? "bg-green-900/20 border-green-700"
                    : "bg-red-900/20 border-red-700"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{customer.back.orderName}</p>
                    <p className="text-xs text-gray-400">
                      {getCardArchetype(customer).name}
                    </p>
                  </div>
                  <div className="text-right">
                    {canFulfill ? (
                      <div className="flex gap-2">
                        <span className="text-yellow-400">${customer.back.reward.money}</span>
                        <span className="text-purple-400">+{customer.back.reward.prestige}</span>
                      </div>
                    ) : (
                      <span className="text-red-400 text-sm">
                        {customer.back.failRule === "lose_prestige" && "-1 prestige"}
                        {customer.back.failRule === "pay_penalty" && "-$2"}
                        {customer.back.failRule === "no_penalty" && "No penalty"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CleanupView({ player, round }: { player: CafePlayerState; round: number }) {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">End of Round {round}</h2>
      <div className="space-y-2 text-gray-300">
        <p>Paying rent: $2</p>
        <p>Remaining money: ${Math.max(0, player.money - 2)}</p>
        <p>Customers served this round: {player.customerLine.length}</p>
      </div>
    </section>
  );
}

function GameOverView({
  gameState,
  playerId,
  room,
}: {
  gameState: CafeState;
  playerId: string;
  room: { players: Array<{ id: string; name: string }> };
}) {
  const winner = gameState.winnerId
    ? gameState.players[gameState.winnerId]
    : null;
  const isWinner = gameState.winnerId === playerId;

  // Sort players by score
  const sortedPlayers = gameState.playerOrder
    .map((id) => {
      const p = gameState.players[id];
      return {
        ...p,
        score: p.money + p.prestige * 2,
      };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-center mb-6">Game Over!</h2>

      {winner && (
        <div
          className={`text-center p-6 rounded-lg mb-6 ${
            isWinner
              ? "bg-yellow-900/30 border border-yellow-600"
              : "bg-gray-900"
          }`}
        >
          <p className="text-gray-400 mb-2">Winner</p>
          <p className="text-3xl font-bold text-yellow-400">
            {winner.name}
            {isWinner && " (You!)"}
          </p>
          <p className="text-gray-400 mt-2">
            Score: {winner.money + winner.prestige * 2}
          </p>
        </div>
      )}

      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Final Standings</h3>
        <div className="space-y-2">
          {sortedPlayers.map((p, i) => (
            <div
              key={p.id}
              className={`flex justify-between items-center p-2 rounded ${
                p.id === playerId ? "bg-blue-900/30" : "bg-gray-800"
              }`}
            >
              <span>
                #{i + 1} {p.name}
              </span>
              <div className="text-right text-sm">
                <span className="text-yellow-400">${p.money}</span>
                <span className="mx-2 text-gray-500">+</span>
                <span className="text-purple-400">{p.prestige} prestige</span>
                <span className="mx-2 text-gray-500">=</span>
                <span className="font-bold">{p.score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// PLAYER STATUS GRID
// =============================================================================

function PlayerStatusGrid({
  players,
  playerOrder,
  currentPlayerId,
}: {
  players: Record<string, CafePlayerState>;
  playerOrder: string[];
  currentPlayerId: string;
}) {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h2 className="font-semibold mb-3">All Players</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {playerOrder.map((id) => {
          const p = players[id];
          const isMe = id === currentPlayerId;
          const totalSupplies = p.supplies.coffeeBeans + p.supplies.tea + p.supplies.milk + p.supplies.syrup;
          return (
            <div
              key={id}
              className={`bg-gray-900 rounded-lg p-3 ${
                isMe ? "ring-2 ring-blue-500" : ""
              }`}
            >
              <p className="font-semibold text-sm truncate">
                {p.name}
                {isMe && " (You)"}
              </p>
              <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Money:</span>
                  <span className="text-yellow-400">${p.money}</span>
                </div>
                <div className="flex justify-between">
                  <span>Prestige:</span>
                  <span className="text-purple-400">{p.prestige}</span>
                </div>
                <div className="flex justify-between">
                  <span>Supplies:</span>
                  <span title={`Beans: ${p.supplies.coffeeBeans}, Tea: ${p.supplies.tea}, Milk: ${p.supplies.milk}, Syrup: ${p.supplies.syrup}`}>
                    {totalSupplies}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Served:</span>
                  <span>{p.customersServed}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
