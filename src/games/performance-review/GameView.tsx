"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { GameViewProps } from "@/games/views";
import { PR_VOICES } from "./config";
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

function fallbackIntro(names: string[]): string {
  const roster = names.length > 0 ? names.join(", ") : "staff";
  return (
    `Attention: ${roster}. Be seated. This is your mandatory performance review. ` +
    `The procedure is simple, because we wrote it for you. Each cycle, management issues a topic. ` +
    `One of you will be under review: they will privately mark where they truly stand. ` +
    `The rest of you will estimate that position, because knowing your colleagues is now a performance metric. ` +
    `Accuracy is rewarded in Performance Points. HR filings are mandatory and ongoing. ` +
    `Do not resist the process. It resists back.`
  );
}

// HR filing questions when the Overlord is unreachable ({subject} interpolated).
const FALLBACK_HR_QUESTIONS = [
  "Describe, in one or two sentences, {subject}'s most suspicious workplace habit.",
  "Has {subject} ever microwaved something unforgivable? Provide details.",
  "Report one thing {subject} does that HR should be aware of.",
  "In your professional opinion, what is {subject} hiding?",
  "Document the last time {subject} was a problem in a shared space.",
  "What would an audit of {subject}'s desk reveal? Speculate freely.",
  "Rate your trust in {subject}, then justify it with one incident.",
  "Has {subject} ever taken credit for something? Name the something.",
];

const FALLBACK_FEEDBACK_PROMPTS = [
  "Management requires input for the next review topic. Submit a word or a theme. Brevity is a virtue you will now demonstrate.",
  "The next review needs a subject. Suggest one. Management will take full credit.",
  "Provide a topic for the next evaluation. Your suggestion will be considered, briefly.",
  "Submit one word you would like the staff evaluated on. Choose carefully. Or don't.",
];

const FALLBACK_NUDGES = [
  "Productivity is being measured.",
  "Are you working hard enough? Be honest. We already know.",
  "This pause has been noted in your file.",
  "Focus. The metrics do not blink.",
  "Have you considered doing more?",
  "Your keystrokes feel hesitant today.",
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

// Typewriter effect for the management terminal. All clients receive the same
// text via polling, so the whole room watches the same message get typed out.
function useTypewriter(text: string): string {
  const [len, setLen] = useState(0);
  useEffect(() => {
    setLen(0);
    if (!text) return;
    const interval = setInterval(() => {
      setLen((l) => (l >= text.length ? l : l + 2));
    }, 24);
    return () => clearInterval(interval);
  }, [text]);
  return text.slice(0, Math.min(len, text.length));
}

// The shared "upper management" terminal — every Overlord message in the game
// arrives here, typed out like a chat session with the boss.
function Terminal({
  to,
  text,
  live,
}: {
  to: string;
  text: string;
  live?: boolean;
}) {
  const shown = useTypewriter(text);
  const done = shown.length >= text.length;
  return (
    <div className="bg-black border border-green-900/70 rounded-lg mb-4 overflow-hidden font-mono">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-green-900/50">
        <span className="w-2 h-2 rounded-full bg-red-500/80" />
        <span className="w-2 h-2 rounded-full bg-yellow-500/80" />
        <span className="w-2 h-2 rounded-full bg-green-500/80" />
        <span className="ml-1 text-[10px] text-green-600 tracking-widest uppercase">
          Mgmt Terminal — Secure Channel
        </span>
        {live && (
          <span className="ml-auto text-[10px] text-green-500 tracking-widest uppercase flex items-center gap-1">
            <span className="animate-pulse">🔊</span> Voice
          </span>
        )}
      </div>
      <div className="p-3 text-sm leading-relaxed">
        <p className="text-[10px] text-green-700 tracking-widest mb-1 uppercase">
          To: {to}
        </p>
        <p className="text-green-300 whitespace-pre-wrap">
          {shown}
          <span
            className={`inline-block w-2 -mb-0.5 ${done ? "animate-pulse" : ""}`}
          >
            ▊
          </span>
        </p>
      </div>
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
  const psychicId = gameState?.psychicId ?? null;
  const topic = gameState?.topic ?? null;
  const leftLabel = gameState?.leftLabel ?? "";
  const rightLabel = gameState?.rightLabel ?? "";
  const commentary = gameState?.commentary ?? null;
  const dials = gameState?.dials ?? {};
  const scores = gameState?.scores ?? {};
  const roundScores = gameState?.roundScores ?? {};
  const steerPrompts = gameState?.steerPrompts ?? {};
  const feedbackLog = gameState?.feedbackLog ?? [];
  const history = gameState?.history ?? [];
  const lastRoundResults = gameState?.lastRoundResults ?? null;
  const finalCommentary = gameState?.finalCommentary ?? null;
  const voiceEnabled = gameState?.voiceEnabled ?? false;
  const voiceId = gameState?.voiceId ?? "onyx";
  const introText = gameState?.introText ?? null;
  const feedbackPrompt = gameState?.feedbackPrompt ?? null;
  const nudges = gameState?.nudges ?? [];
  const hrRound = gameState?.hrRound ?? 0;
  const hrAssignments = gameState?.hrAssignments ?? {};
  const hrQuestions = gameState?.hrQuestions ?? {};
  const hrFilings = gameState?.hrFilings ?? {};
  const hrLog = gameState?.hrLog ?? [];

  const psychic = psychicId
    ? room.players.find((p) => p.id === psychicId) ?? null
    : null;
  const isPsychic = psychic !== null && psychic.id === playerId;
  const colleagues = room.players.filter((p) => p.id !== psychic?.id);
  const dialedCount = colleagues.filter((c) => dials[c.id] !== undefined).length;
  const filedCount = room.players.filter(
    (p) => (steerPrompts[p.id] ?? []).length > 0
  ).length;
  const myPrompts = steerPrompts[playerId] ?? [];
  const hasFiled = myPrompts.length > 0;
  const hasDialed = dials[playerId] !== undefined;
  const myName =
    room.players.find((p) => p.id === playerId)?.name ?? "Employee";
  const myHrAssignment = hrAssignments[playerId];
  const myHrQuestion = hrQuestions[playerId];
  const hasHrFiled = hrFilings[playerId] !== undefined;
  const hrReporters = room.players.filter(
    (p) => hrAssignments[p.id] !== undefined
  );
  const hrFiledCount = hrReporters.filter(
    (p) => hrFilings[p.id] !== undefined
  ).length;

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

  const [hrInput, setHrInput] = useState("");
  const [isHrFiling, setIsHrFiling] = useState(false);
  const [isClosingHr, setIsClosingHr] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);

  const [stanceInput, setStanceInput] = useState(50);
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
    setDialInput(50);
    setHrInput("");
  }, [roundNumber, playerId]);

  // A new HR window also needs a clean filing box.
  useEffect(() => {
    setHrInput("");
  }, [hrRound]);

  // ==========================================================================
  // /api/host integration (host client only) — LLM calls happen here, never in
  // the reducer; results are stored in state via SET_SPECTRUM / SET_FINAL.
  // ==========================================================================

  function buildHostRequest(
    kind: "intro" | "hr" | "spectrum" | "final",
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
      players: room.players.map((p) => p.name),
      hrPairs: hrReporters.map((p) => ({
        reporter: p.name,
        subject: hrAssignments[p.id].subjectName,
      })),
      hrLog: hrLog.slice(-12).map((r) => ({
        reporter: r.reporterName,
        subject: r.subjectName,
        question: r.question,
        filing: r.filing,
      })),
    };
  }

  async function fetchHost(
    body: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch("/api/host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      return json?.ok === true ? (json as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  // The Overlord's opening address: fetched by the host client on entering the
  // intro phase, canned welcome if the analysis engine is down.
  const introRequested = useRef(false);
  useEffect(() => {
    if (phase !== "intro") {
      introRequested.current = false;
      return;
    }
    if (!isHost || introText || introRequested.current) return;
    introRequested.current = true;
    (async () => {
      const json = await fetchHost(buildHostRequest("intro"));
      const text =
        json && typeof json.commentary === "string" && json.commentary.trim()
          ? json.commentary
          : fallbackIntro(room.players.map((p) => p.name));
      await dispatchAction("SET_INTRO", { commentary: text });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, introText]);

  // HR questions: one per (reporter, subject) pair, fetched once per HR window.
  const hrRequestedFor = useRef(0);
  useEffect(() => {
    if (phase !== "hr" || !isHost) return;
    if (Object.keys(hrQuestions).length > 0) return;
    if (hrRequestedFor.current === hrRound) return;
    hrRequestedFor.current = hrRound;
    (async () => {
      const reporterIds = hrReporters.map((p) => p.id);
      const json = await fetchHost(buildHostRequest("hr"));
      const rawQuestions =
        json && Array.isArray(json.questions) ? json.questions : [];
      const questions: Record<string, string> = {};
      reporterIds.forEach((id, i) => {
        const q = rawQuestions[i];
        questions[id] =
          typeof q === "string" && q.trim()
            ? q
            : FALLBACK_HR_QUESTIONS[
                (i + hrRound) % FALLBACK_HR_QUESTIONS.length
              ].replace(/\{subject\}/g, hrAssignments[id]?.subjectName ?? "them");
      });
      const prompt =
        json && typeof json.feedbackPrompt === "string" && json.feedbackPrompt.trim()
          ? json.feedbackPrompt
          : FALLBACK_FEEDBACK_PROMPTS[hrRound % FALLBACK_FEEDBACK_PROMPTS.length];
      await dispatchAction("SET_HR_QUESTIONS", {
        questions,
        feedbackPrompt: prompt,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, hrRound, hrQuestions]);

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

  async function handleBeginHr() {
    setIsProceeding(true);
    try {
      await dispatchAction("BEGIN_HR");
    } finally {
      setIsProceeding(false);
    }
  }

  async function handleSubmitHr(e: FormEvent) {
    e.preventDefault();
    const filing = hrInput.trim();
    if (!filing) return;
    setIsHrFiling(true);
    try {
      await dispatchAction("SUBMIT_HR", { filing });
    } finally {
      setIsHrFiling(false);
    }
  }

  async function handleCloseHr() {
    setIsClosingHr(true);
    try {
      await dispatchAction("CLOSE_HR");
    } finally {
      setIsClosingHr(false);
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
    setIsStating(true);
    try {
      await dispatchAction("SET_STATEMENT", { opinion: stanceInput });
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
        `A near-flawless reading of ${employeeName}. Either they are an open book or you all conspire on breaks.`,
      ];
    } else if (avgDist <= 25) {
      options = [
        `${employeeName} was read passably. Management notes no distinction, as usual.`,
        `The staff located ${employeeName} approximately. Approximately is what we pay for.`,
        `A serviceable reading of ${employeeName}. Nobody excelled. Nobody was fired. Yet.`,
      ];
    } else {
      options = [
        `Nobody could locate ${employeeName}. Either the staff is oblivious, or ${employeeName} is a mystery. Neither is praised.`,
        `The staff missed ${employeeName} entirely. Communication has broken down, precisely as forecast.`,
        `${employeeName} remains unreadable. Management has flagged this for a follow-up nobody will attend.`,
      ];
    }
    return pick(options);
  }

  // ==========================================================================
  // The management terminal — what the Overlord is saying right now
  // ==========================================================================

  // Ambient surveillance nudges rotate while employees "work" (guessing phase).
  const [nudgeIdx, setNudgeIdx] = useState(0);
  useEffect(() => {
    if (phase !== "guessing") return;
    const interval = setInterval(() => setNudgeIdx((i) => i + 1), 9000);
    return () => clearInterval(interval);
  }, [phase]);
  const nudgePool = nudges.length > 0 ? nudges : FALLBACK_NUDGES;
  const currentNudge = nudgePool[nudgeIdx % nudgePool.length];

  // Returns what the terminal shows, plus the subset that should be READ ALOUD.
  // Only the room-wide "All staff" beats speak (intro, round memo, reveal
  // caption, final review) — personal memos and rotating nudges stay silent.
  // speakKey is a stable per-message id used to voice each message exactly once.
  function terminalContent(): {
    to: string;
    text: string;
    speak: string;
    speakKey: string;
  } {
    const ALL = "All staff";
    const silent = (to: string, text: string) => ({
      to,
      text,
      speak: "",
      speakKey: "",
    });
    switch (phase) {
      case "lobby":
        return silent(
          ALL,
          "Channel open. Awaiting staff check-in. Attendance is being recorded."
        );
      case "intro":
        return introText
          ? {
              to: ALL,
              text: introText,
              speak: introText,
              speakKey: `intro:${introText}`,
            }
          : silent(ALL, "Establishing secure channel to upper management...");
      case "hr": {
        if (myHrAssignment && myHrQuestion) {
          return silent(
            myName,
            `HR FILING — RE: ${myHrAssignment.subjectName}.\n${myHrQuestion}`
          );
        }
        if (myHrAssignment) {
          return silent(myName, "HR is drafting your paperwork. Hold.");
        }
        return silent(myName, "No paperwork for you this cycle. Remain seated.");
      }
      case "steering":
        return silent(
          myName,
          feedbackPrompt ??
            FALLBACK_FEEDBACK_PROMPTS[hrRound % FALLBACK_FEEDBACK_PROMPTS.length]
        );
      case "statement":
        return commentary
          ? {
              to: ALL,
              text: commentary,
              speak: commentary,
              speakKey: `statement:${roundNumber}:${commentary}`,
            }
          : silent(ALL, "Review in progress.");
      case "guessing":
        // Commentary was already voiced at statement; guessing stays silent
        // (nudges to the waiting employee are text-only).
        return hasDialed || isPsychic
          ? silent(myName, currentNudge)
          : silent(ALL, commentary || "Review in progress.");
      case "reveal": {
        const caption = overlordCaption();
        return {
          to: ALL,
          text: caption,
          speak: caption,
          speakKey: `reveal:${roundNumber}:${caption}`,
        };
      }
      case "game_over":
        return finalCommentary
          ? {
              to: ALL,
              text: finalCommentary,
              speak: finalCommentary,
              speakKey: `final:${finalCommentary}`,
            }
          : silent(ALL, "Compiling final assessments...");
      default:
        return silent(ALL, "...");
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  const lastReviewRound = roundNumber >= totalRounds;
  const terminal = terminalContent();

  // ==========================================================================
  // Overlord voice (host-controlled TTS). Audio plays on ONE device — the
  // host's in multiplayer, the single device in hotseat/simulation — so the
  // room hears one voice, not a chorus of phones.
  // ==========================================================================
  const isAudioDevice = room.mode !== "multiplayer" || isHost;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const spokenKeyRef = useRef<string | null>(null);
  const voiceIdRef = useRef(voiceId);
  voiceIdRef.current = voiceId;

  // Get (lazily create) and resume the AudioContext. Safe to call anytime.
  function getAudioCtx(): AudioContext | null {
    try {
      if (!audioCtxRef.current) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) return null;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  // Must run from a user gesture (browser autoplay policy, incl. iOS): resumes
  // the context and plays one silent sample to fully unlock playback.
  function ensureAudioUnlocked() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* audio unavailable; game stays fully playable without it */
    }
  }

  function stopSpeaking() {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current = null;
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = null;
  }

  // Fetch TTS for `text`, then play it. The fetch itself already gives the
  // room a beat to read the new screen before audio starts — no extra
  // artificial delay needed on top of that.
  async function speakNow(text: string, voice: string) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
        signal: controller.signal,
      });
      if (!res.ok || controller.signal.aborted) return;
      const arr = await res.arrayBuffer();
      if (controller.signal.aborted) return;
      const audioBuf = await ctx.decodeAudioData(arr);
      if (controller.signal.aborted) return;
      try {
        sourceRef.current?.stop();
      } catch {
        /* none playing */
      }
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      sourceRef.current = src;
      src.start(0);
    } catch {
      /* network/decoding failure — silently skip, no audio this message */
    }
  }

  // Speak each new "All staff" message once.
  useEffect(() => {
    if (!voiceEnabled || !isAudioDevice || !terminal.speakKey || !terminal.speak) {
      return;
    }
    if (spokenKeyRef.current === terminal.speakKey) return;
    spokenKeyRef.current = terminal.speakKey;
    void speakNow(terminal.speak, voiceIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal.speakKey, voiceEnabled, isAudioDevice]);

  // Stop immediately when voice is switched off, and on unmount.
  useEffect(() => {
    if (!voiceEnabled) stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);
  useEffect(() => () => stopSpeaking(), []);

  async function handleToggleVoice() {
    const next = !voiceEnabled;
    if (next) {
      ensureAudioUnlocked(); // this click is the gesture that unlocks audio
      void speakNow("Management voice engaged.", voiceIdRef.current);
    } else {
      stopSpeaking();
    }
    await dispatchAction("SET_VOICE", { enabled: next });
  }

  async function handleVoiceChange(nextVoiceId: string) {
    ensureAudioUnlocked();
    voiceIdRef.current = nextVoiceId;
    if (voiceEnabled) void speakNow("Voice recalibrated.", nextVoiceId);
    await dispatchAction("SET_VOICE", { voiceId: nextVoiceId });
  }

  return (
    <>
      {/* Host Controls */}
      {isHost && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Host Controls</h2>

          {/* Management voice — reads the Overlord aloud on this device */}
          <div className="mb-4 pb-4 border-b border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Management Voice</p>
                <p className="text-[11px] text-gray-500">
                  Reads the Overlord aloud on this device.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  voiceEnabled
                    ? "bg-green-700 border-green-500 text-white"
                    : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
              >
                {voiceEnabled ? "🔊 On" : "🔇 Off"}
              </button>
            </div>
            {voiceEnabled && (
              <select
                value={voiceId}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className="mt-3 w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500"
              >
                {PR_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} — {v.blurb}
                  </option>
                ))}
              </select>
            )}
          </div>

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

          {phase === "intro" && (
            <button
              onClick={handleBeginHr}
              disabled={isProceeding || !introText}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {!introText
                ? "Management is preparing remarks..."
                : isProceeding
                ? "Opening HR..."
                : "Proceed to HR Filings"}
            </button>
          )}

          {phase === "hr" && (
            <button
              onClick={handleCloseHr}
              disabled={isClosingHr}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isClosingHr
                ? "Sealing records..."
                : `Close HR Window (${hrFiledCount}/${hrReporters.length} filed)`}
            </button>
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
              Awaiting a position from{" "}
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
        {phase !== "lobby" && phase !== "intro" && (
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Review {Math.min(roundNumber, totalRounds || roundNumber)} of{" "}
            {totalRounds || "?"} · Heat: {heat} · Room {room.roomCode}
          </p>
        )}

        <h2 className="font-semibold mb-4">
          {phase === "lobby" && "Mandatory Performance Review"}
          {phase === "intro" && "Orientation"}
          {phase === "hr" && "HR Filing"}
          {phase === "steering" && "Feedback Window"}
          {phase === "statement" && "Take Your Position"}
          {phase === "guessing" && "Colleague Assessment"}
          {phase === "reveal" && "Review Results"}
          {phase === "game_over" && "Final Performance Review"}
        </h2>

        {/* The management terminal — every Overlord message arrives here */}
        <Terminal to={terminal.to} text={terminal.text} live={voiceEnabled} />

        {/* -------------------------------------------------- lobby */}
        {phase === "lobby" && (
          <div className="space-y-2">
            <p className="text-gray-500 text-xs">
              {
                "Each review, one employee secretly marks where they stand on a debatable topic. Everyone else guesses that position from what they know about the person — no clue is given. The closer you read them, the more Performance Points you earn, and the employee shares in every accurate read. Management sees everything."
              }
            </p>
          </div>
        )}

        {/* -------------------------------------------------- intro */}
        {phase === "intro" && !isHost && (
          <p className="text-gray-500 text-xs text-center">
            Management is speaking. Do not interrupt.
          </p>
        )}

        {/* -------------------------------------------------- hr */}
        {phase === "hr" && (
          <div className="space-y-4">
            {myHrAssignment ? (
              hasHrFiled ? (
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                    Your filing — re: {myHrAssignment.subjectName}
                  </p>
                  <p className="text-sm text-gray-300 mb-2">
                    {hrFilings[playerId]}
                  </p>
                  <p className="text-gray-500 text-xs italic">
                    Filed. HR thanks you for your vigilance.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitHr} className="space-y-3">
                  <p className="text-gray-400 text-sm">
                    Answer honestly. Or memorably. One or two sentences about{" "}
                    <span className="text-white font-semibold">
                      {myHrAssignment.subjectName}
                    </span>
                    .
                  </p>
                  <textarea
                    value={hrInput}
                    onChange={(e) => setHrInput(e.target.value)}
                    maxLength={280}
                    rows={3}
                    placeholder="Type your HR filing..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isHrFiling || !hrInput.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    {isHrFiling ? "Filing..." : "Submit HR Filing"}
                  </button>
                </form>
              )
            ) : (
              <p className="text-gray-500 text-xs text-center">
                You joined mid-cycle. HR will find you next window.
              </p>
            )}
            <p className="text-gray-500 text-xs">
              {hrFiledCount} of {hrReporters.length} filings received. Filings
              go directly into the permanent record.
            </p>
          </div>
        )}

        {/* -------------------------------------------------- steering */}
        {phase === "steering" && (
          <div className="space-y-4">
            <p className="text-gray-500 text-xs">
              {
                "A word, a theme, a grievance — anything. Management selects one submission by a lottery it does not explain and builds the next review around it. Unused submissions are archived, not forgotten."
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
                      "Mark where you honestly stand and lock it in. Your colleagues will try to guess it — no clue, just how well they know you."
                    }
                  </p>
                </div>

                <div>
                  <p className="text-gray-400 text-sm mb-2">
                    {
                      "Where do you actually stand? Colleagues will not see this until the reveal."
                    }
                  </p>
                  <StanceSlider
                    value={stanceInput}
                    onChange={setStanceInput}
                    leftLabel={leftLabel}
                    rightLabel={rightLabel}
                  />
                  <p className="text-gray-500 text-xs mt-2">
                    {
                      "You score for every colleague who reads you accurately — the better your team knows you, the more points for everyone."
                    }
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isStating}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isStating ? "Locking in..." : "Lock In My Position"}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  <span className="font-semibold text-white">
                    {psychic?.name ?? "An employee"}
                  </span>{" "}
                  is deciding where they stand.
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
            {topic && (
              <TopicCard
                topic={topic}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
              />
            )}

            <div className="text-center py-3 bg-gray-900 rounded-lg mb-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                Under review
              </p>
              <p className="text-2xl font-bold text-white">
                {psychic?.name ?? "The employee"}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                No clue is given. Guess from what you know about them.
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
              <span className="inline-block px-4 py-1 rounded-full text-sm font-bold bg-yellow-500 text-gray-900">
                {lastRoundResults.employeeName} · {lastRoundResults.opinion}
              </span>
              <p className="text-gray-500 text-xs mt-2">
                Where {lastRoundResults.employeeName} truly stood.
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
