// =============================================================================
// CAFE BOT LOGIC
// =============================================================================
//
// This file contains bot personalities and decision functions for simulating
// café game sessions in the test/dev tools page.

import type {
  CafeState,
  CafePlayerState,
  SupplyType,
  CustomerCard,
} from "./config";
import { GAME_CONFIG, SUPPLY_COST } from "./config";

// =============================================================================
// BOT PERSONALITIES
// =============================================================================

export type CafeBotPersonality = "efficient" | "hoarder" | "gambler" | "specialist";

export interface CafePersonalityConfig {
  name: string;
  // Supply purchasing preferences (higher = more likely to buy)
  supplyPreferences: Record<SupplyType, number>;
  // 0-1 scale: how willing to take customers without guaranteed supplies
  riskTolerance: number;
  // Minimum money to keep before investing (for rent safety)
  minMoneyBuffer: number;
  // How many passes before being more likely to take a customer
  passThreshold: number;
  // Strategy for fulfillment: "all" attempts all, "profitable" only high-reward, "safe" only guaranteed
  fulfillmentStrategy: "all" | "profitable" | "safe";
}

export const CAFE_PERSONALITIES: Record<CafeBotPersonality, CafePersonalityConfig> = {
  efficient: {
    name: "Efficient",
    supplyPreferences: {
      coffeeBeans: 0.8,
      tea: 0.6,
      milk: 0.7,
      syrup: 0.5,
    },
    riskTolerance: 0.3,
    minMoneyBuffer: 12, // Keeps rent + small buffer
    passThreshold: 2,
    fulfillmentStrategy: "all",
  },
  hoarder: {
    name: "Hoarder",
    supplyPreferences: {
      coffeeBeans: 1.0,
      tea: 0.8,
      milk: 0.9,
      syrup: 0.7,
    },
    riskTolerance: 0.1,
    minMoneyBuffer: 15, // Very conservative
    passThreshold: 3,
    fulfillmentStrategy: "safe",
  },
  gambler: {
    name: "Gambler",
    supplyPreferences: {
      coffeeBeans: 0.6,
      tea: 0.4,
      milk: 0.5,
      syrup: 0.3,
    },
    riskTolerance: 0.8,
    minMoneyBuffer: 10, // Just enough for rent
    passThreshold: 1,
    fulfillmentStrategy: "all",
  },
  specialist: {
    name: "Specialist",
    supplyPreferences: {
      coffeeBeans: 1.0, // Focuses heavily on coffee
      tea: 0.2,
      milk: 0.8, // Needs milk for lattes
      syrup: 0.4,
    },
    riskTolerance: 0.4,
    minMoneyBuffer: 12,
    passThreshold: 2,
    fulfillmentStrategy: "profitable",
  },
};

// Assign personalities to players based on their ID
export function getCafePlayerPersonality(playerId: string): CafeBotPersonality {
  const personalities: CafeBotPersonality[] = ["efficient", "hoarder", "gambler", "specialist"];
  const playerNum = parseInt(playerId.replace(/\D/g, "")) || 0;
  return personalities[playerNum % personalities.length];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Calculate total supply cost for a customer order
function getOrderSupplyCost(customer: CustomerCard): number {
  const supplies = customer.back.requiresSupplies;
  let cost = 0;
  for (const qty of Object.values(supplies)) {
    cost += (qty || 0) * SUPPLY_COST;
  }
  return cost;
}

// Calculate profit for fulfilling a customer
function getOrderProfit(customer: CustomerCard): number {
  const supplyCost = getOrderSupplyCost(customer);
  return customer.back.reward.money - supplyCost;
}

// Check if player can fulfill a customer's order
function canFulfillOrder(player: CafePlayerState, customer: CustomerCard): boolean {
  const required = customer.back.requiresSupplies;
  for (const [supply, qty] of Object.entries(required)) {
    const supplyType = supply as SupplyType;
    const needed = qty || 0;
    if (player.supplies[supplyType] < needed) {
      return false;
    }
  }
  return true;
}

// Count how many supplies would be needed (that player doesn't have) for an order
function getMissingSupplies(player: CafePlayerState, customer: CustomerCard): number {
  const required = customer.back.requiresSupplies;
  let missing = 0;
  for (const [supply, qty] of Object.entries(required)) {
    const supplyType = supply as SupplyType;
    const needed = qty || 0;
    const have = player.supplies[supplyType];
    if (have < needed) {
      missing += needed - have;
    }
  }
  return missing;
}

// =============================================================================
// INVESTMENT PHASE DECISIONS
// =============================================================================

export interface InvestmentDecision {
  action: "PURCHASE_SUPPLY" | "END_INVESTMENT";
  supplyType?: SupplyType;
  reason: string;
}

export function decideInvestmentAction(
  player: CafePlayerState,
  personality: CafeBotPersonality,
  state: CafeState,
  random: () => number
): InvestmentDecision {
  const config = CAFE_PERSONALITIES[personality];

  // Calculate available budget (money - rent buffer)
  const availableBudget = player.money - config.minMoneyBuffer;

  // If no budget, end investment
  if (availableBudget < SUPPLY_COST) {
    return { action: "END_INVESTMENT", reason: "No budget remaining" };
  }

  // Only supplies are available for purchase (upgrades not implemented in game UI)
  const supplyTypes: SupplyType[] = ["coffeeBeans", "tea", "milk", "syrup"];

  // Weight supplies by preference
  const weightedSupplies: { type: SupplyType; weight: number }[] = supplyTypes.map(type => ({
    type,
    weight: config.supplyPreferences[type] * (1 + random() * 0.3), // Add some randomness
  }));

  // Sort by weight (highest first)
  weightedSupplies.sort((a, b) => b.weight - a.weight);

  // Pick the highest weighted supply we can afford
  for (const { type } of weightedSupplies) {
    if (availableBudget >= SUPPLY_COST) {
      return {
        action: "PURCHASE_SUPPLY",
        supplyType: type,
        reason: `Buying ${type} (preference: ${config.supplyPreferences[type].toFixed(1)})`,
      };
    }
  }

  return { action: "END_INVESTMENT", reason: "Cannot afford any supplies" };
}

// =============================================================================
// CUSTOMER DRAFT DECISIONS
// =============================================================================

export interface CustomerDraftDecision {
  action: "TAKE_CUSTOMER" | "PASS_CUSTOMER";
  reason: string;
}

export function decideOnCustomer(
  player: CafePlayerState,
  customer: CustomerCard,
  personality: CafeBotPersonality,
  passCount: number,
  activePlayerCount: number,
  isDrawer: boolean,
  random: () => number
): CustomerDraftDecision {
  const config = CAFE_PERSONALITIES[personality];

  // Calculate order details
  const profit = getOrderProfit(customer);
  const canFulfill = canFulfillOrder(player, customer);
  const missingSupplies = getMissingSupplies(player, customer);

  // Force take if this is the last chance (everyone else passed)
  if (passCount >= activePlayerCount - 1 && isDrawer) {
    return {
      action: "TAKE_CUSTOMER",
      reason: "Forced take - customer returned to drawer",
    };
  }

  // Decision factors
  let takeScore = 0;
  const reasons: string[] = [];

  // Factor 1: Can we fulfill the order?
  if (canFulfill) {
    takeScore += 0.4;
    reasons.push("can fulfill");
  } else {
    // Risk tolerance affects willingness to take unfulfillable orders
    takeScore += config.riskTolerance * 0.2;
    if (missingSupplies <= 2) {
      takeScore += 0.1; // Close to fulfillable
      reasons.push(`missing only ${missingSupplies} supplies`);
    }
  }

  // Factor 2: Profit margin
  if (profit > 5) {
    takeScore += 0.3;
    reasons.push(`good profit ($${profit})`);
  } else if (profit > 2) {
    takeScore += 0.15;
    reasons.push(`decent profit ($${profit})`);
  } else if (profit <= 0) {
    takeScore -= 0.2;
    reasons.push(`low profit ($${profit})`);
  }

  // Factor 3: Pass count (more passes = more pressure to take)
  if (passCount >= config.passThreshold) {
    takeScore += 0.2 * (passCount - config.passThreshold + 1);
    reasons.push(`passed ${passCount} times`);
  }

  // Factor 4: Customer line size (don't overcommit)
  if (player.customerLine.length >= 3) {
    takeScore -= 0.2;
    reasons.push("line getting full");
  }

  // Factor 5: Gambler's special - always somewhat interested
  if (personality === "gambler") {
    takeScore += random() * 0.2;
  }

  // Factor 6: Hoarder prefers to pass more
  if (personality === "hoarder" && !canFulfill) {
    takeScore -= 0.2;
  }

  // Factor 7: Specialist likes coffee-heavy orders
  if (personality === "specialist") {
    const coffeeNeeded = customer.back.requiresSupplies.coffeeBeans || 0;
    if (coffeeNeeded >= 2) {
      takeScore += 0.15;
      reasons.push("coffee specialty");
    }
  }

  // Add some randomness
  takeScore += (random() - 0.5) * 0.2;

  // Make decision
  const threshold = 0.4;
  if (takeScore >= threshold) {
    return {
      action: "TAKE_CUSTOMER",
      reason: `Taking (score: ${takeScore.toFixed(2)}) - ${reasons.join(", ")}`,
    };
  } else {
    return {
      action: "PASS_CUSTOMER",
      reason: `Passing (score: ${takeScore.toFixed(2)}) - ${reasons.length > 0 ? reasons.join(", ") : "not attractive"}`,
    };
  }
}

// =============================================================================
// CUSTOMER RESOLUTION DECISIONS
// =============================================================================

export interface ResolutionDecision {
  customerIndices: number[];
  reason: string;
}

export function selectCustomersToFulfill(
  player: CafePlayerState,
  personality: CafeBotPersonality
): ResolutionDecision {
  const config = CAFE_PERSONALITIES[personality];
  const selectedIndices: number[] = [];
  const reasons: string[] = [];

  // Track available supplies as we select customers
  const availableSupplies: Record<SupplyType, number> = { ...player.supplies };

  // Score each customer
  const scoredCustomers = player.customerLine.map((customer, index) => {
    const canFulfill = canFulfillWithSupplies(customer, availableSupplies);
    const profit = getOrderProfit(customer);

    return {
      index,
      customer,
      canFulfill,
      profit,
    };
  });

  // Sort by fulfillment strategy
  if (config.fulfillmentStrategy === "profitable") {
    // Sort by profit (highest first)
    scoredCustomers.sort((a, b) => b.profit - a.profit);
  } else if (config.fulfillmentStrategy === "safe") {
    // Sort by fulfillability first, then profit
    scoredCustomers.sort((a, b) => {
      if (a.canFulfill !== b.canFulfill) return a.canFulfill ? -1 : 1;
      return b.profit - a.profit;
    });
  }
  // "all" strategy: process in order

  // Select customers to fulfill
  for (const { index, customer, canFulfill, profit } of scoredCustomers) {
    if (config.fulfillmentStrategy === "safe" && !canFulfill) {
      // Safe strategy: skip unfulfillable
      continue;
    }

    if (config.fulfillmentStrategy === "profitable" && profit < 2) {
      // Profitable strategy: skip low-profit orders
      continue;
    }

    // Check if we can still fulfill with remaining supplies
    if (canFulfillWithSupplies(customer, availableSupplies)) {
      // Deduct supplies
      const required = customer.back.requiresSupplies;
      for (const [supply, qty] of Object.entries(required)) {
        availableSupplies[supply as SupplyType] -= qty || 0;
      }
      selectedIndices.push(index);
      reasons.push(`#${index + 1} (profit: $${profit})`);
    }
  }

  return {
    customerIndices: selectedIndices,
    reason: selectedIndices.length > 0
      ? `Fulfilling: ${reasons.join(", ")}`
      : "No customers selected for fulfillment",
  };
}

function canFulfillWithSupplies(
  customer: CustomerCard,
  supplies: Record<SupplyType, number>
): boolean {
  const required = customer.back.requiresSupplies;
  for (const [supply, qty] of Object.entries(required)) {
    const supplyType = supply as SupplyType;
    const needed = qty || 0;
    if (supplies[supplyType] < needed) {
      return false;
    }
  }
  return true;
}

// =============================================================================
// BAILOUT DECISIONS (CLEANUP PHASE)
// =============================================================================

export interface BailoutDecision {
  targetPlayerId: string | null;
  reason: string;
}

export function decideBailout(
  player: CafePlayerState,
  state: CafeState,
  personality: CafeBotPersonality,
  random: () => number
): BailoutDecision {
  const config = CAFE_PERSONALITIES[personality];

  // Hoarders never bail out others
  if (personality === "hoarder") {
    return { targetPlayerId: null, reason: "Hoarder: never bails out others" };
  }

  // Check if player can afford to bail out (needs money for rent + bailout)
  const rentCost = GAME_CONFIG.RENT_PER_ROUND;
  const minNeeded = rentCost * 2; // Own rent + bailout

  if (player.money < minNeeded) {
    return { targetPlayerId: null, reason: "Cannot afford bailout" };
  }

  // Find players who need bailout
  const needsBailout = state.playerOrder
    .filter(pid => {
      if (pid === player.id) return false; // Can't bail out self
      if (state.eliminatedPlayers.includes(pid)) return false;
      if (state.rentPaidBy[pid] !== null) return false; // Already bailed out

      const otherPlayer = state.players[pid];
      return otherPlayer && otherPlayer.money < rentCost;
    });

  if (needsBailout.length === 0) {
    return { targetPlayerId: null, reason: "No one needs bailout" };
  }

  // Gambler: random chance to bail out
  if (personality === "gambler" && random() < 0.3) {
    const target = needsBailout[Math.floor(random() * needsBailout.length)];
    return { targetPlayerId: target, reason: "Gambler: feeling generous" };
  }

  // Efficient: strategic bailout (keep competition alive for reputation)
  if (personality === "efficient" && random() < 0.2) {
    const target = needsBailout[0];
    return { targetPlayerId: target, reason: "Efficient: strategic alliance" };
  }

  return { targetPlayerId: null, reason: "Chose not to bail out" };
}

// =============================================================================
// EXPORTS FOR TEST PAGE
// =============================================================================

export {
  getOrderSupplyCost,
  getOrderProfit,
  canFulfillOrder,
  getMissingSupplies,
};
