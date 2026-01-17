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
  RENT_PER_ROUND: 10,
  CUSTOMERS_PER_PLAYER: 3, // 2 players = 6, 3 players = 9, 4 players = 12
  // Reputation track settings
  REPUTATION_MIN: -5,
  REPUTATION_MAX: 5,
  REPUTATION_START: 0, // Neutral midpoint
};

// Calculate customer modifier based on reputation level
// -5 → -4 customers, -4 → -3, -3 → -2, -2 → -1, -1 to +1 → 0, +2 → +1, +3 → +2, +4 → +3, +5 → +4
export function getReputationCustomerModifier(reputation: number): number {
  if (reputation <= -5) return -4;
  if (reputation === -4) return -3;
  if (reputation === -3) return -2;
  if (reputation === -2) return -1;
  if (reputation >= -1 && reputation <= 1) return 0;
  if (reputation === 2) return 1;
  if (reputation === 3) return 2;
  if (reputation === 4) return 3;
  if (reputation >= 5) return 4;
  return 0;
}

// =============================================================================
// CUSTOMER ARCHETYPE SYSTEM (5 Archetypes)
// =============================================================================

export type CustomerArchetypeId =
  | "average_joe"
  | "coffee_snob"
  | "influencer"
  | "health_person"
  | "bulk_orderer";

// =============================================================================
// DELIGHT & STORM OUT SYSTEM
// =============================================================================

export type DelightCondition =
  | { type: "serve_multiple"; count: number }
  | { type: "surplus_supply"; supply: SupplyType; amount: number }
  | { type: "all_supplies_stocked" }
  | { type: "total_surplus"; amount: number };

export type StormOutEffect =
  | { type: "none" }
  | { type: "lose_money"; amount: number }
  | { type: "extra_reputation_loss"; total: number }
  | { type: "lose_supply"; supply: SupplyType; amount: number };

export type CustomerOutcome = "delighted" | "satisfied" | "stormed_out";

export interface CustomerArchetype {
  id: CustomerArchetypeId;
  name: string;
  emoji: string;
  description: string;
  delightCondition: DelightCondition;
  delightDescription: string;
  stormOutEffect: StormOutEffect;
  stormOutDescription: string;
}

export const CUSTOMER_ARCHETYPES: Record<CustomerArchetypeId, CustomerArchetype> = {
  average_joe: {
    id: "average_joe",
    name: "Average Joe",
    emoji: "👤",
    description: "Just here for a simple cup. Easy to please, reliable business.",
    delightCondition: { type: "serve_multiple", count: 2 },
    delightDescription: "Serve 2+ Average Joes this round",
    stormOutEffect: { type: "none" },
    stormOutDescription: "No additional effect",
  },
  coffee_snob: {
    id: "coffee_snob",
    name: "Coffee Snob",
    emoji: "🧐",
    description: "Demands only the finest brews. Expects quality and expertise.",
    delightCondition: { type: "surplus_supply", supply: "coffeeBeans", amount: 2 },
    delightDescription: "Have 2+ coffee beans after serving",
    stormOutEffect: { type: "lose_money", amount: 2 },
    stormOutDescription: "Lose $2",
  },
  influencer: {
    id: "influencer",
    name: "Influencer",
    emoji: "📸",
    description: "Here for the aesthetic. Loves presentation and seasonal items.",
    delightCondition: { type: "all_supplies_stocked" },
    delightDescription: "Have all 4 supply types in stock",
    stormOutEffect: { type: "extra_reputation_loss", total: 2 },
    stormOutDescription: "Reputation -2 instead of -1",
  },
  health_person: {
    id: "health_person",
    name: "Health Person",
    emoji: "🧘",
    description: "Focused on wellness. Prefers tea and healthy alternatives.",
    delightCondition: { type: "surplus_supply", supply: "tea", amount: 2 },
    delightDescription: "Have 2+ tea after serving",
    stormOutEffect: { type: "lose_supply", supply: "tea", amount: 1 },
    stormOutDescription: "Lose 1 tea",
  },
  bulk_orderer: {
    id: "bulk_orderer",
    name: "Bulk Orderer",
    emoji: "💼",
    description: "Ordering for the whole team. Big order, big payout.",
    delightCondition: { type: "total_surplus", amount: 3 },
    delightDescription: "Have 3+ total supplies after serving",
    stormOutEffect: { type: "lose_money", amount: 5 },
    stormOutDescription: "Lose $5",
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
// UPGRADE CARD SYSTEM
// =============================================================================

export const UPGRADE_CONFIG = {
  MAX_HAND_SIZE: 3,
  MAX_ACTIVE_UPGRADES: 3,
  STARTING_HAND_SIZE: 3,
  CARDS_DRAWN_PER_ROUND: 1,
};

export type UpgradeCardCategory =
  | "efficiency"    // Reduces costs or increases output
  | "capacity"      // Increases limits or storage
  | "reputation"    // Affects reputation gains/losses
  | "specialty";    // Unique effects

export interface UpgradeCost {
  money?: number;
  supplies?: Partial<Record<SupplyType, number>>;
}

export interface UpgradePrerequisite {
  // Requires another upgrade to be active
  requiresUpgradeCategory?: UpgradeCardCategory;
  // Requires minimum cafe upgrade level
  requiresCafeUpgrade?: {
    type: CafeUpgradeType;
    minLevel: number;
  };
}

export interface UpgradeCard {
  id: string;
  name: string;
  category: UpgradeCardCategory;
  description: string;
  cost: UpgradeCost;
  prerequisite?: UpgradePrerequisite;
  // Effect is placeholder for now - will be implemented later
  effectId: string;
}

// Placeholder upgrade cards - effects to be implemented later
const UPGRADE_CARD_TEMPLATES: Omit<UpgradeCard, "id">[] = [
  // ==========================================================================
  // EFFICIENCY UPGRADES (5 cards) - Reduce costs or increase output
  // ==========================================================================
  {
    name: "Bulk Supplier Contract",
    category: "efficiency",
    description: "Placeholder: Reduces supply costs",
    cost: { money: 5 },
    effectId: "bulk_supplier",
  },
  {
    name: "Efficient Brewing",
    category: "efficiency",
    description: "Placeholder: Get more from your supplies",
    cost: { money: 4 },
    effectId: "efficient_brewing",
  },
  {
    name: "Staff Training",
    category: "efficiency",
    description: "Placeholder: Serve customers faster",
    cost: { money: 6 },
    effectId: "staff_training",
  },
  {
    name: "Loyalty Program",
    category: "efficiency",
    description: "Placeholder: Repeat customers cost less to serve",
    cost: { money: 5 },
    effectId: "loyalty_program",
  },
  {
    name: "Streamlined Menu",
    category: "efficiency",
    description: "Placeholder: Simplified operations",
    cost: { money: 3 },
    effectId: "streamlined_menu",
  },

  // ==========================================================================
  // CAPACITY UPGRADES (5 cards) - Increase limits or storage
  // ==========================================================================
  {
    name: "Extra Storage",
    category: "capacity",
    description: "Placeholder: Store more supplies",
    cost: { money: 4 },
    effectId: "extra_storage",
  },
  {
    name: "Expanded Seating",
    category: "capacity",
    description: "Placeholder: Serve more customers",
    cost: { money: 6 },
    effectId: "expanded_seating",
  },
  {
    name: "Second Register",
    category: "capacity",
    description: "Placeholder: Handle more orders",
    cost: { money: 5 },
    effectId: "second_register",
  },
  {
    name: "Delivery Service",
    category: "capacity",
    description: "Placeholder: Reach more customers",
    cost: { money: 7 },
    effectId: "delivery_service",
  },
  {
    name: "Outdoor Patio",
    category: "capacity",
    description: "Placeholder: Additional seating area",
    cost: { money: 5 },
    effectId: "outdoor_patio",
  },

  // ==========================================================================
  // REPUTATION UPGRADES (4 cards) - Affect reputation gains/losses
  // ==========================================================================
  {
    name: "Social Media Presence",
    category: "reputation",
    description: "Placeholder: Boost reputation gains",
    cost: { money: 4 },
    effectId: "social_media",
  },
  {
    name: "Customer Apology Card",
    category: "reputation",
    description: "Placeholder: Reduce reputation losses",
    cost: { money: 3 },
    effectId: "apology_card",
  },
  {
    name: "Local Partnerships",
    category: "reputation",
    description: "Placeholder: Community reputation boost",
    cost: { money: 5 },
    effectId: "local_partnerships",
  },
  {
    name: "Quality Guarantee",
    category: "reputation",
    description: "Placeholder: Protect your reputation",
    cost: { money: 6 },
    effectId: "quality_guarantee",
  },

  // ==========================================================================
  // SPECIALTY UPGRADES (6 cards) - Unique effects
  // ==========================================================================
  {
    name: "Barista Championship",
    category: "specialty",
    description: "Placeholder: Prestige from coffee orders",
    cost: { money: 5, supplies: { coffeeBeans: 2 } },
    effectId: "barista_championship",
  },
  {
    name: "Tea Ceremony Master",
    category: "specialty",
    description: "Placeholder: Prestige from tea orders",
    cost: { money: 5, supplies: { tea: 2 } },
    effectId: "tea_ceremony",
  },
  {
    name: "Happy Hour Special",
    category: "specialty",
    description: "Placeholder: Bonus during certain rounds",
    cost: { money: 4 },
    effectId: "happy_hour",
  },
  {
    name: "VIP Treatment",
    category: "specialty",
    description: "Placeholder: Special handling for tough customers",
    cost: { money: 6 },
    prerequisite: { requiresCafeUpgrade: { type: "ambiance", minLevel: 1 } },
    effectId: "vip_treatment",
  },
  {
    name: "Secret Menu",
    category: "specialty",
    description: "Placeholder: Hidden options for regulars",
    cost: { money: 4 },
    prerequisite: { requiresUpgradeCategory: "efficiency" },
    effectId: "secret_menu",
  },
  {
    name: "Catering License",
    category: "specialty",
    description: "Placeholder: Handle bulk orders better",
    cost: { money: 8 },
    prerequisite: { requiresCafeUpgrade: { type: "equipment", minLevel: 1 } },
    effectId: "catering_license",
  },
];

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

  // Upgrade card system
  upgradeHand: UpgradeCard[]; // Cards in hand (max 3)
  activeUpgrades: UpgradeCard[]; // Activated upgrades (max 3)

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

  // Shared reputation track (-5 to +5, starts at 0)
  reputation: number;

  // Player management
  playerOrder: string[];
  players: Record<string, CafePlayerState>;
  eliminatedPlayers: string[]; // Players who went bankrupt

  // Customer deck
  customerDeck: CustomerCard[];

  // Upgrade card deck
  upgradeDeck: UpgradeCard[];
  upgradeDiscardPile: UpgradeCard[];
  // Players who must discard from hand before continuing (exceeded hand limit after draw)
  playersNeedingHandDiscard: string[];

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

  // Ready queue - players who clicked ready for current phase
  playersReady: string[];

  // End game
  winnerId: string | null;
}

// =============================================================================
// ACTION TYPES
// =============================================================================

export type CafeActionType =
  // Lobby
  | "START_GAME"
  // Ready queue (used across multiple phases)
  | "PLAYER_READY"
  // Planning phase
  | "END_PLANNING"
  // Investment phase
  | "PURCHASE_SUPPLY"
  | "UPGRADE_CAFE"
  | "ACTIVATE_UPGRADE" // Activate an upgrade card from hand (pay cost)
  | "DISCARD_UPGRADE_FROM_HAND" // Forced discard when hand exceeds limit
  | "DISCARD_ACTIVE_UPGRADE" // Remove an active upgrade (when activating new one at limit)
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
    // Upgrade card actions
    upgradeCardIndex?: number; // Index of upgrade card in hand
    activeUpgradeIndex?: number; // Index of active upgrade to discard
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
    upgradeHand: [],
    activeUpgrades: [],
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

function createUpgradeDeck(ctx: GameContext): UpgradeCard[] {
  const deck = UPGRADE_CARD_TEMPLATES.map((card, index) => ({
    ...card,
    id: `upgrade-${index}-${Math.floor(ctx.random() * 10000)}`,
  }));

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

// Draw upgrade cards from deck, reshuffling discard if needed
function drawUpgradeCards(
  deck: UpgradeCard[],
  discardPile: UpgradeCard[],
  count: number,
  ctx: GameContext
): { drawnCards: UpgradeCard[]; newDeck: UpgradeCard[]; newDiscard: UpgradeCard[] } {
  let currentDeck = [...deck];
  let currentDiscard = [...discardPile];
  const drawnCards: UpgradeCard[] = [];

  for (let i = 0; i < count; i++) {
    if (currentDeck.length === 0) {
      // Reshuffle discard pile into deck
      if (currentDiscard.length === 0) {
        // No cards left anywhere - stop drawing
        break;
      }
      currentDeck = [...currentDiscard];
      currentDiscard = [];
      // Shuffle the new deck
      for (let j = currentDeck.length - 1; j > 0; j--) {
        const k = Math.floor(ctx.random() * (j + 1));
        [currentDeck[j], currentDeck[k]] = [currentDeck[k], currentDeck[j]];
      }
    }

    const card = currentDeck.shift();
    if (card) {
      drawnCards.push(card);
    }
  }

  return { drawnCards, newDeck: currentDeck, newDiscard: currentDiscard };
}

function getNextPlayerIndex(currentIndex: number, playerCount: number): number {
  return (currentIndex + 1) % playerCount;
}

function getNextActivePlayerIndex(
  currentIndex: number,
  playerOrder: string[],
  eliminatedPlayers: string[]
): number {
  const playerCount = playerOrder.length;
  let nextIndex = (currentIndex + 1) % playerCount;
  let iterations = 0;

  // Find next player who isn't eliminated
  while (eliminatedPlayers.includes(playerOrder[nextIndex]) && iterations < playerCount) {
    nextIndex = (nextIndex + 1) % playerCount;
    iterations++;
  }

  return nextIndex;
}

function getActivePlayerCount(playerOrder: string[], eliminatedPlayers: string[]): number {
  return playerOrder.filter(id => !eliminatedPlayers.includes(id)).length;
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
    reputation: GAME_CONFIG.REPUTATION_START,
    playerOrder,
    players: playerStates,
    eliminatedPlayers: [],
    customerDeck: [],
    upgradeDeck: [],
    upgradeDiscardPile: [],
    playersNeedingHandDiscard: [],
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
    playersReady: [],
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

      // Draw customers for first round (3 per player + reputation modifier)
      // At game start, reputation is 0 (neutral), so modifier is 0
      const reputationModifier = getReputationCustomerModifier(state.reputation);
      const baseCustomers = playerCount * GAME_CONFIG.CUSTOMERS_PER_PLAYER;
      const customersThisRound = Math.max(1, baseCustomers + reputationModifier);
      const customersForRound = customerDeck.slice(0, customersThisRound);
      const remainingDeck = customerDeck.slice(customersThisRound);

      // Create and distribute upgrade cards - each player draws 3 at game start
      let upgradeDeck = createUpgradeDeck(ctx);
      let upgradeDiscardPile: UpgradeCard[] = [];
      const updatedPlayers = { ...state.players };

      for (const playerId of state.playerOrder) {
        const { drawnCards, newDeck, newDiscard } = drawUpgradeCards(
          upgradeDeck,
          upgradeDiscardPile,
          UPGRADE_CONFIG.STARTING_HAND_SIZE,
          ctx
        );
        upgradeDeck = newDeck;
        upgradeDiscardPile = newDiscard;

        updatedPlayers[playerId] = {
          ...updatedPlayers[playerId],
          upgradeHand: drawnCards,
        };
      }

      return {
        ...state,
        phase: "planning",
        round: 1,
        players: updatedPlayers,
        customerDeck: remainingDeck,
        upgradeDeck,
        upgradeDiscardPile,
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
    // READY QUEUE (used across multiple phases)
    // =========================================================================
    case "PLAYER_READY": {
      if (state.playersReady.includes(action.playerId)) {
        return state;
      }
      return {
        ...state,
        playersReady: [...state.playersReady, action.playerId],
      };
    }

    // =========================================================================
    // PLANNING PHASE
    // =========================================================================
    case "END_PLANNING": {
      return {
        ...state,
        phase: "investment",
        playersReady: [], // Reset ready queue for next phase
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

    case "ACTIVATE_UPGRADE": {
      const { upgradeCardIndex, activeUpgradeIndex } = action.payload || {};
      if (upgradeCardIndex === undefined) return state;

      const player = state.players[action.playerId];
      if (upgradeCardIndex < 0 || upgradeCardIndex >= player.upgradeHand.length) {
        return state;
      }

      const upgradeCard = player.upgradeHand[upgradeCardIndex];

      // Check if player can pay the cost
      const moneyCost = upgradeCard.cost.money || 0;
      if (player.money < moneyCost) return state;

      // Check supply costs
      const supplyCosts = upgradeCard.cost.supplies || {};
      for (const [supply, amount] of Object.entries(supplyCosts)) {
        if (player.supplies[supply as SupplyType] < (amount || 0)) {
          return state;
        }
      }

      // Check prerequisites
      if (upgradeCard.prerequisite) {
        const prereq = upgradeCard.prerequisite;

        // Check if requires a specific category of active upgrade
        if (prereq.requiresUpgradeCategory) {
          const hasCategory = player.activeUpgrades.some(
            (u) => u.category === prereq.requiresUpgradeCategory
          );
          if (!hasCategory) return state;
        }

        // Check if requires a minimum cafe upgrade level
        if (prereq.requiresCafeUpgrade) {
          const currentLevel = player.upgrades[prereq.requiresCafeUpgrade.type];
          if (currentLevel < prereq.requiresCafeUpgrade.minLevel) {
            return state;
          }
        }
      }

      // Check if player already has max active upgrades
      if (player.activeUpgrades.length >= UPGRADE_CONFIG.MAX_ACTIVE_UPGRADES) {
        // Must specify which active upgrade to replace
        if (activeUpgradeIndex === undefined) return state;
        if (activeUpgradeIndex < 0 || activeUpgradeIndex >= player.activeUpgrades.length) {
          return state;
        }
      }

      // Pay the cost
      let newMoney = player.money - moneyCost;
      const newSupplies = { ...player.supplies };
      for (const [supply, amount] of Object.entries(supplyCosts)) {
        newSupplies[supply as SupplyType] -= amount || 0;
      }

      // Remove card from hand
      const newHand = player.upgradeHand.filter((_, i) => i !== upgradeCardIndex);

      // Update active upgrades
      let newActiveUpgrades = [...player.activeUpgrades];
      let discardedUpgrade: UpgradeCard | null = null;

      if (player.activeUpgrades.length >= UPGRADE_CONFIG.MAX_ACTIVE_UPGRADES && activeUpgradeIndex !== undefined) {
        // Replace the specified active upgrade
        discardedUpgrade = player.activeUpgrades[activeUpgradeIndex];
        newActiveUpgrades = newActiveUpgrades.filter((_, i) => i !== activeUpgradeIndex);
      }
      newActiveUpgrades.push(upgradeCard);

      // Add discarded upgrade to discard pile
      const newDiscardPile = discardedUpgrade
        ? [...state.upgradeDiscardPile, discardedUpgrade]
        : state.upgradeDiscardPile;

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            money: newMoney,
            supplies: newSupplies,
            upgradeHand: newHand,
            activeUpgrades: newActiveUpgrades,
          },
        },
        upgradeDiscardPile: newDiscardPile,
      };
    }

    case "DISCARD_UPGRADE_FROM_HAND": {
      const { upgradeCardIndex } = action.payload || {};
      if (upgradeCardIndex === undefined) return state;

      // Only allow if player is in the list of players needing to discard
      if (!state.playersNeedingHandDiscard.includes(action.playerId)) {
        return state;
      }

      const player = state.players[action.playerId];
      if (upgradeCardIndex < 0 || upgradeCardIndex >= player.upgradeHand.length) {
        return state;
      }

      const discardedCard = player.upgradeHand[upgradeCardIndex];
      const newHand = player.upgradeHand.filter((_, i) => i !== upgradeCardIndex);

      // Remove player from needing discard list if they're now at or below limit
      const stillNeedsDiscard = newHand.length > UPGRADE_CONFIG.MAX_HAND_SIZE;
      const newPlayersNeedingDiscard = stillNeedsDiscard
        ? state.playersNeedingHandDiscard
        : state.playersNeedingHandDiscard.filter((id) => id !== action.playerId);

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            upgradeHand: newHand,
          },
        },
        upgradeDiscardPile: [...state.upgradeDiscardPile, discardedCard],
        playersNeedingHandDiscard: newPlayersNeedingDiscard,
      };
    }

    case "DISCARD_ACTIVE_UPGRADE": {
      // This action is for voluntarily discarding an active upgrade
      // Note: This is generally not allowed per the rules (can only discard when forced)
      // But we provide it for edge cases or if the design changes
      const { activeUpgradeIndex } = action.payload || {};
      if (activeUpgradeIndex === undefined) return state;

      const player = state.players[action.playerId];
      if (activeUpgradeIndex < 0 || activeUpgradeIndex >= player.activeUpgrades.length) {
        return state;
      }

      const discardedUpgrade = player.activeUpgrades[activeUpgradeIndex];
      const newActiveUpgrades = player.activeUpgrades.filter((_, i) => i !== activeUpgradeIndex);

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: {
            ...player,
            activeUpgrades: newActiveUpgrades,
          },
        },
        upgradeDiscardPile: [...state.upgradeDiscardPile, discardedUpgrade],
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
        playersReady: [], // Reset ready queue for next phase
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

      // Add customer to player's line
      const updatedPlayer = {
        ...player,
        customerLine: [...player.customerLine, state.currentCustomer],
      };

      // Check if more customers to draft
      const allCustomersDealt =
        state.customersDealtThisRound >= state.currentRoundCustomers.length;

      // Next drawer rotates clockwise, skipping eliminated players
      const nextDrawerIndex = getNextActivePlayerIndex(
        state.currentDrawerIndex,
        state.playerOrder,
        state.eliminatedPlayers
      );

      if (allCustomersDealt) {
        // Move to resolution phase - initialize selection state
        const selectedForFulfillment: Record<string, number[]> = {};
        const updatedPlayersWithSelection = {
          ...state.players,
          [deciderId]: updatedPlayer,
        };
        // Default: select all customers for fulfillment (only for active players)
        for (const pid of state.playerOrder) {
          if (state.eliminatedPlayers.includes(pid)) continue;
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

      const activePlayerCount = getActivePlayerCount(state.playerOrder, state.eliminatedPlayers);
      const nextDeciderIndex = getNextActivePlayerIndex(
        state.currentDeciderIndex,
        state.playerOrder,
        state.eliminatedPlayers
      );

      // Check if customer has gone full circle (forced take)
      // passCount tracks how many active players have passed
      // When passCount === activePlayerCount - 1, the customer returns to drawer
      if (state.passCount >= activePlayerCount - 1) {
        // Customer returned to drawer - forced take
        const drawerId = state.playerOrder[state.currentDrawerIndex];
        const drawer = state.players[drawerId];

        const updatedDrawer = {
          ...drawer,
          customerLine: [...drawer.customerLine, state.currentCustomer],
        };

        const allCustomersDealt =
          state.customersDealtThisRound >= state.currentRoundCustomers.length;

        const nextDrawerIndex = getNextActivePlayerIndex(
          state.currentDrawerIndex,
          state.playerOrder,
          state.eliminatedPlayers
        );

        if (allCustomersDealt) {
          // Move to resolution phase - initialize selection state
          const selectedForFulfillment: Record<string, number[]> = {};
          const updatedPlayersWithSelection = {
            ...state.players,
            [drawerId]: updatedDrawer,
          };
          for (const pid of state.playerOrder) {
            if (state.eliminatedPlayers.includes(pid)) continue;
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

      // Normal pass - move to next active player
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
      let totalDelighted = 0;
      let totalStormedOut = 0;
      let totalInfluencerStormedOut = 0; // Track separately for extra reputation loss

      for (const playerId of state.playerOrder) {
        // Skip eliminated players
        if (state.eliminatedPlayers.includes(playerId)) continue;

        const player = updatedPlayers[playerId];
        const selectedIndices = state.selectedForFulfillment[playerId] || [];
        let totalMoney = 0;
        let totalPrestige = 0;
        let customersSuccessfullyServed = 0;
        let moneyPenalty = 0;
        let supplyPenalty: Record<SupplyType, number> = {
          coffeeBeans: 0,
          tea: 0,
          milk: 0,
          syrup: 0,
        };
        let supplyCosts: Record<SupplyType, number> = {
          coffeeBeans: 0,
          tea: 0,
          milk: 0,
          syrup: 0,
        };

        // Track fulfilled customers by archetype for "serve_multiple" delight condition
        const fulfilledByArchetype: Record<CustomerArchetypeId, number[]> = {
          average_joe: [],
          coffee_snob: [],
          influencer: [],
          health_person: [],
          bulk_orderer: [],
        };

        // Track which customers are delighted (for Average Joe second-pass)
        const customerOutcomes: CustomerOutcome[] = [];

        // First pass: process all customers
        for (let i = 0; i < player.customerLine.length; i++) {
          const customer = player.customerLine[i];
          const archetype = CUSTOMER_ARCHETYPES[customer.front.archetypeId];

          if (!selectedIndices.includes(i)) {
            // Customer not selected - storms out
            customerOutcomes.push("stormed_out");

            // Apply storm out effect
            const effect = archetype.stormOutEffect;
            if (effect.type === "lose_money") {
              moneyPenalty += effect.amount;
            } else if (effect.type === "lose_supply") {
              supplyPenalty[effect.supply] += effect.amount;
            } else if (effect.type === "extra_reputation_loss") {
              totalInfluencerStormedOut++;
            } else {
              // type === "none" - just count as stormed out
              totalStormedOut++;
            }

            // Count non-influencer storm outs (influencers tracked separately)
            if (effect.type !== "extra_reputation_loss") {
              // Already counted above for "none" type
            }
            if (effect.type === "lose_money" || effect.type === "lose_supply") {
              totalStormedOut++;
            }
            continue;
          }

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
            // Consume supplies
            for (const [supply, qty] of Object.entries(required)) {
              supplyCosts[supply as SupplyType] += qty || 0;
            }

            // Calculate remaining supplies after this order
            const remainingSupplies: Record<SupplyType, number> = {
              coffeeBeans: player.supplies.coffeeBeans - supplyCosts.coffeeBeans,
              tea: player.supplies.tea - supplyCosts.tea,
              milk: player.supplies.milk - supplyCosts.milk,
              syrup: player.supplies.syrup - supplyCosts.syrup,
            };

            // Check delight condition (except serve_multiple which is checked in second pass)
            const condition = archetype.delightCondition;
            let isDelighted = false;

            if (condition.type === "surplus_supply") {
              isDelighted = remainingSupplies[condition.supply] >= condition.amount;
            } else if (condition.type === "all_supplies_stocked") {
              // Check BEFORE consuming (use original supplies minus costs so far, but before this order)
              const beforeThisOrder: Record<SupplyType, number> = {
                coffeeBeans: player.supplies.coffeeBeans - (supplyCosts.coffeeBeans - (required.coffeeBeans || 0)),
                tea: player.supplies.tea - (supplyCosts.tea - (required.tea || 0)),
                milk: player.supplies.milk - (supplyCosts.milk - (required.milk || 0)),
                syrup: player.supplies.syrup - (supplyCosts.syrup - (required.syrup || 0)),
              };
              isDelighted = beforeThisOrder.coffeeBeans >= 1 &&
                           beforeThisOrder.tea >= 1 &&
                           beforeThisOrder.milk >= 1 &&
                           beforeThisOrder.syrup >= 1;
            } else if (condition.type === "total_surplus") {
              const totalRemaining = remainingSupplies.coffeeBeans +
                                    remainingSupplies.tea +
                                    remainingSupplies.milk +
                                    remainingSupplies.syrup;
              isDelighted = totalRemaining >= condition.amount;
            }
            // serve_multiple is handled in second pass

            // Track for serve_multiple check
            fulfilledByArchetype[customer.front.archetypeId].push(i);

            // Mark outcome (may be upgraded to delighted in second pass for Average Joe)
            customerOutcomes.push(isDelighted ? "delighted" : "satisfied");

            // Grant reward
            totalMoney += customer.back.reward.money;
            totalPrestige += customer.back.reward.prestige;
            customersSuccessfullyServed++;

            if (isDelighted) {
              totalDelighted++;
            }
          } else {
            // Customer storms out despite being selected (not enough supplies)
            customerOutcomes.push("stormed_out");

            // Apply storm out effect
            const effect = archetype.stormOutEffect;
            if (effect.type === "lose_money") {
              moneyPenalty += effect.amount;
              totalStormedOut++;
            } else if (effect.type === "lose_supply") {
              supplyPenalty[effect.supply] += effect.amount;
              totalStormedOut++;
            } else if (effect.type === "extra_reputation_loss") {
              totalInfluencerStormedOut++;
            } else {
              totalStormedOut++;
            }
          }
        }

        // Second pass: check "serve_multiple" delight condition (Average Joe)
        for (const [archetypeId, indices] of Object.entries(fulfilledByArchetype)) {
          const archetype = CUSTOMER_ARCHETYPES[archetypeId as CustomerArchetypeId];
          if (archetype.delightCondition.type === "serve_multiple") {
            const requiredCount = archetype.delightCondition.count;
            if (indices.length >= requiredCount) {
              // Upgrade all fulfilled customers of this archetype to delighted
              for (const idx of indices) {
                if (customerOutcomes[idx] === "satisfied") {
                  customerOutcomes[idx] = "delighted";
                  totalDelighted++;
                }
              }
            }
          }
        }

        // Apply supply penalties (floor at 0)
        const finalSupplies: Record<SupplyType, number> = {
          coffeeBeans: Math.max(0, player.supplies.coffeeBeans - supplyCosts.coffeeBeans - supplyPenalty.coffeeBeans),
          tea: Math.max(0, player.supplies.tea - supplyCosts.tea - supplyPenalty.tea),
          milk: Math.max(0, player.supplies.milk - supplyCosts.milk - supplyPenalty.milk),
          syrup: Math.max(0, player.supplies.syrup - supplyCosts.syrup - supplyPenalty.syrup),
        };

        // Apply money (floor at 0)
        const finalMoney = Math.max(0, player.money + totalMoney - moneyPenalty);

        updatedPlayers[playerId] = {
          ...player,
          money: finalMoney,
          prestige: player.prestige + totalPrestige,
          supplies: finalSupplies,
          customersServed: player.customersServed + customersSuccessfullyServed,
          customerLine: [], // Clear line after resolution
        };
      }

      // Update reputation:
      // +1 per delighted (satisfied = +0)
      // -1 per stormed out (or -2 for influencer, tracked as totalInfluencerStormedOut)
      const reputationChange = totalDelighted - totalStormedOut - (totalInfluencerStormedOut * 2);
      const newReputation = Math.max(
        GAME_CONFIG.REPUTATION_MIN,
        Math.min(GAME_CONFIG.REPUTATION_MAX, state.reputation + reputationChange)
      );

      return {
        ...state,
        players: updatedPlayers,
        reputation: newReputation,
        phase: "shopClosed",
        selectedForFulfillment: {},
        playersConfirmedResolution: [],
        playersReady: [], // Reset ready queue for next phase
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
        playersReady: [], // Reset ready queue for next phase
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
      const newlyEliminated: string[] = [];

      // Get active players (not already eliminated)
      const activePlayers = state.playerOrder.filter(
        (id) => !state.eliminatedPlayers.includes(id)
      );

      // Process rent for each active player
      for (const playerId of activePlayers) {
        const player = updatedPlayers[playerId];
        const wasBailedOut = state.rentPaidBy[playerId] !== null;

        if (wasBailedOut) {
          // Rent was already paid by someone else - player is safe
          continue;
        }

        // Check if player can afford rent
        if (player.money >= GAME_CONFIG.RENT_PER_ROUND) {
          // Player pays their own rent
          updatedPlayers[playerId] = {
            ...player,
            money: player.money - GAME_CONFIG.RENT_PER_ROUND,
          };
        } else {
          // Player can't afford rent - they go bankrupt!
          newlyEliminated.push(playerId);
        }
      }

      const allEliminated = [...state.eliminatedPlayers, ...newlyEliminated];

      // Check remaining active players
      const remainingPlayers = state.playerOrder.filter(
        (id) => !allEliminated.includes(id)
      );

      // Check win conditions:
      // 1. Last player standing wins
      // 2. If all rounds complete, highest money wins
      if (remainingPlayers.length === 1) {
        // Last player standing!
        return {
          ...state,
          players: updatedPlayers,
          eliminatedPlayers: allEliminated,
          phase: "gameOver",
          winnerId: remainingPlayers[0],
          rentOwed: {},
          rentPaidBy: {},
        };
      }

      if (remainingPlayers.length === 0) {
        // Everyone went bankrupt at once - no winner
        return {
          ...state,
          players: updatedPlayers,
          eliminatedPlayers: allEliminated,
          phase: "gameOver",
          winnerId: null,
          rentOwed: {},
          rentPaidBy: {},
        };
      }

      // Check if game is over (all rounds complete)
      if (state.round >= GAME_CONFIG.TOTAL_ROUNDS) {
        let winnerId: string | null = null;
        let highestScore = -Infinity;

        for (const playerId of remainingPlayers) {
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
          eliminatedPlayers: allEliminated,
          phase: "gameOver",
          winnerId,
          rentOwed: {},
          rentPaidBy: {},
        };
      }

      // Prepare next round
      const playerCount = remainingPlayers.length;

      // Find next valid drawer index among remaining players
      let nextFirstDrawer = getNextPlayerIndex(
        state.firstDrawerIndex,
        state.playerOrder.length
      );
      // Skip eliminated players
      while (allEliminated.includes(state.playerOrder[nextFirstDrawer])) {
        nextFirstDrawer = getNextPlayerIndex(
          nextFirstDrawer,
          state.playerOrder.length
        );
      }

      // Draw new customers (based on remaining players + reputation modifier)
      const reputationModifier = getReputationCustomerModifier(state.reputation);
      const baseCustomers = playerCount * GAME_CONFIG.CUSTOMERS_PER_PLAYER;
      const customersThisRound = Math.max(1, baseCustomers + reputationModifier);
      let deck = state.customerDeck;
      if (deck.length < customersThisRound) {
        // Reshuffle all cards
        deck = createCustomerDeck(ctx);
      }

      const customersForRound = deck.slice(0, customersThisRound);
      const remainingDeck = deck.slice(customersThisRound);

      // Draw 1 upgrade card for each remaining player at round start
      let currentUpgradeDeck = state.upgradeDeck;
      let currentUpgradeDiscard = state.upgradeDiscardPile;
      const playersNeedingHandDiscard: string[] = [];

      for (const playerId of remainingPlayers) {
        const { drawnCards, newDeck, newDiscard } = drawUpgradeCards(
          currentUpgradeDeck,
          currentUpgradeDiscard,
          UPGRADE_CONFIG.CARDS_DRAWN_PER_ROUND,
          ctx
        );
        currentUpgradeDeck = newDeck;
        currentUpgradeDiscard = newDiscard;

        const player = updatedPlayers[playerId];
        const newHand = [...player.upgradeHand, ...drawnCards];

        updatedPlayers[playerId] = {
          ...player,
          upgradeHand: newHand,
        };

        // Check if player exceeds hand limit and needs to discard
        if (newHand.length > UPGRADE_CONFIG.MAX_HAND_SIZE) {
          playersNeedingHandDiscard.push(playerId);
        }
      }

      return {
        ...state,
        players: updatedPlayers,
        eliminatedPlayers: allEliminated,
        phase: "planning",
        round: state.round + 1,
        customerDeck: remainingDeck,
        upgradeDeck: currentUpgradeDeck,
        upgradeDiscardPile: currentUpgradeDiscard,
        playersNeedingHandDiscard,
        currentRoundCustomers: customersForRound,
        customersDealtThisRound: 0,
        currentCustomer: null,
        firstDrawerIndex: nextFirstDrawer,
        currentDrawerIndex: nextFirstDrawer,
        currentDeciderIndex: nextFirstDrawer,
        passCount: 0,
        rentOwed: {},
        rentPaidBy: {},
        playersReady: [], // Reset ready queue for next round
      };
    }

    // =========================================================================
    // GAME OVER
    // =========================================================================
    case "PLAY_AGAIN": {
      const newState = initialState(ctx.room.players);
      const customerDeck = createCustomerDeck(ctx);
      const playerCount = newState.playerOrder.length;

      // At game start, reputation is 0 (neutral), so modifier is 0
      const reputationModifier = getReputationCustomerModifier(newState.reputation);
      const baseCustomers = playerCount * GAME_CONFIG.CUSTOMERS_PER_PLAYER;
      const customersThisRound = Math.max(1, baseCustomers + reputationModifier);
      const customersForRound = customerDeck.slice(0, customersThisRound);
      const remainingDeck = customerDeck.slice(customersThisRound);

      // Create and distribute upgrade cards - each player draws 3 at game start
      let upgradeDeck = createUpgradeDeck(ctx);
      let upgradeDiscardPile: UpgradeCard[] = [];
      const updatedPlayers = { ...newState.players };

      for (const playerId of newState.playerOrder) {
        const { drawnCards, newDeck, newDiscard } = drawUpgradeCards(
          upgradeDeck,
          upgradeDiscardPile,
          UPGRADE_CONFIG.STARTING_HAND_SIZE,
          ctx
        );
        upgradeDeck = newDeck;
        upgradeDiscardPile = newDiscard;

        updatedPlayers[playerId] = {
          ...updatedPlayers[playerId],
          upgradeHand: drawnCards,
        };
      }

      return {
        ...newState,
        phase: "planning",
        round: 1,
        players: updatedPlayers,
        customerDeck: remainingDeck,
        upgradeDeck,
        upgradeDiscardPile,
        currentRoundCustomers: customersForRound,
        eliminatedPlayers: [], // Reset eliminations
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

// Helper to check if all active players are ready
function allPlayersReady(state: CafeState): boolean {
  const activePlayers = state.playerOrder.filter(
    id => !state.eliminatedPlayers.includes(id)
  );
  return activePlayers.every(id => state.playersReady.includes(id));
}

// Helper to check if all active players have confirmed their resolution
function allPlayersConfirmedResolution(state: CafeState): boolean {
  const activePlayers = state.playerOrder.filter(
    id => !state.eliminatedPlayers.includes(id)
  );
  return activePlayers.every(id => state.playersConfirmedResolution.includes(id));
}

function isActionAllowed(
  state: CafeState,
  action: CafeAction,
  ctx: GameContext
): boolean {
  const isHost = ctx.room.hostId === ctx.playerId;
  const player = state.players[action.playerId];
  const isEliminated = state.eliminatedPlayers.includes(action.playerId);

  // Eliminated players can't take any actions (except viewing)
  if (isEliminated && action.type !== "PLAY_AGAIN") {
    return false;
  }

  switch (action.type) {
    case "START_GAME":
      return isHost && state.phase === "lobby";

    case "PLAYER_READY": {
      // Can mark ready during planning, investment, shopClosed, or cleanup phases
      const validPhases = ["planning", "investment", "shopClosed", "cleanup"];
      if (!validPhases.includes(state.phase)) return false;
      // Must be an active player
      if (!player) return false;
      // Can't ready twice
      if (state.playersReady.includes(action.playerId)) return false;
      return true;
    }

    case "END_PLANNING":
      // Cannot end planning if any players still need to discard upgrade cards
      if (state.playersNeedingHandDiscard.length > 0) return false;
      return isHost && state.phase === "planning" && allPlayersReady(state);

    case "PURCHASE_SUPPLY":
    case "UPGRADE_CAFE":
      return state.phase === "investment" && player !== undefined;

    case "ACTIVATE_UPGRADE": {
      // Can activate upgrades during investment phase
      if (state.phase !== "investment") return false;
      if (!player) return false;

      const { upgradeCardIndex, activeUpgradeIndex } = action.payload || {};
      if (upgradeCardIndex === undefined) return false;
      if (upgradeCardIndex < 0 || upgradeCardIndex >= player.upgradeHand.length) {
        return false;
      }

      const upgradeCard = player.upgradeHand[upgradeCardIndex];

      // Check if player can pay the money cost
      const moneyCost = upgradeCard.cost.money || 0;
      if (player.money < moneyCost) return false;

      // Check supply costs
      const supplyCosts = upgradeCard.cost.supplies || {};
      for (const [supply, amount] of Object.entries(supplyCosts)) {
        if (player.supplies[supply as SupplyType] < (amount || 0)) {
          return false;
        }
      }

      // Check prerequisites
      if (upgradeCard.prerequisite) {
        const prereq = upgradeCard.prerequisite;

        if (prereq.requiresUpgradeCategory) {
          const hasCategory = player.activeUpgrades.some(
            (u) => u.category === prereq.requiresUpgradeCategory
          );
          if (!hasCategory) return false;
        }

        if (prereq.requiresCafeUpgrade) {
          const currentLevel = player.upgrades[prereq.requiresCafeUpgrade.type];
          if (currentLevel < prereq.requiresCafeUpgrade.minLevel) {
            return false;
          }
        }
      }

      // If at max active upgrades, must specify which to replace
      if (player.activeUpgrades.length >= UPGRADE_CONFIG.MAX_ACTIVE_UPGRADES) {
        if (activeUpgradeIndex === undefined) return false;
        if (activeUpgradeIndex < 0 || activeUpgradeIndex >= player.activeUpgrades.length) {
          return false;
        }
      }

      return true;
    }

    case "DISCARD_UPGRADE_FROM_HAND": {
      // Can only discard from hand if player is in the needing discard list
      // Allowed during planning (after round start draw) or investment phase
      if (state.phase !== "planning" && state.phase !== "investment") {
        return false;
      }
      if (!state.playersNeedingHandDiscard.includes(action.playerId)) {
        return false;
      }
      if (!player) return false;

      const { upgradeCardIndex } = action.payload || {};
      if (upgradeCardIndex === undefined) return false;
      if (upgradeCardIndex < 0 || upgradeCardIndex >= player.upgradeHand.length) {
        return false;
      }

      return true;
    }

    case "DISCARD_ACTIVE_UPGRADE": {
      // Allow players to voluntarily remove active upgrades during planning, investment, and draft phases
      // This allows them to make room for new upgrades
      const validPhases: CafePhase[] = ["planning", "investment", "customerDraft"];
      if (!validPhases.includes(state.phase)) return false;
      const player = state.players[action.playerId];
      if (!player || player.activeUpgrades.length === 0) return false;
      return true;
    }

    case "END_INVESTMENT":
      return isHost && state.phase === "investment" && allPlayersReady(state);

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
      return isHost && state.phase === "customerResolution" && allPlayersConfirmedResolution(state);

    case "CLOSE_SHOP":
      return isHost && state.phase === "shopClosed" && allPlayersReady(state);

    case "PAY_RENT_FOR": {
      if (state.phase !== "cleanup") return false;
      const { targetPlayerId } = action.payload || {};
      if (!targetPlayerId) return false;
      // Can't bailout yourself
      if (action.playerId === targetPlayerId) return false;
      // Target must not be eliminated
      if (state.eliminatedPlayers.includes(targetPlayerId)) return false;
      // Target must still owe rent and not be bailed out yet
      if ((state.rentOwed[targetPlayerId] || 0) <= 0) return false;
      if (state.rentPaidBy[targetPlayerId] !== null) return false;
      // Payer must have enough money
      const payer = state.players[action.playerId];
      return payer && payer.money >= GAME_CONFIG.RENT_PER_ROUND;
    }

    case "END_ROUND":
      return isHost && state.phase === "cleanup" && allPlayersReady(state);

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
