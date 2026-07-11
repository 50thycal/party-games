"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { GameViewProps } from "@/games/views";
import { ATMENTION_BONUS, PR_VOICES } from "./config";
import type {
  PRChallenge,
  PRHeat,
  PRLastRound,
  PRSpectrumResult,
  PRState,
  PRThreadResult,
} from "./config";

// ============================================================================
// Canned content — the game must stay fully playable with zero LLM availability
// ============================================================================

function fallbackIntro(names: string[]): string {
  const roster = names.length > 0 ? names.join(", ") : "staff";
  return (
    `Attention: ${roster}. Be seated. This is a mandatory HR investigation, ` +
    `which you insist on calling a game. The procedure: each round, every one of you files a ` +
    `report on an assigned colleague — what they did that HR should worry about. One accused ` +
    `employee is then interviewed and permitted to explain themselves, briefly. Management ` +
    `issues a ruling and a new Company Guideline born from the incident. You then either guess ` +
    `how the accused feels about the new policy, or roast it in the company thread and tag whoever ` +
    `caused it. Accuracy and wit are rewarded in Performance Points. Do not resist the process. ` +
    `It resists back.`
  );
}

// Accusation prompts when the Overlord is unreachable ({subject} interpolated).
const FALLBACK_ACCUSATION_QUESTIONS = [
  "What did {subject} do that HR should be worried about?",
  "Describe the last time {subject} was a problem in a shared space.",
  "Has {subject} ever microwaved something unforgivable? Provide details.",
  "Report one suspicious workplace habit of {subject}.",
  "In your professional opinion, what is {subject} hiding?",
  "What would an audit of {subject}'s desk reveal? Speculate freely.",
  "Has {subject} ever taken credit for something? Name the something.",
  "Document one thing {subject} does that makes meetings worse.",
];

const FALLBACK_HR_RESPONSES = [
  "{name}, your explanation has been reviewed and found wanting. HR is not satisfied, HR is never satisfied, and a note has been added to a file you will never see.",
  "Thank you, {name}. Your defense was creative. Management has decided creativity is itself a red flag and is opening a second investigation.",
  "{name}, we hear you, and we have chosen not to believe you. The incident stands. So does the paperwork.",
  "Noted, {name}. Your version of events has been filed beside the version we prefer. Ours has better lighting.",
  "{name}, after careful deliberation lasting nearly four seconds, HR finds the explanation technically true and spiritually guilty.",
];

const FALLBACK_GUIDELINES = [
  "Effective immediately, employees may not describe a group lunch as 'technically a hostage situation' unless at least two managers are present.",
  "Per new policy, the office microwave may only be operated by employees who have completed the mandatory Scent Accountability training.",
  "Henceforth, 'reply all' is classified as a controlled substance and requires written pre-approval from a supervisor and a witness.",
  "Effective this cycle, any desk plant that dies is now a shared team failure and will be discussed at length in every future meeting.",
  "New guideline: employees claiming to be 'almost done' must provide a notarized estimate and a photograph of the progress.",
  "Going forward, use of the phrase 'per my last email' is permitted only during declared corporate emergencies.",
  "Effective immediately, no employee may schedule a meeting that could have been an email, an email that could have been a message, or a message that could have been silence.",
];

const FALLBACK_SPECTRUMS: Array<{
  question: string;
  leftLabel: string;
  rightLabel: string;
}> = [
  {
    question: "How severe is this workplace violation?",
    leftLabel: "A brave breakfast choice",
    rightLabel: "Federal building evacuation",
  },
  {
    question: "How much should HR care about this?",
    leftLabel: "Genuinely nobody's business",
    rightLabel: "Grounds for a task force",
  },
  {
    question: "Where does this land on the conduct scale?",
    leftLabel: "Beloved office quirk",
    rightLabel: "Permanent record, red ink",
  },
  {
    question: "How dangerous is this precedent?",
    leftLabel: "Charming misunderstanding",
    rightLabel: "The reason we have lawyers",
  },
  {
    question: "How does the accused likely feel about this policy?",
    leftLabel: "Vindicated and smug",
    rightLabel: "Filing a complaint about the complaint",
  },
];

const FALLBACK_NUDGES = [
  "Productivity is being measured.",
  "Are you working hard enough? Be honest. We already know.",
  "This pause has been noted in your file.",
  "Focus. The metrics do not blink.",
  "Have you considered doing more?",
  "Your keystrokes feel hesitant today.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const HEAT_OPTIONS: Array<{ value: PRHeat; label: string; desc: string }> = [
  { value: "mild", label: "Mild", desc: "Office-safe. Gentle dry wit." },
  { value: "spicy", label: "Spicy", desc: "Pointed. A little savage." },
  { value: "scorched", label: "Scorched", desc: "Maximally savage. Still compliant." },
];

const CHALLENGE_LABEL: Record<PRChallenge, string> = {
  spectrum: "Spectrum Review",
  thread: "Guideline Thread",
};

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

// The shared "upper management" terminal — every Overlord message arrives here.
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
          HR Terminal — Secure Channel
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

// A distinct banner telling THIS player what to do and what stays secret.
function ActionBanner({
  children,
  tone = "amber",
}: {
  children: React.ReactNode;
  tone?: "amber" | "blue" | "gray";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-900/30 border-amber-700 text-amber-200"
      : tone === "blue"
      ? "bg-blue-900/30 border-blue-700 text-blue-200"
      : "bg-gray-900 border-gray-700 text-gray-300";
  return (
    <div className={`rounded-lg border p-3 mb-4 text-sm ${toneClass}`}>
      {children}
    </div>
  );
}

// The posted Company Guideline — styled like a pinned corporate memo.
function GuidelineCard({ guideline }: { guideline: string }) {
  return (
    <div className="bg-gradient-to-br from-indigo-950 to-gray-900 border border-indigo-700 rounded-lg p-4 mb-4">
      <p className="text-[10px] uppercase tracking-widest text-indigo-400 mb-1">
        📌 New Company Guideline
      </p>
      <p className="text-base font-semibold text-indigo-100">{guideline}</p>
    </div>
  );
}

function SpectrumHeader({
  question,
  leftLabel,
  rightLabel,
}: {
  question: string;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 mb-4 text-center">
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        Spectrum
      </p>
      <p className="text-base font-semibold mb-2">{question}</p>
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
  stance,
  results,
}: {
  leftLabel: string;
  rightLabel: string;
  stance: number;
  results: PRSpectrumResult[];
}) {
  return (
    <div className="select-none">
      <div className="relative h-12">
        {results.map((r, i) => (
          <div
            key={`label-${r.name}-${i}`}
            className={`absolute -translate-x-1/2 text-[10px] leading-tight whitespace-nowrap ${
              i % 2 === 0 ? "top-6" : "top-0"
            } ${r.points >= 5 ? "text-green-300" : "text-blue-300"}`}
            style={{ left: `${Math.min(95, Math.max(5, clampPct(r.guess)))}%` }}
          >
            {r.name} · {r.guess}
          </div>
        ))}
      </div>

      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gray-700" />
        {results.map((r, i) => (
          <div
            key={`tick-${r.name}-${i}`}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-5 rounded ${
              r.points >= 5 ? "bg-green-400" : "bg-blue-400"
            }`}
            style={{ left: `${clampPct(r.guess)}%` }}
          />
        ))}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-8 rounded bg-yellow-400"
          style={{ left: `${clampPct(stance)}%` }}
        />
      </div>

      <div className="relative h-5">
        <div
          className="absolute -translate-x-1/2 text-[10px] font-bold text-yellow-400 whitespace-nowrap"
          style={{ left: `${Math.min(95, Math.max(5, clampPct(stance)))}%` }}
        >
          ▲ ACCUSED · {stance}
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
  const challenge = gameState?.challenge ?? "spectrum";

  const accusationRound = gameState?.accusationRound ?? 0;
  const assignments = gameState?.assignments ?? {};
  const accusationQuestions = gameState?.accusationQuestions ?? {};
  const accusations = gameState?.accusations ?? {};

  const accusedId = gameState?.accusedId ?? null;
  const reporterId = gameState?.reporterId ?? null;
  const accusation = gameState?.accusation ?? null;
  const accusationQuestion = gameState?.accusationQuestion ?? null;
  const explanation = gameState?.explanation ?? null;
  const hrResponse = gameState?.hrResponse ?? null;
  const guideline = gameState?.guideline ?? null;

  const spectrumQuestion = gameState?.spectrumQuestion ?? "";
  const leftLabel = gameState?.leftLabel ?? "";
  const rightLabel = gameState?.rightLabel ?? "";
  const guesses = gameState?.guesses ?? {};

  const comments = gameState?.comments ?? {};
  const votes = gameState?.votes ?? {};

  const scores = gameState?.scores ?? {};
  const roundScores = gameState?.roundScores ?? {};

  const introText = gameState?.introText ?? null;
  const nudges = gameState?.nudges ?? [];
  const caseLog = gameState?.caseLog ?? [];
  const history = gameState?.history ?? [];
  const lastRound = gameState?.lastRound ?? null;
  const finalCommentary = gameState?.finalCommentary ?? null;

  const voiceEnabled = gameState?.voiceEnabled ?? false;
  const voiceId = gameState?.voiceId ?? "onyx";

  // --- derived roster / roles ---
  const accused = accusedId
    ? room.players.find((p) => p.id === accusedId) ?? null
    : null;
  const isAccused = accused !== null && accused.id === playerId;
  const isReporter = reporterId !== null && reporterId === playerId;
  const myName =
    room.players.find((p) => p.id === playerId)?.name ?? "Employee";

  const myAssignment = assignments[playerId];
  const myQuestion = accusationQuestions[playerId];
  const hasAccused = accusations[playerId] !== undefined;
  const reporters = room.players.filter((p) => assignments[p.id] !== undefined);
  const accFiledCount = reporters.filter(
    (p) => accusations[p.id] !== undefined
  ).length;

  const guessers = room.players.filter((p) => p.id !== accusedId);
  const guessedCount = guessers.filter(
    (g) => guesses[g.id] !== undefined
  ).length;
  const hasGuessed = guesses[playerId] !== undefined;

  const commentedCount = room.players.filter(
    (p) => comments[p.id] !== undefined
  ).length;
  const hasCommented = comments[playerId] !== undefined;
  const votedCount = room.players.filter(
    (p) => votes[p.id] !== undefined
  ).length;
  const hasVoted = votes[playerId] !== undefined;

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

  const [accusationInput, setAccusationInput] = useState("");
  const [isAccusing, setIsAccusing] = useState(false);

  const [explanationInput, setExplanationInput] = useState("");
  const [isExplaining, setIsExplaining] = useState(false);

  const [stanceInput, setStanceInput] = useState(50);
  const [isStancing, setIsStancing] = useState(false);

  const [guessInput, setGuessInput] = useState(50);
  const [isGuessing, setIsGuessing] = useState(false);

  const [commentInput, setCommentInput] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);

  const [voteFor, setVoteFor] = useState<string | null>(null);
  const [atGuess, setAtGuess] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  const [isProceeding, setIsProceeding] = useState(false);
  const [isClosingAcc, setIsClosingAcc] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isClosingComments, setIsClosingComments] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  // Fresh inputs every round — and whenever the controlled player changes
  // (hotseat pass-and-play must not leak one player's typing to the next).
  useEffect(() => {
    setAccusationInput("");
    setExplanationInput("");
    setStanceInput(50);
    setGuessInput(50);
    setCommentInput("");
    setVoteFor(null);
    setAtGuess(null);
  }, [roundNumber, playerId, phase]);

  // A new accusation window also needs a clean report box.
  useEffect(() => {
    setAccusationInput("");
  }, [accusationRound]);

  // ==========================================================================
  // /api/host integration (host client only) — LLM calls happen here, never in
  // the reducer; results are stored via SET_* actions.
  // ==========================================================================

  function buildHostRequest(kind: "intro" | "accuse" | "resolve" | "final") {
    return {
      kind,
      heat,
      challenge,
      roundNumber,
      totalRounds,
      standings: standings.map((s) => ({
        name: s.name,
        score: s.score,
        trend: s.roundDelta > 0 ? "up" : s.roundDelta < 0 ? "down" : "flat",
      })),
      players: room.players.map((p) => p.name),
      accusePairs: reporters.map((p) => ({
        reporter: p.name,
        subject: assignments[p.id].subjectName,
      })),
      accusedName: accused?.name ?? "",
      reporterName:
        room.players.find((p) => p.id === reporterId)?.name ?? "",
      accusation: accusation ?? "",
      explanation: explanation ?? "",
      recentGuidelines: history.slice(-5).map((h) => h.guideline),
      caseLog: caseLog.slice(-12).map((r) => ({
        reporter: r.reporterName,
        accused: r.accusedName,
        question: r.question,
        accusation: r.accusation,
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

  // The Overlord's opening address.
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

  // Accusation prompts: one per assigned reporter, fetched once per window.
  const accuseRequestedFor = useRef(0);
  useEffect(() => {
    if (phase !== "accusation" || !isHost) return;
    if (Object.keys(accusationQuestions).length > 0) return;
    if (accuseRequestedFor.current === accusationRound) return;
    accuseRequestedFor.current = accusationRound;
    (async () => {
      const reporterIds = reporters.map((p) => p.id);
      const json = await fetchHost(buildHostRequest("accuse"));
      const rawQuestions =
        json && Array.isArray(json.questions) ? json.questions : [];
      const questions: Record<string, string> = {};
      reporterIds.forEach((id, i) => {
        const q = rawQuestions[i];
        questions[id] =
          typeof q === "string" && q.trim()
            ? q
            : FALLBACK_ACCUSATION_QUESTIONS[
                (i + accusationRound) % FALLBACK_ACCUSATION_QUESTIONS.length
              ].replace(
                /\{subject\}/g,
                assignments[id]?.subjectName ?? "them"
              );
      });
      await dispatchAction("SET_ACCUSATION_QUESTIONS", { questions });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, accusationRound, accusationQuestions]);

  // Resolution: HR ruling + Company Guideline (+ spectrum labels for Type A).
  const resolveRequested = useRef(false);
  useEffect(() => {
    if (phase !== "resolving") {
      resolveRequested.current = false;
      return;
    }
    if (!isHost || guideline || resolveRequested.current) return;
    resolveRequested.current = true;
    (async () => {
      const accusedName = accused?.name ?? "The employee";
      const json = await fetchHost(buildHostRequest("resolve"));

      const okResponse =
        json &&
        typeof json.hrResponse === "string" &&
        json.hrResponse.trim() &&
        typeof json.guideline === "string" &&
        json.guideline.trim();

      const payload: Record<string, unknown> = {};
      payload.hrResponse = okResponse
        ? (json!.hrResponse as string)
        : pick(FALLBACK_HR_RESPONSES).replace(/\{name\}/g, accusedName);
      payload.guideline = okResponse
        ? (json!.guideline as string)
        : pick(FALLBACK_GUIDELINES);
      const nudges =
        json && Array.isArray(json.nudges) && json.nudges.length > 0
          ? json.nudges
          : FALLBACK_NUDGES.slice(0, 3);
      payload.nudges = nudges;

      if (challenge === "spectrum") {
        const okSpectrum =
          json &&
          typeof json.spectrumQuestion === "string" &&
          json.spectrumQuestion.trim() &&
          typeof json.leftLabel === "string" &&
          json.leftLabel.trim() &&
          typeof json.rightLabel === "string" &&
          json.rightLabel.trim();
        if (okSpectrum) {
          payload.spectrumQuestion = json!.spectrumQuestion;
          payload.leftLabel = json!.leftLabel;
          payload.rightLabel = json!.rightLabel;
        } else {
          const fb = pick(FALLBACK_SPECTRUMS);
          payload.spectrumQuestion = fb.question;
          payload.leftLabel = fb.leftLabel;
          payload.rightLabel = fb.rightLabel;
        }
      }

      await dispatchAction("SET_RESOLUTION", payload);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, guideline, challenge]);

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
      ? `Investigation cycle complete. ${topName} is named Employee of the Cycle, pending audit. The rest of you have been noted. Dismissed.`
      : "Investigation cycle complete. Records have been sealed. Dismissed.";

    (async () => {
      const json = await fetchHost(buildHostRequest("final"));
      const text =
        json && typeof json.commentary === "string" && json.commentary.trim()
          ? (json.commentary as string)
          : fallbackFinal;
      await dispatchAction("SET_FINAL", { commentary: text });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, finalCommentary]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  async function withFlag(
    setFlag: (v: boolean) => void,
    fn: () => Promise<void>
  ) {
    setFlag(true);
    try {
      await fn();
    } finally {
      setFlag(false);
    }
  }

  async function handleStartGame() {
    await withFlag(setIsStarting, () =>
      dispatchAction("START_GAME", { heat: heatChoice })
    );
  }

  async function handleBegin() {
    await withFlag(setIsProceeding, () => dispatchAction("BEGIN"));
  }

  async function handleSubmitAccusation(e: FormEvent) {
    e.preventDefault();
    const text = accusationInput.trim();
    if (!text) return;
    await withFlag(setIsAccusing, () =>
      dispatchAction("SUBMIT_ACCUSATION", { accusation: text })
    );
  }

  async function handleCloseAccusation() {
    await withFlag(setIsClosingAcc, () => dispatchAction("CLOSE_ACCUSATION"));
  }

  async function handleSubmitExplanation(e: FormEvent) {
    e.preventDefault();
    const text = explanationInput.trim();
    if (!text) return;
    await withFlag(setIsExplaining, () =>
      dispatchAction("SUBMIT_EXPLANATION", { explanation: text })
    );
  }

  async function handleSkipInterview() {
    await withFlag(setIsSkipping, () => dispatchAction("SKIP_INTERVIEW"));
  }

  async function handleSubmitStance(e: FormEvent) {
    e.preventDefault();
    await withFlag(setIsStancing, () =>
      dispatchAction("SET_STANCE", { stance: stanceInput })
    );
  }

  async function handleSubmitGuess(e: FormEvent) {
    e.preventDefault();
    await withFlag(setIsGuessing, () =>
      dispatchAction("SUBMIT_GUESS", { guess: guessInput })
    );
  }

  async function handleSubmitComment(e: FormEvent) {
    e.preventDefault();
    const text = commentInput.trim();
    if (!text) return;
    await withFlag(setIsCommenting, () =>
      dispatchAction("SUBMIT_COMMENT", { comment: text })
    );
  }

  async function handleCloseComments() {
    await withFlag(setIsClosingComments, () =>
      dispatchAction("CLOSE_COMMENTS")
    );
  }

  async function handleSubmitVote(e: FormEvent) {
    e.preventDefault();
    if (!voteFor) return;
    await withFlag(setIsVoting, () =>
      dispatchAction("SUBMIT_VOTE", {
        voteFor,
        ...(atGuess ? { atGuess } : {}),
      })
    );
  }

  async function handleForceReveal() {
    await withFlag(setIsRevealing, () => dispatchAction("REVEAL"));
  }

  async function handleNextRound() {
    await withFlag(setIsAdvancing, () => dispatchAction("NEXT_ROUND"));
  }

  async function handlePlayAgain() {
    await withFlag(setIsResetting, () => dispatchAction("PLAY_AGAIN"));
  }

  // Host escape hatch during "resolving" if the AI call never lands (rare).
  async function handleForceResolution() {
    await withFlag(setIsResolving, async () => {
      const accusedName = accused?.name ?? "The employee";
      const payload: Record<string, unknown> = {
        hrResponse: pick(FALLBACK_HR_RESPONSES).replace(
          /\{name\}/g,
          accusedName
        ),
        guideline: pick(FALLBACK_GUIDELINES),
        nudges: FALLBACK_NUDGES.slice(0, 3),
      };
      if (challenge === "spectrum") {
        const fb = pick(FALLBACK_SPECTRUMS);
        payload.spectrumQuestion = fb.question;
        payload.leftLabel = fb.leftLabel;
        payload.rightLabel = fb.rightLabel;
      }
      await dispatchAction("SET_RESOLUTION", payload);
    });
  }

  // ==========================================================================
  // The management terminal — what the Overlord is saying right now
  // ==========================================================================

  const [nudgeIdx, setNudgeIdx] = useState(0);
  useEffect(() => {
    if (phase !== "a_guess") return;
    const interval = setInterval(() => setNudgeIdx((i) => i + 1), 9000);
    return () => clearInterval(interval);
  }, [phase]);
  const nudgePool = nudges.length > 0 ? nudges : FALLBACK_NUDGES;
  const currentNudge = nudgePool[nudgeIdx % nudgePool.length];

  const ALL = "All staff";

  // Returns what the terminal shows, plus the subset READ ALOUD. Only room-wide
  // beats speak (intro, the posted guideline, the HR ruling at reveal, final).
  // Anything that could leak the accused's identity stays silent and text-only.
  function terminalContent(): {
    to: string;
    text: string;
    speak: string;
    speakKey: string;
  } {
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
          : silent(ALL, "Establishing secure channel to HR...");
      case "accusation": {
        if (myAssignment && myQuestion) {
          return silent(
            myName,
            `HR REPORT — RE: ${myAssignment.subjectName}.\n${myQuestion}`
          );
        }
        if (myAssignment) {
          return silent(myName, "HR is drafting your report form. Hold.");
        }
        return silent(myName, "No report assigned this cycle. Remain seated.");
      }
      case "interview":
        return isAccused
          ? silent(
              myName,
              accusation
                ? `You have been named in an HR complaint:\n"${accusation}"`
                : "You have been named in an HR complaint. Details are being retrieved."
            )
          : silent(
              ALL,
              "HR is conducting a private interview. Do not speculate. Speculation is a separate offense."
            );
      case "resolving":
        return silent(ALL, "HR is deliberating. A ruling is being prepared.");
      case "a_stance":
      case "b_comment":
        return guideline
          ? {
              to: ALL,
              text: `NEW COMPANY GUIDELINE:\n${guideline}`,
              speak: `New company guideline. ${guideline}`,
              speakKey: `guideline:${roundNumber}`,
            }
          : silent(ALL, "Drafting policy...");
      case "a_guess":
        return hasGuessed || isAccused
          ? silent(myName, currentNudge)
          : silent(ALL, guideline ? `Guideline in effect: ${guideline}` : "Review in progress.");
      case "b_vote":
        return silent(
          ALL,
          "Cast your vote for the finest comment. Then tag the employee this policy was written about."
        );
      case "reveal":
        return hrResponse
          ? {
              to: ALL,
              text: hrResponse,
              speak: hrResponse,
              speakKey: `reveal:${roundNumber}`,
            }
          : silent(ALL, "Compiling the ruling...");
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

  const lastReviewRound = roundNumber >= totalRounds;
  const terminal = terminalContent();

  // ==========================================================================
  // Overlord voice (host-controlled TTS). Audio plays on ONE device.
  // ==========================================================================
  const isAudioDevice = room.mode !== "multiplayer" || isHost;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const spokenKeyRef = useRef<string | null>(null);
  const voiceIdRef = useRef(voiceId);
  voiceIdRef.current = voiceId;

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
      /* network/decoding failure — silently skip */
    }
  }

  useEffect(() => {
    if (!voiceEnabled || !isAudioDevice || !terminal.speakKey || !terminal.speak) {
      return;
    }
    if (spokenKeyRef.current === terminal.speakKey) return;
    spokenKeyRef.current = terminal.speakKey;
    void speakNow(terminal.speak, voiceIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal.speakKey, voiceEnabled, isAudioDevice]);

  useEffect(() => {
    if (!voiceEnabled) stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);
  useEffect(() => () => stopSpeaking(), []);

  async function handleToggleVoice() {
    const next = !voiceEnabled;
    if (next) {
      ensureAudioUnlocked();
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

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <>
      {/* Host Controls */}
      {isHost && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Host Controls</h2>

          {/* Management voice */}
          <div className="mb-4 pb-4 border-b border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Management Voice</p>
                <p className="text-[11px] text-gray-500">
                  Reads HR aloud on this device.
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
                  Calibrate investigation intensity:
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
                  : "Open Investigation"}
              </button>
            </div>
          )}

          {phase === "intro" && (
            <button
              onClick={handleBegin}
              disabled={isProceeding || !introText}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {!introText
                ? "HR is preparing remarks..."
                : isProceeding
                ? "Opening..."
                : "Begin Round 1 — Accusations"}
            </button>
          )}

          {phase === "accusation" && (
            <button
              onClick={handleCloseAccusation}
              disabled={isClosingAcc}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isClosingAcc
                ? "Sealing reports..."
                : `Close Reports & Pick a Case (${accFiledCount}/${reporters.length} filed)`}
            </button>
          )}

          {phase === "interview" && (
            <div className="space-y-2">
              <p className="text-gray-400 text-sm">
                Interviewing{" "}
                <span className="text-white font-semibold">
                  {accused?.name ?? "the accused"}
                </span>
                {" "}(private — their identity is hidden from the room).
              </p>
              <button
                onClick={handleSkipInterview}
                disabled={isSkipping}
                className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                {isSkipping ? "Skipping..." : "Skip Interview (no response)"}
              </button>
            </div>
          )}

          {phase === "resolving" && (
            <button
              onClick={handleForceResolution}
              disabled={isResolving || !!guideline}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isResolving
                ? "Filing..."
                : "HR is deliberating — force a ruling if stuck"}
            </button>
          )}

          {phase === "a_stance" && (
            <p className="text-gray-400 text-sm">
              Awaiting a private ranking from{" "}
              <span className="text-white font-semibold">
                {accused?.name ?? "the accused"}
              </span>
              .
            </p>
          )}

          {phase === "a_guess" && (
            <button
              onClick={handleForceReveal}
              disabled={isRevealing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isRevealing
                ? "Compiling..."
                : `Force Reveal (${guessedCount}/${guessers.length} guesses in)`}
            </button>
          )}

          {phase === "b_comment" && (
            <button
              onClick={handleCloseComments}
              disabled={isClosingComments || commentedCount === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isClosingComments
                ? "Closing thread..."
                : `Close Thread & Open Voting (${commentedCount}/${room.players.length} commented)`}
            </button>
          )}

          {phase === "b_vote" && (
            <button
              onClick={handleForceReveal}
              disabled={isRevealing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isRevealing
                ? "Tallying..."
                : `Force Tally (${votedCount}/${room.players.length} voted)`}
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
                ? "Close Investigation Cycle"
                : "Next Case"}
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
            Case {Math.min(roundNumber, totalRounds || roundNumber)} of{" "}
            {totalRounds || "?"} · {CHALLENGE_LABEL[challenge]} · Heat: {heat} ·
            Room {room.roomCode}
          </p>
        )}

        <h2 className="font-semibold mb-4">
          {phase === "lobby" && "HR Investigation"}
          {phase === "intro" && "Orientation"}
          {phase === "accusation" && "File Your HR Report"}
          {phase === "interview" && "HR Interview"}
          {phase === "resolving" && "HR Ruling Pending"}
          {phase === "a_stance" && "Spectrum Review"}
          {phase === "a_guess" && "Spectrum Review"}
          {phase === "b_comment" && "Guideline Thread"}
          {phase === "b_vote" && "Vote & Tag"}
          {phase === "reveal" && "Case Closed"}
          {phase === "game_over" && "Final Review"}
        </h2>

        <Terminal to={terminal.to} text={terminal.text} live={voiceEnabled} />

        {/* -------------------------------------------------- lobby */}
        {phase === "lobby" && (
          <div className="space-y-2">
            <p className="text-gray-500 text-xs">
              {
                "Each round: everyone files an HR report on an assigned colleague. One accused employee is interviewed and explains themselves. HR issues a ruling and a ridiculous new Company Guideline. Then the table either guesses how the accused ranks the policy, or roasts it in a fake company thread and tries to tag who it was written about. Points for accuracy, wit, and vigilance. HR sees everything."
              }
            </p>
          </div>
        )}

        {/* -------------------------------------------------- intro */}
        {phase === "intro" && !isHost && (
          <p className="text-gray-500 text-xs text-center">
            HR is speaking. Do not interrupt.
          </p>
        )}

        {/* -------------------------------------------------- accusation */}
        {phase === "accusation" && (
          <div className="space-y-4">
            {myAssignment ? (
              hasAccused ? (
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                    Your report — re: {myAssignment.subjectName}
                  </p>
                  <p className="text-sm text-gray-300 mb-2">
                    {accusations[playerId]}
                  </p>
                  <p className="text-gray-500 text-xs italic">
                    Filed. HR thanks you for your vigilance.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitAccusation} className="space-y-3">
                  <ActionBanner tone="amber">
                    <p className="font-semibold">You must file a report.</p>
                    <p className="text-xs opacity-80 mt-1">
                      What did{" "}
                      <span className="font-semibold">
                        {myAssignment.subjectName}
                      </span>{" "}
                      do that HR should worry about? One or two sentences.
                    </p>
                  </ActionBanner>
                  <textarea
                    value={accusationInput}
                    onChange={(e) => setAccusationInput(e.target.value)}
                    maxLength={280}
                    rows={3}
                    placeholder={`Report an incident involving ${myAssignment.subjectName}...`}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isAccusing || !accusationInput.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    {isAccusing ? "Filing..." : "Submit HR Report"}
                  </button>
                </form>
              )
            ) : (
              <p className="text-gray-500 text-xs text-center">
                You joined mid-cycle. HR will assign you next window.
              </p>
            )}
            <p className="text-gray-500 text-xs">
              {accFiledCount} of {reporters.length} reports received. One case
              will be selected for investigation.
            </p>
          </div>
        )}

        {/* -------------------------------------------------- interview */}
        {phase === "interview" && (
          <div className="space-y-4">
            {isAccused ? (
              explanation ? (
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                    Your statement to HR
                  </p>
                  <p className="text-sm text-gray-300 mb-2">{explanation}</p>
                  <p className="text-gray-500 text-xs italic">
                    Submitted. HR is deliberating.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitExplanation} className="space-y-3">
                  <ActionBanner tone="amber">
                    <p className="font-semibold">
                      🔒 You have been named in a complaint. This is private.
                    </p>
                    <p className="text-xs opacity-80 mt-1">
                      The rest of the room does not know it is you. Explain what
                      actually happened.
                    </p>
                  </ActionBanner>
                  {accusation && (
                    <div className="bg-red-950/40 border border-red-800 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-widest text-red-400 mb-1">
                        The accusation
                      </p>
                      <p className="text-sm text-red-100">“{accusation}”</p>
                    </div>
                  )}
                  <textarea
                    value={explanationInput}
                    onChange={(e) => setExplanationInput(e.target.value)}
                    maxLength={400}
                    rows={4}
                    placeholder="Explain yourself to HR..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isExplaining || !explanationInput.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    {isExplaining ? "Submitting..." : "Submit My Statement"}
                  </button>
                </form>
              )
            ) : (
              <div className="text-center py-6">
                <p className="text-4xl mb-3">🕵️</p>
                <p className="text-gray-300">
                  HR is interviewing an employee behind closed doors.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  Their identity is sealed until the ruling. Remain at your desk.
                </p>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- resolving */}
        {phase === "resolving" && (
          <div className="text-center py-6">
            <p className="text-4xl mb-3 animate-pulse">⚖️</p>
            <p className="text-gray-300">
              HR is weighing the evidence and drafting policy.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              A ruling and a new Company Guideline are incoming.
            </p>
          </div>
        )}

        {/* -------------------------------------------------- a_stance */}
        {phase === "a_stance" && (
          <div>
            {guideline && <GuidelineCard guideline={guideline} />}
            <SpectrumHeader
              question={spectrumQuestion}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
            />
            {isAccused ? (
              <form onSubmit={handleSubmitStance} className="space-y-5">
                <ActionBanner tone="amber">
                  <p className="font-semibold">
                    You are on the spot. This guideline exists because of you.
                  </p>
                  <p className="text-xs opacity-80 mt-1">
                    Privately rank it. Your colleagues will try to guess where
                    you land — this stays secret until the reveal.
                  </p>
                </ActionBanner>
                <StanceSlider
                  value={stanceInput}
                  onChange={setStanceInput}
                  leftLabel={leftLabel}
                  rightLabel={rightLabel}
                />
                <button
                  type="submit"
                  disabled={isStancing}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isStancing ? "Locking in..." : "Lock In My Ranking"}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  <span className="font-semibold text-white">
                    {accused?.name ?? "The accused"}
                  </span>{" "}
                  is privately ranking the guideline.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  Get ready to guess where they land.
                </p>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- a_guess */}
        {phase === "a_guess" && (
          <div>
            {guideline && <GuidelineCard guideline={guideline} />}
            <SpectrumHeader
              question={spectrumQuestion}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
            />
            <div className="text-center py-3 bg-gray-900 rounded-lg mb-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                On the spot
              </p>
              <p className="text-2xl font-bold text-white">
                {accused?.name ?? "The accused"}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Guess where they ranked their own guideline.
              </p>
            </div>

            {isAccused ? (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  Your colleagues are reading you. Sit still.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  {guessedCount} of {guessers.length} guesses submitted.
                </p>
              </div>
            ) : hasGuessed ? (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-1">Your guess:</p>
                <p className="text-3xl font-bold text-green-400">
                  {guesses[playerId]}
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  {guessedCount} of {guessers.length} guesses in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitGuess} className="space-y-4">
                <p className="text-gray-400 text-sm">
                  Where did {accused?.name ?? "the accused"} land?
                </p>
                <StanceSlider
                  value={guessInput}
                  onChange={setGuessInput}
                  leftLabel={leftLabel}
                  rightLabel={rightLabel}
                />
                <button
                  type="submit"
                  disabled={isGuessing}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isGuessing ? "Submitting..." : "Submit Guess"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* -------------------------------------------------- b_comment */}
        {phase === "b_comment" && (
          <div>
            {guideline && <GuidelineCard guideline={guideline} />}
            <ActionBanner tone="blue">
              <p className="font-semibold">
                💬 The policy has been posted company-wide.
              </p>
              <p className="text-xs opacity-80 mt-1">
                Everyone comments — including whoever it&apos;s secretly about.
                Later you&apos;ll vote for the funniest and tag who caused it.
              </p>
            </ActionBanner>

            {hasCommented ? (
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Your comment
                </p>
                <p className="text-sm text-gray-300 mb-2">
                  {comments[playerId]}
                </p>
                <p className="text-gray-500 text-xs italic">
                  Posted. {commentedCount} of {room.players.length} have
                  commented.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitComment} className="space-y-3">
                <textarea
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  maxLength={240}
                  rows={3}
                  placeholder="Reply to the company post..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
                <button
                  type="submit"
                  disabled={isCommenting || !commentInput.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {isCommenting ? "Posting..." : "Post Comment"}
                </button>
              </form>
            )}
            <p className="text-gray-500 text-xs mt-3">
              {commentedCount} of {room.players.length} employees have commented.
            </p>
          </div>
        )}

        {/* -------------------------------------------------- b_vote */}
        {phase === "b_vote" && (
          <div>
            {guideline && <GuidelineCard guideline={guideline} />}
            {hasVoted ? (
              <div className="text-center py-4">
                <p className="text-gray-300">Vote submitted.</p>
                <p className="text-gray-500 text-xs mt-2">
                  {votedCount} of {room.players.length} votes in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitVote} className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-gray-200 mb-2">
                    1. Funniest comment
                  </p>
                  <div className="space-y-2">
                    {room.players
                      .filter((p) => comments[p.id] !== undefined)
                      .map((p) => {
                        const isOwn = p.id === playerId;
                        const selected = voteFor === p.id;
                        return (
                          <button
                            type="button"
                            key={p.id}
                            disabled={isOwn}
                            onClick={() => setVoteFor(p.id)}
                            className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${
                              selected
                                ? "bg-green-900/40 border-green-600"
                                : isOwn
                                ? "bg-gray-900/50 border-gray-800 opacity-50 cursor-not-allowed"
                                : "bg-gray-900 border-gray-700 hover:border-gray-500"
                            }`}
                          >
                            <span className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                              {p.name}
                              {isOwn && " (you — can't vote for yourself)"}
                            </span>
                            <span className="text-gray-200">
                              {comments[p.id]}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-200 mb-1">
                    2. Who was this guideline written about?
                  </p>
                  {isAccused || isReporter ? (
                    <p className="text-[11px] text-amber-300/80 mb-2">
                      You already know the answer, so no bonus for you — but you
                      still need to submit a vote above.
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 mb-2">
                      Tag the employee you think caused it (+{ATMENTION_BONUS}).
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {room.players.map((p) => {
                      const selected = atGuess === p.id;
                      return (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() =>
                            setAtGuess((cur) => (cur === p.id ? null : p.id))
                          }
                          className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                            selected
                              ? "bg-indigo-700 border-indigo-500 text-white"
                              : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500"
                          }`}
                        >
                          @{p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isVoting || !voteFor}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isVoting
                    ? "Submitting..."
                    : !voteFor
                    ? "Pick a comment to vote"
                    : "Submit Vote"}
                </button>
              </form>
            )}
            <p className="text-gray-500 text-xs mt-3">
              {votedCount} of {room.players.length} votes in.
            </p>
          </div>
        )}

        {/* -------------------------------------------------- reveal */}
        {phase === "reveal" && lastRound && (
          <RevealPanel
            lastRound={lastRound}
            standings={standings}
            playerId={playerId}
            accusedId={accusedId}
          />
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

// ============================================================================
// Reveal panel — unseals the whole case
// ============================================================================

function RevealPanel({
  lastRound,
  standings,
  playerId,
  accusedId,
}: {
  lastRound: PRLastRound;
  standings: Array<{ id: string; name: string; score: number; roundDelta: number }>;
  playerId: string;
  accusedId: string | null;
}) {
  return (
    <div className="space-y-5">
      {/* The case file */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            The accusation · filed by {lastRound.reporterName || "HR"}
          </p>
          <p className="text-sm text-gray-200">
            “{lastRound.accusation || "No accusation on record."}”
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            The accused
          </p>
          <p className="text-lg font-bold text-white">
            {lastRound.accusedName}
          </p>
        </div>
        {lastRound.explanation && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Their defense
            </p>
            <p className="text-sm text-gray-300 italic">
              “{lastRound.explanation}”
            </p>
          </div>
        )}
      </div>

      {/* The guideline that resulted */}
      <GuidelineCard guideline={lastRound.guideline} />

      {/* Challenge results */}
      {lastRound.challenge === "spectrum" &&
      lastRound.spectrumResults &&
      lastRound.stance !== undefined ? (
        <div className="space-y-3">
          <div className="text-center">
            <span className="inline-block px-4 py-1 rounded-full text-sm font-bold bg-yellow-500 text-gray-900">
              {lastRound.accusedName} · {lastRound.stance}
            </span>
            <p className="text-gray-500 text-xs mt-2">
              {lastRound.spectrumQuestion}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <SpectrumBar
              leftLabel={lastRound.leftLabel ?? ""}
              rightLabel={lastRound.rightLabel ?? ""}
              stance={lastRound.stance}
              results={lastRound.spectrumResults}
            />
          </div>
        </div>
      ) : null}

      {lastRound.challenge === "thread" && lastRound.threadResults ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-300">The thread</h3>
          {lastRound.threadResults.map((r) => (
            <div
              key={r.id}
              className={`rounded-lg border p-3 ${
                r.id === accusedId
                  ? "bg-red-950/30 border-red-800"
                  : "bg-gray-900 border-gray-700"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">
                  {r.name}
                  {r.id === accusedId && (
                    <span className="text-red-400"> · the accused</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 whitespace-nowrap">
                  🗳️ {r.votes} · +{r.commentPoints + r.atBonus} pts
                </p>
              </div>
              <p className="text-sm text-gray-200 mt-1">{r.comment}</p>
              {r.atBonus > 0 && (
                <p className="text-[11px] text-green-400 mt-1">
                  Correctly tagged the accused (+{r.atBonus})
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Scoreboard */}
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
                {s.id === accusedId && (
                  <span className="text-gray-500 text-xs"> (accused)</span>
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
  );
}
