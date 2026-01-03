import { defineGame } from "@/engine/defineGame";
import type { GameContext, Player } from "@/engine/types";

// =============================================================================
// PHASE DEFINITIONS
// =============================================================================

export type CafePhase =
  | "lobby"
  | "planning" // Round start - review hand/resources
  | "investment" // Spend money on supplies/upgrades
  | "drawing" // Draw attraction cards before customers arrive
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

export type TieRule = "customerLeaves" | "fewerCardsWins" | "splitReward";

export const GAME_CONFIG: {
  TOTAL_ROUNDS: number;
  STARTING_MONEY: number;
  CUSTOMERS_PER_ROUND: number;
  RENT_PER_ROUND: number;
  TIE_RULE: TieRule;
} = {
  TOTAL_ROUNDS: 5,
  STARTING_MONEY: 10,
  CUSTOMERS_PER_ROUND: 3,
  RENT_PER_ROUND: 2,
  TIE_RULE: "customerLeaves",
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

// =============================================================================
// CUSTOMER ARCHETYPE SYSTEM (6 Archetypes)
// =============================================================================

export type CustomerArchetypeId =
  | "coffee_snob"
  | "casual_regular"
  | "trend_chaser"
  | "health_sipper"
  | "influencer"
  | "office_bulk";

export interface CustomerArchetype {
  id: CustomerArchetypeId;
  name: string;
  description: string;
  // Eligibility rules - TBD for now, but structure exists
  eligibilityHint: string;
}

export const CUSTOMER_ARCHETYPES: Record<CustomerArchetypeId, CustomerArchetype> = {
  coffee_snob: {
    id: "coffee_snob",
    name: "Coffee Snob",
    description: "Demands only the finest brews. Expects quality and expertise.",
    eligibilityHint: "Requires premium coffee supplies",
  },
  casual_regular: {
    id: "casual_regular",
    name: "Casual Regular",
    description: "Just here for a quick cup. Easy to please, reliable business.",
    eligibilityHint: "No special requirements",
  },
  trend_chaser: {
    id: "trend_chaser",
    name: "Trend Chaser",
    description: "Wants whatever's hot right now. Follows the latest cafe trends.",
    eligibilityHint: "Requires trendy menu items",
  },
  health_sipper: {
    id: "health_sipper",
    name: "Health-Conscious Sipper",
    description: "Focused on wellness. Prefers tea and healthy alternatives.",
    eligibilityHint: "Prefers tea and milk alternatives",
  },
  influencer: {
    id: "influencer",
    name: "Social Media Influencer",
    description: "Here for the aesthetic. Will promote your cafe if impressed.",
    eligibilityHint: "Requires high ambiance",
  },
  office_bulk: {
    id: "office_bulk",
    name: "Bulk Order Office Worker",
    description: "Ordering for the whole team. Big order, big payout.",
    eligibilityHint: "Requires seating capacity",
  },
};

// =============================================================================
// TWO-SIDED CUSTOMER CARD
// =============================================================================

// Front side - shown during Customer Arrival
export interface CustomerCardFront {
  archetypeId: CustomerArchetypeId;
  // Derived from archetype: name, description, eligibilityHint
}

// Back side - shown during Customer Resolution
export interface CustomerCardBack {
  orderName: string;
  requiresSupplies: Partial<Record<SupplyType, number>>;
  reward: {
    money: number;
    prestige: number;
  };
  failRule: CustomerFailRule;
}

export type CustomerFailRule =
  | "no_penalty"      // Customer leaves, no harm done
  | "lose_prestige"   // Customer complains, lose prestige
  | "pay_penalty";    // Must pay compensation

// The complete two-sided customer card
export interface CustomerCard {
  id: string;
  front: CustomerCardFront;
  back: CustomerCardBack;
}

// Helper to get archetype data for a card
export function getCardArchetype(card: CustomerCard): CustomerArchetype {
  return CUSTOMER_ARCHETYPES[card.front.archetypeId];
}

// Legacy types for compatibility (will be removed later)
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

// Tier 1 supplies - raw ingredients that will be used to create Tier 2 items
export type SupplyType =
  | "coffeeBeans"
  | "tea"
  | "milk"
  | "syrup";

export const SUPPLY_COST = 2; // All supplies cost $2 per unit

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

  // Attraction card deck (shared)
  attractionDeck: AttractionCard[];
  attractionDiscard: AttractionCard[];

  // Shared cafe state (optional future feature)
  sharedUpgrades: Record<string, number>;

  // Available cards for purchase (legacy - keeping for now)
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
  // Drawing phase
  | "DRAW_ATTRACTION_CARDS"
  | "END_DRAWING"
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
      coffeeBeans: 0,
      tea: 0,
      milk: 0,
      syrup: 0,
    },
    customerLine: [],
    committedCards: [],
    hasCommitted: false,
    customersServed: 0,
    totalTipsEarned: 0,
  };
}

// Attraction card templates for the shared deck (~20 cards)
const ATTRACTION_CARD_TEMPLATES: Omit<AttractionCard, "id">[] = [
  // Value 1 cards (8 cards) - common
  { name: "Friendly Smile", value: 1, cost: 0 },
  { name: "Quick Service", value: 1, cost: 0 },
  { name: "Warm Greeting", value: 1, cost: 0 },
  { name: "Clean Table", value: 1, cost: 0 },
  { name: "Good Music", value: 1, cost: 0 },
  { name: "Nice Aroma", value: 1, cost: 0 },
  { name: "Comfy Seat", value: 1, cost: 0 },
  { name: "Fast Wifi", value: 1, cost: 0 },
  // Value 2 cards (8 cards) - uncommon
  { name: "Cozy Corner", value: 2, cost: 0 },
  { name: "Latte Art", value: 2, cost: 0 },
  { name: "Special Blend", value: 2, cost: 0 },
  { name: "Fresh Pastry", value: 2, cost: 0 },
  { name: "Window Seat", value: 2, cost: 0 },
  { name: "Power Outlet", value: 2, cost: 0 },
  { name: "Loyalty Perk", value: 2, cost: 0 },
  { name: "Extra Shot", value: 2, cost: 0 },
  // Value 3 cards (4 cards) - rare
  { name: "VIP Treatment", value: 3, cost: 0 },
  { name: "Chef's Special", value: 3, cost: 0 },
  { name: "Live Music", value: 3, cost: 0 },
  { name: "Perfect Moment", value: 3, cost: 0 },
];

function createAttractionDeck(ctx: GameContext): AttractionCard[] {
  // Create cards with unique IDs
  const deck = ATTRACTION_CARD_TEMPLATES.map((template, index) => ({
    ...template,
    id: `attr-${index}-${Math.floor(ctx.random() * 10000)}`,
  }));

  // Shuffle the deck using Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// Draw cards from deck, reshuffling discard if needed
function drawAttractionCards(
  deck: AttractionCard[],
  discard: AttractionCard[],
  count: number,
  ctx: GameContext
): { drawn: AttractionCard[]; deck: AttractionCard[]; discard: AttractionCard[] } {
  let currentDeck = [...deck];
  let currentDiscard = [...discard];
  const drawn: AttractionCard[] = [];

  for (let i = 0; i < count; i++) {
    // If deck is empty, shuffle discard back in
    if (currentDeck.length === 0) {
      if (currentDiscard.length === 0) {
        // No cards left anywhere
        break;
      }
      currentDeck = [...currentDiscard];
      currentDiscard = [];
      // Shuffle
      for (let j = currentDeck.length - 1; j > 0; j--) {
        const k = Math.floor(ctx.random() * (j + 1));
        [currentDeck[j], currentDeck[k]] = [currentDeck[k], currentDeck[j]];
      }
    }

    const card = currentDeck.pop()!;
    drawn.push(card);
  }

  return { drawn, deck: currentDeck, discard: currentDiscard };
}

// Customer card templates - 2 cards per archetype = 12 total cards
const CUSTOMER_CARD_TEMPLATES: CustomerCard[] = [
  // Coffee Snob cards (2)
  {
    id: "cs-1",
    front: { archetypeId: "coffee_snob" },
    back: {
      orderName: "Single Origin Pour Over",
      requiresSupplies: { coffeeBeans: 2 },
      reward: { money: 5, prestige: 2 },
      failRule: "lose_prestige",
    },
  },
  {
    id: "cs-2",
    front: { archetypeId: "coffee_snob" },
    back: {
      orderName: "Espresso Flight",
      requiresSupplies: { coffeeBeans: 3 },
      reward: { money: 7, prestige: 3 },
      failRule: "lose_prestige",
    },
  },
  // Casual Regular cards (2)
  {
    id: "cr-1",
    front: { archetypeId: "casual_regular" },
    back: {
      orderName: "House Coffee",
      requiresSupplies: { coffeeBeans: 1 },
      reward: { money: 3, prestige: 0 },
      failRule: "no_penalty",
    },
  },
  {
    id: "cr-2",
    front: { archetypeId: "casual_regular" },
    back: {
      orderName: "Coffee with Milk",
      requiresSupplies: { coffeeBeans: 1, milk: 1 },
      reward: { money: 4, prestige: 0 },
      failRule: "no_penalty",
    },
  },
  // Trend Chaser cards (2)
  {
    id: "tc-1",
    front: { archetypeId: "trend_chaser" },
    back: {
      orderName: "Oat Milk Latte",
      requiresSupplies: { coffeeBeans: 1, milk: 2 },
      reward: { money: 5, prestige: 1 },
      failRule: "no_penalty",
    },
  },
  {
    id: "tc-2",
    front: { archetypeId: "trend_chaser" },
    back: {
      orderName: "Lavender Syrup Cold Brew",
      requiresSupplies: { coffeeBeans: 2, syrup: 2 },
      reward: { money: 6, prestige: 2 },
      failRule: "no_penalty",
    },
  },
  // Health-Conscious Sipper cards (2)
  {
    id: "hs-1",
    front: { archetypeId: "health_sipper" },
    back: {
      orderName: "Green Tea",
      requiresSupplies: { tea: 2 },
      reward: { money: 4, prestige: 1 },
      failRule: "no_penalty",
    },
  },
  {
    id: "hs-2",
    front: { archetypeId: "health_sipper" },
    back: {
      orderName: "Matcha Latte",
      requiresSupplies: { tea: 2, milk: 1 },
      reward: { money: 5, prestige: 1 },
      failRule: "no_penalty",
    },
  },
  // Influencer cards (2)
  {
    id: "inf-1",
    front: { archetypeId: "influencer" },
    back: {
      orderName: "Aesthetic Latte Art",
      requiresSupplies: { coffeeBeans: 1, milk: 2 },
      reward: { money: 3, prestige: 3 },
      failRule: "lose_prestige",
    },
  },
  {
    id: "inf-2",
    front: { archetypeId: "influencer" },
    back: {
      orderName: "Rainbow Frappuccino",
      requiresSupplies: { coffeeBeans: 1, milk: 1, syrup: 2 },
      reward: { money: 4, prestige: 4 },
      failRule: "lose_prestige",
    },
  },
  // Office Bulk Order cards (2)
  {
    id: "ob-1",
    front: { archetypeId: "office_bulk" },
    back: {
      orderName: "Coffee for 5",
      requiresSupplies: { coffeeBeans: 3, milk: 2 },
      reward: { money: 8, prestige: 1 },
      failRule: "pay_penalty",
    },
  },
  {
    id: "ob-2",
    front: { archetypeId: "office_bulk" },
    back: {
      orderName: "Meeting Room Catering",
      requiresSupplies: { coffeeBeans: 2, tea: 2, milk: 2 },
      reward: { money: 10, prestige: 2 },
      failRule: "pay_penalty",
    },
  },
];

function createCustomerDeck(ctx: GameContext): CustomerCard[] {
  // Create a copy of all card templates
  const deck = CUSTOMER_CARD_TEMPLATES.map((card) => ({
    ...card,
    // Add unique instance ID to prevent duplicate key issues
    id: `${card.id}-${Math.floor(ctx.random() * 10000)}`,
  }));

  // Shuffle the deck using Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// Reshuffle discard pile back into deck if needed
function reshuffleIfNeeded(
  deck: CustomerCard[],
  discard: CustomerCard[],
  ctx: GameContext
): { deck: CustomerCard[]; discard: CustomerCard[] } {
  if (deck.length > 0) {
    return { deck, discard };
  }

  // Shuffle discard pile and use as new deck
  const newDeck = [...discard];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }

  return { deck: newDeck, discard: [] };
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

// Eligibility check - currently all players are eligible
// Full eligibility logic based on archetype/supplies will be added in a future PR
function checkCustomerEligibility(
  player: CafePlayerState,
  customer: CustomerCard
): boolean {
  // For now, all players are eligible for all customers
  // Future: Check based on archetype requirements (supplies, upgrades, etc.)
  return true;
}

function getEligiblePlayers(
  state: CafeState,
  customer: CustomerCard
): string[] {
  return state.playerOrder.filter((playerId) =>
    checkCustomerEligibility(state.players[playerId], customer)
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
    // Players start with empty hands - cards are drawn at round start
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
    attractionDeck: [],
    attractionDiscard: [],
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

      // Create and shuffle the attraction deck
      const attractionDeck = createAttractionDeck(ctx);

      return {
        ...state,
        phase: "planning",
        round: 1,
        customerDeck: remaining,
        currentRoundCustomers: drawn,
        currentCustomerIndex: 0,
        currentCustomer: null,
        attractionDeck,
        attractionDiscard: [],
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
      const cost = quantity * SUPPLY_COST;

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
        phase: "drawing",
      };
    }

    // =========================================================================
    // DRAWING PHASE
    // =========================================================================
    case "DRAW_ATTRACTION_CARDS": {
      const player = state.players[action.playerId];
      const cardsToDrawCount = 2;

      // Draw cards from deck
      const { drawn, deck, discard } = drawAttractionCards(
        state.attractionDeck,
        state.attractionDiscard,
        cardsToDrawCount,
        ctx
      );

      return {
        ...state,
        attractionDeck: deck,
        attractionDiscard: discard,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            hand: [...player.hand, ...drawn],
          },
        },
      };
    }

    case "END_DRAWING": {
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

      // Collect all committed cards to add to discard pile
      const cardsToDiscard: AttractionCard[] = [];

      // Remove committed cards from hands, reset commitment state
      const updatedPlayers = { ...state.players };
      for (const playerId of state.eligiblePlayerIds) {
        const player = updatedPlayers[playerId];
        const committedIds = new Set(player.committedCards.map((c) => c.id));

        // Add committed cards to discard pile
        cardsToDiscard.push(...player.committedCards);

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
        attractionDiscard: [...state.attractionDiscard, ...cardsToDiscard],
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
        let totalPrestige = 0;

        // Use the back side of customer cards for rewards
        for (const customer of player.customerLine) {
          // For now, just award the full reward (supply consumption comes later)
          totalMoney += customer.back.reward.money;
          totalPrestige += customer.back.reward.prestige;
        }

        updatedPlayers[playerId] = {
          ...player,
          money: player.money + totalMoney,
          prestige: player.prestige + totalPrestige,
          customersServed: player.customersServed + player.customerLine.length,
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
      // Reset to initial state using room players (has all required fields)
      const newState = initialState(ctx.room.players);

      // Start game immediately
      const customerDeck = createCustomerDeck(ctx);
      const { drawn, remaining } = drawCustomersForRound(
        customerDeck,
        GAME_CONFIG.CUSTOMERS_PER_ROUND
      );

      // Create new attraction deck
      const attractionDeck = createAttractionDeck(ctx);

      return {
        ...newState,
        phase: "planning",
        round: 1,
        customerDeck: remaining,
        currentRoundCustomers: drawn,
        attractionDeck,
        attractionDiscard: [],
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

    case "DRAW_ATTRACTION_CARDS":
      return state.phase === "drawing" && player !== undefined;

    case "END_DRAWING":
      return isHost && state.phase === "drawing";

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
