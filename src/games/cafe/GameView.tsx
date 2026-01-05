"use client";

import type { GameViewProps } from "@/games/views";
import {
  SUPPLY_COST,
  CUSTOMER_ARCHETYPES,
  getCardArchetype,
  type CafeState,
  type CafePlayerState,
  type CustomerCard,
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
              <p className={`font-bold ${player.money < 0 ? "text-red-400" : "text-yellow-400"}`}>
                ${player.money}
                {player.money < 0 && <span className="text-xs ml-1">(IN DEBT)</span>}
              </p>
              {/* Prestige hidden for now
              <p className="text-purple-400 text-sm">
                {player.prestige} prestige
              </p>
              */}
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
      {phase === "customerResolution" && player && (
        <CustomerResolutionView
          gameState={gameState}
          player={player}
          playerId={playerId!}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "shopClosed" && (
        <ShopClosedView gameState={gameState} />
      )}
      {phase === "cleanup" && player && (
        <CleanupView
          gameState={gameState}
          player={player}
          playerId={playerId!}
          dispatch={dispatch}
          isLoading={isLoading}
        />
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

        {phase === "shopClosed" && (
          <button
            onClick={() => dispatch("CLOSE_SHOP")}
            disabled={isLoading}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Pay Rent & End Day
          </button>
        )}

        {phase === "cleanup" && (
          <button
            onClick={() => dispatch("END_ROUND")}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            {gameState.round >= 5 ? "End Game" : "Start Next Round"}
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
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Supplies</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
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
  const supplyTypes: SupplyType[] = ["coffeeBeans", "tea", "milk", "syrup"];

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Investment Phase</h2>
      <p className="text-gray-400 mb-4">
        Spend money to prepare for customers. Money: <span className="text-yellow-400 font-bold">${player.money}</span>
      </p>

      {/* Supplies */}
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Buy Supplies</h3>
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
  // Only the drawer can be forced to take (when card returns after everyone else passed)
  const isForcedTake = isDrawer && isDecider && gameState.passCount >= playerCount - 1;

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
          {/* Customer Card - Hidden (only show archetype) */}
          <CustomerCardHidden customer={currentCustomer} />

          {/* Pass Counter */}
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">
                Drawn by: <span className="text-white">{drawerName}</span>
              </span>
              <span className="text-gray-400">
                Passed: <span className={gameState.passCount >= playerCount - 1 ? "text-red-400 font-bold" : "text-white"}>
                  {gameState.passCount} / {playerCount - 1}
                </span>
                {gameState.passCount >= playerCount - 1 && (
                  <span className="ml-2 text-red-400">(returns to drawer)</span>
                )}
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
                <p className="text-gray-400 text-sm">
                  The order is hidden until resolution. Do you want to risk it?
                </p>

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

          {/* Your current customers this round (order hidden) */}
          {player.customerLine.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="font-semibold mb-2">Your Customers ({player.customerLine.length})</h3>
              <p className="text-xs text-gray-500 mb-2">Orders revealed at resolution</p>
              <div className="flex flex-wrap gap-2">
                {player.customerLine.map((c, i) => {
                  const arch = getCardArchetype(c);
                  return (
                    <span key={i} className="text-sm bg-gray-700 px-3 py-1.5 rounded">
                      {arch.emoji} {arch.name}
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

// Hidden customer card display (only archetype visible during draft)
function CustomerCardHidden({ customer }: { customer: CustomerCard }) {
  const archetype = getCardArchetype(customer);

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-600 rounded-lg p-6 text-center">
      <div className="text-6xl mb-3">{archetype.emoji}</div>
      <h3 className="text-xl font-bold text-white mb-2">{archetype.name}</h3>
      <p className="text-gray-400 text-sm mb-4">{archetype.description}</p>
      <div className="bg-gray-700/50 rounded-lg p-3">
        <p className="text-gray-500 text-xs uppercase tracking-wide">Order Hidden</p>
        <p className="text-gray-400 text-sm mt-1">Will be revealed at resolution</p>
      </div>
    </div>
  );
}

// Full customer card display (used in resolution phase)
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
          {/* Prestige hidden for now
          <span className="text-purple-400 font-bold">+{back.reward.prestige} prestige</span>
          */}
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
  const selectedIndices = gameState.selectedForFulfillment[playerId] || [];
  const hasConfirmed = gameState.playersConfirmedResolution.includes(playerId);
  const allConfirmed = gameState.playersConfirmedResolution.length === gameState.playerOrder.length;

  // Calculate supply usage for selected customers only
  const supplyCosts: Record<SupplyType, number> = {
    coffeeBeans: 0,
    tea: 0,
    milk: 0,
    syrup: 0,
  };

  for (let i = 0; i < player.customerLine.length; i++) {
    if (selectedIndices.includes(i)) {
      const required = player.customerLine[i].back.requiresSupplies;
      for (const [supply, qty] of Object.entries(required)) {
        if (qty && qty > 0) {
          supplyCosts[supply as SupplyType] += qty;
        }
      }
    }
  }

  // Check which selected customers can be fulfilled
  const canFulfillSelected = (index: number): boolean => {
    if (!selectedIndices.includes(index)) return false;
    const remaining: Record<SupplyType, number> = { ...player.supplies };

    // Deduct earlier selected customers first
    for (let i = 0; i < index; i++) {
      if (selectedIndices.includes(i)) {
        const req = player.customerLine[i].back.requiresSupplies;
        for (const [s, q] of Object.entries(req)) {
          if (q && q > 0) remaining[s as SupplyType] -= q;
        }
      }
    }

    // Check this customer
    const required = player.customerLine[index].back.requiresSupplies;
    for (const [supply, qty] of Object.entries(required)) {
      if (qty && qty > 0 && remaining[supply as SupplyType] < qty) {
        return false;
      }
    }
    return true;
  };

  const totalMoney = selectedIndices
    .filter(i => canFulfillSelected(i))
    .reduce((sum, i) => sum + player.customerLine[i].back.reward.money, 0);

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-2">Customer Resolution</h2>
      <p className="text-gray-400 mb-4">
        Orders revealed! Select which customers to serve.
      </p>

      {/* Confirmation Status */}
      <div className="bg-gray-900 rounded-lg p-3 mb-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">
            Confirmed: {gameState.playersConfirmedResolution.length} / {gameState.playerOrder.length}
          </span>
          {hasConfirmed ? (
            <span className="text-green-400">You are ready</span>
          ) : (
            <span className="text-yellow-400">Select customers to serve</span>
          )}
        </div>
      </div>

      {player.customerLine.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <p className="text-gray-500">No customers to serve this round</p>
        </div>
      ) : (
        <>
          {/* Current Supplies */}
          <div className="bg-gray-900 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-400 mb-2">Your Supplies (cost shown for selected):</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className={supplyCosts.coffeeBeans > player.supplies.coffeeBeans ? "text-red-400" : "text-amber-400"}>
                Beans: {player.supplies.coffeeBeans - supplyCosts.coffeeBeans}/{player.supplies.coffeeBeans}
              </span>
              <span className={supplyCosts.tea > player.supplies.tea ? "text-red-400" : "text-green-400"}>
                Tea: {player.supplies.tea - supplyCosts.tea}/{player.supplies.tea}
              </span>
              <span className={supplyCosts.milk > player.supplies.milk ? "text-red-400" : "text-blue-200"}>
                Milk: {player.supplies.milk - supplyCosts.milk}/{player.supplies.milk}
              </span>
              <span className={supplyCosts.syrup > player.supplies.syrup ? "text-red-400" : "text-pink-400"}>
                Syrup: {player.supplies.syrup - supplyCosts.syrup}/{player.supplies.syrup}
              </span>
            </div>
          </div>

          {/* Customer selection */}
          <div className="space-y-3 mb-4">
            {player.customerLine.map((customer, i) => {
              const archetype = getCardArchetype(customer);
              const isSelected = selectedIndices.includes(i);
              const willFulfill = canFulfillSelected(i);
              const requiredList = Object.entries(customer.back.requiresSupplies)
                .filter(([_, qty]) => qty && qty > 0)
                .map(([supply, qty]) => `${qty} ${SUPPLY_INFO[supply as SupplyType]?.label || supply}`);

              return (
                <div
                  key={i}
                  className={`rounded-lg p-4 border cursor-pointer transition-colors ${
                    isSelected
                      ? willFulfill
                        ? "bg-green-900/30 border-green-600"
                        : "bg-red-900/30 border-red-600"
                      : "bg-gray-900 border-gray-700 hover:border-gray-500"
                  }`}
                  onClick={() => !hasConfirmed && dispatch("TOGGLE_CUSTOMER_FULFILL", { customerIndex: i })}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center mt-0.5 ${
                        isSelected
                          ? willFulfill ? "bg-green-600 border-green-600" : "bg-red-600 border-red-600"
                          : "border-gray-500"
                      }`}>
                        {isSelected && <span className="text-white text-sm">✓</span>}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{archetype.emoji}</span>
                          <span className="font-semibold">{customer.back.orderName}</span>
                        </div>
                        <p className="text-xs text-gray-400">{archetype.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Requires: {requiredList.join(", ") || "Nothing"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-yellow-400 font-bold">${customer.back.reward.money}</span>
                      {isSelected && !willFulfill && (
                        <p className="text-xs text-red-400 mt-1">Not enough supplies</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="bg-gray-900 rounded-lg p-3 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">
                {selectedIndices.filter(i => canFulfillSelected(i)).length} will be fulfilled
              </span>
              <span className="text-yellow-400 font-bold">+${totalMoney}</span>
            </div>
          </div>
        </>
      )}

      {/* Confirm Button */}
      {!hasConfirmed ? (
        <button
          onClick={() => dispatch("CONFIRM_RESOLUTION")}
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-3 rounded-lg font-semibold transition-colors"
        >
          Confirm Selection
        </button>
      ) : (
        <div className="text-center text-green-400 py-3">
          Waiting for other players...
        </div>
      )}
    </section>
  );
}

function ShopClosedView({ gameState }: { gameState: CafeState }) {
  // Calculate summary for each player
  const summaries = gameState.playerOrder.map(id => {
    const player = gameState.players[id];
    return {
      id,
      name: player.name,
      money: player.money,
      prestige: player.prestige,
      customersServed: player.customersServed,
    };
  });

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-amber-400">Shop Closed</h2>
        <p className="text-gray-400 mt-2">End of Round {gameState.round}</p>
      </div>

      <div className="bg-gray-900 rounded-lg p-4 mb-4">
        <h3 className="font-semibold mb-3">Round Summary</h3>
        <div className="space-y-2">
          {summaries.map(p => (
            <div key={p.id} className="flex justify-between items-center text-sm">
              <span>{p.name}</span>
              <div className="flex gap-4">
                <span className={p.money < 0 ? "text-red-400" : "text-yellow-400"}>
                  ${p.money}
                </span>
                {/* Prestige hidden for now
                <span className="text-purple-400">{p.prestige} prestige</span>
                */}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4 text-center">
        <p className="text-amber-400">
          Time to pay rent: $2 per player
        </p>
        <p className="text-gray-400 text-sm mt-2">
          Waiting for host to proceed...
        </p>
      </div>
    </section>
  );
}

function CleanupView({
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
  const rent = 2; // GAME_CONFIG.RENT_PER_ROUND
  const canAffordRent = player.money >= rent;
  const myRentPaidBy = gameState.rentPaidBy[playerId];
  const amBailedOut = myRentPaidBy !== null;

  // Find players who need bailout (can't afford rent and not yet bailed out)
  const playersNeedingBailout = gameState.playerOrder
    .filter(id => id !== playerId)
    .map(id => ({
      id,
      player: gameState.players[id],
      needsBailout: gameState.players[id].money < rent && gameState.rentPaidBy[id] === null,
      wasBailedOut: gameState.rentPaidBy[id] !== null,
      bailedOutBy: gameState.rentPaidBy[id],
    }))
    .filter(p => p.needsBailout || p.wasBailedOut);

  const canBailoutOthers = player.money >= rent;

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Rent Payment - Round {gameState.round}</h2>

      {/* Your rent status */}
      <div className={`rounded-lg p-4 mb-4 border ${
        amBailedOut
          ? "bg-green-900/20 border-green-700"
          : canAffordRent
          ? "bg-gray-900 border-gray-700"
          : "bg-red-900/20 border-red-700"
      }`}>
        <h3 className="font-semibold mb-2">Your Rent Status</h3>
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-400">Rent due: ${rent}</p>
            <p className="text-sm text-gray-400">
              Your money: <span className={player.money < 0 ? "text-red-400" : "text-yellow-400"}>${player.money}</span>
            </p>
          </div>
          <div className="text-right">
            {amBailedOut ? (
              <span className="text-green-400 font-semibold">
                Bailed out by {gameState.players[myRentPaidBy]?.name}!
              </span>
            ) : canAffordRent ? (
              <span className="text-green-400">Can pay</span>
            ) : (
              <div>
                <span className="text-red-400 font-semibold">Will go into debt</span>
                <p className="text-xs text-gray-500">After rent: ${player.money - rent}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bailout options */}
      {playersNeedingBailout.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Bailout Options</h3>
          <p className="text-xs text-gray-500 mb-3">
            Other players struggling with rent. You can pay their rent for them.
          </p>
          <div className="space-y-2">
            {playersNeedingBailout.map(({ id, player: targetPlayer, needsBailout, wasBailedOut, bailedOutBy }) => (
              <div key={id} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                <div>
                  <span className="font-medium">{targetPlayer.name}</span>
                  <span className={`text-sm ml-2 ${targetPlayer.money < 0 ? "text-red-400" : "text-yellow-400"}`}>
                    (${targetPlayer.money})
                  </span>
                </div>
                {wasBailedOut ? (
                  <span className="text-green-400 text-sm">
                    Bailed out by {gameState.players[bailedOutBy!]?.name}
                  </span>
                ) : needsBailout && canBailoutOthers ? (
                  <button
                    onClick={() => dispatch("PAY_RENT_FOR", { targetPlayerId: id })}
                    disabled={isLoading}
                    className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-3 py-1 rounded transition-colors"
                  >
                    Pay ${rent} for them
                  </button>
                ) : needsBailout ? (
                  <span className="text-red-400 text-sm">Needs bailout</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
        <p className="text-blue-300 text-sm">
          {gameState.round >= 5
            ? "This is the final round! After rent, the game will end."
            : "After rent is paid, the next round will begin."}
        </p>
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

  // Sort players by score (prestige disabled for now, just use money)
  const sortedPlayers = gameState.playerOrder
    .map((id) => {
      const p = gameState.players[id];
      return {
        ...p,
        // score: p.money + p.prestige * 2, // Prestige disabled
        score: p.money,
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
            {/* Score: {winner.money + winner.prestige * 2} // Prestige disabled */}
            Final Money: ${winner.money}
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
                <span className={p.money < 0 ? "text-red-400" : "text-yellow-400"} title="Final Money">
                  ${p.money}
                </span>
                {/* Prestige hidden for now
                <span className="mx-2 text-gray-500">+</span>
                <span className="text-purple-400">{p.prestige} prestige</span>
                <span className="mx-2 text-gray-500">=</span>
                <span className="font-bold">{p.score}</span>
                */}
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
              {p.money < 0 && (
                <span className="text-xs bg-red-600 text-white px-1 rounded">IN DEBT</span>
              )}
              <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Money:</span>
                  <span className={p.money < 0 ? "text-red-400" : "text-yellow-400"}>${p.money}</span>
                </div>
                {/* Prestige hidden for now
                <div className="flex justify-between">
                  <span>Prestige:</span>
                  <span className="text-purple-400">{p.prestige}</span>
                </div>
                */}
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
