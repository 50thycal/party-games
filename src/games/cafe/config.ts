import { defineGame } from "@/engine/defineGame";
import type { GameContext, Player } from "@/engine/types";

// =============================================================================
// PHASE DEFINITIONS
// =============================================================================

export type CafePhase =
  | "lobby"
  | "planning" // Round start - review hand/resources
  | "investment" // Spend money on supplies/upgrades
  | "customerArrival" // Reveal customer, check eligibility, commit, resolve
  | "customerResolution" // Payoff from customer line
  | "cleanup" // Pay rent, discard, prepare next round
  | "gameOver";

// Sub-phases within customerArrival
export type CustomerArrivalSubPhase =
  | "revealing" // Showing customer archetype
  | "eligibilityCheck" // Determining who can compete
  | "commitment" // Players secretly commit cards
  | "reveal"; // Reveal commitments and resolve winner

// =============================================================================
// GAME CONFIGURATION
// =============================================================================

export const GAME_CONFIG = {
  TOTAL_ROUNDS: 5,
  STARTING_MONEY: 10,
  CUSTOMERS_PER_ROUND: 3,
  RENT_PER_ROUND: 2,
  TIE_RULE: "customerLeaves" as const, // "customerLeaves" | "fewerCardsWins" | "splitReward"
};

// =============================================================================
// CARD & CUSTOMER TYPES
// =============================================================================

export interface AttractionCard {
  id: string;
  name: string;
  value: number; // Attraction power (simple addition)
  cost: number; // Cost to acquire
}

export interface CustomerCard {
  id: string;
  archetype: string; // e.g., "Coffee Snob", "Sweet Tooth", "Budget Diner"
  eligibilityRequirement: CustomerRequirement;
  reward: CustomerReward;
  description: string;
}

export interface CustomerRequirement {
  type: "minUpgrade" | "hasSupply" | "none";
  upgradeType?: CafeUpgradeType;
  minLevel?: number;
  supplyType?: SupplyType;
}

export interface CustomerReward {
  money: number;
  tips: number;
  prestige: number;
}

export type CafeUpgradeType =
  | "seating"
  | "ambiance"
  | "equipment"
  | "menu";

export type SupplyType =
  | "coffee"
  | "pastries"
  | "specialty";

// =============================================================================
// PLAYER STATE
// =============================================================================

export interface CafePlayerState {
  id: string;
  name: string;
  money: number;
  prestige: number;

  // Hand of attraction cards
  hand: AttractionCard[];

  // Cafe setup (private corner)
  upgrades: Record<CafeUpgradeType, number>; // Level 0-3
  supplies: Record<SupplyType, number>; // Quantity owned

  // Current round state
  customerLine: CustomerCard[]; // Customers won this round
  committedCards: AttractionCard[]; // Cards committed for current customer
  hasCommitted: boolean; // Whether player has locked in commitment

  // Statistics
  customersServed: number;
  totalTipsEarned: number;
}

// =============================================================================
// GAME STATE
// =============================================================================

export interface CafeState {
  phase: CafePhase;
  round: number;

  // Player management
  playerOrder: string[];
  players: Record<string, CafePlayerState>;

  // Customer management
  customerDeck: CustomerCard[];
  currentRoundCustomers: CustomerCard[];
  currentCustomerIndex: number;
  currentCustomer: CustomerCard | null;

  // Customer arrival sub-phase tracking
  customerSubPhase: CustomerArrivalSubPhase;
  eligiblePlayerIds: string[];

  // Shared cafe state (optional future feature)
  sharedUpgrades: Record<string, number>;

  // Available cards for purchase
  attractionMarket: AttractionCard[];

  // End game
  winnerId: string | null;
}

// =============================================================================
// ACTION TYPES
// =============================================================================

export type CafeActionType =
  // Lobby
  | "START_GAME"
  // Planning phase
  | "END_PLANNING"
  // Investment phase
  | "PURCHASE_SUPPLY"
  | "PURCHASE_ATTRACTION"
  | "UPGRADE_CAFE"
  | "END_INVESTMENT"
  // Customer arrival phase
  | "REVEAL_CUSTOMER"
  | "COMMIT_CARDS"
  | "REVEAL_COMMITMENTS"
  | "AWARD_CUSTOMER"
  | "NEXT_CUSTOMER"
  // Customer resolution phase
  | "RESOLVE_CUSTOMERS"
  // Cleanup phase
  | "END_ROUND"
  // Game over
  | "PLAY_AGAIN";

export interface CafeAction {
  type: CafeActionType;
  playerId: string;
  payload?: {
    supplyType?: SupplyType;
    upgradeType?: CafeUpgradeType;
    cardIds?: string[];
    attractionId?: string;
    quantity?: number;
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createInitialPlayerState(player: Player): CafePlayerState {
  return {
    id: player.id,
    name: player.name,
    money: GAME_CONFIG.STARTING_MONEY,
    prestige: 0,
    hand: [],
    upgrades: {
      seating: 0,
      ambiance: 0,
      equipment: 0,
      menu: 0,
    },
    supplies: {
      coffee: 1,
      pastries: 1,
      specialty: 0,
    },
    customerLine: [],
    committedCards: [],
    hasCommitted: false,
    customersServed: 0,
    totalTipsEarned: 0,
  };
}

function createStarterAttractionCards(): AttractionCard[] {
  return [
    { id: "charm-1", name: "Friendly Smile", value: 1, cost: 0 },
    { id: "charm-2", name: "Quick Service", value: 1, cost: 0 },
    { id: "charm-3", name: "Cozy Corner", value: 2, cost: 0 },
  ];
}

function createCustomerDeck(ctx: GameContext): CustomerCard[] {
  const archetypes: CustomerCard[] = [
    {
      id: "customer-1",
      archetype: "Coffee Snob",
      eligibilityRequirement: { type: "hasSupply", supplyType: "coffee" },
      reward: { money: 4, tips: 2, prestige: 1 },
      description: "Demands premium coffee. Tips well for quality.",
    },
    {
      id: "customer-2",
      archetype: "Sweet Tooth",
      eligibilityRequirement: { type: "hasSupply", supplyType: "pastries" },
      reward: { money: 3, tips: 1, prestige: 0 },
      description: "Here for the pastries. Easy to please.",
    },
    {
      id: "customer-3",
      archetype: "Budget Diner",
      eligibilityRequirement: { type: "none" },
      reward: { money: 2, tips: 0, prestige: 0 },
      description: "Just wants cheap coffee. No frills.",
    },
    {
      id: "customer-4",
      archetype: "Influencer",
      eligibilityRequirement: { type: "minUpgrade", upgradeType: "ambiance", minLevel: 1 },
      reward: { money: 2, tips: 3, prestige: 3 },
      description: "Needs aesthetic vibes. Brings clout.",
    },
    {
      id: "customer-5",
      archetype: "Regular",
      eligibilityRequirement: { type: "none" },
      reward: { money: 3, tips: 1, prestige: 1 },
      description: "Loyal customer. Consistent business.",
    },
    {
      id: "customer-6",
      archetype: "Food Critic",
      eligibilityRequirement: { type: "minUpgrade", upgradeType: "menu", minLevel: 1 },
      reward: { money: 5, tips: 0, prestige: 4 },
      description: "Tough to impress. Major prestige boost.",
    },
    {
      id: "customer-7",
      archetype: "Group Booking",
      eligibilityRequirement: { type: "minUpgrade", upgradeType: "seating", minLevel: 1 },
      reward: { money: 6, tips: 2, prestige: 1 },
      description: "Large party. High revenue potential.",
    },
    {
      id: "customer-8",
      archetype: "Specialty Seeker",
      eligibilityRequirement: { type: "hasSupply", supplyType: "specialty" },
      reward: { money: 5, tips: 3, prestige: 2 },
      description: "Wants unique items. Premium spender.",
    },
  ];

  // Shuffle the deck
  const shuffled = [...archetypes];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function createAttractionMarket(): AttractionCard[] {
  return [
    { id: "market-1", name: "Latte Art", value: 2, cost: 2 },
    { id: "market-2", name: "Live Music", value: 3, cost: 4 },
    { id: "market-3", name: "Loyalty Card", value: 1, cost: 1 },
    { id: "market-4", name: "Free WiFi", value: 2, cost: 2 },
    { id: "market-5", name: "Vintage Decor", value: 3, cost: 3 },
    { id: "market-6", name: "Pet Friendly", value: 2, cost: 2 },
  ];
}

function checkEligibility(
  player: CafePlayerState,
  requirement: CustomerRequirement
): boolean {
  switch (requirement.type) {
    case "none":
      return true;
    case "hasSupply":
      return (
        requirement.supplyType !== undefined &&
        player.supplies[requirement.supplyType] > 0
      );
    case "minUpgrade":
      return (
        requirement.upgradeType !== undefined &&
        requirement.minLevel !== undefined &&
        player.upgrades[requirement.upgradeType] >= requirement.minLevel
      );
    default:
      return true;
  }
}

function getEligiblePlayers(
  state: CafeState,
  customer: CustomerCard
): string[] {
  return state.playerOrder.filter((playerId) =>
    checkEligibility(state.players[playerId], customer.eligibilityRequirement)
  );
}

function calculateCommitmentTotal(cards: AttractionCard[]): number {
  return cards.reduce((sum, card) => sum + card.value, 0);
}

function resolveCustomerContest(state: CafeState): string | null {
  const eligiblePlayers = state.eligiblePlayerIds;

  if (eligiblePlayers.length === 0) {
    return null;
  }

  if (eligiblePlayers.length === 1) {
    return eligiblePlayers[0];
  }

  // Calculate totals for each player
  const totals: { playerId: string; total: number; cardCount: number }[] = [];

  for (const playerId of eligiblePlayers) {
    const player = state.players[playerId];
    const total = calculateCommitmentTotal(player.committedCards);
    totals.push({
      playerId,
      total,
      cardCount: player.committedCards.length,
    });
  }

  // Sort by total (descending)
  totals.sort((a, b) => b.total - a.total);

  // Check for tie
  const highest = totals[0];
  const tied = totals.filter((t) => t.total === highest.total);

  if (tied.length === 1) {
    return highest.playerId;
  }

  // Handle tie based on global rule
  switch (GAME_CONFIG.TIE_RULE) {
    case "customerLeaves":
      return null;
    case "fewerCardsWins":
      // Sort tied players by card count (ascending)
      tied.sort((a, b) => a.cardCount - b.cardCount);
      return tied[0].cardCount < tied[1].cardCount ? tied[0].playerId : null;
    case "splitReward":
      // For now, just pick the first (could implement split later)
      return null;
    default:
      return null;
  }
}

function drawCustomersForRound(
  deck: CustomerCard[],
  count: number
): { drawn: CustomerCard[]; remaining: CustomerCard[] } {
  const drawn = deck.slice(0, count);
  const remaining = deck.slice(count);
  return { drawn, remaining };
}

// =============================================================================
// INITIAL STATE
// =============================================================================

function initialState(players: Player[]): CafeState {
  const playerStates: Record<string, CafePlayerState> = {};
  const playerOrder: string[] = [];

  for (const player of players) {
    const playerState = createInitialPlayerState(player);
    playerState.hand = createStarterAttractionCards();
    playerStates[player.id] = playerState;
    playerOrder.push(player.id);
  }

  return {
    phase: "lobby",
    round: 0,
    playerOrder,
    players: playerStates,
    customerDeck: [],
    currentRoundCustomers: [],
    currentCustomerIndex: 0,
    currentCustomer: null,
    customerSubPhase: "revealing",
    eligiblePlayerIds: [],
    sharedUpgrades: {},
    attractionMarket: createAttractionMarket(),
    winnerId: null,
  };
}

// =============================================================================
// REDUCER
// =============================================================================

function reducer(
  state: CafeState,
  action: CafeAction,
  ctx: GameContext
): CafeState {
  switch (action.type) {
    // =========================================================================
    // LOBBY -> GAME START
    // =========================================================================
    case "START_GAME": {
      const customerDeck = createCustomerDeck(ctx);
      const { drawn, remaining } = drawCustomersForRound(
        customerDeck,
        GAME_CONFIG.CUSTOMERS_PER_ROUND
      );

      return {
        ...state,
        phase: "planning",
        round: 1,
        customerDeck: remaining,
        currentRoundCustomers: drawn,
        currentCustomerIndex: 0,
        currentCustomer: null,
      };
    }

    // =========================================================================
    // PLANNING PHASE
    // =========================================================================
    case "END_PLANNING": {
      return {
        ...state,
        phase: "investment",
      };
    }

    // =========================================================================
    // INVESTMENT PHASE
    // =========================================================================
    case "PURCHASE_SUPPLY": {
      const { supplyType, quantity = 1 } = action.payload || {};
      if (!supplyType) return state;

      const player = state.players[action.playerId];
      const cost = quantity * 2; // Base cost per supply

      if (player.money < cost) return state;

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            money: player.money - cost,
            supplies: {
              ...player.supplies,
              [supplyType]: player.supplies[supplyType] + quantity,
            },
          },
        },
      };
    }

    case "PURCHASE_ATTRACTION": {
      const { attractionId } = action.payload || {};
      if (!attractionId) return state;

      const card = state.attractionMarket.find((c) => c.id === attractionId);
      if (!card) return state;

      const player = state.players[action.playerId];
      if (player.money < card.cost) return state;

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            money: player.money - card.cost,
            hand: [...player.hand, { ...card, id: `${card.id}-${Date.now()}` }],
          },
        },
        attractionMarket: state.attractionMarket.filter(
          (c) => c.id !== attractionId
        ),
      };
    }

    case "UPGRADE_CAFE": {
      const { upgradeType } = action.payload || {};
      if (!upgradeType) return state;

      const player = state.players[action.playerId];
      const currentLevel = player.upgrades[upgradeType];
      const cost = (currentLevel + 1) * 3; // Scaling cost

      if (player.money < cost || currentLevel >= 3) return state;

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            money: player.money - cost,
            upgrades: {
              ...player.upgrades,
              [upgradeType]: currentLevel + 1,
            },
          },
        },
      };
    }

    case "END_INVESTMENT": {
      return {
        ...state,
        phase: "customerArrival",
        customerSubPhase: "revealing",
        currentCustomerIndex: 0,
      };
    }

    // =========================================================================
    // CUSTOMER ARRIVAL PHASE
    // =========================================================================
    case "REVEAL_CUSTOMER": {
      const customer = state.currentRoundCustomers[state.currentCustomerIndex];
      if (!customer) return state;

      const eligiblePlayerIds = getEligiblePlayers(state, customer);

      // If exactly one player is eligible, auto-award
      if (eligiblePlayerIds.length === 1) {
        const winnerId = eligiblePlayerIds[0];
        const winner = state.players[winnerId];

        const nextIndex = state.currentCustomerIndex + 1;
        const hasMoreCustomers =
          nextIndex < state.currentRoundCustomers.length;

        return {
          ...state,
          currentCustomer: customer,
          eligiblePlayerIds,
          customerSubPhase: hasMoreCustomers ? "revealing" : "revealing",
          currentCustomerIndex: nextIndex,
          players: {
            ...state.players,
            [winnerId]: {
              ...winner,
              customerLine: [...winner.customerLine, customer],
            },
          },
          // Move to next customer or resolution phase
          phase: hasMoreCustomers ? "customerArrival" : "customerResolution",
        };
      }

      return {
        ...state,
        currentCustomer: customer,
        eligiblePlayerIds,
        customerSubPhase:
          eligiblePlayerIds.length === 0 ? "revealing" : "eligibilityCheck",
      };
    }

    case "COMMIT_CARDS": {
      const { cardIds = [] } = action.payload || {};
      const player = state.players[action.playerId];

      // Can only commit if eligible and haven't already committed
      if (
        !state.eligiblePlayerIds.includes(action.playerId) ||
        player.hasCommitted
      ) {
        return state;
      }

      const committedCards = player.hand.filter((card) =>
        cardIds.includes(card.id)
      );

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            committedCards,
            hasCommitted: true,
          },
        },
        customerSubPhase: "commitment",
      };
    }

    case "REVEAL_COMMITMENTS": {
      // Check if all eligible players have committed
      const allCommitted = state.eligiblePlayerIds.every(
        (id) => state.players[id].hasCommitted
      );

      if (!allCommitted) return state;

      return {
        ...state,
        customerSubPhase: "reveal",
      };
    }

    case "AWARD_CUSTOMER": {
      if (!state.currentCustomer) return state;

      const winnerId = resolveCustomerContest(state);

      // Remove committed cards from hands, reset commitment state
      const updatedPlayers = { ...state.players };
      for (const playerId of state.eligiblePlayerIds) {
        const player = updatedPlayers[playerId];
        const committedIds = new Set(player.committedCards.map((c) => c.id));

        updatedPlayers[playerId] = {
          ...player,
          hand: player.hand.filter((c) => !committedIds.has(c.id)),
          committedCards: [],
          hasCommitted: false,
          ...(winnerId === playerId
            ? {
                customerLine: [...player.customerLine, state.currentCustomer!],
              }
            : {}),
        };
      }

      // Reset non-eligible players' commitment state too
      for (const playerId of state.playerOrder) {
        if (!state.eligiblePlayerIds.includes(playerId)) {
          updatedPlayers[playerId] = {
            ...updatedPlayers[playerId],
            committedCards: [],
            hasCommitted: false,
          };
        }
      }

      return {
        ...state,
        players: updatedPlayers,
        currentCustomer: null,
        eligiblePlayerIds: [],
        customerSubPhase: "revealing",
      };
    }

    case "NEXT_CUSTOMER": {
      const nextIndex = state.currentCustomerIndex + 1;
      const hasMoreCustomers = nextIndex < state.currentRoundCustomers.length;

      if (!hasMoreCustomers) {
        return {
          ...state,
          phase: "customerResolution",
          currentCustomerIndex: nextIndex,
        };
      }

      return {
        ...state,
        currentCustomerIndex: nextIndex,
        customerSubPhase: "revealing",
      };
    }

    // =========================================================================
    // CUSTOMER RESOLUTION PHASE
    // =========================================================================
    case "RESOLVE_CUSTOMERS": {
      const updatedPlayers = { ...state.players };

      for (const playerId of state.playerOrder) {
        const player = updatedPlayers[playerId];
        let totalMoney = 0;
        let totalTips = 0;
        let totalPrestige = 0;

        for (const customer of player.customerLine) {
          totalMoney += customer.reward.money;
          totalTips += customer.reward.tips;
          totalPrestige += customer.reward.prestige;
        }

        updatedPlayers[playerId] = {
          ...player,
          money: player.money + totalMoney + totalTips,
          prestige: player.prestige + totalPrestige,
          customersServed: player.customersServed + player.customerLine.length,
          totalTipsEarned: player.totalTipsEarned + totalTips,
          customerLine: [], // Clear customer line
        };
      }

      return {
        ...state,
        players: updatedPlayers,
        phase: "cleanup",
      };
    }

    // =========================================================================
    // CLEANUP PHASE
    // =========================================================================
    case "END_ROUND": {
      // Pay rent
      const updatedPlayers = { ...state.players };
      for (const playerId of state.playerOrder) {
        const player = updatedPlayers[playerId];
        updatedPlayers[playerId] = {
          ...player,
          money: Math.max(0, player.money - GAME_CONFIG.RENT_PER_ROUND),
        };
      }

      // Check if game is over
      if (state.round >= GAME_CONFIG.TOTAL_ROUNDS) {
        // Determine winner by money + prestige
        let winnerId: string | null = null;
        let highestScore = -1;

        for (const playerId of state.playerOrder) {
          const player = updatedPlayers[playerId];
          const score = player.money + player.prestige * 2;
          if (score > highestScore) {
            highestScore = score;
            winnerId = playerId;
          }
        }

        return {
          ...state,
          players: updatedPlayers,
          phase: "gameOver",
          winnerId,
        };
      }

      // Prepare next round
      const { drawn, remaining } = drawCustomersForRound(
        state.customerDeck,
        GAME_CONFIG.CUSTOMERS_PER_ROUND
      );

      return {
        ...state,
        players: updatedPlayers,
        phase: "planning",
        round: state.round + 1,
        customerDeck: remaining,
        currentRoundCustomers: drawn,
        currentCustomerIndex: 0,
        currentCustomer: null,
        customerSubPhase: "revealing",
        eligiblePlayerIds: [],
      };
    }

    // =========================================================================
    // GAME OVER
    // =========================================================================
    case "PLAY_AGAIN": {
      // Reset to initial state
      const newState = initialState(
        state.playerOrder.map((id) => ({
          id,
          name: state.players[id].name,
        }))
      );

      // Start game immediately
      const customerDeck = createCustomerDeck(ctx);
      const { drawn, remaining } = drawCustomersForRound(
        customerDeck,
        GAME_CONFIG.CUSTOMERS_PER_ROUND
      );

      return {
        ...newState,
        phase: "planning",
        round: 1,
        customerDeck: remaining,
        currentRoundCustomers: drawn,
      };
    }

    default:
      return state;
  }
}

// =============================================================================
// PHASE EXTRACTION
// =============================================================================

function getPhase(state: CafeState): string {
  return state.phase;
}

// =============================================================================
// ACTION VALIDATION
// =============================================================================

function isActionAllowed(
  state: CafeState,
  action: CafeAction,
  ctx: GameContext
): boolean {
  const isHost = ctx.room.hostId === ctx.playerId;
  const player = state.players[action.playerId];

  switch (action.type) {
    case "START_GAME":
      return isHost && state.phase === "lobby";

    case "END_PLANNING":
      return isHost && state.phase === "planning";

    case "PURCHASE_SUPPLY":
    case "PURCHASE_ATTRACTION":
    case "UPGRADE_CAFE":
      return state.phase === "investment" && player !== undefined;

    case "END_INVESTMENT":
      return isHost && state.phase === "investment";

    case "REVEAL_CUSTOMER":
      return isHost && state.phase === "customerArrival";

    case "COMMIT_CARDS":
      return (
        state.phase === "customerArrival" &&
        state.customerSubPhase === "eligibilityCheck" &&
        state.eligiblePlayerIds.includes(action.playerId) &&
        !player.hasCommitted
      );

    case "REVEAL_COMMITMENTS":
      return (
        isHost &&
        state.phase === "customerArrival" &&
        state.customerSubPhase === "commitment" &&
        state.eligiblePlayerIds.every((id) => state.players[id].hasCommitted)
      );

    case "AWARD_CUSTOMER":
      return (
        isHost &&
        state.phase === "customerArrival" &&
        state.customerSubPhase === "reveal"
      );

    case "NEXT_CUSTOMER":
      return isHost && state.phase === "customerArrival";

    case "RESOLVE_CUSTOMERS":
      return isHost && state.phase === "customerResolution";

    case "END_ROUND":
      return isHost && state.phase === "cleanup";

    case "PLAY_AGAIN":
      return isHost && state.phase === "gameOver";

    default:
      return false;
  }
}

// =============================================================================
// GAME EXPORT
// =============================================================================

export const cafeGame = defineGame<CafeState, CafeAction>({
  id: "cafe",
  name: "Cafe",
  description: "Compete to attract customers to your cafe!",
  minPlayers: 2,
  maxPlayers: 4,
  initialState,
  reducer,
  getPhase,
  isActionAllowed,
});
