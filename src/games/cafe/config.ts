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
  | "cleanup" // Pay rent, prepare next round
  | "gameOver";

// =============================================================================
// GAME CONFIGURATION
// =============================================================================

export const GAME_CONFIG = {
  TOTAL_ROUNDS: 5,
  STARTING_MONEY: 10,
  RENT_PER_ROUND: 2,
  // Customers per round = number of players (set dynamically)
};

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

export const SUPPLY_COST = 2;

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

      // Draw customers for first round (one per player)
      const customersForRound = customerDeck.slice(0, playerCount);
      const remainingDeck = customerDeck.slice(playerCount);

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
        // Move to resolution phase
        return {
          ...state,
          players: {
            ...state.players,
            [deciderId]: updatedPlayer,
          },
          currentCustomer: null,
          phase: "customerResolution",
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
          return {
            ...state,
            players: {
              ...state.players,
              [drawerId]: updatedDrawer,
            },
            currentCustomer: null,
            phase: "customerResolution",
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
    case "RESOLVE_CUSTOMERS": {
      const updatedPlayers = { ...state.players };

      for (const playerId of state.playerOrder) {
        const player = updatedPlayers[playerId];
        let totalMoney = 0;
        let totalPrestige = 0;
        let supplyCosts: Record<SupplyType, number> = {
          coffeeBeans: 0,
          tea: 0,
          milk: 0,
          syrup: 0,
        };
        let penalties = 0;

        for (const customer of player.customerLine) {
          const required = customer.back.requiresSupplies;

          // Check if player can fulfill order
          let canFulfill = true;
          for (const [supply, qty] of Object.entries(required)) {
            const supplyType = supply as SupplyType;
            const needed = qty || 0;
            const have = player.supplies[supplyType] - (supplyCosts[supplyType] || 0);
            if (have < needed) {
              canFulfill = false;
              break;
            }
          }

          if (canFulfill) {
            // Consume supplies and get rewards
            for (const [supply, qty] of Object.entries(required)) {
              supplyCosts[supply as SupplyType] += qty || 0;
            }
            totalMoney += customer.back.reward.money;
            totalPrestige += customer.back.reward.prestige;
          } else {
            // Apply failure penalty
            switch (customer.back.failRule) {
              case "lose_prestige":
                totalPrestige -= 1;
                break;
              case "pay_penalty":
                penalties += 2;
                break;
              // no_penalty: nothing happens
            }
          }
        }

        updatedPlayers[playerId] = {
          ...player,
          money: Math.max(0, player.money + totalMoney - penalties),
          prestige: Math.max(0, player.prestige + totalPrestige),
          supplies: {
            coffeeBeans: player.supplies.coffeeBeans - supplyCosts.coffeeBeans,
            tea: player.supplies.tea - supplyCosts.tea,
            milk: player.supplies.milk - supplyCosts.milk,
            syrup: player.supplies.syrup - supplyCosts.syrup,
          },
          customersServed: player.customersServed + player.customerLine.length,
          customerLine: [],
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
      const updatedPlayers = { ...state.players };

      // Pay rent
      for (const playerId of state.playerOrder) {
        const player = updatedPlayers[playerId];
        updatedPlayers[playerId] = {
          ...player,
          money: Math.max(0, player.money - GAME_CONFIG.RENT_PER_ROUND),
        };
      }

      // Check if game is over
      if (state.round >= GAME_CONFIG.TOTAL_ROUNDS) {
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
      const playerCount = state.playerOrder.length;

      // Rotate first drawer for next round
      const nextFirstDrawer = getNextPlayerIndex(
        state.firstDrawerIndex,
        playerCount
      );

      // Draw new customers (replenish from deck or reshuffle if needed)
      let deck = state.customerDeck;
      if (deck.length < playerCount) {
        // Reshuffle all cards
        deck = createCustomerDeck(ctx);
      }

      const customersForRound = deck.slice(0, playerCount);
      const remainingDeck = deck.slice(playerCount);

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
  description: "Draft customers and fulfill their orders in your cafe!",
  minPlayers: 2,
  maxPlayers: 4,
  initialState,
  reducer,
  getPhase,
  isActionAllowed,
});
