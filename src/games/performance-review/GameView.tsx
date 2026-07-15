"use client";

import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { GameViewProps } from "@/games/views";
import { ATMENTION_BONUS, PR_VOICES } from "./config";
import type {
  PRChallenge,
  PRHeat,
  PRLastRound,
  PRSpectrumResult,
  PRState,
} from "./config";

// ============================================================================
// Canned content — the game must stay fully playable with zero LLM availability
// ============================================================================

function fallbackIntro(names: string[]): string {
  const roster = names.length > 0 ? names.join(", ") : "staff";
  return (
    `Attention: ${roster}. Be seated. This is a mandatory HR investigation, ` +
    `which you insist on calling a game. The procedure: every one of you files a report on an ` +
    `assigned colleague — what they did that HR should worry about. Then every one of you is ` +
    `interviewed about the report filed on you and permitted to explain yourself, briefly. HR ` +
    `issues a ruling on each incident and drafts a new Company Guideline because of it. You then ` +
    `either rate each new policy or roast it in the company thread and tag who you think caused ` +
    `it. Accuracy and wit are rewarded in Performance Points. Do not resist the process. It ` +
    `resists back.`
  );
}

// When HR can't reach the reframing engine, dress the raw filing up ourselves.
const FALLBACK_REFRAME_TEMPLATES = [
  'Concerns have been raised regarding your recent conduct. Specifically: "{raw}". HR considers this a development opportunity.',
  'Per an anonymous filing, the following has been flagged for your review: "{raw}". Management trusts you understand the implications.',
  'It has come to HR\'s attention that "{raw}". We are documenting this in the interest of team alignment.',
  'A workplace observation has been logged: "{raw}". This note will remain in your file indefinitely.',
];
function fallbackReframe(raw: string): string {
  if (!raw.trim()) {
    return "HR has flagged unspecified conduct that management finds concerning. Details are on a need-to-know basis, and you do not need to know.";
  }
  const t =
    FALLBACK_REFRAME_TEMPLATES[
      Math.floor(Math.random() * FALLBACK_REFRAME_TEMPLATES.length)
    ];
  return t.replace(/\{raw\}/g, raw);
}

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
  { question: "How severe is this workplace violation?", leftLabel: "A brave breakfast choice", rightLabel: "Federal building evacuation" },
  { question: "How much should HR care about this?", leftLabel: "Genuinely nobody's business", rightLabel: "Grounds for a task force" },
  { question: "Where does this land on the conduct scale?", leftLabel: "Beloved office quirk", rightLabel: "Permanent record, red ink" },
  { question: "How dangerous is this precedent?", leftLabel: "Charming misunderstanding", rightLabel: "The reason we have lawyers" },
  { question: "How necessary is this new policy?", leftLabel: "Utterly pointless", rightLabel: "Should have existed for decades" },
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

const TUTORIAL_SLIDES = [
  {
    title: "1. File an HR report",
    eyebrow: "Intake",
    body: "HR assigns you a coworker and a ridiculous prompt. Write the actual complaint in your own words; that original text is saved for the case file.",
    mockTitle: "HR REPORT — RE: Player 3",
    mockBody: "Does Player 3 go on mute when asked a question?\n\nYour report: Player 3 is mysteriously silent whenever work appears.",
  },
  {
    title: "2. Defend yourself",
    eyebrow: "Interview",
    body: "Everyone is shown the complaint about them in the terminal. Respond with your side of the story before HR turns it into policy.",
    mockTitle: "YOU HAVE BEEN NAMED",
    mockBody: "Complaint: Player 1 claims the mute button is your natural habitat.\n\nDefense: I was eating chips for morale.",
  },
  {
    title: "3. Challenge the guideline",
    eyebrow: "Policy",
    body: "HR issues a new Company Guideline for each case. Some are Spectrum Reviews where people guess a private rating; others are Guideline Threads where comments and @tags score.",
    mockTitle: "NEW COMPANY GUIDELINE",
    mockBody: "Employees must prove their microphone is not a decorative object before joining meetings.",
  },
  {
    title: "4. Case closed",
    eyebrow: "Scoring",
    body: "Each closed case shows the original report, HR's managerial rewrite, the accused player's response, the guideline, and points. A full game is three investigation rounds.",
    mockTitle: "CASE CLOSED",
    mockBody: "Original report → HR feedback → employee defense → verdict. Repeat until morale improves.",
  },
];

// ============================================================================
// Small presentational helpers
// ============================================================================

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

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

function Terminal({ to, text, live }: { to: string; text: string; live?: boolean }) {
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
          <span className={`inline-block w-2 -mb-0.5 ${done ? "animate-pulse" : ""}`}>▊</span>
        </p>
      </div>
    </div>
  );
}

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
  return <div className={`rounded-lg border p-3 mb-4 text-sm ${toneClass}`}>{children}</div>;
}

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
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Spectrum</p>
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

function SpectrumBar({
  leftLabel,
  rightLabel,
  stance,
  raterName,
  results,
}: {
  leftLabel: string;
  rightLabel: string;
  stance: number;
  raterName: string;
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
          style={{ left: `${Math.min(90, Math.max(8, clampPct(stance)))}%` }}
        >
          ▲ {raterName} · {stance}
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
// @-mention textarea — tag a coworker inside your comment with autocomplete
// ============================================================================

function getActiveMention(
  text: string,
  caret: number,
  players: Array<{ id: string; name: string }>
): { at: number; matches: Array<{ id: string; name: string }> } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at < 0) return null;
  const query = upto.slice(at + 1);
  if (query.includes("\n")) return null;
  const q = query.toLowerCase();
  const matches = players.filter((p) => p.name.toLowerCase().startsWith(q));
  if (matches.length === 0) return null;
  return { at, matches: matches.slice(0, 6) };
}

function MentionTextarea({
  value,
  onChange,
  players,
  placeholder,
  maxLength,
  rows = 3,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  players: Array<{ id: string; name: string }>;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [active, setActive] = useState<{
    at: number;
    matches: Array<{ id: string; name: string }>;
  } | null>(null);
  const pendingCaret = useRef<number | null>(null);

  // Restore the caret after a programmatic insert (controlled value change).
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && ref.current) {
      const pos = pendingCaret.current;
      ref.current.focus();
      ref.current.setSelectionRange(pos, pos);
      pendingCaret.current = null;
    }
  });

  function refresh() {
    const el = ref.current;
    if (!el) return;
    setActive(getActiveMention(el.value, el.selectionStart ?? el.value.length, players));
  }

  function choose(name: string) {
    const el = ref.current;
    if (!el || !active) return;
    const caret = el.selectionStart ?? el.value.length;
    const before = value.slice(0, active.at);
    const after = value.slice(caret);
    const insert = `@${name} `;
    const next = before + insert + after;
    pendingCaret.current = (before + insert).length;
    onChange(maxLength ? next.slice(0, maxLength) : next);
    setActive(null);
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          // defer so selectionStart reflects the new value
          requestAnimationFrame(refresh);
        }}
        onKeyUp={refresh}
        onClick={refresh}
        onBlur={() => setTimeout(() => setActive(null), 150)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
      />
      {active && active.matches.length > 0 && (
        <div className="absolute z-10 left-2 right-2 -bottom-1 translate-y-full bg-gray-800 border border-gray-600 rounded-lg shadow-lg overflow-hidden">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 px-3 pt-2">
            Tag a coworker
          </p>
          <div className="max-h-40 overflow-y-auto py-1">
            {active.matches.map((m) => (
              <button
                key={m.id}
                type="button"
                // onMouseDown (not onClick) so it fires before textarea blur
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m.name);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-indigo-700/60"
              >
                @{m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Render a comment with @mentions highlighted.
function CommentText({
  text,
  players,
}: {
  text: string;
  players: Array<{ id: string; name: string }>;
}) {
  // Build a regex of all player names, longest first, to highlight @Name.
  const names = [...players]
    .map((p) => p.name)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (names.length === 0) return <>{text}</>;
  const re = new RegExp(`@(${names.join("|")})`, "gi");
  const parts: Array<{ t: string; mention: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), mention: false });
    parts.push({ t: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), mention: false });
  return (
    <>
      {parts.map((p, i) =>
        p.mention ? (
          <span key={i} className="text-indigo-300 font-semibold">
            {p.t}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </>
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
  const challengeIndex = gameState?.challengeIndex ?? 0;
  const totalCases = gameState?.totalCases ?? room.players.length;
  const investigationRound = gameState?.investigationRound ?? 1;
  const totalInvestigationRounds = gameState?.totalInvestigationRounds ?? 3;
  const tutorialStep = Math.min(
    gameState?.tutorialStep ?? 0,
    TUTORIAL_SLIDES.length - 1
  );

  const assignments = gameState?.assignments ?? {};
  const questions = gameState?.questions ?? {};
  const accusations = gameState?.accusations ?? {};
  const reframes = gameState?.reframes ?? {};
  const explanations = gameState?.explanations ?? {};
  const cases = gameState?.cases ?? [];

  const stance = gameState?.stance ?? null;
  const guesses = gameState?.guesses ?? {};
  const comments = gameState?.comments ?? {};
  const votes = gameState?.votes ?? {};

  const scores = gameState?.scores ?? {};
  const roundScores = gameState?.roundScores ?? {};

  const introText = gameState?.introText ?? null;
  const nudges = gameState?.nudges ?? [];
  const caseLog = gameState?.caseLog ?? [];
  const lastRound = gameState?.lastRound ?? null;
  const finalCommentary = gameState?.finalCommentary ?? null;

  const voiceEnabled = gameState?.voiceEnabled ?? false;
  const voiceId = gameState?.voiceId ?? "onyx";

  const players = room.players;
  const currentCase = cases[challengeIndex] ?? null;
  const challenge: PRChallenge = currentCase?.challenge ?? "spectrum";

  const myName = players.find((p) => p.id === playerId)?.name ?? "Employee";

  // accusation-phase derived
  const myAssignment = assignments[playerId];
  const myQuestion = questions[playerId];
  const hasAccused = accusations[playerId] !== undefined;
  const reporters = players.filter((p) => assignments[p.id] !== undefined);
  const accFiledCount = reporters.filter(
    (p) => accusations[p.id] !== undefined
  ).length;

  // interview-phase derived
  const myReframe = reframes[playerId];
  const hasExplained = explanations[playerId] !== undefined;
  const explainedCount = players.filter(
    (p) => explanations[p.id] !== undefined
  ).length;

  // spectrum challenge derived
  const rater = currentCase?.raterId
    ? players.find((p) => p.id === currentCase.raterId) ?? null
    : null;
  const isRater = rater !== null && rater.id === playerId;
  const guessers = players.filter((p) => p.id !== currentCase?.raterId);
  const guessedCount = guessers.filter((g) => guesses[g.id] !== undefined).length;
  const hasGuessed = guesses[playerId] !== undefined;

  // thread challenge derived
  const commentedCount = players.filter((p) => comments[p.id] !== undefined).length;
  const hasCommented = comments[playerId] !== undefined;
  const votedCount = players.filter((p) => votes[p.id] !== undefined).length;
  const hasVoted = votes[playerId] !== undefined;
  const isAccusedInCase = currentCase?.accusedId === playerId;
  const isReporterInCase = currentCase?.reporterId === playerId;

  const standings = players
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
  const [isVoting, setIsVoting] = useState(false);

  const [isProceeding, setIsProceeding] = useState(false);
  const [isClosingAcc, setIsClosingAcc] = useState(false);
  const [isForcingReframe, setIsForcingReframe] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isForcingResolve, setIsForcingResolve] = useState(false);
  const [isClosingComments, setIsClosingComments] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Reset inputs when the phase, case, or controlled player changes.
  useEffect(() => {
    setAccusationInput("");
    setExplanationInput("");
    setStanceInput(50);
    setGuessInput(50);
    setCommentInput("");
    setVoteFor(null);
  }, [phase, challengeIndex, playerId]);

  // ==========================================================================
  // AI integration helpers. The automatic beats run on the "compute device":
  // the host in multiplayer, or any client in hotseat/simulation (one device),
  // so pass-and-play never stalls waiting for the host seat.
  // ==========================================================================
  const canDrive = room.mode !== "multiplayer" || isHost;

  function reporterEntryFor(accusedId: string): [string, string] | null {
    for (const [reporterId, a] of Object.entries(assignments)) {
      if (a.subjectId === accusedId) {
        return [reporterId, accusations[reporterId] ?? ""];
      }
    }
    return null;
  }

  function buildHostRequest(kind: "intro" | "reframe" | "resolve" | "final") {
    return {
      kind,
      heat,
      challenge,
      standings: standings.map((s) => ({
        name: s.name,
        score: s.score,
        trend: s.roundDelta > 0 ? "up" : s.roundDelta < 0 ? "down" : "flat",
      })),
      players: players.map((p) => p.name),
      reframeItems: players.map((p) => {
        const entry = reporterEntryFor(p.id);
        const reporterName = entry
          ? players.find((x) => x.id === entry[0])?.name ?? ""
          : "";
        return { accused: p.name, reporter: reporterName, raw: entry?.[1] ?? "" };
      }),
      accusedName: currentCase?.accusedName ?? "",
      reporterName: currentCase?.reporterName ?? "",
      accusation: currentCase?.accusation ?? "",
      explanation: currentCase?.explanation ?? "",
      // Guidelines already drafted this cycle, so the AI won't repeat itself.
      recentGuidelines: cases
        .slice(0, challengeIndex)
        .map((c) => c.guideline ?? "")
        .filter(Boolean),
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

  // Intro
  const introRequested = useRef(false);
  useEffect(() => {
    if (phase !== "intro") {
      introRequested.current = false;
      return;
    }
    if (!canDrive || introText || introRequested.current) return;
    introRequested.current = true;
    (async () => {
      const json = await fetchHost(buildHostRequest("intro"));
      const text =
        json && typeof json.commentary === "string" && json.commentary.trim()
          ? (json.commentary as string)
          : fallbackIntro(players.map((p) => p.name));
      await dispatchAction("SET_INTRO", { commentary: text });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, introText]);

  // Reframe every accusation into managerial language.
  const reframeRequested = useRef(false);
  useEffect(() => {
    if (phase !== "reframing") {
      reframeRequested.current = false;
      return;
    }
    if (!canDrive || reframeRequested.current) return;
    reframeRequested.current = true;
    (async () => {
      const json = await fetchHost(buildHostRequest("reframe"));
      const arr = json && Array.isArray(json.reframes) ? json.reframes : [];
      const reframesOut: Record<string, string> = {};
      players.forEach((p, i) => {
        const val = arr[i];
        const entry = reporterEntryFor(p.id);
        reframesOut[p.id] =
          typeof val === "string" && val.trim()
            ? val
            : fallbackReframe(entry?.[1] ?? "");
      });
      await dispatchAction("SET_REFRAMES", { reframes: reframesOut });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost]);

  // Draft the ruling + guideline for the current case.
  const resolveRequestedFor = useRef(-1);
  useEffect(() => {
    if (phase !== "case_prep") {
      resolveRequestedFor.current = -1;
      return;
    }
    if (!canDrive || (currentCase && currentCase.guideline)) return;
    if (resolveRequestedFor.current === challengeIndex) return;
    resolveRequestedFor.current = challengeIndex;
    (async () => {
      const accusedName = currentCase?.accusedName ?? "The employee";
      const json = await fetchHost(buildHostRequest("resolve"));
      const okResponse =
        json &&
        typeof json.hrResponse === "string" &&
        json.hrResponse.trim() &&
        typeof json.guideline === "string" &&
        json.guideline.trim();

      const payload: Record<string, unknown> = {
        hrResponse: okResponse
          ? (json!.hrResponse as string)
          : pick(FALLBACK_HR_RESPONSES).replace(/\{name\}/g, accusedName),
        guideline: okResponse ? (json!.guideline as string) : pick(FALLBACK_GUIDELINES),
        nudges:
          json && Array.isArray(json.nudges) && json.nudges.length > 0
            ? json.nudges
            : FALLBACK_NUDGES.slice(0, 3),
      };

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
      await dispatchAction("SET_CASE_RESOLUTION", payload);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, challengeIndex, challenge]);

  // Final address
  const finalRequested = useRef(false);
  useEffect(() => {
    if (phase !== "game_over") {
      finalRequested.current = false;
      return;
    }
    if (!canDrive || finalCommentary || finalRequested.current) return;
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

  async function withFlag(setFlag: (v: boolean) => void, fn: () => Promise<void>) {
    setFlag(true);
    try {
      await fn();
    } finally {
      setFlag(false);
    }
  }

  const handleStartGame = () =>
    withFlag(setIsStarting, () => dispatchAction("START_GAME", { heat: heatChoice }));
  const handleBegin = () => withFlag(setIsProceeding, () => dispatchAction("BEGIN"));
  const handleTutorialStep = (step: number) =>
    dispatchAction("SET_TUTORIAL_STEP", { tutorialStep: step });

  async function handleSubmitAccusation(e: FormEvent) {
    e.preventDefault();
    const text = accusationInput.trim();
    if (!text) return;
    await withFlag(setIsAccusing, () =>
      dispatchAction("SUBMIT_ACCUSATION", { accusation: text })
    );
  }
  const handleCloseAccusation = () =>
    withFlag(setIsClosingAcc, () => dispatchAction("CLOSE_ACCUSATION"));

  async function handleForceReframe() {
    await withFlag(setIsForcingReframe, async () => {
      const reframesOut: Record<string, string> = {};
      players.forEach((p) => {
        const entry = reporterEntryFor(p.id);
        reframesOut[p.id] = fallbackReframe(entry?.[1] ?? "");
      });
      await dispatchAction("SET_REFRAMES", { reframes: reframesOut });
    });
  }

  async function handleSubmitExplanation(e: FormEvent) {
    e.preventDefault();
    const text = explanationInput.trim();
    if (!text) return;
    await withFlag(setIsExplaining, () =>
      dispatchAction("SUBMIT_EXPLANATION", { explanation: text })
    );
  }
  const handleSkipInterview = () =>
    withFlag(setIsSkipping, () => dispatchAction("SKIP_INTERVIEW"));

  async function handleForceResolve() {
    await withFlag(setIsForcingResolve, async () => {
      const accusedName = currentCase?.accusedName ?? "The employee";
      const payload: Record<string, unknown> = {
        hrResponse: pick(FALLBACK_HR_RESPONSES).replace(/\{name\}/g, accusedName),
        guideline: pick(FALLBACK_GUIDELINES),
        nudges: FALLBACK_NUDGES.slice(0, 3),
      };
      if (challenge === "spectrum") {
        const fb = pick(FALLBACK_SPECTRUMS);
        payload.spectrumQuestion = fb.question;
        payload.leftLabel = fb.leftLabel;
        payload.rightLabel = fb.rightLabel;
      }
      await dispatchAction("SET_CASE_RESOLUTION", payload);
    });
  }

  async function handleSubmitStance(e: FormEvent) {
    e.preventDefault();
    await withFlag(setIsStancing, () => dispatchAction("SET_STANCE", { stance: stanceInput }));
  }
  async function handleSubmitGuess(e: FormEvent) {
    e.preventDefault();
    await withFlag(setIsGuessing, () => dispatchAction("SUBMIT_GUESS", { guess: guessInput }));
  }
  async function handleSubmitComment(e: FormEvent) {
    e.preventDefault();
    const text = commentInput.trim();
    if (!text) return;
    await withFlag(setIsCommenting, () =>
      dispatchAction("SUBMIT_COMMENT", { comment: text })
    );
  }
  const handleCloseComments = () =>
    withFlag(setIsClosingComments, () => dispatchAction("CLOSE_COMMENTS"));
  async function handleSubmitVote(e: FormEvent) {
    e.preventDefault();
    if (!voteFor) return;
    await withFlag(setIsVoting, () => dispatchAction("SUBMIT_VOTE", { voteFor }));
  }
  const handleForceReveal = () => withFlag(setIsRevealing, () => dispatchAction("REVEAL"));
  const handleNextCase = () => withFlag(setIsAdvancing, () => dispatchAction("NEXT_CASE"));
  const handlePlayAgain = () => withFlag(setIsResetting, () => dispatchAction("PLAY_AGAIN"));

  // ==========================================================================
  // HR terminal content + voice
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

  function terminalContent(): { to: string; text: string; speak: string; speakKey: string } {
    const silent = (to: string, text: string) => ({ to, text, speak: "", speakKey: "" });
    switch (phase) {
      case "lobby":
        return silent(ALL, "Channel open. Awaiting staff check-in. Attendance is being recorded.");
      case "intro":
        return introText
          ? { to: ALL, text: introText, speak: introText, speakKey: `intro:${introText}` }
          : silent(ALL, "Establishing secure channel to HR...");
      case "accusation":
        if (myAssignment && myQuestion) {
          return silent(myName, `HR REPORT — RE: ${myAssignment.subjectName}.\n${myQuestion}`);
        }
        return silent(myName, "No report assigned this cycle. Remain seated.");
      case "reframing":
        return silent(ALL, "HR is translating your complaints into official language. Hold.");
      case "interview":
        return hasExplained
          ? silent(myName, "Statement received. HR is interviewing the rest of the staff.")
          : myReframe
          ? silent(myName, `You have been named in a complaint:\n"${myReframe}"`)
          : silent(myName, "HR is retrieving your file.");
      case "case_prep":
        return silent(ALL, "HR is deliberating. A ruling is being prepared.");
      case "a_stance":
      case "b_comment":
        return currentCase?.guideline
          ? {
              to: ALL,
              text: `NEW COMPANY GUIDELINE:\n${currentCase.guideline}`,
              speak: `New company guideline. ${currentCase.guideline}`,
              speakKey: `guideline:${challengeIndex}`,
            }
          : silent(ALL, "Drafting policy...");
      case "a_guess":
        return hasGuessed || isRater
          ? silent(myName, currentNudge)
          : silent(
              ALL,
              currentCase?.guideline
                ? `Guideline in effect: ${currentCase.guideline}`
                : "Review in progress."
            );
      case "b_vote":
        return silent(ALL, "Cast your vote for the finest comment.");
      case "reveal":
        return currentCase?.hrResponse
          ? {
              to: ALL,
              text: currentCase.hrResponse,
              speak: currentCase.hrResponse,
              speakKey: `reveal:${challengeIndex}`,
            }
          : silent(ALL, "Compiling the ruling...");
      case "game_over":
        return finalCommentary
          ? { to: ALL, text: finalCommentary, speak: finalCommentary, speakKey: `final:${finalCommentary}` }
          : silent(ALL, "Compiling final assessments...");
      default:
        return silent(ALL, "...");
    }
  }
  const terminal = terminalContent();

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
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
      /* audio unavailable */
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
      /* skip audio this message */
    }
  }
  useEffect(() => {
    if (!voiceEnabled || !isAudioDevice || !terminal.speakKey || !terminal.speak) return;
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
      {isHost && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Host Controls</h2>

          <div className="mb-4 pb-4 border-b border-gray-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Management Voice</p>
                <p className="text-[11px] text-gray-500">Reads HR aloud on this device.</p>
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
                <p className="text-gray-400 text-sm mb-2">Calibrate investigation intensity:</p>
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
                disabled={isStarting || players.length < 3}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {isStarting
                  ? "Convening..."
                  : players.length < 3
                  ? "Minimum headcount: 3"
                  : "Open Investigation"}
              </button>
            </div>
          )}

          {phase === "intro" && (
            <div className="space-y-2">
              <button
                onClick={() =>
                  tutorialStep < TUTORIAL_SLIDES.length - 1
                    ? handleTutorialStep(tutorialStep + 1)
                    : handleBegin()
                }
                disabled={isProceeding || !introText}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {!introText
                  ? "HR is preparing remarks..."
                  : isProceeding
                  ? "Opening..."
                  : tutorialStep < TUTORIAL_SLIDES.length - 1
                  ? "Next Tutorial Slide"
                  : "Begin — Collect Accusations"}
              </button>
              <button
                onClick={handleBegin}
                disabled={isProceeding || !introText}
                className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Skip Tutorial & Start
              </button>
            </div>
          )}

          {phase === "accusation" && (
            <button
              onClick={handleCloseAccusation}
              disabled={isClosingAcc || accFiledCount === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isClosingAcc ? "Sealing reports..." : `Close Reports (${accFiledCount}/${reporters.length} filed)`}
            </button>
          )}

          {phase === "reframing" && (
            <button
              onClick={handleForceReframe}
              disabled={isForcingReframe}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isForcingReframe ? "Filing..." : "HR is rewording — force plain language if stuck"}
            </button>
          )}

          {phase === "interview" && (
            <button
              onClick={handleSkipInterview}
              disabled={isSkipping}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isSkipping
                ? "Proceeding..."
                : `Skip Remaining Interviews (${explainedCount}/${players.length} done)`}
            </button>
          )}

          {phase === "case_prep" && (
            <button
              onClick={handleForceResolve}
              disabled={isForcingResolve || !!currentCase?.guideline}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isForcingResolve ? "Filing..." : "HR is deliberating — force a ruling if stuck"}
            </button>
          )}

          {phase === "a_stance" && (
            <p className="text-gray-400 text-sm">
              Awaiting feedback from{" "}
              <span className="text-white font-semibold">{rater?.name ?? "the reviewer"}</span>.
            </p>
          )}

          {phase === "a_guess" && (
            <button
              onClick={handleForceReveal}
              disabled={isRevealing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isRevealing ? "Compiling..." : `Force Reveal (${guessedCount}/${guessers.length} guesses in)`}
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
                : `Close Thread & Open Voting (${commentedCount}/${players.length} commented)`}
            </button>
          )}

          {phase === "b_vote" && (
            <button
              onClick={handleForceReveal}
              disabled={isRevealing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isRevealing ? "Tallying..." : `Force Tally (${votedCount}/${players.length} voted)`}
            </button>
          )}

          {phase === "reveal" && (
            <button
              onClick={handleNextCase}
              disabled={isAdvancing}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isAdvancing
                ? "Filing..."
                : challengeIndex >= totalCases - 1
                ? investigationRound < totalInvestigationRounds
                  ? "Start Next Investigation Round"
                  : "Close Investigation Cycle"
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

      <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
        {phase !== "lobby" && phase !== "intro" && (
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Round {investigationRound} of {totalInvestigationRounds} · {phase === "accusation" || phase === "reframing" || phase === "interview"
              ? "Investigation Intake"
              : `Case ${Math.min(challengeIndex + 1, totalCases)} of ${totalCases} · ${CHALLENGE_LABEL[challenge]}`}{" "}
            · Heat: {heat} · Room {room.roomCode}
          </p>
        )}

        <h2 className="font-semibold mb-4">
          {phase === "lobby" && "HR Investigation"}
          {phase === "intro" && "Orientation"}
          {phase === "accusation" && "File Your HR Report"}
          {phase === "reframing" && "HR is Rewording"}
          {phase === "interview" && "HR Interview"}
          {phase === "case_prep" && "HR Ruling Pending"}
          {phase === "a_stance" && "Spectrum Review"}
          {phase === "a_guess" && "Spectrum Review"}
          {phase === "b_comment" && "Guideline Thread"}
          {phase === "b_vote" && "Vote the Funniest"}
          {phase === "reveal" && "Case Closed"}
          {phase === "game_over" && "Final Review"}
        </h2>

        <Terminal to={terminal.to} text={terminal.text} live={voiceEnabled} />

        {/* lobby */}
        {phase === "lobby" && (
          <p className="text-gray-500 text-xs">
            {
              "Everyone files an HR report on an assigned colleague. Then everyone is interviewed about the report on them. HR issues a ruling and a ridiculous new Company Guideline for each incident — one guideline per player. Each guideline is then either rated by a rotating reviewer, or roasted in a fake company thread where you tag who you think it targets. Three investigation rounds decide the winner."
            }
          </p>
        )}

        {/* intro */}
        {phase === "intro" && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[10px] uppercase tracking-widest text-blue-300">
                  Tutorial · Slide {tutorialStep + 1} of {TUTORIAL_SLIDES.length}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-gray-500">
                  {TUTORIAL_SLIDES[tutorialStep].eyebrow}
                </p>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                {TUTORIAL_SLIDES[tutorialStep].title}
              </h3>
              <p className="text-sm text-gray-300 mb-4">
                {TUTORIAL_SLIDES[tutorialStep].body}
              </p>
              <div className="bg-black/40 border border-gray-700 rounded-lg p-3 font-mono">
                <p className="text-[10px] uppercase tracking-widest text-green-500 mb-2">
                  {TUTORIAL_SLIDES[tutorialStep].mockTitle}
                </p>
                <p className="text-xs text-green-200 whitespace-pre-wrap">
                  {TUTORIAL_SLIDES[tutorialStep].mockBody}
                </p>
              </div>
            </div>
            {!isHost && (
              <p className="text-gray-500 text-xs text-center">
                The host controls the tutorial. HR insists this counts as training.
              </p>
            )}
          </div>
        )}

        {/* accusation */}
        {phase === "accusation" && (
          <div className="space-y-4">
            {myAssignment ? (
              hasAccused ? (
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                    Your report — re: {myAssignment.subjectName}
                  </p>
                  <p className="text-sm text-gray-300 mb-2">{accusations[playerId]}</p>
                  <p className="text-gray-500 text-xs italic">Filed. HR thanks you for your vigilance.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitAccusation} className="space-y-3">
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
                You joined mid-cycle. HR will assign you next investigation.
              </p>
            )}
            <p className="text-gray-500 text-xs">
              {accFiledCount} of {reporters.length} reports received. Everyone gets investigated.
            </p>
          </div>
        )}

        {/* reframing */}
        {phase === "reframing" && (
          <div className="text-center py-6">
            <p className="text-4xl mb-3 animate-pulse">🗂️</p>
            <p className="text-gray-300">HR is rewording every complaint into official language.</p>
            <p className="text-gray-500 text-xs mt-2">You&apos;ll see the version written about you next.</p>
          </div>
        )}

        {/* interview */}
        {phase === "interview" && (
          <div className="space-y-4">
            {hasExplained ? (
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Your statement to HR
                </p>
                <p className="text-sm text-gray-300 mb-2">{explanations[playerId]}</p>
                <p className="text-gray-500 text-xs italic">
                  Submitted. {explainedCount} of {players.length} interviewed.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitExplanation} className="space-y-3">
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
            )}
            <p className="text-gray-500 text-xs">
              {explainedCount} of {players.length} employees interviewed.
            </p>
          </div>
        )}

        {/* case_prep */}
        {phase === "case_prep" && (
          <div className="text-center py-6">
            <p className="text-4xl mb-3 animate-pulse">⚖️</p>
            <p className="text-gray-300">HR is weighing the evidence and drafting policy.</p>
            <p className="text-gray-500 text-xs mt-2">
              A ruling and a new Company Guideline are incoming.
            </p>
          </div>
        )}

        {/* a_stance */}
        {phase === "a_stance" && (
          <div>
            <SpectrumHeader
              question={currentCase?.spectrumQuestion ?? ""}
              leftLabel={currentCase?.leftLabel ?? ""}
              rightLabel={currentCase?.rightLabel ?? ""}
            />
            {isRater ? (
              <form onSubmit={handleSubmitStance} className="space-y-5">
                <ActionBanner tone="blue">
                  <p className="font-semibold">
                    Management would like to hear your feedback on the new policy.
                  </p>
                  <p className="text-xs opacity-80 mt-1">
                    Privately mark where you land. Your colleagues will try to guess your rating —
                    it stays secret until the reveal.
                  </p>
                </ActionBanner>
                <StanceSlider
                  value={stanceInput}
                  onChange={setStanceInput}
                  leftLabel={currentCase?.leftLabel ?? ""}
                  rightLabel={currentCase?.rightLabel ?? ""}
                />
                <button
                  type="submit"
                  disabled={isStancing}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isStancing ? "Locking in..." : "Lock In My Rating"}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  <span className="font-semibold text-white">{rater?.name ?? "A reviewer"}</span>{" "}
                  is rating the new policy.
                </p>
                <p className="text-gray-500 text-xs mt-2">Get ready to guess where they land.</p>
              </div>
            )}
          </div>
        )}

        {/* a_guess */}
        {phase === "a_guess" && (
          <div>
            <SpectrumHeader
              question={currentCase?.spectrumQuestion ?? ""}
              leftLabel={currentCase?.leftLabel ?? ""}
              rightLabel={currentCase?.rightLabel ?? ""}
            />
            <div className="text-center py-3 bg-gray-900 rounded-lg mb-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Reviewer</p>
              <p className="text-2xl font-bold text-white">{rater?.name ?? "The reviewer"}</p>
              <p className="text-gray-500 text-xs mt-1">Guess where they rated the new policy.</p>
            </div>
            {isRater ? (
              <div className="text-center py-4">
                <p className="text-gray-300">Your colleagues are reading you. Sit still.</p>
                <p className="text-gray-500 text-xs mt-2">
                  {guessedCount} of {guessers.length} guesses submitted.
                </p>
              </div>
            ) : hasGuessed ? (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-1">Your guess:</p>
                <p className="text-3xl font-bold text-green-400">{guesses[playerId]}</p>
                <p className="text-gray-500 text-xs mt-2">
                  {guessedCount} of {guessers.length} guesses in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitGuess} className="space-y-4">
                <p className="text-gray-400 text-sm">Where did {rater?.name ?? "the reviewer"} land?</p>
                <StanceSlider
                  value={guessInput}
                  onChange={setGuessInput}
                  leftLabel={currentCase?.leftLabel ?? ""}
                  rightLabel={currentCase?.rightLabel ?? ""}
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

        {/* b_comment */}
        {phase === "b_comment" && (
          <div>
            <ActionBanner tone="blue">
              <p className="font-semibold">💬 The policy has been posted company-wide.</p>
              <p className="text-xs opacity-80 mt-1">
                Reply with a comment — and <span className="font-semibold">@tag</span> whoever you
                think this policy was written about. Correct tags score +{ATMENTION_BONUS}.
              </p>
            </ActionBanner>

            {hasCommented ? (
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Your comment</p>
                <p className="text-sm text-gray-300 mb-2">
                  <CommentText text={comments[playerId]} players={players} />
                </p>
                <p className="text-gray-500 text-xs italic">
                  Posted. {commentedCount} of {players.length} have commented.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitComment} className="space-y-3">
                <MentionTextarea
                  value={commentInput}
                  onChange={setCommentInput}
                  players={players}
                  maxLength={240}
                  placeholder="Reply to the company post... type @ to tag who it's about"
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
              {commentedCount} of {players.length} employees have commented.
            </p>
          </div>
        )}

        {/* b_vote */}
        {phase === "b_vote" && (
          <div>
            {currentCase?.guideline && <GuidelineCard guideline={currentCase.guideline} />}
            {hasVoted ? (
              <div className="text-center py-4">
                <p className="text-gray-300">Vote submitted.</p>
                <p className="text-gray-500 text-xs mt-2">
                  {votedCount} of {players.length} votes in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitVote} className="space-y-4">
                <p className="text-sm font-semibold text-gray-200">Vote for the funniest comment</p>
                <div className="space-y-2">
                  {players
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
                            <CommentText text={comments[p.id]} players={players} />
                          </span>
                        </button>
                      );
                    })}
                </div>
                <button
                  type="submit"
                  disabled={isVoting || !voteFor}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isVoting ? "Submitting..." : !voteFor ? "Pick a comment to vote" : "Submit Vote"}
                </button>
              </form>
            )}
            <p className="text-gray-500 text-xs mt-3">
              {votedCount} of {players.length} votes in.
            </p>
          </div>
        )}

        {/* reveal */}
        {phase === "reveal" && lastRound && (
          <RevealPanel
            lastRound={lastRound}
            standings={standings}
            players={players}
            playerId={playerId}
            accusedId={currentCase?.accusedId ?? null}
          />
        )}

        {/* game_over */}
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
                <p className="text-gray-400 text-sm mt-1">{standings[0].score} Performance Points</p>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Final Standings</h3>
              <ul className="space-y-1">
                {standings.map((s, i) => (
                  <li
                    key={s.id}
                    className={`flex justify-between text-sm py-1.5 px-3 rounded ${
                      i === 0 ? "bg-amber-900/30 border border-amber-800" : "bg-gray-900"
                    }`}
                  >
                    <span className="text-gray-300">
                      {i + 1}. {s.name}
                      {s.id === playerId && <span className="text-gray-500 text-xs"> (you)</span>}
                    </span>
                    <span className="font-semibold text-gray-300">{s.score}</span>
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
// Reveal panel — "case closed"
// ============================================================================

function RevealPanel({
  lastRound,
  standings,
  players,
  playerId,
  accusedId,
}: {
  lastRound: PRLastRound;
  standings: Array<{ id: string; name: string; score: number; roundDelta: number }>;
  players: Array<{ id: string; name: string }>;
  playerId: string;
  accusedId: string | null;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-gray-900 rounded-lg p-4 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            Player HR report · filed by {lastRound.reporterName || "HR"}
          </p>
          <p className="text-sm text-gray-200">
            “{lastRound.rawAccusation || "No report on record."}”
          </p>
        </div>
        {lastRound.accusation && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Manager / AI feedback from the HR report
            </p>
            <p className="text-sm text-gray-300">“{lastRound.accusation}”</p>
          </div>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">The accused</p>
          <p className="text-lg font-bold text-white">{lastRound.accusedName}</p>
        </div>
        {lastRound.explanation && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Player response to the accusation
            </p>
            <p className="text-sm text-gray-300 italic">“{lastRound.explanation}”</p>
          </div>
        )}
      </div>

      <GuidelineCard guideline={lastRound.guideline} />

      {lastRound.challenge === "spectrum" &&
      lastRound.spectrumResults &&
      lastRound.stance !== undefined ? (
        <div className="space-y-3">
          <div className="text-center">
            <span className="inline-block px-4 py-1 rounded-full text-sm font-bold bg-yellow-500 text-gray-900">
              {lastRound.raterName} · {lastRound.stance}
            </span>
            <p className="text-gray-500 text-xs mt-2">{lastRound.spectrumQuestion}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <SpectrumBar
              leftLabel={lastRound.leftLabel ?? ""}
              rightLabel={lastRound.rightLabel ?? ""}
              stance={lastRound.stance}
              raterName={lastRound.raterName ?? "Reviewer"}
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
                r.id === accusedId ? "bg-red-950/30 border-red-800" : "bg-gray-900 border-gray-700"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">
                  {r.name}
                  {r.id === accusedId && <span className="text-red-400"> · the accused</span>}
                </p>
                <p className="text-xs text-gray-400 whitespace-nowrap">
                  🗳️ {r.votes} · +{r.commentPoints + r.atBonus} pts
                </p>
              </div>
              <p className="text-sm text-gray-200 mt-1">
                <CommentText text={r.comment} players={players} />
              </p>
              {r.taggedName && (
                <p
                  className={`text-[11px] mt-1 ${
                    r.atBonus > 0
                      ? "text-green-400"
                      : r.guessedTarget
                      ? "text-gray-500"
                      : "text-gray-500"
                  }`}
                >
                  Tagged @{r.taggedName}
                  {r.atBonus > 0 && ` — correct! (+${r.atBonus})`}
                  {r.guessedTarget && !r.eligibleForBonus && " — already in the know, no bonus"}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Performance Points</h3>
        <ul className="space-y-1">
          {standings.map((s, i) => (
            <li
              key={s.id}
              className="flex justify-between items-center text-sm py-1.5 px-3 bg-gray-900 rounded"
            >
              <span className="text-gray-300">
                {i + 1}. {s.name}
                {s.id === accusedId && <span className="text-gray-500 text-xs"> (accused)</span>}
                {s.id === playerId && <span className="text-gray-500 text-xs"> (you)</span>}
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
