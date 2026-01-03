"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/views";
import {
  SUPPLY_COST,
  CUSTOMER_ARCHETYPES,
  getCardArchetype,
  type CafeState,
  type CafePlayerState,
  type AttractionCard,
  type CustomerCard,
  type CafeUpgradeType,
  type SupplyType,
} from "./config";

export function CafeGameView({
  state,
  room,
  playerId,
  isHost,
  dispatchAction,
}: GameViewProps<CafeState>) {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const gameState = state as CafeState;
  const phase = gameState?.phase ?? "lobby";
  const player = playerId ? gameState?.players?.[playerId] : null;

  // Helper to wrap dispatch calls with loading state
  async function dispatch(action: string, payload?: Record<string, unknown>) {
    setIsLoading(true);
    try {
      await dispatchAction(action, payload);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleCardSelection(cardId: string) {
    setSelectedCardIds((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId]
    );
  }

  async function handleCommitCards() {
    await dispatch("COMMIT_CARDS", { cardIds: selectedCardIds });
    setSelectedCardIds([]);
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
          market={gameState.attractionMarket}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "drawing" && player && (
        <DrawingPhaseView
          player={player}
          deckSize={gameState.attractionDeck.length}
          discardSize={gameState.attractionDiscard.length}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "customerArrival" && player && (
        <CustomerArrivalView
          gameState={gameState}
          player={player}
          playerId={playerId!}
          selectedCardIds={selectedCardIds}
          toggleCardSelection={toggleCardSelection}
          handleCommitCards={handleCommitCards}
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
  const allCommitted = gameState.eligiblePlayerIds.every(
    (id) => gameState.players[id]?.hasCommitted
  );

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
            Start Card Draw
          </button>
        )}

        {phase === "drawing" && (
          <button
            onClick={() => dispatch("END_DRAWING")}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Open Doors (Start Customers)
          </button>
        )}

        {phase === "customerArrival" && (
          <>
            {gameState.customerSubPhase === "revealing" && !gameState.currentCustomer && (
              <button
                onClick={() => dispatch("REVEAL_CUSTOMER")}
                disabled={isLoading}
                className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Reveal Next Customer
              </button>
            )}
            {gameState.customerSubPhase === "commitment" && allCommitted && (
              <button
                onClick={() => dispatch("REVEAL_COMMITMENTS")}
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Reveal All Commitments
              </button>
            )}
            {gameState.customerSubPhase === "reveal" && (
              <button
                onClick={() => dispatch("AWARD_CUSTOMER")}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Award Customer
              </button>
            )}
            {!gameState.currentCustomer && gameState.currentCustomerIndex > 0 && (
              <button
                onClick={() => dispatch("NEXT_CUSTOMER")}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Next Customer
              </button>
            )}
          </>
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
        Compete to attract customers to your cafe. Build upgrades, stock supplies,
        and play attraction cards to win customers!
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
        Review your resources before investing. No actions available this phase.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Your Hand</h3>
          <div className="space-y-1">
            {player.hand.map((card) => (
              <div key={card.id} className="text-sm text-gray-300">
                {card.name} (+{card.value})
              </div>
            ))}
            {player.hand.length === 0 && (
              <p className="text-gray-500 text-sm">No cards</p>
            )}
          </div>
        </div>
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
  market,
  dispatch,
  isLoading,
}: {
  player: CafePlayerState;
  market: AttractionCard[];
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* Attraction Market */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Attraction Cards</h3>
          <div className="space-y-2">
            {market.map((card) => (
              <div key={card.id} className="flex justify-between items-center">
                <span className="text-sm">
                  {card.name} (+{card.value})
                </span>
                <button
                  onClick={() => dispatch("PURCHASE_ATTRACTION", { attractionId: card.id })}
                  disabled={isLoading || player.money < card.cost}
                  className="text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 px-2 py-1 rounded transition-colors"
                >
                  ${card.cost}
                </button>
              </div>
            ))}
            {market.length === 0 && (
              <p className="text-gray-500 text-sm">No cards available</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DrawingPhaseView({
  player,
  deckSize,
  discardSize,
  dispatch,
  isLoading,
}: {
  player: CafePlayerState;
  deckSize: number;
  discardSize: number;
  dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}) {
  const [hasDrawn, setHasDrawn] = useState(false);

  async function handleDraw() {
    await dispatch("DRAW_ATTRACTION_CARDS");
    setHasDrawn(true);
  }

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Draw Phase</h2>
      <p className="text-gray-400 mb-4">
        Draw attraction cards to use for competing for customers!
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deck Info */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Attraction Deck</h3>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-400">
              <p>Deck: {deckSize} cards</p>
              <p>Discard: {discardSize} cards</p>
            </div>
            {!hasDrawn ? (
              <button
                onClick={handleDraw}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Draw 2 Cards
              </button>
            ) : (
              <span className="text-green-400 font-semibold">Cards Drawn!</span>
            )}
          </div>
        </div>

        {/* Current Hand */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Your Hand ({player.hand.length} cards)</h3>
          <div className="space-y-2">
            {player.hand.map((card) => (
              <div
                key={card.id}
                className="flex justify-between items-center bg-gray-800 px-3 py-2 rounded"
              >
                <span className="text-sm">{card.name}</span>
                <span className="text-yellow-400 font-bold">+{card.value}</span>
              </div>
            ))}
            {player.hand.length === 0 && (
              <p className="text-gray-500 text-sm">No cards in hand</p>
            )}
          </div>
        </div>
      </div>

      {hasDrawn && (
        <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
          <p className="text-blue-300 text-sm">
            Waiting for host to open doors and start customer arrival...
          </p>
        </div>
      )}
    </section>
  );
}

function CustomerArrivalView({
  gameState,
  player,
  playerId,
  selectedCardIds,
  toggleCardSelection,
  handleCommitCards,
  isLoading,
}: {
  gameState: CafeState;
  player: CafePlayerState;
  playerId: string;
  selectedCardIds: string[];
  toggleCardSelection: (id: string) => void;
  handleCommitCards: () => void;
  isLoading: boolean;
}) {
  const customer = gameState.currentCustomer;
  const isEligible = gameState.eligiblePlayerIds.includes(playerId);
  const hasCommitted = player.hasCommitted;
  const subPhase = gameState.customerSubPhase;

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">
        Customer Arrival - Customer {gameState.currentCustomerIndex + 1} of{" "}
        {gameState.currentRoundCustomers.length}
      </h2>

      {!customer && (
        <p className="text-gray-400">Waiting for customer to be revealed...</p>
      )}

      {customer && (
        <div className="space-y-4">
          {/* Customer Card Front Side - shows archetype only */}
          <CustomerCardFrontDisplay customer={customer} />

          {/* Eligibility Status */}
          <div
            className={`p-3 rounded-lg ${
              isEligible
                ? "bg-green-900/30 border border-green-700"
                : "bg-red-900/30 border border-red-700"
            }`}
          >
            {isEligible ? (
              <p className="text-green-400">You are eligible to compete!</p>
            ) : (
              <p className="text-red-400">
                You do not meet the requirements for this customer.
              </p>
            )}
          </div>

          {/* Commitment Phase UI */}
          {isEligible && (subPhase === "eligibilityCheck" || subPhase === "commitment") && (
            <div className="bg-gray-900 rounded-lg p-4">
              {hasCommitted ? (
                <div className="text-center">
                  <p className="text-green-400">Cards committed!</p>
                  <p className="text-gray-500 text-sm">
                    Waiting for other players...
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold mb-3">Select cards to commit:</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {player.hand.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => toggleCardSelection(card.id)}
                        className={`px-3 py-2 rounded-lg border transition-colors ${
                          selectedCardIds.includes(card.id)
                            ? "bg-blue-600 border-blue-500"
                            : "bg-gray-800 border-gray-600 hover:border-gray-500"
                        }`}
                      >
                        {card.name} (+{card.value})
                      </button>
                    ))}
                    {player.hand.length === 0 && (
                      <p className="text-gray-500">No cards to commit</p>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-gray-400">
                      Total: +
                      {player.hand
                        .filter((c) => selectedCardIds.includes(c.id))
                        .reduce((sum, c) => sum + c.value, 0)}
                    </p>
                    <button
                      onClick={handleCommitCards}
                      disabled={isLoading}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
                    >
                      Lock In Commitment
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Reveal Phase */}
          {subPhase === "reveal" && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="font-semibold mb-3">Commitments Revealed</h3>
              <div className="space-y-2">
                {gameState.eligiblePlayerIds.map((pid) => {
                  const p = gameState.players[pid];
                  const total = p.committedCards.reduce((s, c) => s + c.value, 0);
                  return (
                    <div
                      key={pid}
                      className="flex justify-between items-center bg-gray-800 p-2 rounded"
                    >
                      <span>{p.name}</span>
                      <span className="font-bold text-yellow-400">
                        +{total} ({p.committedCards.length} cards)
                      </span>
                    </div>
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

// Front side of customer card - shown during Customer Arrival
function CustomerCardFrontDisplay({ customer }: { customer: CustomerCard }) {
  const archetype = getCardArchetype(customer);

  return (
    <div className="bg-gradient-to-br from-amber-900/50 to-amber-800/30 border border-amber-600 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-bold text-amber-200">{archetype.name}</h3>
        <div className="text-xs text-amber-400 bg-amber-900/50 px-2 py-1 rounded">
          Front
        </div>
      </div>
      <p className="text-gray-300 text-sm mb-3">{archetype.description}</p>
      <div className="text-xs text-gray-400 border-t border-amber-700 pt-2 mt-2">
        <span className="text-amber-300">Hint:</span> {archetype.eligibilityHint}
      </div>
    </div>
  );
}

// Back side of customer card - shown during Customer Resolution
function CustomerCardBackDisplay({ customer }: { customer: CustomerCard }) {
  const archetype = getCardArchetype(customer);
  const { back } = customer;

  // Format required supplies for display
  const suppliesNeeded = Object.entries(back.requiresSupplies)
    .filter(([_, qty]) => qty && qty > 0)
    .map(([supply, qty]) => {
      const label = SUPPLY_INFO[supply as SupplyType]?.label || supply;
      return `${qty} ${label}`;
    });

  const failRuleText = {
    no_penalty: "No penalty if unfulfilled",
    lose_prestige: "Lose prestige if unfulfilled",
    pay_penalty: "Pay penalty if unfulfilled",
  }[back.failRule];

  return (
    <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 border border-purple-600 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-xs text-purple-300">{archetype.name}</p>
          <h3 className="text-lg font-bold text-purple-200">{back.orderName}</h3>
        </div>
        <div className="text-xs text-purple-400 bg-purple-900/50 px-2 py-1 rounded">
          Back
        </div>
      </div>

      {/* Required Supplies */}
      <div className="bg-gray-900/50 rounded p-2 mb-3">
        <p className="text-xs text-gray-400 mb-1">Requires:</p>
        <div className="flex flex-wrap gap-2">
          {suppliesNeeded.length > 0 ? (
            suppliesNeeded.map((supply, i) => (
              <span key={i} className="text-sm text-white bg-gray-700 px-2 py-0.5 rounded">
                {supply}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-500">No supplies needed</span>
          )}
        </div>
      </div>

      {/* Rewards */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-400">Reward:</span>
        <div className="flex gap-3">
          <span className="text-yellow-400">${back.reward.money}</span>
          <span className="text-purple-400">+{back.reward.prestige} prestige</span>
        </div>
      </div>

      {/* Fail Rule */}
      <div className="text-xs text-gray-500 border-t border-purple-700 pt-2 mt-2">
        {failRuleText}
      </div>
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

  // Calculate total potential rewards
  const totalMoney = player.customerLine.reduce(
    (sum, c) => sum + c.back.reward.money,
    0
  );
  const totalPrestige = player.customerLine.reduce(
    (sum, c) => sum + c.back.reward.prestige,
    0
  );

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Customer Resolution</h2>
      <p className="text-gray-400 mb-4">
        Customers are being served. View their orders below!
      </p>

      {player.customerLine.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-500">No customers won this round</p>
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

          {/* Customer Cards - Back Side */}
          <div className="space-y-3">
            {player.customerLine.map((customer, i) => (
              <CustomerCardBackDisplay key={customer.id || i} customer={customer} />
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
                  <span>Cards:</span>
                  <span>{p.hand.length}</span>
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
