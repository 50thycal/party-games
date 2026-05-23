import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GameContext, GamePhase, Player } from "@/engine/types";
import { getCurrentPrice } from "./pricing";

// =============================================================================
// CONFIG
// =============================================================================

export const REAL_ESTATE_CONFIG = {
  STARTING_CASH_PER_PLAYER: 120,
  MARKET_SIZE: 4,
  DECK_SIZE: 16,
  MIN_CASH_TO_CONTINUE: 20, // below this, the round ends automatically
};

// =============================================================================
// TYPES
// =============================================================================

export type RealEstatePhase = "lobby" | "playing" | "results";

export type HouseCategory =
  | "condo"
  | "suburban"
  | "mansion"
  | "waterfront";

export const HOUSE_CATEGORIES: HouseCategory[] = [
  "condo",
  "suburban",
  "mansion",
  "waterfront",
];

// A house template — the platonic ideal before it hits the market.
export interface HouseTemplate {
  category: HouseCategory;
  basePrice: number;
  trueValue: number;
}

// A live listing on the market.
export interface Listing extends HouseTemplate {
  id: string;
  listedAt: number; // ms epoch
  driftSeed: number; // 0..1
}

// A house someone owns.
export interface OwnedHouse {
  id: string;
  category: HouseCategory;
  trueValue: number;
  pricePaid: number;
  basePrice: number;
}

export interface RealEstatePlayer {
  id: string;
  name: string;
  houses: OwnedHouse[];
}

export type RealEstateLogEntry =
  | {
      type: "buy";
      playerId: string;
      listingId: string;
      category: HouseCategory;
      pricePaid: number;
      at: number;
    }
  | {
      type: "pass";
      playerId: string;
      at: number;
    }
  | {
      type: "round_ended";
      reason: "deck_empty" | "cash_depleted";
      at: number;
    };

export interface RealEstateState {
  phase: RealEstatePhase;

  // Shared resources
  cashPool: number;
  initialCashPool: number;

  // Market
  market: Listing[];
  deck: HouseTemplate[]; // upcoming listings, drawn into the market

  // Turn order
  playerOrder: string[];
  currentTurnIndex: number;

  // Players
  players: Record<string, RealEstatePlayer>;

  // History (capped to last N for UI)
  log: RealEstateLogEntry[];

  // Endgame
  scores: Record<string, number> | null;
  winnerId: string | null;
}

// =============================================================================
// ACTIONS
// =============================================================================

export type RealEstateActionType =
  | "START_GAME"
  | "BUY_HOUSE"
  | "PASS"
  | "PLAY_AGAIN";

export interface RealEstateAction extends BaseAction {
  type: RealEstateActionType;
  payload?: {
    listingId?: string;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

const CATEGORY_TEMPLATES: Record<
  HouseCategory,
  { basePriceMin: number; basePriceMax: number }
> = {
  condo: { basePriceMin: 30, basePriceMax: 50 },
  suburban: { basePriceMin: 45, basePriceMax: 70 },
  mansion: { basePriceMin: 70, basePriceMax: 100 },
  waterfront: { basePriceMin: 85, basePriceMax: 120 },
};

function randInt(ctx: GameContext, lo: number, hi: number): number {
  return Math.floor(ctx.random() * (hi - lo + 1)) + lo;
}

function makeHouseTemplate(ctx: GameContext): HouseTemplate {
  const category =
    HOUSE_CATEGORIES[Math.floor(ctx.random() * HOUSE_CATEGORIES.length)];
  const { basePriceMin, basePriceMax } = CATEGORY_TEMPLATES[category];
  const basePrice = randInt(ctx, basePriceMin, basePriceMax);
  // True value ranges from 70%–135% of base price.
  const trueMultiplier = 0.7 + ctx.random() * 0.65;
  const trueValue = Math.max(5, Math.round(basePrice * trueMultiplier));
  return { category, basePrice, trueValue };
}

function makeListingFromTemplate(
  template: HouseTemplate,
  ctx: GameContext,
  idSuffix: string
): Listing {
  return {
    ...template,
    id: `house-${ctx.now()}-${idSuffix}-${Math.floor(ctx.random() * 100000)}`,
    listedAt: ctx.now(),
    driftSeed: ctx.random(),
  };
}

function buildDeck(ctx: GameContext, size: number): HouseTemplate[] {
  const deck: HouseTemplate[] = [];
  for (let i = 0; i < size; i++) {
    deck.push(makeHouseTemplate(ctx));
  }
  return deck;
}

function appendLog(
  log: RealEstateLogEntry[],
  entry: RealEstateLogEntry
): RealEstateLogEntry[] {
  const next = [...log, entry];
  // Keep last 20 entries — anything older is just noise.
  return next.length > 20 ? next.slice(next.length - 20) : next;
}

function shouldEndRound(state: RealEstateState, nowMs: number): {
  end: boolean;
  reason: "deck_empty" | "cash_depleted" | null;
} {
  // Cash depleted (can't afford the cheapest current listing).
  if (state.cashPool < REAL_ESTATE_CONFIG.MIN_CASH_TO_CONTINUE) {
    return { end: true, reason: "cash_depleted" };
  }
  if (state.market.length > 0) {
    const cheapest = Math.min(
      ...state.market.map((l) => getCurrentPrice(l, nowMs))
    );
    if (state.cashPool < cheapest) {
      return { end: true, reason: "cash_depleted" };
    }
  }
  // Deck and market both empty.
  if (state.market.length === 0 && state.deck.length === 0) {
    return { end: true, reason: "deck_empty" };
  }
  return { end: false, reason: null };
}

function computeScores(
  players: Record<string, RealEstatePlayer>
): { scores: Record<string, number>; winnerId: string | null } {
  const scores: Record<string, number> = {};
  let winnerId: string | null = null;
  let bestScore = -Infinity;
  for (const [pid, p] of Object.entries(players)) {
    const score = p.houses.reduce(
      (acc, h) => acc + (h.trueValue - h.pricePaid),
      0
    );
    scores[pid] = score;
    if (score > bestScore) {
      bestScore = score;
      winnerId = pid;
    }
  }
  return { scores, winnerId };
}

// =============================================================================
// INITIAL STATE / PHASE
// =============================================================================

function initialState(players: Player[]): RealEstateState {
  const playerState: Record<string, RealEstatePlayer> = {};
  for (const p of players) {
    playerState[p.id] = { id: p.id, name: p.name, houses: [] };
  }
  return {
    phase: "lobby",
    cashPool: 0,
    initialCashPool: 0,
    market: [],
    deck: [],
    playerOrder: players.map((p) => p.id),
    currentTurnIndex: 0,
    players: playerState,
    log: [],
    scores: null,
    winnerId: null,
  };
}

function getPhase(state: RealEstateState): GamePhase {
  return state.phase;
}

// =============================================================================
// REDUCER
// =============================================================================

function reducer(
  state: RealEstateState,
  action: RealEstateAction,
  ctx: GameContext
): RealEstateState {
  switch (action.type) {
    case "START_GAME": {
      if (ctx.room.hostId !== ctx.playerId) return state;
      if (state.phase !== "lobby") return state;
      if (ctx.room.players.length === 0) return state;

      const deck = buildDeck(ctx, REAL_ESTATE_CONFIG.DECK_SIZE);
      const market: Listing[] = [];
      const marketSize = Math.min(REAL_ESTATE_CONFIG.MARKET_SIZE, deck.length);
      for (let i = 0; i < marketSize; i++) {
        const tmpl = deck.shift()!;
        market.push(makeListingFromTemplate(tmpl, ctx, `m${i}`));
      }

      // Re-seed player records from current room roster (handles late joiners).
      const players: Record<string, RealEstatePlayer> = {};
      for (const p of ctx.room.players) {
        players[p.id] = { id: p.id, name: p.name, houses: [] };
      }

      const initialCash =
        REAL_ESTATE_CONFIG.STARTING_CASH_PER_PLAYER *
        ctx.room.players.length;

      return {
        ...state,
        phase: "playing",
        cashPool: initialCash,
        initialCashPool: initialCash,
        market,
        deck,
        playerOrder: ctx.room.players.map((p) => p.id),
        currentTurnIndex: 0,
        players,
        log: [],
        scores: null,
        winnerId: null,
      };
    }

    case "BUY_HOUSE": {
      if (state.phase !== "playing") return state;
      const activePlayerId = state.playerOrder[state.currentTurnIndex];
      if (action.playerId !== activePlayerId) return state;

      const listingId = action.payload?.listingId;
      if (!listingId) return state;
      const listing = state.market.find((l) => l.id === listingId);
      if (!listing) return state;

      const now = ctx.now();
      const price = getCurrentPrice(listing, now);
      if (price > state.cashPool) return state;

      // Apply purchase.
      const nextCashPool = state.cashPool - price;
      const nextMarket = state.market.filter((l) => l.id !== listingId);

      // Refill market from deck if available.
      let nextDeck = state.deck;
      if (nextDeck.length > 0 && nextMarket.length < REAL_ESTATE_CONFIG.MARKET_SIZE) {
        const [tmpl, ...rest] = nextDeck;
        nextDeck = rest;
        nextMarket.push(makeListingFromTemplate(tmpl, ctx, "refill"));
      }

      const buyer = state.players[action.playerId];
      if (!buyer) return state;
      const nextPlayers: Record<string, RealEstatePlayer> = {
        ...state.players,
        [action.playerId]: {
          ...buyer,
          houses: [
            ...buyer.houses,
            {
              id: listing.id,
              category: listing.category,
              trueValue: listing.trueValue,
              pricePaid: price,
              basePrice: listing.basePrice,
            },
          ],
        },
      };

      const nextLog = appendLog(state.log, {
        type: "buy",
        playerId: action.playerId,
        listingId: listing.id,
        category: listing.category,
        pricePaid: price,
        at: now,
      });

      // Advance turn.
      const nextTurnIndex =
        (state.currentTurnIndex + 1) % state.playerOrder.length;

      const interim: RealEstateState = {
        ...state,
        cashPool: nextCashPool,
        market: nextMarket,
        deck: nextDeck,
        players: nextPlayers,
        log: nextLog,
        currentTurnIndex: nextTurnIndex,
      };

      // Check end-of-round conditions.
      const endCheck = shouldEndRound(interim, now);
      if (endCheck.end) {
        const { scores, winnerId } = computeScores(interim.players);
        return {
          ...interim,
          phase: "results",
          scores,
          winnerId,
          log: appendLog(interim.log, {
            type: "round_ended",
            reason: endCheck.reason!,
            at: now,
          }),
        };
      }

      return interim;
    }

    case "PASS": {
      if (state.phase !== "playing") return state;
      const activePlayerId = state.playerOrder[state.currentTurnIndex];
      if (action.playerId !== activePlayerId) return state;

      const now = ctx.now();
      const nextTurnIndex =
        (state.currentTurnIndex + 1) % state.playerOrder.length;

      const interim: RealEstateState = {
        ...state,
        currentTurnIndex: nextTurnIndex,
        log: appendLog(state.log, {
          type: "pass",
          playerId: action.playerId,
          at: now,
        }),
      };

      const endCheck = shouldEndRound(interim, now);
      if (endCheck.end) {
        const { scores, winnerId } = computeScores(interim.players);
        return {
          ...interim,
          phase: "results",
          scores,
          winnerId,
          log: appendLog(interim.log, {
            type: "round_ended",
            reason: endCheck.reason!,
            at: now,
          }),
        };
      }

      return interim;
    }

    case "PLAY_AGAIN": {
      if (ctx.room.hostId !== ctx.playerId) return state;
      if (state.phase !== "results") return state;
      return initialState(ctx.room.players);
    }

    default:
      return state;
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export const realEstateGame = defineGame<RealEstateState, RealEstateAction>({
  id: "real-estate",
  name: "Open House",
  description:
    "Drifting-price real estate showdown — share the bank, beat the market.",
  minPlayers: 2,
  maxPlayers: 6,
  initialState,
  reducer,
  getPhase,
  isActionAllowed(state, action, ctx) {
    switch (action.type) {
      case "START_GAME":
        return ctx.room.hostId === ctx.playerId && state.phase === "lobby";
      case "BUY_HOUSE":
      case "PASS":
        if (state.phase !== "playing") return false;
        return (
          state.playerOrder[state.currentTurnIndex] === action.playerId
        );
      case "PLAY_AGAIN":
        return (
          ctx.room.hostId === ctx.playerId && state.phase === "results"
        );
      default:
        return true;
    }
  },
});
