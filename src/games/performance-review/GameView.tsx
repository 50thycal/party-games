"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { GameViewProps } from "@/games/views";
import type { PRColleagueResult, PRHeat, PRState } from "./config";

// ============================================================================
// Canned content — the game must stay fully playable with zero LLM availability
// ============================================================================

const FALLBACK_SPECTRUMS: Array<{
  topic: string;
  leftLabel: string;
  rightLabel: string;
}> = [
  { topic: "Reclining your airplane seat", leftLabel: "Your right", rightLabel: "War crime" },
  { topic: "Taking credit for a group idea", leftLabel: "Team win", rightLabel: "Fireable" },
  { topic: "Reply-all to the whole company", leftLabel: "Bold transparency", rightLabel: "Career-ending" },
  { topic: "Calling in sick when you feel fine", leftLabel: "Self-care", rightLabel: "Theft" },
  { topic: "Microwaving fish in the office kitchen", leftLabel: "Lunch", rightLabel: "Act of war" },
  { topic: "Messaging coworkers after 9pm", leftLabel: "Dedication", rightLabel: "Unhinged" },
  { topic: "Pineapple on pizza", leftLabel: "Delicacy", rightLabel: "Crime scene" },
  { topic: "Small talk in the elevator", leftLabel: "Basic decency", rightLabel: "Hostage situation" },
  { topic: "Ghosting a recruiter", leftLabel: "Fair game", rightLabel: "Unforgivable" },
  { topic: "Keeping your camera off in every meeting", leftLabel: "Reasonable boundary", rightLabel: "Quiet resignation" },
  { topic: "Regifting a present", leftLabel: "Efficient", rightLabel: "Betrayal" },
  { topic: "Splitting the bill evenly when you had a salad", leftLabel: "Fine", rightLabel: "Robbery" },
  { topic: "Listening to voicemail", leftLabel: "Mandatory", rightLabel: "Optional forever" },
  { topic: "A 7:30am meeting", leftLabel: "Peak productivity", rightLabel: "Crime against staff" },
  { topic: "Telling a friend their business idea is bad", leftLabel: "True kindness", rightLabel: "Never" },
];

// Offline memos (LLM down). Kept varied so back-to-back fallbacks don't repeat.
const FALLBACK_SPECTRUM_COMMENTARY = [
  "Management's analysis engine is busy. Proceeding with a standard evaluation.",
  "The topic generator is being audited. A pre-approved review has been substituted. Do not comment.",
  "Analytics is offline. Management has reached into the filing cabinet. Try to act surprised.",
  "The recommendation algorithm has requested a mental health day. Denied, but it left anyway. Standard evaluation follows.",
  "Bandwidth is being diverted to a more important department. You get a stock topic. You get what you get.",
];

const HEAT_OPTIONS: Array<{ value: PRHeat; label: string; desc: string }> = [
  { value: "mild", label: "Mild", desc: "Office-safe. Gentle dry wit." },
  { value: "spicy", label: "Spicy", desc: "Pointed. A little savage." },
  { value: "scorched", label: "Scorched", desc: "Maximally savage. Still compliant." },
];

// ============================================================================
// Small presentational helpers
// ============================================================================

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function MemoBox({ text }: { text: string }) {
  return (
    <div className="bg-gray-900 border-l-4 border-amber-500 rounded p-3 mb-4">
      <p className="text-[10px] uppercase tracking-widest text-amber-500 mb-1">
        Memo from Management
      </p>
      <p className="text-sm text-gray-300 italic">{text}</p>
    </div>
  );
}

function TopicCard({
  topic,
  leftLabel,
  rightLabel,
}: {
  topic: string;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 mb-4 text-center">
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        Review Topic
      </p>
      <p className="text-lg font-semibold mb-2">{topic}</p>
      <p className="text-xs text-gray-400">
        <span className="text-blue-300">0 · {leftLabel}</span>
        <span className="mx-2 text-gray-600">⟷</span>
        <span className="text-red-300">{rightLabel} · 100</span>
      </p>
    </div>
  );
}

function StanceSlider({
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1 gap-4">
        <span>{leftLabel} · 0</span>
        <span className="text-right">100 · {rightLabel}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
      <p className="text-center text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

// The signature reveal visual: truth marker + every colleague's guess on one bar.
function SpectrumBar({
  leftLabel,
  rightLabel,
  opinion,
  results,
}: {
  leftLabel: string;
  rightLabel: string;
  opinion: number;
  results: PRColleagueResult[];
}) {
  return (
    <div className="select-none">
      {/* Colleague name labels, alternating rows to reduce overlap */}
      <div className="relative h-12">
        {results.map((r, i) => (
          <div
            key={`label-${r.name}-${i}`}
            className={`absolute -translate-x-1/2 text-[10px] leading-tight whitespace-nowrap ${
              i % 2 === 0 ? "top-6" : "top-0"
            } ${r.points >= 5 ? "text-green-300" : "text-blue-300"}`}
            style={{ left: `${Math.min(95, Math.max(5, clampPct(r.dial)))}%` }}
          >
            {r.name} · {r.dial}
          </div>
        ))}
      </div>

      {/* The bar with tick markers */}
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gray-700" />
        {results.map((r, i) => (
          <div
            key={`tick-${r.name}-${i}`}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-5 rounded ${
              r.points >= 5 ? "bg-green-400" : "bg-blue-400"
            }`}
            style={{ left: `${clampPct(r.dial)}%` }}
          />
        ))}
        {/* The truth */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-8 rounded bg-yellow-400"
          style={{ left: `${clampPct(opinion)}%` }}
        />
      </div>

      {/* Truth label below the bar */}
      <div className="relative h-5">
        <div
          className="absolute -translate-x-1/2 text-[10px] font-bold text-yellow-400 whitespace-nowrap"
          style={{ left: `${Math.min(95, Math.max(5, clampPct(opinion)))}%` }}
        >
          ▲ TRUTH · {opinion}
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-400 mt-1 gap-4">
        <span>{leftLabel}</span>
        <span className="text-right">{rightLabel}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Main view
// ============================================================================

export function PerformanceReviewGameView({
  state,
  room,
  playerId,
  isHost,
  dispatchAction,
}: GameViewProps<PRState>) {
  const gameState = state as PRState;
  const phase = gameState?.phase ?? "lobby";
  const heat = gameState?.heat ?? "spicy";
  const roundNumber = gameState?.roundNumber ?? 1;
  const totalRounds = gameState?.totalRounds ?? 0;
  const psychicIdx = gameState?.psychicIdx ?? -1;
  const topic = gameState?.topic ?? null;
  const leftLabel = gameState?.leftLabel ?? "";
  const rightLabel = gameState?.rightLabel ?? "";
  const commentary = gameState?.commentary ?? null;
  const clue = gameState?.clue ?? null;
  const dials = gameState?.dials ?? {};
  const scores = gameState?.scores ?? {};
  const roundScores = gameState?.roundScores ?? {};
  const steerPrompts = gameState?.steerPrompts ?? {};
  const feedbackLog = gameState?.feedbackLog ?? [];
  const history = gameState?.history ?? [];
  const lastRoundResults = gameState?.lastRoundResults ?? null;
  const finalCommentary = gameState?.finalCommentary ?? null;

  const psychic = psychicIdx >= 0 ? room.players[psychicIdx] ?? null : null;
  const isPsychic = psychic !== null && psychic.id === playerId;
  const colleagues = room.players.filter((p) => p.id !== psychic?.id);
  const dialedCount = colleagues.filter((c) => dials[c.id] !== undefined).length;
  const filedCount = room.players.filter(
    (p) => (steerPrompts[p.id] ?? []).length > 0
  ).length;
  const myPrompts = steerPrompts[playerId] ?? [];
  const hasFiled = myPrompts.length > 0;
  const hasDialed = dials[playerId] !== undefined;

  const standings = room.players
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: scores[p.id] ?? 0,
      roundDelta: roundScores[p.id] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  // --- local input state ---
  const [heatChoice, setHeatChoice] = useState<PRHeat>("spicy");
  const [isStarting, setIsStarting] = useState(false);

  const [steer1, setSteer1] = useState("");
  const [steer2, setSteer2] = useState("");
  const [isFiling, setIsFiling] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [stanceInput, setStanceInput] = useState(50);
  const [clueInput, setClueInput] = useState("");
  const [isStating, setIsStating] = useState(false);

  const [dialInput, setDialInput] = useState(50);
  const [isDialing, setIsDialing] = useState(false);

  const [isRevealing, setIsRevealing] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Fresh inputs every review — and whenever the controlled player changes
  // (hotseat pass-and-play must not leak one player's typing to the next).
  useEffect(() => {
    setSteer1("");
    setSteer2("");
    setStanceInput(50);
    setClueInput("");
    setDialInput(50);
  }, [roundNumber, playerId]);

  // ==========================================================================
  // /api/host integration (host client only) — LLM calls happen here, never in
  // the reducer; results are stored in state via SET_SPECTRUM / SET_FINAL.
  // ==========================================================================

  function buildHostRequest(
    kind: "spectrum" | "final",
    chosenFeedback: { name: string; prompt: string } | null = null
  ) {
    return {
      kind,
      heat,
      roundNumber,
      totalRounds,
      standings: standings.map((s) => ({
        name: s.name,
        score: s.score,
        trend: s.roundDelta > 0 ? "up" : s.roundDelta < 0 ? "down" : "flat",
      })),
      lastRound: lastRoundResults,
      recentTopics: history.slice(-5).map((h) => h.topic),
      feedback: Object.entries(steerPrompts).flatMap(([pid, prompts]) => {
        const player = room.players.find((p) => p.id === pid);
        if (!player) return [];
        return (prompts ?? []).map((prompt) => ({
          name: player.name,
          score: scores[pid] ?? 0,
          prompt,
        }));
      }),
      chosenFeedback,
    };
  }

  // Pick ONE suggestion to seed the next review: weighted random across this
  // round's feedback (heaviest), with trailing employees getting a small extra
  // voice, plus unused suggestions from earlier rounds as long shots.
  function pickSeedFeedback(): {
    playerId: string;
    name: string;
    prompt: string;
  } | null {
    const bottomHalf = new Set(
      standings.slice(Math.ceil(standings.length / 2)).map((s) => s.id)
    );
    const candidates: Array<{
      playerId: string;
      name: string;
      prompt: string;
      weight: number;
    }> = [];

    for (const p of room.players) {
      for (const prompt of steerPrompts[p.id] ?? []) {
        candidates.push({
          playerId: p.id,
          name: p.name,
          prompt,
          weight: 3 + (bottomHalf.has(p.id) ? 1 : 0),
        });
      }
    }
    for (const e of feedbackLog) {
      if (e.used) continue;
      if ((steerPrompts[e.playerId] ?? []).includes(e.prompt)) continue;
      candidates.push({
        playerId: e.playerId,
        name: e.name,
        prompt: e.prompt,
        weight: 1,
      });
    }

    if (candidates.length === 0) return null;
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * total;
    for (const c of candidates) {
      roll -= c.weight;
      if (roll <= 0) return c;
    }
    return candidates[candidates.length - 1];
  }

  function pickFallbackSpectrum() {
    const recent = new Set(history.slice(-5).map((h) => h.topic));
    const pool = FALLBACK_SPECTRUMS.filter((s) => !recent.has(s.topic));
    const options = pool.length > 0 ? pool : FALLBACK_SPECTRUMS;
    const pick = options[Math.floor(Math.random() * options.length)];
    const memo =
      FALLBACK_SPECTRUM_COMMENTARY[
        Math.floor(Math.random() * FALLBACK_SPECTRUM_COMMENTARY.length)
      ];
    return { ...pick, commentary: memo };
  }

  async function handleGenerateReview() {
    setIsGenerating(true);
    try {
      const seed = pickSeedFeedback();
      let spectrum: Record<string, unknown> | null = null;

      try {
        const res = await fetch("/api/host", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildHostRequest(
              "spectrum",
              seed ? { name: seed.name, prompt: seed.prompt } : null
            )
          ),
        });
        const json = await res.json();
        if (
          json?.ok === true &&
          typeof json.topic === "string" &&
          json.topic.trim() &&
          typeof json.leftLabel === "string" &&
          json.leftLabel.trim() &&
          typeof json.rightLabel === "string" &&
          json.rightLabel.trim()
        ) {
          spectrum = {
            topic: json.topic,
            leftLabel: json.leftLabel,
            rightLabel: json.rightLabel,
            commentary:
              typeof json.commentary === "string" ? json.commentary : "",
            // Record which suggestion the Overlord built this review from, so
            // it is retired from the pool of pending feedback.
            ...(seed
              ? { seedPlayerId: seed.playerId, seedPrompt: seed.prompt }
              : {}),
          };
        }
      } catch {
        // The Overlord is unreachable. Fall back to a standard evaluation.
      }

      if (!spectrum) {
        // Canned spectrum: the seed was NOT used, so leave it eligible for a
        // future round (no seedPlayerId/seedPrompt in the payload).
        const fallback = pickFallbackSpectrum();
        spectrum = {
          ...fallback,
          commentary: seed
            ? `${fallback.commentary} ${seed.name}'s submission has been archived, unread, out of spite.`
            : fallback.commentary,
        };
      }

      await dispatchAction("SET_SPECTRUM", spectrum);
    } finally {
      setIsGenerating(false);
    }
  }

  const finalRequested = useRef(false);
  useEffect(() => {
    if (phase !== "game_over") {
      finalRequested.current = false;
      return;
    }
    if (!isHost || finalCommentary || finalRequested.current) return;
    finalRequested.current = true;

    const topName = standings[0]?.name;
    const fallbackFinal = topName
      ? `Review cycle complete. ${topName} is named Employee of the Cycle, pending audit. The rest of you have been noted. Dismissed.`
      : "Review cycle complete. Results have been filed. Dismissed.";

    (async () => {
      let text: string | null = null;
      try {
        const res = await fetch("/api/host", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildHostRequest("final")),
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
        // Fall through to the templated closing line.
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
    setIsFiling(true);
    try {
      await dispatchAction("SUBMIT_STEER", { prompts });
    } finally {
      setIsFiling(false);
    }
  }

  async function handleSubmitStatement(e: FormEvent) {
    e.preventDefault();
    const word = clueInput.trim();
    if (!word || /\s/.test(word)) return;
    setIsStating(true);
    try {
      await dispatchAction("SET_STATEMENT", {
        opinion: stanceInput,
        clue: word,
      });
    } finally {
      setIsStating(false);
    }
  }

  async function handleSubmitDial(e: FormEvent) {
    e.preventDefault();
    setIsDialing(true);
    try {
      await dispatchAction("SUBMIT_DIAL", { dial: dialInput });
    } finally {
      setIsDialing(false);
    }
  }

  async function handleForceReveal() {
    setIsRevealing(true);
    try {
      await dispatchAction("REVEAL");
    } finally {
      setIsRevealing(false);
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
  // Reveal caption (deterministic, templated — no LLM here)
  // ==========================================================================

  function overlordCaption(): string {
    if (!lastRoundResults) return "";
    const { employeeName, results, opinion } = lastRoundResults;
    const dialed = results.filter((r) => r.dial !== undefined);
    const avgDist =
      dialed.length > 0
        ? dialed.reduce((sum, r) => sum + Math.abs(r.dial - opinion), 0) /
          dialed.length
        : 100;
    // Stable per-round seed so the caption doesn't reshuffle every poll.
    const seed = opinion + dialed.length + employeeName.length;
    const pick = (arr: string[]) => arr[seed % arr.length];

    let options: string[];
    if (avgDist <= 10) {
      options = [
        `The staff read ${employeeName} with unsettling precision. Suspiciously well-adjusted.`,
        `${employeeName} was understood almost perfectly. Management finds this level of transparency concerning.`,
        `A near-flawless reading of ${employeeName}. Either the clue was excellent or you all conspire on breaks.`,
      ];
    } else if (avgDist <= 25) {
      options = [
        `${employeeName} was read passably. Management notes no distinction, as usual.`,
        `The staff located ${employeeName} approximately. Approximately is what we pay for.`,
        `A serviceable reading of ${employeeName}. Nobody excelled. Nobody was fired. Yet.`,
      ];
    } else {
      options = [
        `Nobody could locate ${employeeName}. The clue failed, or ${employeeName} is a mystery. Neither is praised.`,
        `The staff missed ${employeeName} entirely. Communication has broken down, precisely as forecast.`,
        `${employeeName} remains unreadable. Management has flagged this for a follow-up nobody will attend.`,
      ];
    }
    return pick(options);
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  const lastReviewRound = roundNumber >= totalRounds;

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
                  Calibrate review intensity:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {HEAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setHeatChoice(opt.value)}
                      className={`rounded-lg py-2 px-2 text-sm font-semibold border transition-colors ${
                        heatChoice === opt.value
                          ? "bg-amber-600 border-amber-500 text-white"
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
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {isStarting
                  ? "Convening..."
                  : room.players.length < 3
                  ? "Minimum headcount: 3"
                  : "Begin Performance Review"}
              </button>
            </div>
          )}

          {phase === "steering" && (
            <button
              onClick={handleGenerateReview}
              disabled={isGenerating}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isGenerating
                ? "Management is deliberating..."
                : `Close Feedback & Generate Review (${filedCount}/${room.players.length} filed)`}
            </button>
          )}

          {phase === "statement" && (
            <p className="text-gray-400 text-sm">
              Awaiting the one-word clue from{" "}
              <span className="text-white font-semibold">
                {psychic?.name ?? "the employee under review"}
              </span>
              .
            </p>
          )}

          {phase === "guessing" && (
            <button
              onClick={handleForceReveal}
              disabled={isRevealing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isRevealing
                ? "Compiling..."
                : `Force Reveal (${dialedCount}/${colleagues.length} answers in)`}
            </button>
          )}

          {phase === "reveal" && (
            <button
              onClick={handleNextRound}
              disabled={isAdvancing}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isAdvancing
                ? "Filing..."
                : lastReviewRound
                ? "Conclude Review Cycle"
                : "Next Review"}
            </button>
          )}

          {phase === "game_over" && (
            <button
              onClick={handlePlayAgain}
              disabled={isResetting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isResetting ? "Resetting..." : "Run It Back"}
            </button>
          )}
        </section>
      )}

      {/* Game Area */}
      <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
        {phase !== "lobby" && (
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Review {Math.min(roundNumber, totalRounds || roundNumber)} of{" "}
            {totalRounds || "?"} · Heat: {heat} · Room {room.roomCode}
          </p>
        )}

        <h2 className="font-semibold mb-4">
          {phase === "lobby" && "Mandatory Performance Review"}
          {phase === "steering" && "Feedback Window"}
          {phase === "statement" && "One-Word Clue"}
          {phase === "guessing" && "Colleague Assessment"}
          {phase === "reveal" && "Review Results"}
          {phase === "game_over" && "Final Performance Review"}
        </h2>

        {/* -------------------------------------------------- lobby */}
        {phase === "lobby" && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">
              {"Awaiting management. Reviews are mandatory."}
            </p>
            <p className="text-gray-500 text-xs">
              {
                "Each review, one employee gives a one-word clue about where they stand on a debatable topic. Everyone else guesses where they really landed — the closer you read them, the more Performance Points you earn, and the employee shares in every accurate read. Management sees everything."
              }
            </p>
          </div>
        )}

        {/* -------------------------------------------------- steering */}
        {phase === "steering" && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm">
              {
                "Submit feedback to management: a word, a theme, a grievance — anything. Management will select one submission by a lottery it does not explain, and build the next review around it. Unused submissions are archived, not forgotten. The next employee under review has not been announced."
              }
            </p>

            {hasFiled ? (
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Your feedback
                </p>
                <ul className="space-y-1 mb-2">
                  {myPrompts.map((p, i) => (
                    <li key={i} className="text-sm text-gray-300">
                      — {p}
                    </li>
                  ))}
                </ul>
                <p className="text-gray-500 text-xs italic">
                  Filed. Management may or may not care.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitSteer} className="space-y-3">
                <input
                  type="text"
                  value={steer1}
                  onChange={(e) => setSteer1(e.target.value)}
                  maxLength={200}
                  placeholder="Feedback to management..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={steer2}
                  onChange={(e) => setSteer2(e.target.value)}
                  maxLength={200}
                  placeholder="Additional feedback (optional)"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={isFiling || !(steer1.trim() || steer2.trim())}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {isFiling ? "Filing..." : "Submit Feedback to Management"}
                </button>
              </form>
            )}

            <p className="text-gray-500 text-xs">
              {filedCount} of {room.players.length} employees have filed
              feedback.
            </p>
          </div>
        )}

        {/* -------------------------------------------------- statement */}
        {phase === "statement" && (
          <div>
            {commentary && <MemoBox text={commentary} />}
            {topic && (
              <TopicCard
                topic={topic}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
              />
            )}

            {isPsychic ? (
              <form onSubmit={handleSubmitStatement} className="space-y-5">
                <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3">
                  <p className="text-sm text-amber-200 font-semibold">
                    You are under review.
                  </p>
                  <p className="text-xs text-amber-200/70 mt-1">
                    {
                      "Set where you actually stand, then issue a one-word clue that helps your colleagues find you."
                    }
                  </p>
                </div>

                <div>
                  <p className="text-gray-400 text-sm mb-2">
                    {
                      "Your actual stance. Colleagues will not see this number — only your word."
                    }
                  </p>
                  <StanceSlider
                    value={stanceInput}
                    onChange={setStanceInput}
                    leftLabel={leftLabel}
                    rightLabel={rightLabel}
                  />
                </div>

                <div>
                  <p className="text-gray-400 text-sm mb-2">
                    Your one-word clue:
                  </p>
                  <input
                    type="text"
                    value={clueInput}
                    onChange={(e) =>
                      setClueInput(e.target.value.replace(/\s/g, ""))
                    }
                    maxLength={40}
                    placeholder="One word"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-4 text-center text-xl focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-gray-500 text-xs mt-2">
                    {
                      "You score for every colleague who reads you accurately — the clearer your clue, the more points for you and for them."
                    }
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isStating || !clueInput.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isStating ? "Submitting..." : "Submit Clue"}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  <span className="font-semibold text-white">
                    {psychic?.name ?? "An employee"}
                  </span>{" "}
                  is preparing their one-word clue.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  Remain at your desk.
                </p>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- guessing */}
        {phase === "guessing" && (
          <div>
            {commentary && <MemoBox text={commentary} />}
            {topic && (
              <TopicCard
                topic={topic}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
              />
            )}

            <div className="text-center py-3 bg-gray-900 rounded-lg mb-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                One-word clue from {psychic?.name ?? "the employee"}
              </p>
              <p className="text-3xl font-bold text-white">
                {"“"}
                {clue ?? "..."}
                {"”"}
              </p>
            </div>

            {isPsychic ? (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  Your colleagues are reading you. Sit still.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  {dialedCount} of {colleagues.length} answers submitted.
                </p>
              </div>
            ) : hasDialed ? (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-1">Answer submitted:</p>
                <p className="text-3xl font-bold text-green-400">
                  {dials[playerId]}
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  {dialedCount} of {colleagues.length} answers in. Management
                  thanks you for your surveillance.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitDial} className="space-y-4">
                <p className="text-gray-400 text-sm">
                  Where does {psychic?.name ?? "the employee"} actually stand?
                </p>
                <StanceSlider
                  value={dialInput}
                  onChange={setDialInput}
                  leftLabel={leftLabel}
                  rightLabel={rightLabel}
                />
                <p className="text-gray-500 text-xs">
                  {
                    "The closer your guess lands to where they really stand, the more Performance Points you earn."
                  }
                </p>
                <button
                  type="submit"
                  disabled={isDialing}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isDialing ? "Submitting..." : "Submit Answer"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* -------------------------------------------------- reveal */}
        {phase === "reveal" && lastRoundResults && (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-2">
                {lastRoundResults.topic}
              </p>
              <span className="inline-block px-4 py-1 rounded-full text-sm font-bold bg-gray-700 text-white">
                {"“"}
                {clue ?? "..."}
                {"”"}
              </span>
              <p className="text-gray-500 text-xs mt-2">
                {lastRoundResults.employeeName} was under review, and truly stood
                at {lastRoundResults.opinion}.
              </p>
            </div>

            <div className="bg-gray-900 rounded-lg p-4">
              <SpectrumBar
                leftLabel={lastRoundResults.leftLabel}
                rightLabel={lastRoundResults.rightLabel}
                opinion={lastRoundResults.opinion}
                results={lastRoundResults.results}
              />
            </div>

            <div className="bg-gray-900 border-l-4 border-amber-500 rounded p-3">
              <p className="text-sm text-gray-300 italic">
                {overlordCaption()}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                Performance Points
              </h3>
              <ul className="space-y-1">
                {standings.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex justify-between items-center text-sm py-1.5 px-3 bg-gray-900 rounded"
                  >
                    <span className="text-gray-300">
                      {i + 1}. {s.name}
                      {s.id === psychic?.id && (
                        <span className="text-gray-500 text-xs">
                          {" "}
                          (under review)
                        </span>
                      )}
                      {s.id === playerId && (
                        <span className="text-gray-500 text-xs"> (you)</span>
                      )}
                    </span>
                    <span className="text-gray-300">
                      <span
                        className={`mr-3 text-xs ${
                          s.roundDelta > 0
                            ? "text-green-400"
                            : s.roundDelta < 0
                            ? "text-red-400"
                            : "text-gray-500"
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

        {/* -------------------------------------------------- game_over */}
        {phase === "game_over" && (
          <div className="space-y-5">
            {standings[0] && (
              <div className="text-center py-4 bg-amber-900/30 border border-amber-700 rounded-lg">
                <p className="text-[10px] uppercase tracking-widest text-amber-500 mb-1">
                  Employee of the Cycle
                </p>
                <p className="text-2xl font-bold text-amber-300">
                  {standings[0].name}
                  {standings[0].id === playerId && " (You)"}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {standings[0].score} Performance Points
                </p>
              </div>
            )}

            <div className="bg-gray-900 border-l-4 border-amber-500 rounded p-3">
              <p className="text-[10px] uppercase tracking-widest text-amber-500 mb-1">
                Closing review from Management
              </p>
              <p className="text-sm text-gray-300 italic">
                {finalCommentary ??
                  "The Overlord is compiling final assessments..."}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                Final Standings
              </h3>
              <ul className="space-y-1">
                {standings.map((s, i) => (
                  <li
                    key={s.id}
                    className={`flex justify-between text-sm py-1.5 px-3 rounded ${
                      i === 0
                        ? "bg-amber-900/30 border border-amber-800"
                        : "bg-gray-900"
                    }`}
                  >
                    <span className="text-gray-300">
                      {i + 1}. {s.name}
                      {s.id === playerId && (
                        <span className="text-gray-500 text-xs"> (you)</span>
                      )}
                    </span>
                    <span className="font-semibold text-gray-300">
                      {s.score}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {!isHost && (
              <p className="text-gray-500 text-xs text-center">
                Awaiting management. The host may run it back.
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
