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
- A comet is approaching Earth. Players build and launch rockets to destroy it.
- The comet has multiple "strength segments" that must be destroyed one by one.
- Each segment has HP that must be reduced to 0 by rocket hits.
- The game ends when either: (1) all comet segments are destroyed (players win), or (2) the comet reaches Earth (distance = 0, players lose).

## YOUR TURN STRUCTURE
Each turn you MUST take actions in this order:
1. BEGIN_TURN (mandatory) - Collect income, rockets tick down build time
2. DRAW_CARD (mandatory) - Draw from Engineering OR Political deck
3. FREE ACTIONS (any order, any number):
   - LAUNCH_ROCKET: Launch a ready rocket at the comet
   - BUILD_ROCKET: Spend cubes to build a new rocket
   - PLAY_CARD: Play a card from your hand
4. END_TURN (mandatory) - Pass to next player, comet moves closer

## ROCKET MECHANICS
- Rockets cost: Power + Accuracy + BuildTimeCost in cubes
- Power (1-6): Damage dealt on hit
- Accuracy (1-6): You must roll ≤ accuracy on 1d6 to hit
- BuildTimeCost (1-3): 1=instant ready, 2=ready next turn, 3=ready in 2 turns
- You can have max 4 rockets at once (any status)

## CARD TYPES

### Engineering Cards (boost your capabilities):
- BOOST_POWER: Permanently raise your power cap by 1 (max 6)
- IMPROVE_ACCURACY: Permanently raise your accuracy cap by 1 (max 6)
- STREAMLINED_ASSEMBLY: Reduce build time of one of your building rockets by 1
- MASS_PRODUCTION: Reduce build time of ALL your building rockets by 1
- INCREASE_INCOME: +1 income permanently (stacks up to 3)
- ROCKET_SALVAGE: +1 cube refund per launch (stacks up to 3)
- REROLL_PROTOCOL: Get a re-roll token (use after a miss to re-roll)
- COMET_RESEARCH: Peek at top Strength or Movement card

### Political Cards (interaction & resources):
- RESOURCE_SEIZURE: Steal 2 cubes from target player
- TECHNOLOGY_THEFT: Steal a random card from target player
- EMBARGO: Target player gains no income next turn
- SABOTAGE: Force target player to re-roll their next launch
- REGULATORY_REVIEW: Add +1 build time to target player's rocket
- EMERGENCY_FUNDING: Gain 6 cubes immediately
- PUBLIC_DONATION_DRIVE: Gain 1 cube per rocket you own
- INTERNATIONAL_GRANT: You gain 5 cubes, all others gain 1

## WINNING & SCORING
- If comet destroyed: Player with most trophy points wins
- Trophy points = sum of base strength of segments YOU destroyed
- Bonus: +3 points for destroying the final segment

## STRATEGY TIPS
- Balance offense (rockets) with economy (income cards)
- High accuracy is often better than high power early game
- Save sabotage/embargo for critical moments
- STREAMLINED_ASSEMBLY can make a building rocket ready faster
- COMET_RESEARCH helps plan for comet strength/movement

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

  const rockets = player.rockets.map(r => {
    const status = r.status === "building"
      ? `building (${r.buildTimeRemaining} turns left)`
      : r.status;
    return `  - Rocket ${r.id}: P${r.power}/A${r.accuracy} [${status}]`;
  }).join("\n");

  const hand = isYou ? player.hand.map(c => {
    const type = c.deck === "engineering"
      ? (c as EngineeringCard).cardType
      : (c as PoliticalCard).cardType;
    return `  - ${c.id}: ${c.name} (${type}) - ${c.description}`;
  }).join("\n") : `  (${player.hand.length} cards)`;

  const upgrades = [];
  if (player.upgrades.incomeBonus > 0) upgrades.push(`+${player.upgrades.incomeBonus} income`);
  if (player.upgrades.salvageBonus > 0) upgrades.push(`+${player.upgrades.salvageBonus} salvage`);
  if (player.upgrades.powerCap > 3) upgrades.push(`power cap: ${player.upgrades.powerCap}`);
  if (player.upgrades.accuracyCap > 3) upgrades.push(`accuracy cap: ${player.upgrades.accuracyCap}`);
  if (player.hasRerollToken) upgrades.push("has re-roll token");
  if (player.isEmbargoed) upgrades.push("EMBARGOED (no income this turn)");
  if (player.mustRerollNextLaunch) upgrades.push("SABOTAGED (must re-roll next launch)");

  return `${prefix}:
  Resources: ${player.resourceCubes} cubes
  Base Income: ${player.baseIncome} + ${player.upgrades.incomeBonus} bonus = ${player.baseIncome + player.upgrades.incomeBonus}/turn
  Upgrades: ${upgrades.length > 0 ? upgrades.join(", ") : "none"}
  Trophies: ${player.trophies.length} segments (${player.trophies.reduce((sum, t) => sum + t.baseStrength, 0)} points)
  Rockets (${player.rockets.length}/4):
${rockets || "  (none)"}
  Hand:
${hand || "  (empty)"}`;
}

function formatGameState(state: CometRushState, playerId: string): string {
  const player = state.players[playerId];
  const otherPlayers = Object.values(state.players).filter(p => p.id !== playerId);

  const activeSegment = state.activeStrengthCard
    ? `Segment HP: ${state.activeStrengthCard.currentStrength}/${state.activeStrengthCard.baseStrength}`
    : "No active segment";

  const readyRockets = player.rockets.filter(r => r.status === "ready");
  const buildingRockets = player.rockets.filter(r => r.status === "building");
  const canBuildMore = player.rockets.length < 4;
  const minRocketCost = 3; // power 1 + accuracy 1 + build 1

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
  - Ready rockets to launch: ${readyRockets.length > 0 ? readyRockets.map(r => r.id).join(", ") : "none"}
  - Can build new rocket: ${canBuildMore && player.resourceCubes >= minRocketCost ? "YES" : "NO"} (need ${minRocketCost}+ cubes, have ${player.resourceCubes})
  - Rocket slots available: ${4 - player.rockets.length}
  - Power cap: ${player.upgrades.powerCap}, Accuracy cap: ${player.upgrades.accuracyCap}

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

  // Check if can build
  const canBuild = player.rockets.length < 4 && player.resourceCubes >= 3;
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
