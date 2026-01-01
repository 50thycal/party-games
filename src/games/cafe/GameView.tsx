"use client";

import { useState } from "react";
import type { GameViewProps } from "@/games/views";
import type {
  CafeState,
  CafePlayerState,
  AttractionCard,
  CustomerCard,
  CafeUpgradeType,
  SupplyType,
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
          <h3 className="font-semibold mb-2">Supplies</h3>
          <div className="space-y-1 text-sm">
            <div>Coffee: {player.supplies.coffee}</div>
            <div>Pastries: {player.supplies.pastries}</div>
            <div>Specialty: {player.supplies.specialty}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

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
  const supplyTypes: SupplyType[] = ["coffee", "pastries", "specialty"];

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Investment Phase</h2>
      <p className="text-gray-400 mb-4">
        Spend money to prepare for customers. Money: ${player.money}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* Supplies */}
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Buy Supplies</h3>
          <div className="space-y-2">
            {supplyTypes.map((type) => (
              <div key={type} className="flex justify-between items-center">
                <span className="capitalize text-sm">
                  {type}: {player.supplies[type]}
                </span>
                <button
                  onClick={() => dispatch("PURCHASE_SUPPLY", { supplyType: type })}
                  disabled={isLoading || player.money < 2}
                  className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-2 py-1 rounded transition-colors"
                >
                  $2
                </button>
              </div>
            ))}
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
          {/* Customer Card Display */}
          <CustomerCardDisplay customer={customer} />

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

function CustomerCardDisplay({ customer }: { customer: CustomerCard }) {
  return (
    <div className="bg-gradient-to-br from-amber-900/50 to-amber-800/30 border border-amber-600 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-bold text-amber-200">{customer.archetype}</h3>
        <div className="text-right text-sm">
          <div className="text-yellow-400">${customer.reward.money}</div>
          <div className="text-green-400">+{customer.reward.tips} tips</div>
          <div className="text-purple-400">+{customer.reward.prestige} prestige</div>
        </div>
      </div>
      <p className="text-gray-300 text-sm mb-2">{customer.description}</p>
      <div className="text-xs text-gray-400 border-t border-amber-700 pt-2 mt-2">
        Requires:{" "}
        {customer.eligibilityRequirement.type === "none"
          ? "Anyone can serve"
          : customer.eligibilityRequirement.type === "hasSupply"
          ? `${customer.eligibilityRequirement.supplyType} supply`
          : `${customer.eligibilityRequirement.upgradeType} Lv.${customer.eligibilityRequirement.minLevel}+`}
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

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Customer Resolution</h2>
      <p className="text-gray-400 mb-4">
        Customers are being served. Time to collect rewards!
      </p>
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Your Customers This Round</h3>
        {player.customerLine.length === 0 ? (
          <p className="text-gray-500">No customers won this round</p>
        ) : (
          <div className="space-y-2">
            {player.customerLine.map((customer, i) => (
              <div
                key={i}
                className="flex justify-between items-center bg-gray-800 p-2 rounded"
              >
                <span>{customer.archetype}</span>
                <span className="text-yellow-400">
                  ${customer.reward.money + customer.reward.tips}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
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
