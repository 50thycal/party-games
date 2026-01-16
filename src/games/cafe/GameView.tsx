"use client";

import type { GameViewProps } from "@/games/views";
import {
  SUPPLY_COST,
  GAME_CONFIG,
  CUSTOMER_ARCHETYPES,
  getCardArchetype,
  getReputationCustomerModifier,
  UPGRADE_CONFIG,
  type CafeState,
  type CafePlayerState,
  type CustomerCard,
  type SupplyType,
  type UpgradeCard,
  type UpgradeCardCategory,
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
  const isEliminated = playerId ? gameState?.eliminatedPlayers?.includes(playerId) : false;

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
              {phase !== "lobby" && phase !== "gameOver" && gameState && (
                <span className="ml-2">
                  | Round {gameState.round} of 5
                </span>
              )}
            </p>
          </div>
          {player && (
            <div className="text-right">
              {isEliminated ? (
                <p className="font-bold text-red-400">BANKRUPT</p>
              ) : (
                <>
                  <p className="font-bold text-yellow-400">${player.money}</p>
                  <p className="text-gray-400 text-sm">
                    {player.customersServed} served
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Reputation Track - shown during active game phases */}
      {phase !== "lobby" && phase !== "gameOver" && gameState && (
        <ReputationTrackPanel
          reputation={gameState.reputation}
          playerCount={gameState.playerOrder.filter(id => !gameState.eliminatedPlayers.includes(id)).length}
        />
      )}

      {/* Host Controls */}
      {isHost && <HostControls phase={phase} gameState={gameState} dispatch={dispatch} isLoading={isLoading} />}

      {/* Eliminated player banner */}
      {isEliminated && phase !== "gameOver" && (
        <section className="bg-red-900/30 border border-red-700 rounded-lg p-6 text-center">
          <h2 className="text-xl font-bold text-red-400 mb-2">You&apos;re Out!</h2>
          <p className="text-gray-400">
            You went bankrupt and can no longer participate. Watch the remaining players battle it out!
          </p>
        </section>
      )}

      {/* Phase-specific content */}
      {phase === "lobby" && <LobbyView />}
      {phase === "planning" && player && !isEliminated && (
        <PlanningView
          gameState={gameState}
          player={player}
          playerId={playerId!}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "investment" && player && !isEliminated && (
        <InvestmentView
          gameState={gameState}
          player={player}
          playerId={playerId!}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "customerDraft" && player && !isEliminated && (
        <CustomerDraftView
          gameState={gameState}
          player={player}
          playerId={playerId!}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "customerResolution" && player && !isEliminated && (
        <CustomerResolutionView
          gameState={gameState}
          player={player}
          playerId={playerId!}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "shopClosed" && player && !isEliminated && (
        <ShopClosedView
          gameState={gameState}
          playerId={playerId!}
          dispatch={dispatch}
          isLoading={isLoading}
        />
      )}
      {phase === "cleanup" && player && !isEliminated && (
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
      {phase !== "lobby" && phase !== "gameOver" && gameState && (
        <PlayerStatusGrid
          players={gameState.players}
          playerOrder={gameState.playerOrder}
          currentPlayerId={playerId!}
          eliminatedPlayers={gameState.eliminatedPlayers}
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
  gameState: CafeState | null;
  dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}) {
  // In lobby phase, gameState may be null - only show Start Game button
  if (!gameState) {
    if (phase === "lobby") {
      return (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Host Controls</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => dispatch("START_GAME")}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              Start Game
            </button>
          </div>
        </section>
      );
    }
    return null;
  }

  // Check if all active players are ready
  const activePlayers = gameState.playerOrder.filter(
    id => !gameState.eliminatedPlayers.includes(id)
  );
  const readyCount = gameState.playersReady.length;
  const totalActive = activePlayers.length;
  const allReady = activePlayers.every(id => gameState.playersReady.includes(id));

  // Check if all players have confirmed resolution (for customerResolution phase)
  const confirmedCount = gameState.playersConfirmedResolution.length;
  const allConfirmed = activePlayers.every(id => gameState.playersConfirmedResolution.includes(id));

  // Phases that require ready queue
  const requiresReady = ["planning", "investment", "shopClosed", "cleanup"].includes(phase);
  const requiresConfirmation = phase === "customerResolution";

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold">Host Controls</h2>
        {requiresReady && (
          <span className={`text-sm ${allReady ? "text-green-400" : "text-yellow-400"}`}>
            Ready: {readyCount}/{totalActive}
          </span>
        )}
        {requiresConfirmation && (
          <span className={`text-sm ${allConfirmed ? "text-green-400" : "text-yellow-400"}`}>
            Confirmed: {confirmedCount}/{totalActive}
          </span>
        )}
      </div>
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
            disabled={isLoading || !allReady}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Begin Investment Phase
          </button>
        )}

        {phase === "investment" && (
          <button
            onClick={() => dispatch("END_INVESTMENT")}
            disabled={isLoading || !allReady}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Start Customer Draft
          </button>
        )}

        {phase === "customerResolution" && (
          <button
            onClick={() => dispatch("RESOLVE_CUSTOMERS")}
            disabled={isLoading || !allConfirmed}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Resolve & Collect Rewards
          </button>
        )}

        {phase === "shopClosed" && (
          <button
            onClick={() => dispatch("CLOSE_SHOP")}
            disabled={isLoading || !allReady}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Pay Rent & End Day
          </button>
        )}

        {phase === "cleanup" && (
          <button
            onClick={() => dispatch("END_ROUND")}
            disabled={isLoading || !allReady}
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
// READY BUTTON COMPONENT
// =============================================================================

function ReadyButton({
  gameState,
  playerId,
  dispatch,
  isLoading,
  disabled,
  disabledMessage,
}: {
  gameState: CafeState;
  playerId: string;
  dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const isReady = gameState.playersReady.includes(playerId);
  const activePlayers = gameState.playerOrder.filter(
    id => !gameState.eliminatedPlayers.includes(id)
  );
  const readyCount = gameState.playersReady.length;
  const totalActive = activePlayers.length;

  return (
    <div className="bg-gray-900 rounded-lg p-4 mt-4">
      <div className="flex justify-between items-center">
        <div>
          <span className="text-gray-400 text-sm">
            Players ready: <span className="text-white">{readyCount}/{totalActive}</span>
          </span>
          {!isReady && !disabled && readyCount < totalActive && (
            <p className="text-xs text-gray-500 mt-1">
              Click ready when you&apos;re done
            </p>
          )}
          {disabled && disabledMessage && (
            <p className="text-xs text-red-400 mt-1">
              {disabledMessage}
            </p>
          )}
        </div>
        {isReady ? (
          <span className="text-green-400 font-semibold px-4 py-2">Ready!</span>
        ) : (
          <button
            onClick={() => dispatch("PLAYER_READY")}
            disabled={isLoading || disabled}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Ready
          </button>
        )}
      </div>
    </div>
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

function PlanningView({
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
  const needsDiscard = gameState.playersNeedingHandDiscard.includes(playerId);

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Planning Phase</h2>
      <p className="text-gray-400 mb-4">
        Review your resources before investing.
        {gameState.round > 1 && " You drew a new upgrade card this round!"}
      </p>

      <div className="space-y-4">
        {/* Supplies */}
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

        {/* Upgrade Cards Section */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Upgrade Hand - with discard if needed */}
          <UpgradeHandPanel
            player={player}
            gameState={gameState}
            playerId={playerId}
            dispatch={dispatch}
            isLoading={isLoading}
            showActivate={false}
            showDiscard={needsDiscard}
          />

          {/* Active Upgrades - view only */}
          <ActiveUpgradesPanel
            player={player}
            isLoading={isLoading}
          />
        </div>
      </div>

      <ReadyButton
        gameState={gameState}
        playerId={playerId}
        dispatch={dispatch}
        isLoading={isLoading}
        disabled={needsDiscard}
        disabledMessage={needsDiscard ? "You must discard cards before continuing" : undefined}
      />
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

const UPGRADE_CATEGORY_INFO: Record<UpgradeCardCategory, { label: string; color: string; bgColor: string }> = {
  efficiency: { label: "Efficiency", color: "text-blue-400", bgColor: "bg-blue-900/30" },
  capacity: { label: "Capacity", color: "text-green-400", bgColor: "bg-green-900/30" },
  reputation: { label: "Reputation", color: "text-purple-400", bgColor: "bg-purple-900/30" },
  specialty: { label: "Specialty", color: "text-yellow-400", bgColor: "bg-yellow-900/30" },
};

// ============================================================================
// UPGRADE CARD COMPONENTS
// ============================================================================

function UpgradeCardDisplay({
  card,
  onActivate,
  onDiscard,
  isActivatable,
  isDiscardable,
  isActive,
  isLoading,
  canAfford,
}: {
  card: UpgradeCard;
  onActivate?: () => void;
  onDiscard?: () => void;
  isActivatable?: boolean;
  isDiscardable?: boolean;
  isActive?: boolean;
  isLoading?: boolean;
  canAfford?: boolean;
}) {
  const categoryInfo = UPGRADE_CATEGORY_INFO[card.category];
  const cost = card.cost;

  // Build cost string
  const costParts: string[] = [];
  if (cost.money) {
    costParts.push(`$${cost.money}`);
  }
  if (cost.supplies) {
    for (const [supply, qty] of Object.entries(cost.supplies)) {
      if (qty) {
        costParts.push(`${qty} ${SUPPLY_INFO[supply as SupplyType]?.label || supply}`);
      }
    }
  }
  const costString = costParts.length > 0 ? costParts.join(", ") : "Free";

  return (
    <div className={`${categoryInfo.bgColor} border border-gray-600 rounded-lg p-3 ${isActive ? "ring-2 ring-yellow-500" : ""}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className={`text-xs ${categoryInfo.color} uppercase tracking-wide`}>
            {categoryInfo.label}
          </span>
          <h4 className="font-semibold text-white text-sm">{card.name}</h4>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-2">{card.description}</p>

      <div className="flex justify-between items-center">
        <span className={`text-xs ${canAfford === false ? "text-red-400" : "text-gray-300"}`}>
          Cost: {costString}
        </span>

        <div className="flex gap-1">
          {isActivatable && onActivate && (
            <button
              onClick={onActivate}
              disabled={isLoading || canAfford === false}
              className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 px-2 py-1 rounded transition-colors"
            >
              Activate
            </button>
          )}
          {isDiscardable && onDiscard && (
            <button
              onClick={onDiscard}
              disabled={isLoading}
              className="text-xs bg-red-600 hover:bg-red-700 disabled:bg-gray-700 px-2 py-1 rounded transition-colors"
            >
              Discard
            </button>
          )}
        </div>
      </div>

      {card.prerequisite && (
        <div className="mt-2 text-xs text-orange-400">
          Requires: {card.prerequisite.requiresUpgradeCategory
            ? `Active ${UPGRADE_CATEGORY_INFO[card.prerequisite.requiresUpgradeCategory].label} upgrade`
            : card.prerequisite.requiresCafeUpgrade
              ? `${card.prerequisite.requiresCafeUpgrade.type} level ${card.prerequisite.requiresCafeUpgrade.minLevel}+`
              : ""}
        </div>
      )}
    </div>
  );
}

function UpgradeHandPanel({
  player,
  gameState,
  playerId,
  dispatch,
  isLoading,
  showActivate,
  showDiscard,
  onSelectForReplace,
  selectedForReplace,
}: {
  player: CafePlayerState;
  gameState: CafeState;
  playerId: string;
  dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
  showActivate?: boolean;
  showDiscard?: boolean;
  onSelectForReplace?: (index: number) => void;
  selectedForReplace?: number | null;
}) {
  const needsDiscard = gameState.playersNeedingHandDiscard.includes(playerId);
  const hand = player.upgradeHand;

  if (hand.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Upgrade Cards in Hand</h3>
        <p className="text-gray-500 text-sm">No upgrade cards in hand</p>
      </div>
    );
  }

  // Check if player can afford each card
  const canAffordCard = (card: UpgradeCard) => {
    if ((card.cost.money || 0) > player.money) return false;
    if (card.cost.supplies) {
      for (const [supply, qty] of Object.entries(card.cost.supplies)) {
        if ((qty || 0) > player.supplies[supply as SupplyType]) return false;
      }
    }
    return true;
  };

  // Check prerequisites for each card
  const meetsPrerequisites = (card: UpgradeCard) => {
    if (!card.prerequisite) return true;
    const prereq = card.prerequisite;

    if (prereq.requiresUpgradeCategory) {
      const hasCategory = player.activeUpgrades.some(
        (u) => u.category === prereq.requiresUpgradeCategory
      );
      if (!hasCategory) return false;
    }

    if (prereq.requiresCafeUpgrade) {
      const currentLevel = player.upgrades[prereq.requiresCafeUpgrade.type];
      if (currentLevel < prereq.requiresCafeUpgrade.minLevel) return false;
    }

    return true;
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Upgrade Cards in Hand</h3>
        <span className="text-xs text-gray-400">{hand.length}/{UPGRADE_CONFIG.MAX_HAND_SIZE}</span>
      </div>

      {needsDiscard && (
        <div className="bg-red-900/40 border border-red-600 rounded p-2 mb-3">
          <p className="text-red-400 text-sm font-semibold">
            Over hand limit! You must discard {hand.length - UPGRADE_CONFIG.MAX_HAND_SIZE} card(s).
          </p>
        </div>
      )}

      <div className="grid gap-2">
        {hand.map((card, index) => {
          const affordable = canAffordCard(card);
          const prereqMet = meetsPrerequisites(card);
          const canActivate = showActivate && affordable && prereqMet;

          return (
            <div
              key={card.id}
              className={selectedForReplace === index ? "ring-2 ring-blue-500 rounded-lg" : ""}
              onClick={onSelectForReplace ? () => onSelectForReplace(index) : undefined}
            >
              <UpgradeCardDisplay
                card={card}
                isActivatable={canActivate}
                isDiscardable={showDiscard || needsDiscard}
                isLoading={isLoading}
                canAfford={affordable && prereqMet}
                onActivate={canActivate ? () => {
                  // Check if we need to replace an active upgrade
                  if (player.activeUpgrades.length >= UPGRADE_CONFIG.MAX_ACTIVE_UPGRADES) {
                    // Need to select which active upgrade to replace
                    if (onSelectForReplace) {
                      onSelectForReplace(index);
                    }
                  } else {
                    dispatch("ACTIVATE_UPGRADE", { upgradeCardIndex: index });
                  }
                } : undefined}
                onDiscard={(showDiscard || needsDiscard) ? () => {
                  dispatch("DISCARD_UPGRADE_FROM_HAND", { upgradeCardIndex: index });
                } : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActiveUpgradesPanel({
  player,
  isLoading,
  onSelectForReplace,
  selectedForReplace,
  pendingActivation,
  dispatch,
}: {
  player: CafePlayerState;
  isLoading: boolean;
  onSelectForReplace?: (index: number) => void;
  selectedForReplace?: number | null;
  pendingActivation?: number | null;
  dispatch?: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const activeUpgrades = player.activeUpgrades;

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Active Upgrades</h3>
        <span className="text-xs text-gray-400">{activeUpgrades.length}/{UPGRADE_CONFIG.MAX_ACTIVE_UPGRADES}</span>
      </div>

      {pendingActivation !== null && pendingActivation !== undefined && (
        <div className="bg-blue-900/40 border border-blue-600 rounded p-2 mb-3">
          <p className="text-blue-400 text-sm">
            Select an active upgrade to replace, or click the card again to cancel.
          </p>
        </div>
      )}

      {activeUpgrades.length === 0 ? (
        <p className="text-gray-500 text-sm">No active upgrades</p>
      ) : (
        <div className="grid gap-2">
          {activeUpgrades.map((card, index) => (
            <div
              key={card.id}
              className={`cursor-pointer ${selectedForReplace === index ? "ring-2 ring-red-500 rounded-lg" : ""}`}
              onClick={() => {
                if (pendingActivation !== null && pendingActivation !== undefined && onSelectForReplace && dispatch) {
                  // Confirm replacement
                  dispatch("ACTIVATE_UPGRADE", {
                    upgradeCardIndex: pendingActivation,
                    activeUpgradeIndex: index,
                  });
                } else if (onSelectForReplace) {
                  onSelectForReplace(index);
                }
              }}
            >
              <UpgradeCardDisplay
                card={card}
                isActive={true}
                isLoading={isLoading}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InvestmentView({
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
  const supplyTypes: SupplyType[] = ["coffeeBeans", "tea", "milk", "syrup"];

  // State for tracking upgrade activation when at max active upgrades
  const [pendingActivation, setPendingActivation] = useState<number | null>(null);

  const handleSelectCardForActivation = (handIndex: number) => {
    if (player.activeUpgrades.length >= UPGRADE_CONFIG.MAX_ACTIVE_UPGRADES) {
      // Toggle selection - if already selected, cancel
      if (pendingActivation === handIndex) {
        setPendingActivation(null);
      } else {
        setPendingActivation(handIndex);
      }
    }
  };

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">Investment Phase</h2>
      <p className="text-gray-400 mb-4">
        Spend money to prepare for customers. Money: <span className="text-yellow-400 font-bold">${player.money}</span>
      </p>

      <div className="space-y-4">
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

        {/* Upgrade Cards Section */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Upgrade Hand */}
          <UpgradeHandPanel
            player={player}
            gameState={gameState}
            playerId={playerId}
            dispatch={dispatch}
            isLoading={isLoading}
            showActivate={true}
            onSelectForReplace={handleSelectCardForActivation}
            selectedForReplace={pendingActivation}
          />

          {/* Active Upgrades */}
          <ActiveUpgradesPanel
            player={player}
            isLoading={isLoading}
            pendingActivation={pendingActivation}
            dispatch={dispatch}
            onSelectForReplace={(index) => {
              if (pendingActivation !== null) {
                dispatch("ACTIVATE_UPGRADE", {
                  upgradeCardIndex: pendingActivation,
                  activeUpgradeIndex: index,
                });
                setPendingActivation(null);
              }
            }}
          />
        </div>
      </div>

      <ReadyButton
        gameState={gameState}
        playerId={playerId}
        dispatch={dispatch}
        isLoading={isLoading}
      />
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

      {/* Delight & Storm hints */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-2">
          <p className="text-yellow-500 font-semibold mb-1">Delight</p>
          <p className="text-yellow-300/80">{archetype.delightDescription}</p>
        </div>
        <div className="bg-red-900/30 border border-red-700/50 rounded p-2">
          <p className="text-red-500 font-semibold mb-1">Storm Out</p>
          <p className="text-red-300/80">{archetype.stormOutDescription}</p>
        </div>
      </div>

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

  return (
    <div className="bg-gradient-to-br from-amber-900/40 to-purple-900/40 border border-amber-600 rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs text-amber-400 uppercase tracking-wide">{archetype.name}</p>
          <h3 className="text-lg font-bold text-white">{back.orderName}</h3>
        </div>
        <div className="flex gap-2">
          <span className="text-yellow-400 font-bold">${back.reward.money}</span>
        </div>
      </div>

      <p className="text-gray-300 text-sm mb-3">{archetype.description}</p>

      {/* Required Supplies */}
      <div className="bg-gray-900/50 rounded p-3 mb-3">
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

      {/* Delight & Storm Out conditions */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-2">
          <p className="text-yellow-500 font-semibold mb-1">Delight (Rep +1)</p>
          <p className="text-yellow-300/80">{archetype.delightDescription}</p>
        </div>
        <div className="bg-red-900/30 border border-red-700/50 rounded p-2">
          <p className="text-red-500 font-semibold mb-1">Storm Out</p>
          <p className="text-red-300/80">{archetype.stormOutDescription}</p>
        </div>
      </div>
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

  // Check which selected customers can be fulfilled and predict outcome
  type PredictedOutcome = "delighted" | "satisfied" | "stormed_out";

  const predictOutcome = (index: number): { canFulfill: boolean; outcome: PredictedOutcome; remainingAfter: Record<SupplyType, number> } => {
    const customer = player.customerLine[index];
    const archetype = getCardArchetype(customer);
    const isSelected = selectedIndices.includes(index);

    if (!isSelected) {
      return { canFulfill: false, outcome: "stormed_out", remainingAfter: player.supplies };
    }

    // Calculate remaining supplies after processing earlier customers
    const remaining: Record<SupplyType, number> = { ...player.supplies };
    for (let i = 0; i < index; i++) {
      if (selectedIndices.includes(i)) {
        const req = player.customerLine[i].back.requiresSupplies;
        for (const [s, q] of Object.entries(req)) {
          if (q && q > 0) remaining[s as SupplyType] -= q;
        }
      }
    }

    // Check if can fulfill
    const required = customer.back.requiresSupplies;
    let canFulfill = true;
    for (const [supply, qty] of Object.entries(required)) {
      if (qty && qty > 0 && remaining[supply as SupplyType] < qty) {
        canFulfill = false;
        break;
      }
    }

    if (!canFulfill) {
      return { canFulfill: false, outcome: "stormed_out", remainingAfter: remaining };
    }

    // Calculate remaining after this order
    const remainingAfter = { ...remaining };
    for (const [supply, qty] of Object.entries(required)) {
      if (qty && qty > 0) {
        remainingAfter[supply as SupplyType] -= qty;
      }
    }

    // Check delight condition
    const condition = archetype.delightCondition;
    let isDelighted = false;

    if (condition.type === "surplus_supply") {
      isDelighted = remainingAfter[condition.supply] >= condition.amount;
    } else if (condition.type === "all_supplies_stocked") {
      // Check supplies BEFORE consuming this order
      isDelighted = remaining.coffeeBeans >= 1 &&
                   remaining.tea >= 1 &&
                   remaining.milk >= 1 &&
                   remaining.syrup >= 1;
    } else if (condition.type === "total_surplus") {
      const total = remainingAfter.coffeeBeans + remainingAfter.tea + remainingAfter.milk + remainingAfter.syrup;
      isDelighted = total >= condition.amount;
    } else if (condition.type === "serve_multiple") {
      // Count how many of this archetype are selected and can be fulfilled
      let countOfArchetype = 0;
      for (let j = 0; j < player.customerLine.length; j++) {
        if (selectedIndices.includes(j)) {
          const otherCustomer = player.customerLine[j];
          if (otherCustomer.front.archetypeId === customer.front.archetypeId) {
            // Check if this one can be fulfilled (simplified check)
            const otherPrediction = j < index ? predictOutcome(j) : null;
            if (j === index || (otherPrediction && otherPrediction.canFulfill)) {
              countOfArchetype++;
            } else if (j > index) {
              // For later customers, do a quick fulfillability check
              const laterRemaining = { ...remainingAfter };
              for (let k = index + 1; k < j; k++) {
                if (selectedIndices.includes(k)) {
                  const kReq = player.customerLine[k].back.requiresSupplies;
                  for (const [s, q] of Object.entries(kReq)) {
                    if (q && q > 0) laterRemaining[s as SupplyType] -= q;
                  }
                }
              }
              const jReq = player.customerLine[j].back.requiresSupplies;
              let jCanFulfill = true;
              for (const [s, q] of Object.entries(jReq)) {
                if (q && q > 0 && laterRemaining[s as SupplyType] < q) {
                  jCanFulfill = false;
                  break;
                }
              }
              if (jCanFulfill) countOfArchetype++;
            }
          }
        }
      }
      isDelighted = countOfArchetype >= condition.count;
    }

    return {
      canFulfill: true,
      outcome: isDelighted ? "delighted" : "satisfied",
      remainingAfter,
    };
  };

  // Pre-calculate all predictions
  const predictions = player.customerLine.map((_, i) => predictOutcome(i));

  // Count outcomes for summary
  const delightedCount = predictions.filter(p => p.outcome === "delighted").length;
  const satisfiedCount = predictions.filter(p => p.outcome === "satisfied").length;
  const stormedOutCount = predictions.filter(p => p.outcome === "stormed_out").length;

  const totalMoney = predictions
    .map((p, i) => p.canFulfill ? player.customerLine[i].back.reward.money : 0)
    .reduce((sum, m) => sum + m, 0);

  // Calculate predicted reputation change
  const reputationChange = delightedCount - stormedOutCount -
    predictions.filter((p, i) => {
      if (p.outcome !== "stormed_out") return false;
      const archetype = getCardArchetype(player.customerLine[i]);
      return archetype.stormOutEffect.type === "extra_reputation_loss";
    }).length; // Extra -1 for influencers

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
            Confirmed: {gameState.playersConfirmedResolution.length} / {gameState.playerOrder.filter(id => !gameState.eliminatedPlayers.includes(id)).length}
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
              const prediction = predictions[i];
              const requiredList = Object.entries(customer.back.requiresSupplies)
                .filter(([_, qty]) => qty && qty > 0)
                .map(([supply, qty]) => `${qty} ${SUPPLY_INFO[supply as SupplyType]?.label || supply}`);

              // Determine border/background based on outcome
              let borderClass = "bg-gray-900 border-gray-700 hover:border-gray-500";
              if (isSelected) {
                if (prediction.outcome === "delighted") {
                  borderClass = "bg-yellow-900/30 border-yellow-500";
                } else if (prediction.outcome === "satisfied") {
                  borderClass = "bg-green-900/30 border-green-600";
                } else {
                  borderClass = "bg-red-900/30 border-red-600";
                }
              }

              return (
                <div
                  key={i}
                  className={`rounded-lg p-4 border cursor-pointer transition-colors ${borderClass}`}
                  onClick={() => !hasConfirmed && dispatch("TOGGLE_CUSTOMER_FULFILL", { customerIndex: i })}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center mt-0.5 ${
                        isSelected
                          ? prediction.outcome === "delighted"
                            ? "bg-yellow-500 border-yellow-500"
                            : prediction.outcome === "satisfied"
                            ? "bg-green-600 border-green-600"
                            : "bg-red-600 border-red-600"
                          : "border-gray-500"
                      }`}>
                        {isSelected && <span className="text-white text-sm">✓</span>}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{archetype.emoji}</span>
                          <span className="font-semibold">{customer.back.orderName}</span>
                          {/* Outcome badge */}
                          {isSelected && (
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                              prediction.outcome === "delighted"
                                ? "bg-yellow-600 text-yellow-100"
                                : prediction.outcome === "satisfied"
                                ? "bg-green-700 text-green-100"
                                : "bg-red-700 text-red-100"
                            }`}>
                              {prediction.outcome === "delighted" && "★ Delighted"}
                              {prediction.outcome === "satisfied" && "Satisfied"}
                              {prediction.outcome === "stormed_out" && "Storm Out!"}
                            </span>
                          )}
                          {!isSelected && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
                              Will storm out
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{archetype.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Requires: {requiredList.join(", ") || "Nothing"}
                        </p>
                        {/* Delight condition hint */}
                        <p className="text-xs text-yellow-500/70 mt-1">
                          Delight: {archetype.delightDescription}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-yellow-400 font-bold">${customer.back.reward.money}</span>
                      {isSelected && prediction.outcome === "stormed_out" && (
                        <p className="text-xs text-red-400 mt-1">
                          {archetype.stormOutDescription}
                        </p>
                      )}
                      {!isSelected && (
                        <p className="text-xs text-red-400 mt-1">
                          {archetype.stormOutDescription}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="bg-gray-900 rounded-lg p-3 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400">Outcome Preview:</span>
              <span className="text-yellow-400 font-bold">+${totalMoney}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {delightedCount > 0 && (
                <span className="text-yellow-400">★ {delightedCount} Delighted</span>
              )}
              {satisfiedCount > 0 && (
                <span className="text-green-400">{satisfiedCount} Satisfied</span>
              )}
              {stormedOutCount > 0 && (
                <span className="text-red-400">{stormedOutCount} Storm Out</span>
              )}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Reputation: {reputationChange >= 0 ? "+" : ""}{reputationChange}
              {reputationChange > 0 && " (from delighted customers)"}
              {reputationChange < 0 && " (from storm outs)"}
              {reputationChange === 0 && " (no change)"}
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

function ShopClosedView({
  gameState,
  playerId,
  dispatch,
  isLoading,
}: {
  gameState: CafeState;
  playerId: string;
  dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}) {
  const rent = GAME_CONFIG.RENT_PER_ROUND;

  // Calculate summary for each active player
  const summaries = gameState.playerOrder
    .filter(id => !gameState.eliminatedPlayers.includes(id))
    .map(id => {
      const player = gameState.players[id];
      const canAffordRent = player.money >= rent;
      return {
        id,
        name: player.name,
        money: player.money,
        prestige: player.prestige,
        customersServed: player.customersServed,
        canAffordRent,
        afterRent: canAffordRent ? player.money - rent : 0,
      };
    });

  const playersAtRisk = summaries.filter(p => !p.canAffordRent);

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
              <span className="flex items-center gap-2">
                {p.name}
                {!p.canAffordRent && (
                  <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded">AT RISK</span>
                )}
              </span>
              <div className="flex gap-4">
                <span className={p.canAffordRent ? "text-yellow-400" : "text-red-400"}>
                  ${p.money}
                </span>
                {p.canAffordRent && (
                  <span className="text-gray-500">
                    → ${p.afterRent}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`rounded-lg p-4 text-center border ${
        playersAtRisk.length > 0
          ? "bg-red-900/30 border-red-700"
          : "bg-amber-900/30 border-amber-700"
      }`}>
        <p className={playersAtRisk.length > 0 ? "text-red-400" : "text-amber-400"}>
          Time to pay rent: ${rent} per player
        </p>
        {playersAtRisk.length > 0 && (
          <p className="text-red-300 text-sm mt-2">
            {playersAtRisk.length === 1
              ? `${playersAtRisk[0].name} cannot afford rent and will go bankrupt!`
              : `${playersAtRisk.map(p => p.name).join(", ")} cannot afford rent and will go bankrupt!`}
          </p>
        )}
      </div>

      <ReadyButton
        gameState={gameState}
        playerId={playerId}
        dispatch={dispatch}
        isLoading={isLoading}
      />
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
  const rent = GAME_CONFIG.RENT_PER_ROUND;
  const canAffordRent = player.money >= rent;
  const myRentPaidBy = gameState.rentPaidBy[playerId];
  const amBailedOut = myRentPaidBy !== null;

  // Find players who need bailout (can't afford rent and not yet bailed out, excluding eliminated)
  const playersNeedingBailout = gameState.playerOrder
    .filter(id => id !== playerId && !gameState.eliminatedPlayers.includes(id))
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
              Your money: <span className="text-yellow-400">${player.money}</span>
              {canAffordRent && !amBailedOut && (
                <span className="text-gray-500"> → ${player.money - rent} after rent</span>
              )}
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
                <span className="text-red-400 font-semibold">BANKRUPTCY!</span>
                <p className="text-xs text-red-300 mt-1">You will be eliminated!</p>
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
            Save another player from bankruptcy by paying their rent!
          </p>
          <div className="space-y-2">
            {playersNeedingBailout.map(({ id, player: targetPlayer, needsBailout, wasBailedOut, bailedOutBy }) => (
              <div key={id} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                <div>
                  <span className="font-medium">{targetPlayer.name}</span>
                  <span className="text-sm ml-2 text-yellow-400">
                    (${targetPlayer.money})
                  </span>
                  {needsBailout && !wasBailedOut && (
                    <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded ml-2">GOING BANKRUPT</span>
                  )}
                </div>
                {wasBailedOut ? (
                  <span className="text-green-400 text-sm">
                    Saved by {gameState.players[bailedOutBy!]?.name}
                  </span>
                ) : needsBailout && canBailoutOthers ? (
                  <button
                    onClick={() => dispatch("PAY_RENT_FOR", { targetPlayerId: id })}
                    disabled={isLoading}
                    className="text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-3 py-1 rounded transition-colors"
                  >
                    Save them (${rent})
                  </button>
                ) : needsBailout ? (
                  <span className="text-red-400 text-sm">Will go bankrupt</span>
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
            : "Players who can&apos;t pay rent will go bankrupt and be eliminated!"}
        </p>
      </div>

      <ReadyButton
        gameState={gameState}
        playerId={playerId}
        dispatch={dispatch}
        isLoading={isLoading}
      />
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
  const eliminatedPlayers = gameState.eliminatedPlayers;

  // Check if won by last player standing
  const activePlayers = gameState.playerOrder.filter(
    id => !eliminatedPlayers.includes(id)
  );
  const wonByLastStanding = activePlayers.length === 1 && winner !== null;

  // Sort active players by score (prestige disabled for now, just use money)
  const sortedActivePlayers = gameState.playerOrder
    .filter(id => !eliminatedPlayers.includes(id))
    .map((id) => {
      const p = gameState.players[id];
      return {
        ...p,
        score: p.money,
        eliminated: false,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Get eliminated players in order they were eliminated (reverse order in array)
  const eliminatedPlayersList = eliminatedPlayers.map(id => {
    const p = gameState.players[id];
    return {
      ...p,
      score: p.money,
      eliminated: true,
    };
  });

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-2xl font-bold text-center mb-6">Game Over!</h2>

      {winner ? (
        <div
          className={`text-center p-6 rounded-lg mb-6 ${
            isWinner
              ? "bg-yellow-900/30 border border-yellow-600"
              : "bg-gray-900"
          }`}
        >
          <p className="text-gray-400 mb-2">
            {wonByLastStanding ? "Last Player Standing!" : "Winner"}
          </p>
          <p className="text-3xl font-bold text-yellow-400">
            {winner.name}
            {isWinner && " (You!)"}
          </p>
          <p className="text-gray-400 mt-2">
            Final Money: ${winner.money}
          </p>
          {wonByLastStanding && (
            <p className="text-sm text-amber-400 mt-2">
              All other players went bankrupt!
            </p>
          )}
        </div>
      ) : (
        <div className="text-center p-6 rounded-lg mb-6 bg-gray-900">
          <p className="text-gray-400 mb-2">No Winner</p>
          <p className="text-xl text-red-400">Everyone went bankrupt!</p>
        </div>
      )}

      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Final Standings</h3>
        <div className="space-y-2">
          {/* Active players first */}
          {sortedActivePlayers.map((p, i) => (
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
                <span className="text-yellow-400" title="Final Money">
                  ${p.money}
                </span>
              </div>
            </div>
          ))}

          {/* Eliminated players */}
          {eliminatedPlayersList.length > 0 && (
            <>
              <div className="border-t border-gray-700 my-3"></div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Bankrupt</p>
              {eliminatedPlayersList.map((p) => (
                <div
                  key={p.id}
                  className={`flex justify-between items-center p-2 rounded opacity-60 ${
                    p.id === playerId ? "bg-red-900/30" : "bg-gray-800"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-red-400">💀</span>
                    {p.name}
                  </span>
                  <span className="text-xs text-red-400">BANKRUPT</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// REPUTATION TRACK PANEL
// =============================================================================

function ReputationTrackPanel({
  reputation,
  playerCount,
}: {
  reputation: number;
  playerCount: number;
}) {
  const modifier = getReputationCustomerModifier(reputation);
  const baseCustomers = playerCount * GAME_CONFIG.CUSTOMERS_PER_PLAYER;
  const nextRoundCustomers = Math.max(1, baseCustomers + modifier);

  // Determine tier label
  let tierLabel: string;
  let tierColor: string;
  if (reputation <= -2) {
    tierLabel = "Low";
    tierColor = "text-red-400";
  } else if (reputation >= 2) {
    tierLabel = "High";
    tierColor = "text-green-400";
  } else {
    tierLabel = "Neutral";
    tierColor = "text-gray-400";
  }

  // Create visual track markers
  const trackPositions = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold">Shop Reputation</h2>
        <div className="text-right">
          <span className={`font-bold ${tierColor}`}>{tierLabel}</span>
          <span className="text-gray-400 ml-2">({reputation >= 0 ? "+" : ""}{reputation})</span>
        </div>
      </div>

      {/* Visual track */}
      <div className="bg-gray-900 rounded-lg p-3 mb-3">
        <div className="flex justify-between items-center">
          {trackPositions.map((pos) => {
            const isActive = pos === reputation;
            const isNegative = pos < 0;
            const isPositive = pos > 0;
            const isNeutral = pos === 0;

            let bgColor = "bg-gray-700";
            if (isActive) {
              if (isNegative) bgColor = "bg-red-500";
              else if (isPositive) bgColor = "bg-green-500";
              else bgColor = "bg-yellow-500";
            } else if (isNegative) {
              bgColor = "bg-red-900/50";
            } else if (isPositive) {
              bgColor = "bg-green-900/50";
            }

            return (
              <div key={pos} className="flex flex-col items-center">
                <div
                  className={`w-6 h-6 rounded-full ${bgColor} flex items-center justify-center text-xs font-bold transition-all ${
                    isActive ? "ring-2 ring-white scale-110" : ""
                  }`}
                >
                  {isActive && (pos >= 0 ? "+" : "")}{isActive && pos}
                </div>
                {(pos === -5 || pos === 0 || pos === 5) && (
                  <span className="text-xs text-gray-500 mt-1">
                    {pos === -5 ? "-5" : pos === 0 ? "0" : "+5"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer effect info */}
      <div className="flex justify-between items-center text-sm">
        <div className="text-gray-400">
          <span>Next round customers: </span>
          <span className="text-white font-semibold">{nextRoundCustomers}</span>
          {modifier !== 0 && (
            <span className={modifier > 0 ? "text-green-400 ml-1" : "text-red-400 ml-1"}>
              ({modifier > 0 ? "+" : ""}{modifier})
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {modifier > 0 && "More customers attracted!"}
          {modifier < 0 && "Fewer customers coming..."}
          {modifier === 0 && "Normal customer flow"}
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
  eliminatedPlayers = [],
}: {
  players: Record<string, CafePlayerState>;
  playerOrder: string[];
  currentPlayerId: string;
  eliminatedPlayers?: string[];
}) {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h2 className="font-semibold mb-3">All Players</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {playerOrder.map((id) => {
          const p = players[id];
          const isMe = id === currentPlayerId;
          const isEliminated = eliminatedPlayers.includes(id);
          const totalSupplies = p.supplies.coffeeBeans + p.supplies.tea + p.supplies.milk + p.supplies.syrup;
          return (
            <div
              key={id}
              className={`bg-gray-900 rounded-lg p-3 ${
                isMe ? "ring-2 ring-blue-500" : ""
              } ${isEliminated ? "opacity-50" : ""}`}
            >
              <p className="font-semibold text-sm truncate">
                {p.name}
                {isMe && " (You)"}
              </p>
              {isEliminated && (
                <span className="text-xs bg-red-600 text-white px-1 rounded">BANKRUPT</span>
              )}
              <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                <div className="flex justify-between">
                  <span>Money:</span>
                  <span className={isEliminated ? "text-red-400" : "text-yellow-400"}>
                    {isEliminated ? "---" : `$${p.money}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Supplies:</span>
                  <span title={`Beans: ${p.supplies.coffeeBeans}, Tea: ${p.supplies.tea}, Milk: ${p.supplies.milk}, Syrup: ${p.supplies.syrup}`}>
                    {isEliminated ? "---" : totalSupplies}
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
