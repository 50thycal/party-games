import { defineGame } from "@/engine/defineGame";
import type { GameContext, Player } from "@/engine/types";

// =============================================================================
// PHASE DEFINITIONS
// =============================================================================

export type CafePhase =
  | "lobby"
  | "planning" // Round start - review resources
  | "investment" // Spend money on supplies/upgrades
  | "customerDraft" // Pass-or-take customer draft
  | "customerResolution" // Fulfill orders, pay supplies, get rewards
  | "shopClosed" // End of day - review before rent
  | "cleanup" // Pay rent, prepare next round
  | "gameOver";

// =============================================================================
// GAME CONFIGURATION
// =============================================================================

export const GAME_CONFIG = {
  TOTAL_ROUNDS: 5,
  STARTING_MONEY: 40,
  RENT_PER_ROUND: 2,
  CUSTOMERS_PER_PLAYER: 3, // 2 players = 6, 3 players = 9, 4 players = 12
};

// =============================================================================
// CUSTOMER ARCHETYPE SYSTEM (5 Archetypes)
// =============================================================================

export type CustomerArchetypeId =
  | "average_joe"
  | "coffee_snob"
  | "influencer"
  | "health_person"
  | "bulk_orderer";

export interface CustomerArchetype {
  id: CustomerArchetypeId;
  name: string;
  emoji: string;
  description: string;
}

export const CUSTOMER_ARCHETYPES: Record<CustomerArchetypeId, CustomerArchetype> = {
  average_joe: {
    id: "average_joe",
    name: "Average Joe",
    emoji: "👤",
    description: "Just here for a simple cup. Easy to please, reliable business.",
  },
  coffee_snob: {
    id: "coffee_snob",
    name: "Coffee Snob",
    emoji: "🧐",
    description: "Demands only the finest brews. Expects quality and expertise.",
  },
  influencer: {
    id: "influencer",
    name: "Influencer",
    emoji: "📸",
    description: "Here for the aesthetic. Loves presentation and seasonal items.",
  },
  health_person: {
    id: "health_person",
    name: "Health Person",
    emoji: "🧘",
    description: "Focused on wellness. Prefers tea and healthy alternatives.",
  },
  bulk_orderer: {
    id: "bulk_orderer",
    name: "Bulk Orderer",
    emoji: "💼",
    description: "Ordering for the whole team. Big order, big payout.",
  },
};

// =============================================================================
// TWO-SIDED CUSTOMER CARD
// =============================================================================

export interface CustomerCardFront {
  archetypeId: CustomerArchetypeId;
}

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

export interface CustomerCard {
  id: string;
  front: CustomerCardFront;
  back: CustomerCardBack;
}

export function getCardArchetype(card: CustomerCard): CustomerArchetype {
  return CUSTOMER_ARCHETYPES[card.front.archetypeId];
}

// =============================================================================
// SUPPLY & UPGRADE TYPES
// =============================================================================

export type CafeUpgradeType =
  | "seating"
  | "ambiance"
  | "equipment"
  | "menu";

export type SupplyType =
  | "coffeeBeans"
  | "tea"
  | "milk"
  | "syrup";

export const SUPPLY_COST = 1;

// =============================================================================
// PLAYER STATE
// =============================================================================

export interface CafePlayerState {
  id: string;
  name: string;
  money: number;
  prestige: number;

  // Cafe setup
  upgrades: Record<CafeUpgradeType, number>; // Level 0-3
  supplies: Record<SupplyType, number>;

  // Current round state
  customerLine: CustomerCard[]; // Customers taken this round

  // Statistics
  customersServed: number;
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

  // Customer deck
  customerDeck: CustomerCard[];

  // Draft state
  currentRoundCustomers: CustomerCard[]; // Customers for this round
  customersDealtThisRound: number; // How many customers have been dealt
  currentCustomer: CustomerCard | null; // The customer being decided on
  currentDrawerIndex: number; // Index in playerOrder of who drew the customer
  currentDeciderIndex: number; // Index in playerOrder of who's deciding
  passCount: number; // How many times the current customer has been passed

  // Round rotation
  firstDrawerIndex: number; // Who draws first this round (rotates each round)

  // Resolution phase - manual fulfillment
  selectedForFulfillment: Record<string, number[]>; // Indices of customers each player selected to fulfill
  playersConfirmedResolution: string[]; // Players who confirmed their selections

  // Cleanup phase - rent tracking
  rentOwed: Record<string, number>; // How much each player owes in rent
  rentPaidBy: Record<string, string | null>; // Who paid each player's rent (null = self, oderId = bailed out)

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
  | "UPGRADE_CAFE"
  | "END_INVESTMENT"
  // Customer draft phase
  | "DRAW_CUSTOMER"
  | "TAKE_CUSTOMER"
  | "PASS_CUSTOMER"
  // Customer resolution phase
  | "TOGGLE_CUSTOMER_FULFILL" // Toggle whether to fulfill a customer
  | "CONFIRM_RESOLUTION" // Player confirms their selections
  | "RESOLVE_CUSTOMERS" // Host processes all resolutions
  // Shop closed phase
  | "CLOSE_SHOP"
  // Cleanup phase
  | "PAY_RENT_FOR" // Bailout - pay another player's rent
  | "END_ROUND"
  // Game over
  | "PLAY_AGAIN";

export interface CafeAction {
  type: CafeActionType;
  playerId: string;
  payload?: {
    supplyType?: SupplyType;
    upgradeType?: CafeUpgradeType;
    targetPlayerId?: string; // For bailout - who to pay rent for
    customerIndex?: number; // For toggling customer fulfillment
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
    customersServed: 0,
  };
}

// Customer card templates - 52 total cards across 5 archetypes
const CUSTOMER_CARD_TEMPLATES: CustomerCard[] = [
  // ==========================================================================
  // AVERAGE JOE (12 cards) - Safe, reliable customers
  // ==========================================================================
  // Black Coffee ×4 - Coffee ×1 = $4
  { id: "aj-bc-1", front: { archetypeId: "average_joe" }, back: { orderName: "Black Coffee", requiresSupplies: { coffeeBeans: 1 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  { id: "aj-bc-2", front: { archetypeId: "average_joe" }, back: { orderName: "Black Coffee", requiresSupplies: { coffeeBeans: 1 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  { id: "aj-bc-3", front: { archetypeId: "average_joe" }, back: { orderName: "Black Coffee", requiresSupplies: { coffeeBeans: 1 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  { id: "aj-bc-4", front: { archetypeId: "average_joe" }, back: { orderName: "Black Coffee", requiresSupplies: { coffeeBeans: 1 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  // Coffee + Cream ×4 - Coffee ×1, Milk ×1 = $6
  { id: "aj-cc-1", front: { archetypeId: "average_joe" }, back: { orderName: "Coffee + Cream", requiresSupplies: { coffeeBeans: 1, milk: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "aj-cc-2", front: { archetypeId: "average_joe" }, back: { orderName: "Coffee + Cream", requiresSupplies: { coffeeBeans: 1, milk: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "aj-cc-3", front: { archetypeId: "average_joe" }, back: { orderName: "Coffee + Cream", requiresSupplies: { coffeeBeans: 1, milk: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "aj-cc-4", front: { archetypeId: "average_joe" }, back: { orderName: "Coffee + Cream", requiresSupplies: { coffeeBeans: 1, milk: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  // Two Black Coffees ×2 - Coffee ×2 = $8
  { id: "aj-2bc-1", front: { archetypeId: "average_joe" }, back: { orderName: "Two Black Coffees", requiresSupplies: { coffeeBeans: 2 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  { id: "aj-2bc-2", front: { archetypeId: "average_joe" }, back: { orderName: "Two Black Coffees", requiresSupplies: { coffeeBeans: 2 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  // Tea ×2 - Tea ×1 = $4
  { id: "aj-t-1", front: { archetypeId: "average_joe" }, back: { orderName: "Tea", requiresSupplies: { tea: 1 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  { id: "aj-t-2", front: { archetypeId: "average_joe" }, back: { orderName: "Tea", requiresSupplies: { tea: 1 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },

  // ==========================================================================
  // COFFEE SNOB (12 cards) - Higher supply demand, okay returns
  // ==========================================================================
  // Rare Beans Latte ×4 - Coffee ×2, Milk ×1 = $6
  { id: "cs-rbl-1", front: { archetypeId: "coffee_snob" }, back: { orderName: "Rare Beans Latte", requiresSupplies: { coffeeBeans: 2, milk: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "cs-rbl-2", front: { archetypeId: "coffee_snob" }, back: { orderName: "Rare Beans Latte", requiresSupplies: { coffeeBeans: 2, milk: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "cs-rbl-3", front: { archetypeId: "coffee_snob" }, back: { orderName: "Rare Beans Latte", requiresSupplies: { coffeeBeans: 2, milk: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "cs-rbl-4", front: { archetypeId: "coffee_snob" }, back: { orderName: "Rare Beans Latte", requiresSupplies: { coffeeBeans: 2, milk: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  // Flavored Latte ×4 - Coffee ×1, Milk ×1, Syrup ×1 = $6
  { id: "cs-fl-1", front: { archetypeId: "coffee_snob" }, back: { orderName: "Flavored Latte", requiresSupplies: { coffeeBeans: 1, milk: 1, syrup: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "cs-fl-2", front: { archetypeId: "coffee_snob" }, back: { orderName: "Flavored Latte", requiresSupplies: { coffeeBeans: 1, milk: 1, syrup: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "cs-fl-3", front: { archetypeId: "coffee_snob" }, back: { orderName: "Flavored Latte", requiresSupplies: { coffeeBeans: 1, milk: 1, syrup: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "cs-fl-4", front: { archetypeId: "coffee_snob" }, back: { orderName: "Flavored Latte", requiresSupplies: { coffeeBeans: 1, milk: 1, syrup: 1 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  // Double Latte ×2 - Coffee ×2, Milk ×2 = $8
  { id: "cs-dl-1", front: { archetypeId: "coffee_snob" }, back: { orderName: "Double Latte", requiresSupplies: { coffeeBeans: 2, milk: 2 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  { id: "cs-dl-2", front: { archetypeId: "coffee_snob" }, back: { orderName: "Double Latte", requiresSupplies: { coffeeBeans: 2, milk: 2 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  // Espresso Shot ×2 - Coffee ×4 = $8
  { id: "cs-es-1", front: { archetypeId: "coffee_snob" }, back: { orderName: "Espresso Shot", requiresSupplies: { coffeeBeans: 4 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  { id: "cs-es-2", front: { archetypeId: "coffee_snob" }, back: { orderName: "Espresso Shot", requiresSupplies: { coffeeBeans: 4 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },

  // ==========================================================================
  // INFLUENCER (12 cards) - High payout options
  // ==========================================================================
  // Latte w/ Art ×4 - Coffee ×1, Milk ×2 = $8
  { id: "inf-la-1", front: { archetypeId: "influencer" }, back: { orderName: "Latte w/ Art", requiresSupplies: { coffeeBeans: 1, milk: 2 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  { id: "inf-la-2", front: { archetypeId: "influencer" }, back: { orderName: "Latte w/ Art", requiresSupplies: { coffeeBeans: 1, milk: 2 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  { id: "inf-la-3", front: { archetypeId: "influencer" }, back: { orderName: "Latte w/ Art", requiresSupplies: { coffeeBeans: 1, milk: 2 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  { id: "inf-la-4", front: { archetypeId: "influencer" }, back: { orderName: "Latte w/ Art", requiresSupplies: { coffeeBeans: 1, milk: 2 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  // Seasonal Flavor Latte ×4 - Coffee ×1, Syrup ×2 = $10
  { id: "inf-sfl-1", front: { archetypeId: "influencer" }, back: { orderName: "Seasonal Flavor Latte", requiresSupplies: { coffeeBeans: 1, syrup: 2 }, reward: { money: 10, prestige: 0 }, failRule: "no_penalty" } },
  { id: "inf-sfl-2", front: { archetypeId: "influencer" }, back: { orderName: "Seasonal Flavor Latte", requiresSupplies: { coffeeBeans: 1, syrup: 2 }, reward: { money: 10, prestige: 0 }, failRule: "no_penalty" } },
  { id: "inf-sfl-3", front: { archetypeId: "influencer" }, back: { orderName: "Seasonal Flavor Latte", requiresSupplies: { coffeeBeans: 1, syrup: 2 }, reward: { money: 10, prestige: 0 }, failRule: "no_penalty" } },
  { id: "inf-sfl-4", front: { archetypeId: "influencer" }, back: { orderName: "Seasonal Flavor Latte", requiresSupplies: { coffeeBeans: 1, syrup: 2 }, reward: { money: 10, prestige: 0 }, failRule: "no_penalty" } },
  // Pour Over ×2 - Coffee ×3 = $10
  { id: "inf-po-1", front: { archetypeId: "influencer" }, back: { orderName: "Pour Over", requiresSupplies: { coffeeBeans: 3 }, reward: { money: 10, prestige: 0 }, failRule: "no_penalty" } },
  { id: "inf-po-2", front: { archetypeId: "influencer" }, back: { orderName: "Pour Over", requiresSupplies: { coffeeBeans: 3 }, reward: { money: 10, prestige: 0 }, failRule: "no_penalty" } },
  // Seasonal Tea Latte ×2 - Tea ×1, Milk ×1, Syrup ×1 = $10
  { id: "inf-stl-1", front: { archetypeId: "influencer" }, back: { orderName: "Seasonal Tea Latte", requiresSupplies: { tea: 1, milk: 1, syrup: 1 }, reward: { money: 10, prestige: 0 }, failRule: "no_penalty" } },
  { id: "inf-stl-2", front: { archetypeId: "influencer" }, back: { orderName: "Seasonal Tea Latte", requiresSupplies: { tea: 1, milk: 1, syrup: 1 }, reward: { money: 10, prestige: 0 }, failRule: "no_penalty" } },

  // ==========================================================================
  // HEALTH PERSON (12 cards) - Always has tea, okay money
  // ==========================================================================
  // Herbal Tea ×4 - Tea ×2 = $4
  { id: "hp-ht-1", front: { archetypeId: "health_person" }, back: { orderName: "Herbal Tea", requiresSupplies: { tea: 2 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  { id: "hp-ht-2", front: { archetypeId: "health_person" }, back: { orderName: "Herbal Tea", requiresSupplies: { tea: 2 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  { id: "hp-ht-3", front: { archetypeId: "health_person" }, back: { orderName: "Herbal Tea", requiresSupplies: { tea: 2 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  { id: "hp-ht-4", front: { archetypeId: "health_person" }, back: { orderName: "Herbal Tea", requiresSupplies: { tea: 2 }, reward: { money: 4, prestige: 0 }, failRule: "no_penalty" } },
  // Tea w/ Oat Milk ×4 - Tea ×1, Milk ×2 = $6
  { id: "hp-tom-1", front: { archetypeId: "health_person" }, back: { orderName: "Tea w/ Oat Milk", requiresSupplies: { tea: 1, milk: 2 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "hp-tom-2", front: { archetypeId: "health_person" }, back: { orderName: "Tea w/ Oat Milk", requiresSupplies: { tea: 1, milk: 2 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "hp-tom-3", front: { archetypeId: "health_person" }, back: { orderName: "Tea w/ Oat Milk", requiresSupplies: { tea: 1, milk: 2 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "hp-tom-4", front: { archetypeId: "health_person" }, back: { orderName: "Tea w/ Oat Milk", requiresSupplies: { tea: 1, milk: 2 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  // Tea Pot ×2 - Tea ×4 = $8
  { id: "hp-tp-1", front: { archetypeId: "health_person" }, back: { orderName: "Tea Pot", requiresSupplies: { tea: 4 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  { id: "hp-tp-2", front: { archetypeId: "health_person" }, back: { orderName: "Tea Pot", requiresSupplies: { tea: 4 }, reward: { money: 8, prestige: 0 }, failRule: "no_penalty" } },
  // Tea with Honey ×2 - Tea ×1, Syrup ×2 = $6
  { id: "hp-th-1", front: { archetypeId: "health_person" }, back: { orderName: "Tea with Honey", requiresSupplies: { tea: 1, syrup: 2 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },
  { id: "hp-th-2", front: { archetypeId: "health_person" }, back: { orderName: "Tea with Honey", requiresSupplies: { tea: 1, syrup: 2 }, reward: { money: 6, prestige: 0 }, failRule: "no_penalty" } },

  // ==========================================================================
  // BULK ORDERER (4 cards) - High supplies, high payout
  // ==========================================================================
  // Office Coffee Runner ×2 - Coffee ×4, Milk ×2, Syrup ×2 = $20
  { id: "bo-ocr-1", front: { archetypeId: "bulk_orderer" }, back: { orderName: "Office Coffee Runner", requiresSupplies: { coffeeBeans: 4, milk: 2, syrup: 2 }, reward: { money: 20, prestige: 0 }, failRule: "no_penalty" } },
  { id: "bo-ocr-2", front: { archetypeId: "bulk_orderer" }, back: { orderName: "Office Coffee Runner", requiresSupplies: { coffeeBeans: 4, milk: 2, syrup: 2 }, reward: { money: 20, prestige: 0 }, failRule: "no_penalty" } },
  // Party Order ×2 - Coffee ×3, Tea ×3, Syrup ×1, Milk ×2 = $24
  { id: "bo-po-1", front: { archetypeId: "bulk_orderer" }, back: { orderName: "Party Order", requiresSupplies: { coffeeBeans: 3, tea: 3, syrup: 1, milk: 2 }, reward: { money: 24, prestige: 0 }, failRule: "no_penalty" } },
  { id: "bo-po-2", front: { archetypeId: "bulk_orderer" }, back: { orderName: "Party Order", requiresSupplies: { coffeeBeans: 3, tea: 3, syrup: 1, milk: 2 }, reward: { money: 24, prestige: 0 }, failRule: "no_penalty" } },
];

function createCustomerDeck(ctx: GameContext): CustomerCard[] {
  const deck = CUSTOMER_CARD_TEMPLATES.map((card) => ({
    ...card,
    id: `${card.id}-${Math.floor(ctx.random() * 10000)}`,
  }));

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function getNextPlayerIndex(currentIndex: number, playerCount: number): number {
  return (currentIndex + 1) % playerCount;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

function initialState(players: Player[]): CafeState {
  const playerStates: Record<string, CafePlayerState> = {};
  const playerOrder: string[] = [];

  for (const player of players) {
    playerStates[player.id] = createInitialPlayerState(player);
    playerOrder.push(player.id);
  }

  return {
    phase: "lobby",
    round: 0,
    playerOrder,
    players: playerStates,
    customerDeck: [],
    currentRoundCustomers: [],
    customersDealtThisRound: 0,
    currentCustomer: null,
    currentDrawerIndex: 0,
    currentDeciderIndex: 0,
    passCount: 0,
    firstDrawerIndex: 0,
    selectedForFulfillment: {},
    playersConfirmedResolution: [],
    rentOwed: {},
    rentPaidBy: {},
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
      const playerCount = state.playerOrder.length;

      // Draw customers for first round (3 per player)
      const customersThisRound = playerCount * GAME_CONFIG.CUSTOMERS_PER_PLAYER;
      const customersForRound = customerDeck.slice(0, customersThisRound);
      const remainingDeck = customerDeck.slice(customersThisRound);

      return {
        ...state,
        phase: "planning",
        round: 1,
        customerDeck: remainingDeck,
        currentRoundCustomers: customersForRound,
        customersDealtThisRound: 0,
        currentCustomer: null,
        currentDrawerIndex: 0,
        currentDeciderIndex: 0,
        passCount: 0,
        firstDrawerIndex: 0,
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
      const { supplyType } = action.payload || {};
      if (!supplyType) return state;

      const player = state.players[action.playerId];
      if (player.money < SUPPLY_COST) return state;

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            money: player.money - SUPPLY_COST,
            supplies: {
              ...player.supplies,
              [supplyType]: player.supplies[supplyType] + 1,
            },
          },
        },
      };
    }

    case "UPGRADE_CAFE": {
      const { upgradeType } = action.payload || {};
      if (!upgradeType) return state;

      const player = state.players[action.playerId];
      const currentLevel = player.upgrades[upgradeType];
      const cost = (currentLevel + 1) * 3;

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
      // Transition to customer draft phase
      // First drawer is determined by firstDrawerIndex
      return {
        ...state,
        phase: "customerDraft",
        customersDealtThisRound: 0,
        currentCustomer: null,
        currentDrawerIndex: state.firstDrawerIndex,
        currentDeciderIndex: state.firstDrawerIndex,
        passCount: 0,
      };
    }

    // =========================================================================
    // CUSTOMER DRAFT PHASE
    // =========================================================================
    case "DRAW_CUSTOMER": {
      // Can only draw if no current customer and we haven't dealt all customers
      if (state.currentCustomer !== null) return state;
      if (state.customersDealtThisRound >= state.currentRoundCustomers.length) {
        return state;
      }

      const customer = state.currentRoundCustomers[state.customersDealtThisRound];

      return {
        ...state,
        currentCustomer: customer,
        customersDealtThisRound: state.customersDealtThisRound + 1,
        currentDeciderIndex: state.currentDrawerIndex,
        passCount: 0,
      };
    }

    case "TAKE_CUSTOMER": {
      if (!state.currentCustomer) return state;

      const deciderId = state.playerOrder[state.currentDeciderIndex];
      if (action.playerId !== deciderId) return state;

      const player = state.players[deciderId];
      const playerCount = state.playerOrder.length;

      // Add customer to player's line
      const updatedPlayer = {
        ...player,
        customerLine: [...player.customerLine, state.currentCustomer],
      };

      // Check if more customers to draft
      const allCustomersDealt =
        state.customersDealtThisRound >= state.currentRoundCustomers.length;

      // Next drawer rotates clockwise from the current drawer
      const nextDrawerIndex = getNextPlayerIndex(
        state.currentDrawerIndex,
        playerCount
      );

      if (allCustomersDealt) {
        // Move to resolution phase - initialize selection state
        const selectedForFulfillment: Record<string, number[]> = {};
        const updatedPlayersWithSelection = {
          ...state.players,
          [deciderId]: updatedPlayer,
        };
        // Default: select all customers for fulfillment
        for (const pid of state.playerOrder) {
          const p = pid === deciderId ? updatedPlayer : state.players[pid];
          selectedForFulfillment[pid] = p.customerLine.map((_, i) => i);
        }
        return {
          ...state,
          players: updatedPlayersWithSelection,
          currentCustomer: null,
          phase: "customerResolution",
          selectedForFulfillment,
          playersConfirmedResolution: [],
        };
      }

      // More customers to draft
      return {
        ...state,
        players: {
          ...state.players,
          [deciderId]: updatedPlayer,
        },
        currentCustomer: null,
        currentDrawerIndex: nextDrawerIndex,
        currentDeciderIndex: nextDrawerIndex,
        passCount: 0,
      };
    }

    case "PASS_CUSTOMER": {
      if (!state.currentCustomer) return state;

      const deciderId = state.playerOrder[state.currentDeciderIndex];
      if (action.playerId !== deciderId) return state;

      const playerCount = state.playerOrder.length;
      const nextDeciderIndex = getNextPlayerIndex(
        state.currentDeciderIndex,
        playerCount
      );

      // Check if customer has gone full circle (forced take)
      // passCount tracks how many players have passed
      // When passCount === playerCount - 1, the customer returns to drawer
      if (state.passCount >= playerCount - 1) {
        // Customer returned to drawer - forced take
        const drawerId = state.playerOrder[state.currentDrawerIndex];
        const drawer = state.players[drawerId];

        const updatedDrawer = {
          ...drawer,
          customerLine: [...drawer.customerLine, state.currentCustomer],
        };

        const allCustomersDealt =
          state.customersDealtThisRound >= state.currentRoundCustomers.length;

        const nextDrawerIndex = getNextPlayerIndex(
          state.currentDrawerIndex,
          playerCount
        );

        if (allCustomersDealt) {
          // Move to resolution phase - initialize selection state
          const selectedForFulfillment: Record<string, number[]> = {};
          const updatedPlayersWithSelection = {
            ...state.players,
            [drawerId]: updatedDrawer,
          };
          for (const pid of state.playerOrder) {
            const p = pid === drawerId ? updatedDrawer : state.players[pid];
            selectedForFulfillment[pid] = p.customerLine.map((_, i) => i);
          }
          return {
            ...state,
            players: updatedPlayersWithSelection,
            currentCustomer: null,
            phase: "customerResolution",
            selectedForFulfillment,
            playersConfirmedResolution: [],
          };
        }

        return {
          ...state,
          players: {
            ...state.players,
            [drawerId]: updatedDrawer,
          },
          currentCustomer: null,
          currentDrawerIndex: nextDrawerIndex,
          currentDeciderIndex: nextDrawerIndex,
          passCount: 0,
        };
      }

      // Normal pass - move to next player
      return {
        ...state,
        currentDeciderIndex: nextDeciderIndex,
        passCount: state.passCount + 1,
      };
    }

    // =========================================================================
    // CUSTOMER RESOLUTION PHASE
    // =========================================================================
    case "TOGGLE_CUSTOMER_FULFILL": {
      const { customerIndex } = action.payload || {};
      if (customerIndex === undefined) return state;

      const playerId = action.playerId;
      const currentSelection = state.selectedForFulfillment[playerId] || [];

      // Toggle the index
      const newSelection = currentSelection.includes(customerIndex)
        ? currentSelection.filter((i) => i !== customerIndex)
        : [...currentSelection, customerIndex].sort((a, b) => a - b);

      return {
        ...state,
        selectedForFulfillment: {
          ...state.selectedForFulfillment,
          [playerId]: newSelection,
        },
        // Remove from confirmed if they change selection
        playersConfirmedResolution: state.playersConfirmedResolution.filter(
          (id) => id !== playerId
        ),
      };
    }

    case "CONFIRM_RESOLUTION": {
      const playerId = action.playerId;
      if (state.playersConfirmedResolution.includes(playerId)) {
        return state;
      }
      return {
        ...state,
        playersConfirmedResolution: [...state.playersConfirmedResolution, playerId],
      };
    }

    case "RESOLVE_CUSTOMERS": {
      const updatedPlayers = { ...state.players };

      for (const playerId of state.playerOrder) {
        const player = updatedPlayers[playerId];
        const selectedIndices = state.selectedForFulfillment[playerId] || [];
        let totalMoney = 0;
        let totalPrestige = 0;
        let customersSuccessfullyServed = 0;
        let supplyCosts: Record<SupplyType, number> = {
          coffeeBeans: 0,
          tea: 0,
          milk: 0,
          syrup: 0,
        };

        // Only process selected customers, in order
        for (let i = 0; i < player.customerLine.length; i++) {
          if (!selectedIndices.includes(i)) {
            // Customer not selected - storms out
            continue;
          }

          const customer = player.customerLine[i];
          const required = customer.back.requiresSupplies;

          // Check if player has enough supplies (all-or-nothing)
          let canFulfill = true;
          for (const [supply, qty] of Object.entries(required)) {
            const supplyType = supply as SupplyType;
            const needed = qty || 0;
            const remaining = player.supplies[supplyType] - supplyCosts[supplyType];
            if (remaining < needed) {
              canFulfill = false;
              break;
            }
          }

          if (canFulfill) {
            // Fulfilled: consume supplies and grant reward
            for (const [supply, qty] of Object.entries(required)) {
              supplyCosts[supply as SupplyType] += qty || 0;
            }
            totalMoney += customer.back.reward.money;
            totalPrestige += customer.back.reward.prestige;
            customersSuccessfullyServed++;
          }
          // Else: Customer storms out despite being selected (not enough supplies)
        }

        updatedPlayers[playerId] = {
          ...player,
          money: player.money + totalMoney,
          prestige: player.prestige + totalPrestige,
          supplies: {
            coffeeBeans: player.supplies.coffeeBeans - supplyCosts.coffeeBeans,
            tea: player.supplies.tea - supplyCosts.tea,
            milk: player.supplies.milk - supplyCosts.milk,
            syrup: player.supplies.syrup - supplyCosts.syrup,
          },
          customersServed: player.customersServed + customersSuccessfullyServed,
          customerLine: [], // Clear line after resolution
        };
      }

      return {
        ...state,
        players: updatedPlayers,
        phase: "shopClosed",
        selectedForFulfillment: {},
        playersConfirmedResolution: [],
      };
    }

    // =========================================================================
    // SHOP CLOSED PHASE
    // =========================================================================
    case "CLOSE_SHOP": {
      // Calculate rent owed for each player
      const rentOwed: Record<string, number> = {};
      const rentPaidBy: Record<string, string | null> = {};

      for (const playerId of state.playerOrder) {
        rentOwed[playerId] = GAME_CONFIG.RENT_PER_ROUND;
        rentPaidBy[playerId] = null; // Not paid yet
      }

      return {
        ...state,
        phase: "cleanup",
        rentOwed,
        rentPaidBy,
      };
    }

    // =========================================================================
    // CLEANUP PHASE
    // =========================================================================
    case "PAY_RENT_FOR": {
      // Bailout - one player pays another player's rent
      const { targetPlayerId } = action.payload || {};
      if (!targetPlayerId) return state;

      const payer = state.players[action.playerId];
      const target = state.players[targetPlayerId];
      if (!payer || !target) return state;

      // Can't bailout yourself
      if (action.playerId === targetPlayerId) return state;

      // Check if target still owes rent
      const rentAmount = state.rentOwed[targetPlayerId] || 0;
      if (rentAmount <= 0) return state;

      // Check if already paid by someone
      if (state.rentPaidBy[targetPlayerId] !== null) return state;

      // Payer must have enough money
      if (payer.money < rentAmount) return state;

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...payer,
            money: payer.money - rentAmount,
          },
        },
        rentOwed: {
          ...state.rentOwed,
          [targetPlayerId]: 0,
        },
        rentPaidBy: {
          ...state.rentPaidBy,
          [targetPlayerId]: action.playerId, // Bailed out by this player
        },
      };
    }

    case "END_ROUND": {
      const updatedPlayers = { ...state.players };

      // Pay rent - only for players who weren't bailed out
      // Allow negative money (debt)
      for (const playerId of state.playerOrder) {
        const player = updatedPlayers[playerId];
        const wasBailedOut = state.rentPaidBy[playerId] !== null;

        if (!wasBailedOut) {
          // Player pays their own rent - can go into debt
          updatedPlayers[playerId] = {
            ...player,
            money: player.money - GAME_CONFIG.RENT_PER_ROUND,
          };
        }
        // If bailed out, rent was already paid by someone else
      }

      // Check if game is over
      if (state.round >= GAME_CONFIG.TOTAL_ROUNDS) {
        let winnerId: string | null = null;
        let highestScore = -Infinity;

        for (const playerId of state.playerOrder) {
          const player = updatedPlayers[playerId];
          // Score = money + prestige * 2 (negative money hurts!)
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
          rentOwed: {},
          rentPaidBy: {},
        };
      }

      // Prepare next round
      const playerCount = state.playerOrder.length;

      // Rotate first drawer for next round
      const nextFirstDrawer = getNextPlayerIndex(
        state.firstDrawerIndex,
        playerCount
      );

      // Draw new customers (replenish from deck or reshuffle if needed)
      const customersThisRound = playerCount * GAME_CONFIG.CUSTOMERS_PER_PLAYER;
      let deck = state.customerDeck;
      if (deck.length < customersThisRound) {
        // Reshuffle all cards
        deck = createCustomerDeck(ctx);
      }

      const customersForRound = deck.slice(0, customersThisRound);
      const remainingDeck = deck.slice(customersThisRound);

      return {
        ...state,
        players: updatedPlayers,
        phase: "planning",
        round: state.round + 1,
        customerDeck: remainingDeck,
        currentRoundCustomers: customersForRound,
        customersDealtThisRound: 0,
        currentCustomer: null,
        firstDrawerIndex: nextFirstDrawer,
        currentDrawerIndex: nextFirstDrawer,
        currentDeciderIndex: nextFirstDrawer,
        passCount: 0,
        rentOwed: {},
        rentPaidBy: {},
      };
    }

    // =========================================================================
    // GAME OVER
    // =========================================================================
    case "PLAY_AGAIN": {
      const newState = initialState(ctx.room.players);
      const customerDeck = createCustomerDeck(ctx);
      const playerCount = newState.playerOrder.length;

      const customersForRound = customerDeck.slice(0, playerCount);
      const remainingDeck = customerDeck.slice(playerCount);

      return {
        ...newState,
        phase: "planning",
        round: 1,
        customerDeck: remainingDeck,
        currentRoundCustomers: customersForRound,
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
    case "UPGRADE_CAFE":
      return state.phase === "investment" && player !== undefined;

    case "END_INVESTMENT":
      return isHost && state.phase === "investment";

    case "DRAW_CUSTOMER": {
      if (state.phase !== "customerDraft") return false;
      if (state.currentCustomer !== null) return false;
      if (state.customersDealtThisRound >= state.currentRoundCustomers.length) {
        return false;
      }
      // Only the current drawer can draw
      const drawerId = state.playerOrder[state.currentDrawerIndex];
      return action.playerId === drawerId;
    }

    case "TAKE_CUSTOMER":
    case "PASS_CUSTOMER": {
      if (state.phase !== "customerDraft") return false;
      if (state.currentCustomer === null) return false;
      // Only the current decider can take/pass
      const deciderId = state.playerOrder[state.currentDeciderIndex];
      return action.playerId === deciderId;
    }

    case "TOGGLE_CUSTOMER_FULFILL": {
      if (state.phase !== "customerResolution") return false;
      if (!player) return false;
      const { customerIndex } = action.payload || {};
      if (customerIndex === undefined) return false;
      // Must be a valid customer index
      return customerIndex >= 0 && customerIndex < player.customerLine.length;
    }

    case "CONFIRM_RESOLUTION":
      return state.phase === "customerResolution" && player !== undefined;

    case "RESOLVE_CUSTOMERS":
      return isHost && state.phase === "customerResolution";

    case "CLOSE_SHOP":
      return isHost && state.phase === "shopClosed";

    case "PAY_RENT_FOR": {
      if (state.phase !== "cleanup") return false;
      const { targetPlayerId } = action.payload || {};
      if (!targetPlayerId) return false;
      // Can't bailout yourself
      if (action.playerId === targetPlayerId) return false;
      // Target must still owe rent and not be bailed out yet
      if ((state.rentOwed[targetPlayerId] || 0) <= 0) return false;
      if (state.rentPaidBy[targetPlayerId] !== null) return false;
      // Payer must have enough money
      const payer = state.players[action.playerId];
      return payer && payer.money >= GAME_CONFIG.RENT_PER_ROUND;
    }

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
  description: "Draft customers and fulfill their orders in your cafe!",
  minPlayers: 2,
  maxPlayers: 4,
  initialState,
  reducer,
  getPhase,
  isActionAllowed,
});
