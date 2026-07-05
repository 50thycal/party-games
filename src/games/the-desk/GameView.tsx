"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { GameViewProps } from "@/games/views";
import type { DeskHeat, DeskLastRoundResults, DeskState } from "./config";
import { PAR_K, PAYZONE_WIDTH } from "./config";

// ============================================================================
// Canned content — the game must stay fully playable with zero LLM availability
// ============================================================================

const FALLBACK_QUESTIONS: Array<{ prompt: string; trueValue: number }> = [
  { prompt: "% of people who sleep on the same side of the bed every night", trueValue: 76 },
  { prompt: "% of drivers who rate themselves above average", trueValue: 80 },
  { prompt: "% of new year's resolutions abandoned before February", trueValue: 79 },
  { prompt: "% of people who have faked a phone call to avoid someone", trueValue: 62 },
  { prompt: "% of restaurant diners who photograph their food", trueValue: 37 },
  { prompt: "% of people who sing in the car when driving alone", trueValue: 71 },
  { prompt: "% of office meetings that could have been an email", trueValue: 64 },
  { prompt: "% of people who wear jeans at least three times before washing them", trueValue: 57 },
  { prompt: "% of adults who still sleep with a stuffed animal", trueValue: 34 },
  { prompt: "% of people who check their phone within ten minutes of waking", trueValue: 78 },
  { prompt: "% of gym memberships that go unused after March", trueValue: 67 },
  { prompt: "% of people who have cried at work at least once", trueValue: 46 },
  { prompt: "% of people who lick the yogurt lid", trueValue: 55 },
  { prompt: "% of people who talk to their pets in a special voice", trueValue: 82 },
  { prompt: "% of restaurant leftovers that get thrown out uneaten", trueValue: 41 },
];

const FALLBACK_ROUND_COMMENTARY =
  "The Oracle's pricing engine is occupied. Settling from the standard book.";

const HEAT_OPTIONS: Array<{ value: DeskHeat; label: string; desc: string }> = [
  { value: "mild", label: "Mild", desc: "Tame questions. Gentle wit." },
  { value: "spicy", label: "Spicy", desc: "Pointed. The Oracle names names." },
  { value: "scorched", label: "Scorched", desc: "Savagely deadpan. Still compliant." },
];

// ============================================================================
// Small presentational helpers
// ============================================================================

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function OracleMemo({ text }: { text: string }) {
  return (
    <div className="bg-gray-900 border-l-4 border-emerald-500 rounded p-3 mb-4">
      <p className="text-[10px] uppercase tracking-widest text-emerald-500 mb-1">
        The Oracle
      </p>
      <p className="text-sm text-gray-300 italic">{text}</p>
    </div>
  );
}

function PromptCard({ prompt }: { prompt: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 mb-4 text-center">
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        This Round&apos;s Market
      </p>
      <p className="text-lg font-semibold mb-2">{prompt}</p>
      <p className="text-xs text-gray-400">The answer settles as a percentage, 0–100.</p>
    </div>
  );
}

// Persistent collective stakes: the fund's P&L against the benchmark.
function FundTicker({
  fundScore,
  benchmark,
}: {
  fundScore: number;
  benchmark: number;
}) {
  const gap = fundScore - benchmark;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 mb-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-300">
          <span className="text-gray-500">Fund</span>{" "}
          <span className="font-bold text-white">{fundScore}</span>
          <span className="text-gray-600 mx-2">vs</span>
          <span className="text-gray-500">Benchmark</span>{" "}
          <span className="font-bold text-white">{benchmark}</span>
        </span>
        <span
          className={`font-bold ${gap >= 0 ? "text-emerald-400" : "text-red-400"}`}
        >
          {gap >= 0 ? `Ahead by ${gap}` : `Behind by ${-gap}`}
        </span>
      </div>
      <p className="text-[10px] text-gray-500 mt-1">
        The group&apos;s fund must finish at or above the benchmark, or it is
        liquidated and every personal bonus is void.
      </p>
    </div>
  );
}

type Band = { low: number; high: number };

// The market on a 0–100 bar: optional quote band, position band, truth marker,
// and labeled order ticks. Used in quote (MM), trading (public), settlement.
function MarketBar({
  quoteBand,
  payBand,
  truth,
  orders,
}: {
  quoteBand?: Band | null;
  payBand?: Band | null;
  truth?: number | null;
  orders?: DeskLastRoundResults["orders"];
}) {
  const orderList = orders ?? [];
  return (
    <div className="select-none">
      {/* Order name labels, alternating rows to reduce overlap */}
      {orderList.length > 0 && (
        <div className="relative h-12">
          {orderList.map((o, i) => (
            <div
              key={`label-${o.name}-${i}`}
              className={`absolute -translate-x-1/2 text-[10px] leading-tight whitespace-nowrap text-sky-300 ${
                i % 2 === 0 ? "top-6" : "top-0"
              }`}
              style={{ left: `${Math.min(95, Math.max(5, clampPct(o.order)))}%` }}
            >
              {o.sharp ? "🎯" : ""}
              {o.inPayZone ? "💰" : ""}
              {o.name} · {o.order}
            </div>
          ))}
        </div>
      )}

      {/* The bar: bands underneath, ticks on top */}
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gray-700" />
        {quoteBand && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 rounded bg-sky-500/40 border border-sky-400"
            style={{
              left: `${clampPct(quoteBand.low)}%`,
              width: `${clampPct(quoteBand.high) - clampPct(quoteBand.low)}%`,
            }}
          />
        )}
        {payBand && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-6 rounded bg-rose-500/30 border border-rose-500 border-dashed"
            style={{
              left: `${clampPct(payBand.low)}%`,
              width: `${clampPct(payBand.high) - clampPct(payBand.low)}%`,
            }}
          />
        )}
        {orderList.map((o, i) => (
          <div
            key={`tick-${o.name}-${i}`}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-5 rounded bg-sky-400"
            style={{ left: `${clampPct(o.order)}%` }}
          />
        ))}
        {typeof truth === "number" && (
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-8 rounded bg-yellow-400"
            style={{ left: `${clampPct(truth)}%` }}
          />
        )}
      </div>

      {/* Truth label below the bar */}
      {typeof truth === "number" && (
        <div className="relative h-5">
          <div
            className="absolute -translate-x-1/2 text-[10px] font-bold text-yellow-400 whitespace-nowrap"
            style={{ left: `${Math.min(95, Math.max(5, clampPct(truth)))}%` }}
          >
            ▲ SETTLES · {truth}
          </div>
        </div>
      )}

      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>0</span>
        <span>100</span>
      </div>
    </div>
  );
}

function BandLegend({
  showQuote,
  showPay,
  showTruth,
}: {
  showQuote?: boolean;
  showPay?: boolean;
  showTruth?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-[10px] text-gray-400 mt-2">
      {showQuote && (
        <span>
          <span className="inline-block w-3 h-2 rounded-sm bg-sky-500/40 border border-sky-400 mr-1 align-middle" />
          posted quote
        </span>
      )}
      {showPay && (
        <span>
          <span className="inline-block w-3 h-2 rounded-sm bg-rose-500/30 border border-rose-500 border-dashed mr-1 align-middle" />
          MM position
        </span>
      )}
      {showTruth && (
        <span>
          <span className="inline-block w-1 h-3 rounded-sm bg-yellow-400 mr-1 align-middle" />
          settlement value
        </span>
      )}
    </div>
  );
}

function ValueSlider({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
}) {
  return (
    <div>
      {label && <p className="text-gray-400 text-xs mb-1">{label}</p>}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
      <p className="text-center text-2xl font-bold">{value}</p>
    </div>
  );
}

// ============================================================================
// Main view
// ============================================================================

export function TheDeskGameView({
  state,
  room,
  playerId,
  isHost,
  dispatchAction,
}: GameViewProps<DeskState>) {
  const gameState = state as DeskState;
  const phase = gameState?.phase ?? "lobby";
  const heat = gameState?.heat ?? "spicy";
  const roundNumber = gameState?.roundNumber ?? 1;
  const totalRounds = gameState?.totalRounds ?? 0;
  const mmIdx = gameState?.mmIdx ?? -1;
  const fundScore = gameState?.fundScore ?? 0;
  const benchmark = gameState?.benchmark ?? 0;
  const prompt = gameState?.prompt ?? null;
  const trueValue = gameState?.trueValue ?? null;
  const payLow = gameState?.payLow ?? null;
  const payHigh = gameState?.payHigh ?? null;
  const commentary = gameState?.commentary ?? null;
  const quoteLow = gameState?.quoteLow ?? null;
  const quoteHigh = gameState?.quoteHigh ?? null;
  const orders = gameState?.orders ?? {};
  const individual = gameState?.individual ?? {};
  const roundGroupDelta = gameState?.roundGroupDelta ?? 0;
  const roundIndividualDelta = gameState?.roundIndividualDelta ?? {};
  const steerPrompts = gameState?.steerPrompts ?? {};
  const history = gameState?.history ?? [];
  const lastRoundResults = gameState?.lastRoundResults ?? null;
  const outcome = gameState?.outcome ?? null;
  const finalCommentary = gameState?.finalCommentary ?? null;

  const mm = mmIdx >= 0 ? room.players[mmIdx] ?? null : null;
  const isMM = mm !== null && mm.id === playerId;
  const traders = room.players.filter((p) => p.id !== mm?.id);
  const orderedCount = traders.filter((t) => orders[t.id] !== undefined).length;
  const filedCount = room.players.filter(
    (p) => (steerPrompts[p.id] ?? []).length > 0
  ).length;
  const myPrompts = steerPrompts[playerId] ?? [];
  const hasFiled = myPrompts.length > 0;
  const hasOrdered = orders[playerId] !== undefined;

  const standings = room.players
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: individual[p.id] ?? 0,
      roundDelta: roundIndividualDelta[p.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  // --- local input state ---
  const [heatChoice, setHeatChoice] = useState<DeskHeat>("spicy");
  const [isStarting, setIsStarting] = useState(false);

  const [steer1, setSteer1] = useState("");
  const [steer2, setSteer2] = useState("");
  const [isRouting, setIsRouting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [quoteLowInput, setQuoteLowInput] = useState(25);
  const [quoteHighInput, setQuoteHighInput] = useState(75);
  const [isQuoting, setIsQuoting] = useState(false);

  const [orderInput, setOrderInput] = useState(50);
  const [isOrdering, setIsOrdering] = useState(false);

  const [isSettling, setIsSettling] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Fresh inputs every round — and whenever the controlled player changes
  // (hotseat pass-and-play must not leak one player's inputs to the next).
  useEffect(() => {
    setSteer1("");
    setSteer2("");
    setQuoteLowInput(25);
    setQuoteHighInput(75);
    setOrderInput(50);
  }, [roundNumber, playerId]);

  // ==========================================================================
  // /api/desk integration (host client only) — LLM calls happen here, never in
  // the reducer; results are stored in state via SET_ROUND / SET_FINAL.
  // ==========================================================================

  function buildDeskRequest(
    kind: "round" | "final",
    chosenFeedback: { name: string; prompt: string } | null = null
  ) {
    const n = Math.max(1, room.players.length);
    const upcoming = room.players[(mmIdx + 1) % n];
    const scoreValues = room.players.map((p) => individual[p.id] ?? 0);
    const meanScore =
      scoreValues.reduce((sum, s) => sum + s, 0) / Math.max(1, scoreValues.length);
    const upcomingScore = upcoming ? individual[upcoming.id] ?? 0 : 0;

    return {
      kind,
      heat,
      roundNumber,
      totalRounds,
      fundScore,
      benchmark,
      guesserCount: Math.max(1, n - 1),
      upcomingMarketMaker: {
        name: upcoming?.name ?? "",
        individualScore: upcomingScore,
        trailing: upcomingScore < meanScore,
      },
      standings: standings.map((s) => ({
        name: s.name,
        individualScore: s.score,
      })),
      lastRound: lastRoundResults,
      recentPrompts: history.slice(-5).map((h) => h.prompt),
      feedback: Object.entries(steerPrompts).flatMap(([pid, prompts]) => {
        const player = room.players.find((p) => p.id === pid);
        if (!player) return [];
        return (prompts ?? []).map((request) => ({
          name: player.name,
          individualScore: individual[pid] ?? 0,
          prompt: request,
        }));
      }),
      chosenFeedback,
      ...(kind === "final" ? { outcome: outcome ?? "win" } : {}),
    };
  }

  // Pick ONE piece of order flow to build the next market around: a weighted
  // lottery across this round's requests (trailing traders weighted a little
  // heavier). Honored ~80% of the time so the desk usually gets what it asked
  // for; the rest of the time the Oracle chooses its own topic for variety.
  function pickSeedFeedback(): { name: string; prompt: string } | null {
    const bottomHalf = new Set(
      standings.slice(Math.ceil(standings.length / 2)).map((s) => s.id)
    );
    const candidates: Array<{ name: string; prompt: string; weight: number }> = [];
    for (const p of room.players) {
      for (const request of steerPrompts[p.id] ?? []) {
        candidates.push({
          name: p.name,
          prompt: request,
          weight: 3 + (bottomHalf.has(p.id) ? 1 : 0),
        });
      }
    }
    if (candidates.length === 0) return null;
    if (Math.random() >= 0.8) return null; // ~20%: let the Oracle free-wheel

    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * total;
    for (const c of candidates) {
      roll -= c.weight;
      if (roll <= 0) return { name: c.name, prompt: c.prompt };
    }
    const last = candidates[candidates.length - 1];
    return { name: last.name, prompt: last.prompt };
  }

  // Offline dealer: pick an unseen question and place the MM's book by RNG —
  // off the truth by default, over it when the upcoming MM is trailing.
  function dealFallbackRound() {
    const recent = new Set(history.slice(-5).map((h) => h.prompt));
    const pool = FALLBACK_QUESTIONS.filter((q) => !recent.has(q.prompt));
    const options = pool.length > 0 ? pool : FALLBACK_QUESTIONS;
    const question = options[Math.floor(Math.random() * options.length)];

    const request = buildDeskRequest("round");
    const trailing = request.upcomingMarketMaker.trailing;
    const maxLow = 100 - PAYZONE_WIDTH;

    let bandLow: number;
    if (trailing) {
      const lo = Math.max(0, Math.min(maxLow, question.trueValue - PAYZONE_WIDTH));
      const hi = Math.max(0, Math.min(maxLow, question.trueValue));
      bandLow = lo + Math.floor(Math.random() * (hi - lo + 1));
    } else {
      bandLow = Math.floor(Math.random() * (maxLow + 1));
      for (let roll = 0; roll < 20; roll++) {
        if (
          question.trueValue < bandLow ||
          question.trueValue > bandLow + PAYZONE_WIDTH
        ) {
          break;
        }
        bandLow = Math.floor(Math.random() * (maxLow + 1));
      }
    }

    return {
      prompt: question.prompt,
      unit: "%",
      trueValue: question.trueValue,
      payLow: bandLow,
      payHigh: bandLow + PAYZONE_WIDTH,
      par: PAR_K * request.guesserCount,
      commentary: FALLBACK_ROUND_COMMENTARY,
    };
  }

  async function handleGenerateRound() {
    setIsGenerating(true);
    try {
      let round: Record<string, unknown> | null = null;
      const seed = pickSeedFeedback();

      try {
        const res = await fetch("/api/desk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildDeskRequest("round", seed)),
        });
        const json = await res.json();
        if (
          json?.ok === true &&
          typeof json.prompt === "string" &&
          json.prompt.trim() &&
          typeof json.trueValue === "number" &&
          Number.isFinite(json.trueValue) &&
          typeof json.payLow === "number" &&
          Number.isFinite(json.payLow) &&
          typeof json.payHigh === "number" &&
          Number.isFinite(json.payHigh) &&
          typeof json.par === "number" &&
          Number.isFinite(json.par)
        ) {
          round = {
            prompt: json.prompt,
            unit: typeof json.unit === "string" ? json.unit : "%",
            trueValue: json.trueValue,
            payLow: json.payLow,
            payHigh: json.payHigh,
            par: json.par,
            commentary:
              typeof json.commentary === "string" ? json.commentary : "",
          };
        }
      } catch {
        // The Oracle is unreachable. Settle from the standard book.
      }

      await dispatchAction("SET_ROUND", round ?? dealFallbackRound());
    } finally {
      setIsGenerating(false);
    }
  }

  const finalRequested = useRef(false);
  useEffect(() => {
    if (phase !== "final") {
      finalRequested.current = false;
      return;
    }
    if (!isHost || finalCommentary || finalRequested.current) return;
    finalRequested.current = true;

    const topName = standings[0]?.name;
    const fallbackFinal =
      outcome === "liquidated"
        ? `The fund closed at ${fundScore} against a benchmark of ${benchmark}. Liquidated. All bonuses are void. The Oracle is not surprised.`
        : `The fund closed at ${fundScore} against a benchmark of ${benchmark}. It survives.${
            topName ? ` ${topName} is named PM of the Cycle, pending audit.` : ""
          } The Oracle expected less.`;

    (async () => {
      let text: string | null = null;
      try {
        const res = await fetch("/api/desk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildDeskRequest("final")),
        });
        const json = await res.json();
        if (
          json?.ok === true &&
          typeof json.commentary === "string" &&
          json.commentary.trim()
        ) {
          text = json.commentary;
        }
      } catch {
        // Fall through to the templated settlement memo.
      }
      await dispatchAction("SET_FINAL", { commentary: text ?? fallbackFinal });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, finalCommentary]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  async function handleStartGame() {
    setIsStarting(true);
    try {
      await dispatchAction("START_GAME", { heat: heatChoice });
    } finally {
      setIsStarting(false);
    }
  }

  async function handleSubmitSteer(e: FormEvent) {
    e.preventDefault();
    const prompts = [steer1, steer2]
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (prompts.length === 0) return;
    setIsRouting(true);
    try {
      await dispatchAction("SUBMIT_STEER", { prompts });
    } finally {
      setIsRouting(false);
    }
  }

  function handleQuoteLowChange(v: number) {
    setQuoteLowInput(v);
    if (v > quoteHighInput) setQuoteHighInput(v);
  }

  function handleQuoteHighChange(v: number) {
    setQuoteHighInput(v);
    if (v < quoteLowInput) setQuoteLowInput(v);
  }

  async function handlePostQuote(e: FormEvent) {
    e.preventDefault();
    setIsQuoting(true);
    try {
      await dispatchAction("SET_QUOTE", {
        quoteLow: Math.min(quoteLowInput, quoteHighInput),
        quoteHigh: Math.max(quoteLowInput, quoteHighInput),
      });
    } finally {
      setIsQuoting(false);
    }
  }

  async function handleSubmitOrder(e: FormEvent) {
    e.preventDefault();
    setIsOrdering(true);
    try {
      await dispatchAction("SUBMIT_ORDER", { order: orderInput });
    } finally {
      setIsOrdering(false);
    }
  }

  async function handleForceSettle() {
    setIsSettling(true);
    try {
      await dispatchAction("SETTLE");
    } finally {
      setIsSettling(false);
    }
  }

  async function handleNextRound() {
    setIsAdvancing(true);
    try {
      await dispatchAction("NEXT_ROUND");
    } finally {
      setIsAdvancing(false);
    }
  }

  async function handlePlayAgain() {
    setIsResetting(true);
    try {
      await dispatchAction("PLAY_AGAIN");
    } finally {
      setIsResetting(false);
    }
  }

  // ==========================================================================
  // Settlement caption (deterministic, templated — no LLM here)
  // ==========================================================================

  function oracleCaption(lr: DeskLastRoundResults): string {
    if (lr.orders.length === 0) {
      return "No orders were placed. The desk banked 0. The Oracle has settled livelier markets in a graveyard.";
    }
    const truthInQuote =
      lr.quoteLow <= lr.trueValue && lr.trueValue <= lr.quoteHigh;
    const sharps = lr.orders.filter((o) => o.sharp);
    const sharpNailedIt =
      sharps.length > 0 && Math.abs(sharps[0].order - lr.trueValue) <= 5;

    if (!truthInQuote) {
      if (sharpNailedIt) {
        const names = sharps.map((s) => s.name).join(", ");
        return `${names} ignored the quote and hit the number. The rest of you did not.`;
      }
      return `${lr.mmName} talked their book. The desk banked ${lr.groupDelta}. The fund notes this.`;
    }
    if (lr.groupDelta >= lr.par) {
      return `${lr.mmName} quoted straight. The desk nearly settled it. Suspicious.`;
    }
    return `${lr.mmName} quoted straight and the desk still missed. Remarkable, in the wrong direction.`;
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  const lastRound = roundNumber >= totalRounds;
  const roundsRemaining = Math.max(0, totalRounds - roundNumber);

  return (
    <>
      {/* Host Controls */}
      {isHost && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Host Controls</h2>

          {phase === "lobby" && (
            <div className="space-y-4">
              <div>
                <p className="text-gray-400 text-sm mb-2">
                  Calibrate the Oracle:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {HEAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setHeatChoice(opt.value)}
                      className={`rounded-lg py-2 px-2 text-sm font-semibold border transition-colors ${
                        heatChoice === opt.value
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  {HEAT_OPTIONS.find((o) => o.value === heatChoice)?.desc}
                </p>
              </div>
              <button
                onClick={handleStartGame}
                disabled={isStarting || room.players.length < 3}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {isStarting
                  ? "Opening..."
                  : room.players.length < 3
                  ? "The desk requires 3 operators"
                  : "Open the Desk"}
              </button>
            </div>
          )}

          {phase === "briefing" && (
            <button
              onClick={handleGenerateRound}
              disabled={isGenerating}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isGenerating
                ? "The Oracle is pricing the round..."
                : `Close Order Flow & Settle Next Question (${filedCount}/${room.players.length} routed)`}
            </button>
          )}

          {phase === "quote" && (
            <p className="text-gray-400 text-sm">
              Awaiting a posted market from{" "}
              <span className="text-white font-semibold">
                {mm?.name ?? "the market maker"}
              </span>
              .
            </p>
          )}

          {phase === "trading" && (
            <button
              onClick={handleForceSettle}
              disabled={isSettling}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isSettling
                ? "Settling..."
                : `Force Settlement (${orderedCount}/${traders.length} orders in)`}
            </button>
          )}

          {phase === "settlement" && (
            <button
              onClick={handleNextRound}
              disabled={isAdvancing}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isAdvancing
                ? "Booking..."
                : lastRound
                ? "Close the Books"
                : "Next Question"}
            </button>
          )}

          {phase === "final" && (
            <button
              onClick={handlePlayAgain}
              disabled={isResetting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isResetting ? "Reopening..." : "Reopen the Desk"}
            </button>
          )}
        </section>
      )}

      {/* Game Area */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
        {phase !== "lobby" && (
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Round {Math.min(roundNumber, totalRounds || roundNumber)} of{" "}
            {totalRounds || "?"} · Heat: {heat} · Room {room.roomCode}
          </p>
        )}

        {phase !== "lobby" && (
          <FundTicker fundScore={fundScore} benchmark={benchmark} />
        )}

        <h2 className="font-semibold mb-4">
          {phase === "lobby" && "The Desk"}
          {phase === "briefing" && "Order Flow Window"}
          {phase === "quote" && "Market Making"}
          {phase === "trading" && "Trading Window"}
          {phase === "settlement" && "Settlement"}
          {phase === "final" && "Final Settlement"}
        </h2>

        {/* -------------------------------------------------- lobby */}
        {phase === "lobby" && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">
              Awaiting the Oracle. Attendance is mandatory.
            </p>
            <p className="text-gray-500 text-xs">
              Each round, one of you makes the market: the Oracle privately
              tells them the true settlement value of a prediction question —
              and quietly deals them a position that pays them personally for
              every order it catches. They post a public quote; everyone else
              places an order. The fund banks the traders&apos; accuracy, and
              must beat the Oracle&apos;s benchmark by the end of the session
              or it is liquidated and every personal bonus is void. Quote it
              straight, or talk your book. The Oracle settles all.
            </p>
          </div>
        )}

        {/* -------------------------------------------------- briefing */}
        {phase === "briefing" && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              Submit order flow: requests, themes, grievances — the Oracle
              prices what it pleases. The next market maker has not been
              announced.
            </p>

            {hasFiled ? (
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Your order flow
                </p>
                <ul className="space-y-1 mb-2">
                  {myPrompts.map((p, i) => (
                    <li key={i} className="text-sm text-gray-300">
                      — {p}
                    </li>
                  ))}
                </ul>
                <p className="text-gray-500 text-xs italic">
                  Routed. The Oracle may or may not care.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitSteer} className="space-y-3">
                <input
                  type="text"
                  value={steer1}
                  onChange={(e) => setSteer1(e.target.value)}
                  maxLength={200}
                  placeholder="Request to the Oracle..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  value={steer2}
                  onChange={(e) => setSteer2(e.target.value)}
                  maxLength={200}
                  placeholder="Additional request (optional)"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={isRouting || !(steer1.trim() || steer2.trim())}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {isRouting ? "Routing..." : "Submit Order Flow"}
                </button>
              </form>
            )}

            <p className="text-gray-500 text-xs">
              {filedCount} of {room.players.length} desks have routed order
              flow.
            </p>
          </div>
        )}

        {/* -------------------------------------------------- quote */}
        {phase === "quote" && (
          <div>
            {commentary && <OracleMemo text={commentary} />}
            {prompt && <PromptCard prompt={prompt} />}

            {isMM ? (
              <form onSubmit={handlePostQuote} className="space-y-5">
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
                  <p className="text-sm text-yellow-200 font-semibold">
                    Settlement value: {trueValue ?? "?"}%. Only you know this.
                  </p>
                  <p className="text-xs text-yellow-200/70 mt-1">
                    You are the market maker. The Oracle has also dealt you a
                    position.
                  </p>
                </div>

                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-rose-400 mb-2">
                    Your position — insider information
                  </p>
                  <p className="text-gray-300 text-sm mb-3">
                    You earn{" "}
                    <span className="font-semibold text-rose-300">
                      personal bonus points for every trader whose order lands
                      in {payLow ?? 0}–{payHigh ?? 0}
                    </span>
                    , so a quote that lures them into that band pads your
                    personal score. But the{" "}
                    <span className="font-semibold text-emerald-300">
                      group&apos;s fund only grows when traders guess the real
                      answer ({trueValue ?? "?"}%)
                    </span>
                    — and if the fund misses the benchmark, your bonus is wiped.
                    Quote it straight, or talk your book.
                  </p>
                  <MarketBar
                    payBand={
                      payLow !== null && payHigh !== null
                        ? { low: payLow, high: payHigh }
                        : null
                    }
                    quoteBand={{
                      low: Math.min(quoteLowInput, quoteHighInput),
                      high: Math.max(quoteLowInput, quoteHighInput),
                    }}
                    truth={trueValue}
                  />
                  <BandLegend showQuote showPay showTruth />
                </div>

                <div>
                  <p className="text-gray-400 text-sm mb-2">
                    Post your market. Traders will see only this range.
                  </p>
                  <div className="space-y-3">
                    <ValueSlider
                      value={quoteLowInput}
                      onChange={handleQuoteLowChange}
                      label="Quote low"
                    />
                    <ValueSlider
                      value={quoteHighInput}
                      onChange={handleQuoteHighChange}
                      label="Quote high"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isQuoting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isQuoting
                    ? "Posting..."
                    : `Post Quote ${Math.min(
                        quoteLowInput,
                        quoteHighInput
                      )}–${Math.max(quoteLowInput, quoteHighInput)}`}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  <span className="font-semibold text-white">
                    {mm?.name ?? "The market maker"}
                  </span>{" "}
                  is pricing the market.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  Hold your orders.
                </p>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- trading */}
        {phase === "trading" && (
          <div>
            {commentary && <OracleMemo text={commentary} />}
            {prompt && <PromptCard prompt={prompt} />}

            <div className="bg-gray-900 rounded-lg p-4 mb-4">
              <p className="text-[10px] uppercase tracking-widest text-sky-400 mb-2">
                Posted market from {mm?.name ?? "the market maker"}:{" "}
                {quoteLow ?? 0}–{quoteHigh ?? 100}
              </p>
              <MarketBar
                quoteBand={
                  quoteLow !== null && quoteHigh !== null
                    ? { low: quoteLow, high: quoteHigh }
                    : null
                }
                payBand={
                  isMM && payLow !== null && payHigh !== null
                    ? { low: payLow, high: payHigh }
                    : null
                }
                truth={isMM ? trueValue : null}
              />
              <BandLegend showQuote showPay={isMM} showTruth={isMM} />
            </div>

            {isMM ? (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  Your traders are filling. Let&apos;s see who read the tape.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  {orderedCount} of {traders.length} orders in.
                </p>
              </div>
            ) : hasOrdered ? (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-1">Order filled:</p>
                <p className="text-3xl font-bold text-emerald-400">
                  {orders[playerId]}
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  {orderedCount} of {traders.length} orders in. The Oracle
                  thanks you for your liquidity.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitOrder} className="space-y-4">
                <p className="text-gray-400 text-sm">
                  Place your order: where does this settle? The quote is a
                  courtesy from someone with a position. Closest order takes
                  the sharp bonus.
                </p>
                <ValueSlider value={orderInput} onChange={setOrderInput} />
                <button
                  type="submit"
                  disabled={isOrdering}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isOrdering ? "Filling..." : `Place Order at ${orderInput}`}
                </button>
              </form>
            )}
          </div>
        )}

        {/* -------------------------------------------------- settlement */}
        {phase === "settlement" && lastRoundResults && (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-2">
                {lastRoundResults.prompt}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">
                Settlement value
              </p>
              <p className="text-4xl font-bold text-yellow-400">
                {lastRoundResults.trueValue}%
              </p>
              <p className="text-gray-500 text-xs mt-2">
                {lastRoundResults.mmName} posted {lastRoundResults.quoteLow}–
                {lastRoundResults.quoteHigh}. Their book paid on{" "}
                {lastRoundResults.payLow}–{lastRoundResults.payHigh}.
              </p>
            </div>

            <div className="bg-gray-900 rounded-lg p-4">
              <MarketBar
                quoteBand={{
                  low: lastRoundResults.quoteLow,
                  high: lastRoundResults.quoteHigh,
                }}
                payBand={{
                  low: lastRoundResults.payLow,
                  high: lastRoundResults.payHigh,
                }}
                truth={lastRoundResults.trueValue}
                orders={lastRoundResults.orders}
              />
              <BandLegend showQuote showPay showTruth />
              <p className="text-[10px] text-gray-500 mt-1">
                🎯 sharp (closest to settlement) · 💰 landed in the MM&apos;s
                book
              </p>
            </div>

            <div className="bg-gray-900 border-l-4 border-emerald-500 rounded p-3">
              <p className="text-sm text-gray-300 italic">
                {oracleCaption(lastRoundResults)}
              </p>
            </div>

            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                Fund P&amp;L
              </p>
              <p className="text-2xl font-bold text-white">
                +{roundGroupDelta}{" "}
                <span className="text-sm font-normal text-gray-400">
                  banked this round (par was {lastRoundResults.par})
                </span>
              </p>
              <p
                className={`text-sm font-semibold mt-1 ${
                  fundScore >= benchmark ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {fundScore} vs benchmark {benchmark} —{" "}
                {fundScore >= benchmark
                  ? `ahead by ${fundScore - benchmark}`
                  : `behind by ${benchmark - fundScore}`}
                {roundsRemaining > 0
                  ? ` · ${roundsRemaining} round${
                      roundsRemaining === 1 ? "" : "s"
                    } remain`
                  : " · no rounds remain"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                Round Bonuses (personal ledger — void on liquidation)
              </h3>
              <ul className="space-y-1">
                {standings.map((s) => (
                  <li
                    key={s.id}
                    className="flex justify-between items-center text-sm py-1.5 px-3 bg-gray-900 rounded"
                  >
                    <span className="text-gray-300">
                      {s.name}
                      {s.id === mm?.id && (
                        <span className="text-gray-500 text-xs">
                          {" "}
                          (Market Maker)
                        </span>
                      )}
                      {s.id === playerId && (
                        <span className="text-gray-500 text-xs"> (you)</span>
                      )}
                    </span>
                    <span className="text-gray-300">
                      <span
                        className={`mr-3 text-xs ${
                          s.roundDelta > 0 ? "text-emerald-400" : "text-gray-500"
                        }`}
                      >
                        {s.roundDelta > 0 ? `+${s.roundDelta}` : s.roundDelta}
                      </span>
                      <span className="font-semibold">{s.score}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* -------------------------------------------------- final */}
        {phase === "final" && (
          <div className="space-y-5">
            <div
              className={`text-center py-6 rounded-lg border ${
                outcome === "win"
                  ? "bg-emerald-900/30 border-emerald-700"
                  : "bg-red-900/30 border-red-700"
              }`}
            >
              <p
                className={`text-3xl font-bold ${
                  outcome === "win" ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {outcome === "win" ? "FUND SURVIVES" : "LIQUIDATED"}
              </p>
              <p className="text-gray-300 text-sm mt-2 font-mono">
                Final P&amp;L {fundScore} vs benchmark {benchmark} (
                {fundScore >= benchmark ? "+" : ""}
                {fundScore - benchmark})
              </p>
              {outcome === "liquidated" && (
                <p className="text-red-200/70 text-xs mt-1">
                  All bonuses are void.
                </p>
              )}
            </div>

            {outcome === "win" && standings[0] && (
              <div className="text-center py-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                <p className="text-[10px] uppercase tracking-widest text-yellow-500 mb-1">
                  PM of the Cycle
                </p>
                <p className="text-2xl font-bold text-yellow-300">
                  {standings[0].name}
                  {standings[0].id === playerId && " (You)"}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {standings[0].score} in personal bonuses
                </p>
              </div>
            )}

            <div className="bg-gray-900 border-l-4 border-emerald-500 rounded p-3">
              <p className="text-[10px] uppercase tracking-widest text-emerald-500 mb-1">
                Closing settlement from the Oracle
              </p>
              <p className="text-sm text-gray-300 italic">
                {finalCommentary ?? "The Oracle is marking the book to market..."}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                {outcome === "win" ? "Bonus Ledger" : "Bonus Ledger — VOID"}
              </h3>
              <ul className="space-y-1">
                {standings.map((s, i) => (
                  <li
                    key={s.id}
                    className={`flex justify-between text-sm py-1.5 px-3 rounded ${
                      outcome === "win" && i === 0
                        ? "bg-yellow-900/30 border border-yellow-800"
                        : "bg-gray-900"
                    }`}
                  >
                    <span
                      className={
                        outcome === "liquidated"
                          ? "text-gray-500 line-through"
                          : "text-gray-300"
                      }
                    >
                      {i + 1}. {s.name}
                      {s.id === playerId && (
                        <span className="text-gray-500 text-xs no-underline">
                          {" "}
                          (you)
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-semibold ${
                        outcome === "liquidated"
                          ? "text-gray-500 line-through"
                          : "text-gray-300"
                      }`}
                    >
                      {s.score}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {!isHost && (
              <p className="text-gray-500 text-xs text-center">
                Awaiting the Oracle. The host may reopen the desk.
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
