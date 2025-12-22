import { NextRequest } from "next/server";
import OpenAI from "openai";
import type {
  CometRushState,
  CometRushPlayerState,
  GameCard,
  EngineeringCard,
  PoliticalCard,
  Rocket,
} from "@/games/comet-rush/config";

export const runtime = "nodejs";

// ============================================================================
// SYSTEM PROMPT - Game Rules
// ============================================================================

const SYSTEM_PROMPT = `You are playing Comet Rush, a cooperative/competitive rocket-building board game. Your goal is to help destroy the comet before it reaches Earth while scoring the most points.

## GAME OVERVIEW
- A comet is approaching Earth (starts 18 spaces away). Players build and launch rockets to destroy it.
- The comet has multiple "strength segments" (4-6 depending on player count) that must be destroyed one by one.
- Each segment has HP (starting from 4 and increasing). A rocket must deal damage ≥ remaining HP to destroy it.
- After ALL players take a turn, the comet moves 1-3 spaces closer (drawn from movement deck).
- The game ends when either: (1) all comet segments are destroyed (players win), or (2) the comet reaches Earth (distance ≤ 0, everyone loses).

## STARTING CONDITIONS
- Each player starts with: 20 resource cubes, 5 income per turn, 2 Engineering cards, 2 Political cards
- Power cap: 3 (can be raised to 6 with BOOST_POWER cards)
- Accuracy cap: 3 (can be raised to 6 with IMPROVE_ACCURACY cards)

## YOUR TURN STRUCTURE
Each turn you MUST take actions in this order:
1. BEGIN_TURN (mandatory) - Collect income, rockets tick down build time
2. DRAW_CARD (mandatory) - Draw from Engineering OR Political deck
3. FREE ACTIONS (any order, any number):
   - LAUNCH_ROCKET: Launch a ready rocket at the comet
   - BUILD_ROCKET: Spend cubes to build a new rocket
   - PLAY_CARD: Play a card from your hand
4. END_TURN (mandatory) - Pass to next player

## ROCKET MECHANICS
- Rockets cost: Power + Accuracy + BuildTimeCost in cubes (e.g., P3/A3/BTC3 = 9 cubes)
- Power (1 to your power cap): Damage dealt on hit. Must equal or exceed segment's remaining HP to destroy it.
- Accuracy (1 to your accuracy cap): You roll 1d6; hit if roll ≤ accuracy. Higher = more reliable.
- BuildTimeCost (1-3): Determines BOTH cube cost AND build delay:
  - BTC 3 = costs 3 extra cubes but rocket is INSTANTLY ready (0 turns wait)
  - BTC 2 = costs 2 extra cubes, rocket ready NEXT turn (1 turn wait)
  - BTC 1 = costs 1 extra cube, rocket ready in 2 TURNS (2 turn wait)
- You can have max 3 active rockets (building + ready). Spent/launched rockets don't count toward this limit.

## CARD TYPES

### Engineering Cards (boost your capabilities):
- BOOST_POWER: Permanently raise your power cap by 1 (max 6)
- IMPROVE_ACCURACY: Permanently raise your accuracy cap by 1 (max 6)
- STREAMLINED_ASSEMBLY: Reduce build time of one of your building rockets by 1. Requires targetRocketId.
- MASS_PRODUCTION: Reduce build time of ALL your building rockets by 1
- INCREASE_INCOME: +1 income permanently (stacks up to +3)
- ROCKET_SALVAGE: +1 cube refund per launch (stacks up to +3)
- REROLL_PROTOCOL: Get a re-roll token (automatically used after a miss)
- COMET_RESEARCH: Peek at top Strength or Movement card. Requires peekChoice: "strength" or "movement".

### Political Cards (interaction & resources):
- RESOURCE_SEIZURE: Steal 2 cubes from target player. Requires targetPlayerId.
- TECHNOLOGY_THEFT: Steal a random card from target player. Requires targetPlayerId.
- EMBARGO: Target player gains no income next turn. Requires targetPlayerId.
- SABOTAGE: Force target player to re-roll their next launch. Requires targetPlayerId.
- REGULATORY_REVIEW: Add +1 build time to target player's building rocket. Requires targetPlayerId AND targetRocketId.
- EMERGENCY_FUNDING: Gain your current income (base + bonus) immediately
- PUBLIC_DONATION_DRIVE: Gain 1 cube per active rocket you have (building + ready)
- INTERNATIONAL_GRANT: You gain 5 cubes, all other players gain 1 cube each

## WINNING & SCORING
- If comet destroyed: Player with most trophy points wins
- Trophy points = sum of base strength of segments YOU destroyed
- Bonus: +5 points for destroying the FINAL segment (game-winning hit)
- If comet reaches Earth: Everyone loses, but highest score is "best loser"

## STRATEGY TIPS
- Early game priority: Raise accuracy cap to 5-6 first (83-100% hit chance is much better than 50%)
- Power only matters for destroying segments - a P1 rocket still deals 1 damage on hit
- BTC 3 (instant) rockets cost more but let you respond immediately; good for finishing off weak segments
- BTC 1 (cheap) rockets are economical for building up your rocket fleet over time
- INCREASE_INCOME cards compound over time - playing them early gives the most benefit
- Political cards against the leader can balance the game; save EMBARGO/SABOTAGE for critical moments
- COMET_RESEARCH (peek at movement) helps predict how many turns remain before impact

## RESPONSE FORMAT
You must respond with valid JSON only:
{
  "action": "ACTION_TYPE",
  "payload": { ... },
  "reasoning": "Brief explanation of your decision"
}

Valid actions and their payloads:
- BEGIN_TURN: {} (no payload needed)
- DRAW_CARD: { "deck": "engineering" | "political" }
- BUILD_ROCKET: { "power": 1-6, "accuracy": 1-6, "buildTimeCost": 1-3 }
- LAUNCH_ROCKET: { "rocketId": "string" }
- PLAY_CARD: { "cardId": "string", "targetPlayerId?": "string", "targetRocketId?": "string", "peekChoice?": "strength" | "movement" }
- END_TURN: {} (no payload needed)

IMPORTANT: Only suggest actions that are valid given the current game state. Check your resources, rocket slots, and what cards are in your hand.`;

// ============================================================================
// STATE FORMATTING
// ============================================================================

function formatPlayerState(player: CometRushPlayerState, isYou: boolean): string {
  const prefix = isYou ? "YOU" : player.name;

  // Count rockets by status
  const readyRockets = player.rockets.filter(r => r.status === "ready");
  const buildingRockets = player.rockets.filter(r => r.status === "building");
  const spentRockets = player.rockets.filter(r => r.status === "spent" || r.status === "launched");
  const activeRockets = readyRockets.length + buildingRockets.length;

  const rockets = player.rockets.map(r => {
    const status = r.status === "building"
      ? `building (${r.buildTimeRemaining} turns left)`
      : r.status;
    return `  - Rocket ${r.id}: P${r.power}/A${r.accuracy} [${status}]`;
  }).join("\n");

  // Show actual card IDs for the player
  const hand = isYou ? player.hand.map(c => {
    const type = c.deck === "engineering"
      ? (c as EngineeringCard).cardType
      : (c as PoliticalCard).cardType;
    return `  - ID="${c.id}": ${c.name} (${type}) - ${c.description}`;
  }).join("\n") : `  (${player.hand.length} cards)`;

  const upgrades = [];
  if (player.upgrades.incomeBonus > 0) upgrades.push(`+${player.upgrades.incomeBonus} income`);
  if (player.upgrades.salvageBonus > 0) upgrades.push(`+${player.upgrades.salvageBonus} salvage`);
  if (player.upgrades.powerCap > 3) upgrades.push(`power cap: ${player.upgrades.powerCap}`);
  if (player.upgrades.accuracyCap > 3) upgrades.push(`accuracy cap: ${player.upgrades.accuracyCap}`);
  if (player.hasRerollToken) upgrades.push("has re-roll token");
  if (player.isEmbargoed) upgrades.push("EMBARGOED (no income this turn)");
  if (player.mustRerollNextLaunch) upgrades.push("SABOTAGED (must re-roll next launch)");

  const maxRockets = player.maxConcurrentRockets;
  const slotsAvailable = maxRockets - activeRockets;

  return `${prefix}:
  Resources: ${player.resourceCubes} cubes
  Base Income: ${player.baseIncome} + ${player.upgrades.incomeBonus} bonus = ${player.baseIncome + player.upgrades.incomeBonus}/turn
  Upgrades: ${upgrades.length > 0 ? upgrades.join(", ") : "none"}
  Trophies: ${player.trophies.length} segments (${player.trophies.reduce((sum, t) => sum + t.baseStrength, 0)} points)
  Rockets: ${activeRockets}/${maxRockets} active (${readyRockets.length} ready, ${buildingRockets.length} building), ${spentRockets.length} spent, ${slotsAvailable} slots free
${rockets || "  (none)"}
  Hand:
${hand || "  (empty)"}`;
}

// Analyze which cards can actually be played right now
function analyzePlayableCards(state: CometRushState, playerId: string): string[] {
  const player = state.players[playerId];
  const otherPlayers = Object.values(state.players).filter(p => p.id !== playerId);
  const playableCards: string[] = [];

  for (const card of player.hand) {
    const cardType = card.deck === "engineering"
      ? (card as { cardType: string }).cardType
      : (card as { cardType: string }).cardType;

    // Check if card can be played based on its requirements
    switch (cardType) {
      // Cards that need no target - always playable
      case "BOOST_POWER":
        if (player.upgrades.powerCap < 6) {
          playableCards.push(`${card.id}: ${card.name} - just use cardId, no target needed`);
        } else {
          playableCards.push(`${card.id}: ${card.name} - CANNOT PLAY (power cap already 6)`);
        }
        break;
      case "IMPROVE_ACCURACY":
        if (player.upgrades.accuracyCap < 6) {
          playableCards.push(`${card.id}: ${card.name} - just use cardId, no target needed`);
        } else {
          playableCards.push(`${card.id}: ${card.name} - CANNOT PLAY (accuracy cap already 6)`);
        }
        break;
      case "INCREASE_INCOME":
        if (player.upgrades.incomeBonus < 3) {
          playableCards.push(`${card.id}: ${card.name} - just use cardId, no target needed`);
        } else {
          playableCards.push(`${card.id}: ${card.name} - CANNOT PLAY (income bonus already +3)`);
        }
        break;
      case "ROCKET_SALVAGE":
        if (player.upgrades.salvageBonus < 3) {
          playableCards.push(`${card.id}: ${card.name} - just use cardId, no target needed`);
        } else {
          playableCards.push(`${card.id}: ${card.name} - CANNOT PLAY (salvage bonus already +3)`);
        }
        break;
      case "MASS_PRODUCTION": {
        const buildingRockets = player.rockets.filter(r => r.status === "building");
        if (buildingRockets.length > 0) {
          playableCards.push(`${card.id}: ${card.name} - just use cardId (affects ${buildingRockets.length} building rocket(s))`);
        } else {
          playableCards.push(`${card.id}: ${card.name} - CANNOT PLAY (no rockets building)`);
        }
        break;
      }
      case "REROLL_PROTOCOL":
      case "EMERGENCY_FUNDING":
      case "PUBLIC_DONATION_DRIVE":
      case "INTERNATIONAL_GRANT":
        playableCards.push(`${card.id}: ${card.name} - just use cardId, no target needed`);
        break;

      // Cards that need targetRocketId (your own building rocket)
      case "STREAMLINED_ASSEMBLY": {
        const buildingRockets = player.rockets.filter(r => r.status === "building");
        if (buildingRockets.length > 0) {
          const targets = buildingRockets.map(r => r.id).join(", ");
          playableCards.push(`${card.id}: ${card.name} - needs targetRocketId (your building rockets: ${targets})`);
        } else {
          playableCards.push(`${card.id}: ${card.name} - CANNOT PLAY (no rockets building)`);
        }
        break;
      }

      // Cards that need peekChoice
      case "COMET_RESEARCH":
        playableCards.push(`${card.id}: ${card.name} - needs peekChoice: "strength" or "movement"`);
        break;

      // Cards that need targetPlayerId (another player)
      case "RESOURCE_SEIZURE":
      case "TECHNOLOGY_THEFT":
      case "EMBARGO":
      case "SABOTAGE": {
        if (otherPlayers.length > 0) {
          const targets = otherPlayers.map(p => p.id).join(", ");
          playableCards.push(`${card.id}: ${card.name} - needs targetPlayerId (opponents: ${targets})`);
        } else {
          playableCards.push(`${card.id}: ${card.name} - CANNOT PLAY (no other players)`);
        }
        break;
      }

      // Cards that need targetPlayerId AND targetRocketId (opponent's building rocket)
      case "REGULATORY_REVIEW": {
        const opponentsWithBuildingRockets = otherPlayers.filter(
          p => p.rockets.some(r => r.status === "building")
        );
        if (opponentsWithBuildingRockets.length > 0) {
          const targets = opponentsWithBuildingRockets.map(p => {
            const buildingIds = p.rockets.filter(r => r.status === "building").map(r => r.id);
            return `${p.id} (rockets: ${buildingIds.join(", ")})`;
          }).join("; ");
          playableCards.push(`${card.id}: ${card.name} - needs targetPlayerId AND targetRocketId (${targets})`);
        } else {
          playableCards.push(`${card.id}: ${card.name} - CANNOT PLAY (no opponents have building rockets)`);
        }
        break;
      }

      default:
        playableCards.push(`${card.id}: ${card.name} - just use cardId`);
    }
  }

  return playableCards;
}

function formatGameState(state: CometRushState, playerId: string): string {
  const player = state.players[playerId];
  const otherPlayers = Object.values(state.players).filter(p => p.id !== playerId);

  const activeSegment = state.activeStrengthCard
    ? `Segment HP: ${state.activeStrengthCard.currentStrength}/${state.activeStrengthCard.baseStrength}`
    : "No active segment (next will appear when you destroy current or there is none)";

  const readyRockets = player.rockets.filter(r => r.status === "ready");
  const buildingRockets = player.rockets.filter(r => r.status === "building");
  const activeRocketCount = readyRockets.length + buildingRockets.length;
  const maxRockets = player.maxConcurrentRockets;
  const slotsAvailable = maxRockets - activeRocketCount;

  // Calculate what rockets the player can actually afford
  const cubes = player.resourceCubes;
  const powerCap = player.upgrades.powerCap;
  const accuracyCap = player.upgrades.accuracyCap;

  // Find max affordable rocket within caps
  let affordableConfigs: string[] = [];
  if (slotsAvailable > 0 && cubes >= 3) {
    // Instant rocket (BTC=3): costs power + accuracy + 3
    const maxInstantBudget = cubes - 3;
    if (maxInstantBudget >= 2) {
      const p = Math.min(powerCap, Math.floor(maxInstantBudget / 2) + 1);
      const a = Math.min(accuracyCap, maxInstantBudget - p + 2);
      affordableConfigs.push(`Instant (BTC=3): up to P${Math.min(p, powerCap)}/A${Math.min(a, accuracyCap)} for ${p + a + 3} cubes`);
    }
    // 1-turn rocket (BTC=2): costs power + accuracy + 2
    const maxOneTurnBudget = cubes - 2;
    if (maxOneTurnBudget >= 2) {
      const p = Math.min(powerCap, Math.floor(maxOneTurnBudget / 2) + 1);
      const a = Math.min(accuracyCap, maxOneTurnBudget - p + 2);
      affordableConfigs.push(`1-turn delay (BTC=2): up to P${Math.min(p, powerCap)}/A${Math.min(a, accuracyCap)} for ${p + a + 2} cubes`);
    }
    // 2-turn rocket (BTC=1): costs power + accuracy + 1
    const maxTwoTurnBudget = cubes - 1;
    if (maxTwoTurnBudget >= 2) {
      const p = Math.min(powerCap, Math.floor(maxTwoTurnBudget / 2) + 1);
      const a = Math.min(accuracyCap, maxTwoTurnBudget - p + 2);
      affordableConfigs.push(`2-turn delay (BTC=1): up to P${Math.min(p, powerCap)}/A${Math.min(a, accuracyCap)} for ${p + a + 1} cubes`);
    }
  }

  // Get playable cards analysis
  const playableCards = analyzePlayableCards(state, playerId);
  const actuallyPlayable = playableCards.filter(c => !c.includes("CANNOT PLAY"));
  const unplayable = playableCards.filter(c => c.includes("CANNOT PLAY"));

  return `
=== GAME STATE (Round ${state.round}) ===

COMET STATUS:
  Distance to Earth: ${state.distanceToImpact} spaces
  ${activeSegment}
  Remaining segments: ${state.strengthDeck.length + (state.activeStrengthCard ? 1 : 0)}

${formatPlayerState(player, true)}

OTHER PLAYERS:
${otherPlayers.map(p => formatPlayerState(p, false)).join("\n\n")}

AVAILABLE ACTIONS:
  - Ready rockets to launch: ${readyRockets.length > 0 ? readyRockets.map(r => `"${r.id}" (P${r.power}/A${r.accuracy})`).join(", ") : "none"}
  - Rocket slots available: ${slotsAvailable} of ${maxRockets} (only ready/building count, spent rockets free up slots)
  - Can build: ${slotsAvailable > 0 && cubes >= 3 ? "YES" : "NO"} (have ${cubes} cubes, power cap ${powerCap}, accuracy cap ${accuracyCap})
${affordableConfigs.length > 0 ? "  - Affordable rocket builds:\n    " + affordableConfigs.join("\n    ") : "  - Cannot afford any rockets"}

PLAYABLE CARDS (${actuallyPlayable.length} of ${player.hand.length}):
${actuallyPlayable.length > 0 ? actuallyPlayable.map(c => "  - " + c).join("\n") : "  (none playable right now)"}
${unplayable.length > 0 ? "\nCANNOT PLAY:\n" + unplayable.map(c => "  - " + c).join("\n") : ""}

DECK STATUS:
  Engineering deck: ${state.engineeringDeck.length} cards
  Political deck: ${state.politicalDeck.length} cards
`;
}

function getValidActions(state: CometRushState, playerId: string): string[] {
  const player = state.players[playerId];
  const actions: string[] = [];

  // Check what phase of turn we're in based on state
  const isActivePlayer = state.playerOrder[state.activePlayerIndex] === playerId;
  if (!isActivePlayer) return [];

  // Always can end turn (after mandatory actions)
  actions.push("END_TURN");

  // Check for ready rockets
  const readyRockets = player.rockets.filter(r => r.status === "ready");
  if (readyRockets.length > 0) {
    actions.push("LAUNCH_ROCKET");
  }

  // Check if can build (only active rockets count toward limit)
  const activeRockets = player.rockets.filter(r => r.status === "ready" || r.status === "building").length;
  const canBuild = activeRockets < player.maxConcurrentRockets && player.resourceCubes >= 3;
  if (canBuild) {
    actions.push("BUILD_ROCKET");
  }

  // Check for playable cards
  if (player.hand.length > 0) {
    actions.push("PLAY_CARD");
  }

  return actions;
}

// ============================================================================
// API HANDLER
// ============================================================================

interface LLMBotRequest {
  state: CometRushState;
  playerId: string;
  turnPhase: "begin" | "draw" | "actions" | "end";
  actionHistory?: string[]; // Actions taken this turn so far
}

interface LLMBotResponse {
  action: string;
  payload: Record<string, unknown>;
  reasoning: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { ok: false, error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as LLMBotRequest;
    const { state, playerId, turnPhase, actionHistory = [] } = body;

    if (!state || !playerId) {
      return Response.json(
        { ok: false, error: "Missing state or playerId" },
        { status: 400 }
      );
    }

    const player = state.players[playerId];
    if (!player) {
      return Response.json(
        { ok: false, error: "Player not found in state" },
        { status: 400 }
      );
    }

    // Build context-aware user prompt
    let userPrompt = formatGameState(state, playerId);

    // Add turn phase context
    userPrompt += `\n=== YOUR TURN ===\n`;

    if (actionHistory.length > 0) {
      userPrompt += `Actions taken this turn: ${actionHistory.join(" → ")}\n`;
    }

    switch (turnPhase) {
      case "begin":
        userPrompt += `You must start your turn with BEGIN_TURN to collect income.\n`;
        break;
      case "draw":
        userPrompt += `You must draw a card. Choose either "engineering" (boost your capabilities) or "political" (interaction & resources).\n`;
        break;
      case "actions":
        const validActions = getValidActions(state, playerId);
        userPrompt += `Free action phase. Valid actions: ${validActions.join(", ")}\n`;
        userPrompt += `Choose your next action. You can do multiple free actions, or END_TURN when done.\n`;
        break;
      case "end":
        userPrompt += `You should END_TURN now.\n`;
        break;
    }

    userPrompt += `\nRespond with your action as JSON.`;

    // Call OpenAI
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "{}";

    let parsed: LLMBotResponse;
    try {
      parsed = JSON.parse(responseText) as LLMBotResponse;
    } catch {
      return Response.json(
        { ok: false, error: "Failed to parse LLM response", raw: responseText },
        { status: 500 }
      );
    }

    // Validate the response has required fields
    if (!parsed.action) {
      return Response.json(
        { ok: false, error: "LLM response missing action", raw: responseText },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      action: parsed.action,
      payload: parsed.payload || {},
      reasoning: parsed.reasoning || "No reasoning provided",
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      }
    });

  } catch (error) {
    console.error("LLM Bot error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
