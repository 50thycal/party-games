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
import {
  ACCUSATION_SHADE,
  BANTER_LINES,
  B_VOTE_TERMINAL,
  CASE_PREP_LINES,
  FALLBACK_GUIDELINES,
  FALLBACK_HR_RESPONSES,
  FALLBACK_NUDGES,
  FALLBACK_SPECTRUMS,
  GUIDELINE_CARD_LABEL,
  HEAT_DESCRIPTIONS,
  INTERVIEW_SHADE,
  LOBBY_EXPLAINER,
  LOBBY_TERMINAL_LINES,
  MIN_HEADCOUNT_LABEL,
  ORIENTATION_BEGIN_LABEL,
  ORIENTATION_NEXT_LABEL,
  ORIENTATION_NONHOST_HINT,
  ORIENTATION_PREPARING_LABEL,
  ORIENTATION_WAIVE_LABEL,
  REFRAMING_LINES,
  REPORT_FILED_LINES,
  ROUND_OPENINGS,
  WAIVE_LINES,
  buildOrientationModules,
  fallbackFinal,
  fallbackIntro,
  fallbackReframe,
  pickStable,
  rosterStatus,
} from "./copy";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// The narrator reads a touch quicker than a ceremonial monotone (client-side so
// it works regardless of the TTS model's speed support).
const SPEECH_RATE = 1.2;
// Terminal print is held back this long for spoken lines, to meet the voice.
const SPEECH_TEXT_DELAY_MS = 800;
// Phases where the narrator fills the wait with ambient banter.
const BANTER_PHASES = new Set([
  "accusation",
  "interview",
  "a_stance",
  "a_guess",
  "b_comment",
  "b_vote",
]);

const HEAT_OPTIONS: Array<{ value: PRHeat; label: string; desc: string }> = [
  { value: "mild", label: "Mild", desc: HEAT_DESCRIPTIONS.mild },
  { value: "spicy", label: "Spicy", desc: HEAT_DESCRIPTIONS.spicy },
  { value: "scorched", label: "Scorched", desc: HEAT_DESCRIPTIONS.scorched },
];

const CHALLENGE_LABEL: Record<PRChallenge, string> = {
  spectrum: "Spectrum Review",
  thread: "Guideline Thread",
};

// Orientation module count is fixed; the modules themselves are built per room
// so the briefing can address the actual roster.
const ORIENTATION_MODULE_COUNT = 4;

// ============================================================================
// Small presentational helpers
// ============================================================================

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// `delayMs` holds the print back a beat so the text lands roughly when the
// spoken line begins (TTS has fetch latency), keeping voice and terminal in sync.
function useTypewriter(text: string, delayMs = 0): string {
  const [len, setLen] = useState(0);
  useEffect(() => {
    setLen(0);
    if (!text) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const startTimer = setTimeout(() => {
      interval = setInterval(() => {
        setLen((l) => (l >= text.length ? l : l + 2));
      }, 24);
    }, delayMs);
    return () => {
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
    };
  }, [text, delayMs]);
  return text.slice(0, Math.min(len, text.length));
}

function Terminal({
  to,
  text,
  live,
  delayMs = 0,
}: {
  to: string;
  text: string;
  live?: boolean;
  delayMs?: number;
}) {
  const shown = useTypewriter(text, delayMs);
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
        {GUIDELINE_CARD_LABEL}
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
            Identify a coworker
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
    ORIENTATION_MODULE_COUNT - 1
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
      investigationRound,
      totalInvestigationRounds,
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
    (async () => {
      const json = await fetchHost(buildHostRequest("final"));
      const text =
        json && typeof json.commentary === "string" && json.commentary.trim()
          ? (json.commentary as string)
          : fallbackFinal(standings[0]?.name);
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
  // Skipping orientation earns a witty aside; hold the start a beat so it plays
  // before the first assignment is read.
  const handleWaive = async () => {
    if (voiceEnabled && isAudioDevice) {
      void speakNow(pick(WAIVE_LINES), voiceIdRef.current, { priority: "high" });
      await withFlag(
        setIsProceeding,
        () => new Promise<void>((r) => setTimeout(r, 2600))
      );
    }
    await handleBegin();
  };
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

  // Ambient rotation drives the "guessing" nudges and the host's shade while
  // employees write reports and statements — so the terminal is never dead air.
  const [nudgeIdx, setNudgeIdx] = useState(0);
  useEffect(() => {
    if (phase !== "a_guess" && phase !== "accusation" && phase !== "interview") return;
    const interval = setInterval(() => setNudgeIdx((i) => i + 1), 8000);
    return () => clearInterval(interval);
  }, [phase]);
  const nudgePool = nudges.length > 0 ? nudges : FALLBACK_NUDGES;
  const currentNudge = nudgePool[nudgeIdx % nudgePool.length];
  const accusationShade = ACCUSATION_SHADE[nudgeIdx % ACCUSATION_SHADE.length];
  const interviewShade = INTERVIEW_SHADE[nudgeIdx % INTERVIEW_SHADE.length];

  const ALL = "All staff";
  // Deterministic seeds so waiting copy is stable across the 1s polling loop.
  const roomSeed = room.roomCode;
  const phaseSeed = `${roomSeed}:${investigationRound}:${challengeIndex}`;

  function terminalContent(): { to: string; text: string; speak: string; speakKey: string } {
    const silent = (to: string, text: string) => ({ to, text, speak: "", speakKey: "" });
    switch (phase) {
      case "lobby":
        return silent(ALL, pickStable(LOBBY_TERMINAL_LINES, roomSeed));
      case "intro":
        return introText
          ? { to: ALL, text: introText, speak: introText, speakKey: `intro:${introText}` }
          : silent(ALL, "Establishing secure channel to management...");
      case "accusation": {
        const openerText =
          investigationRound > 1 && ROUND_OPENINGS[investigationRound]
            ? ROUND_OPENINGS[investigationRound]
            : "";
        const opener = openerText ? `${openerText}\n\n` : "";
        if (!myAssignment) {
          return silent(
            myName,
            `${opener}No report has been assigned to you this cycle. Remain available.`
          );
        }
        // Filed already: the host fills the wait with shade at the room.
        if (hasAccused) return silent(myName, accusationShade);
        // Assignment + any cycle opener are public announcements — read aloud.
        const text = `${opener}HR REPORT — RE: ${myAssignment.subjectName}.\n${myQuestion ?? ""}`;
        return {
          to: myName,
          text,
          speak: `${openerText ? openerText + " " : ""}HR report. Regarding ${myAssignment.subjectName}. ${myQuestion ?? ""}`,
          speakKey: `accuse:${investigationRound}:${playerId}`,
        };
      }
      case "reframing":
        return silent(ALL, pickStable(REFRAMING_LINES, phaseSeed));
      case "interview":
        // Statement in: the host passes the time with shade at the room.
        return hasExplained
          ? silent(myName, interviewShade)
          : myReframe
          ? silent(
              myName,
              `You have been named in a workplace observation:\n"${myReframe}"\n\nManagement is offering you space to clarify.`
            )
          : silent(myName, "Your record is being retrieved.");
      case "case_prep":
        return silent(ALL, pickStable(CASE_PREP_LINES, phaseSeed));
      case "a_stance":
      case "b_comment":
        return currentCase?.guideline
          ? {
              to: ALL,
              text: `NEW COMPANY GUIDELINE:\n${currentCase.guideline}`,
              speak: `A new company guideline is in effect. ${currentCase.guideline}`,
              speakKey: `guideline:${investigationRound}:${challengeIndex}`,
            }
          : silent(ALL, "A guideline is being prepared.");
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
        return silent(ALL, B_VOTE_TERMINAL);
      case "reveal":
        return currentCase?.hrResponse
          ? {
              to: ALL,
              text: currentCase.hrResponse,
              speak: currentCase.hrResponse,
              speakKey: `reveal:${investigationRound}:${challengeIndex}`,
            }
          : silent(ALL, "The ruling is being finalized.");
      case "game_over":
        return finalCommentary
          ? { to: ALL, text: finalCommentary, speak: finalCommentary, speakKey: `final:${finalCommentary}` }
          : silent(ALL, "Final assessments are being compiled.");
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
  // A high-priority utterance (intro, assignment, guideline, ruling, orientation,
  // waive line) blocks low-priority banter from starting. Tokened so a stale
  // onended can't clear a newer utterance's flag.
  const highPlayingRef = useRef(false);
  const playTokenRef = useRef(0);

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
    playTokenRef.current++;
    highPlayingRef.current = false;
  }
  // Fetch + play one line. Returns true only once playback has actually started,
  // so the caller can decide whether to mark the message as spoken. A transient
  // TTS failure retries a couple of times before giving up — important because
  // the guideline and the case-closed ruling are the beats the room most needs
  // to hear, and a single dropped request used to silence them permanently.
  // Low-priority calls (ambient banter) refuse to start while a high-priority
  // utterance is playing, so they never talk over a ruling or a guideline.
  async function speakNow(
    text: string,
    voice: string,
    opts: { priority?: "high" | "low" } = {}
  ): Promise<boolean> {
    const priority = opts.priority ?? "high";
    const ctx = getAudioCtx();
    if (!ctx) return false;
    if (priority === "low" && highPlayingRef.current) return false;

    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    const token = ++playTokenRef.current;
    if (priority === "high") highPlayingRef.current = true;
    const clearHigh = () => {
      if (priority === "high" && playTokenRef.current === token) {
        highPlayingRef.current = false;
      }
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      if (controller.signal.aborted) {
        clearHigh();
        return false;
      }
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          clearHigh();
          return false;
        }
        if (!res.ok) {
          // 503 (no key) is permanent — do not retry. Others may be transient.
          if (res.status === 503) {
            clearHigh();
            return false;
          }
          throw new Error(`speak ${res.status}`);
        }
        const arr = await res.arrayBuffer();
        if (controller.signal.aborted) {
          clearHigh();
          return false;
        }
        const audioBuf = await ctx.decodeAudioData(arr);
        if (controller.signal.aborted) {
          clearHigh();
          return false;
        }
        // The context can suspend between messages (tab blur, iOS); resume it
        // right before playback so a later guideline/ruling still sounds.
        if (ctx.state === "suspended") await ctx.resume();
        try {
          sourceRef.current?.stop();
        } catch {
          /* none playing */
        }
        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        src.playbackRate.value = SPEECH_RATE;
        src.connect(ctx.destination);
        src.onended = clearHigh;
        sourceRef.current = src;
        src.start(0);
        return true;
      } catch {
        if (controller.signal.aborted) {
          clearHigh();
          return false;
        }
        // brief backoff, then retry
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    clearHigh();
    return false;
  }
  useEffect(() => {
    if (!voiceEnabled || !isAudioDevice || !terminal.speakKey || !terminal.speak) return;
    if (spokenKeyRef.current === terminal.speakKey) return;
    const key = terminal.speakKey;
    // Reserve the key so the 1s poll re-render doesn't launch a duplicate while
    // this request is in flight; clear it again if playback never starts, so a
    // failure can be retried when state next changes.
    spokenKeyRef.current = key;
    void speakNow(terminal.speak, voiceIdRef.current).then((played) => {
      if (!played && spokenKeyRef.current === key) spokenKeyRef.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal.speakKey, voiceEnabled, isAudioDevice]);
  useEffect(() => {
    if (!voiceEnabled) stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);
  useEffect(() => () => stopSpeaking(), []);

  // Read each orientation module aloud as the host advances. Module 1 (step 0)
  // is covered by the spoken opening address; steps 1-3 carry the mechanics.
  const orientationModules = buildOrientationModules(players.map((p) => p.name));
  useEffect(() => {
    if (phase !== "intro" || !voiceEnabled || !isAudioDevice) return;
    if (tutorialStep < 1) return;
    const mod = orientationModules[tutorialStep];
    if (!mod) return;
    const key = `orient:${tutorialStep}`;
    if (spokenKeyRef.current === key) return;
    spokenKeyRef.current = key;
    void speakNow(`${mod.title}. ${mod.body}`, voiceIdRef.current).then((played) => {
      if (!played && spokenKeyRef.current === key) spokenKeyRef.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tutorialStep, voiceEnabled, isAudioDevice]);

  // ==========================================================================
  // Ambient narrator banter — spoken on a loose 11-24s cadence during the
  // working phases, low priority so it never steps on a guideline or ruling.
  // A batch is fetched from the AI (referencing what players just wrote) and
  // refreshed periodically; the static pool is the offline / pre-fetch baseline.
  // ==========================================================================
  const aiBanterRef = useRef<string[]>([]);
  const lastBanterRef = useRef<string>("");

  // Latest banter context, refreshed every render so periodic refetches see new
  // submissions without re-subscribing the effect.
  const banterCtxRef = useRef<{ phase: string; snippets: string[] }>({
    phase,
    snippets: [],
  });
  const truncSnip = (s: string) => s.trim().slice(0, 140);
  let banterSnippets: string[] = [];
  if (phase === "accusation") {
    banterSnippets = Object.values(accusations).map(truncSnip).slice(-8);
  } else if (phase === "interview") {
    banterSnippets = Object.values(explanations).map(truncSnip).slice(-8);
  } else if (phase === "b_comment" || phase === "b_vote") {
    banterSnippets = Object.values(comments).map(truncSnip).slice(-8);
  } else if (phase === "a_stance" || phase === "a_guess") {
    banterSnippets = [
      ...(currentCase?.guideline ? [truncSnip(currentCase.guideline)] : []),
      ...Object.values(accusations).map(truncSnip),
    ].slice(-8);
  }
  banterCtxRef.current = { phase, snippets: banterSnippets };

  // Fetch (and periodically refresh) the AI banter batch for this phase.
  useEffect(() => {
    aiBanterRef.current = [];
    if (!voiceEnabled || !isAudioDevice || !BANTER_PHASES.has(phase)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      const { phase: bphase, snippets } = banterCtxRef.current;
      const json = await fetchHost({
        ...buildHostRequest("resolve"),
        kind: "banter",
        banterPhase: bphase,
        snippets,
      });
      if (!cancelled && json && Array.isArray(json.lines)) {
        const lines = (json.lines as unknown[]).filter(
          (l): l is string => typeof l === "string" && l.trim().length > 0
        );
        if (lines.length > 0) aiBanterRef.current = lines;
      }
      if (!cancelled) timer = setTimeout(run, 35000);
    };
    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceEnabled, isAudioDevice]);

  // Speak one banter line every 11-24s while in a working phase.
  useEffect(() => {
    if (!voiceEnabled || !isAudioDevice || !BANTER_PHASES.has(phase)) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const pool =
        aiBanterRef.current.length > 0
          ? [...aiBanterRef.current, ...BANTER_LINES]
          : BANTER_LINES;
      // avoid repeating the previous line back-to-back
      let line = pool[Math.floor(Math.random() * pool.length)];
      for (let i = 0; i < 4 && line === lastBanterRef.current; i++) {
        line = pool[Math.floor(Math.random() * pool.length)];
      }
      lastBanterRef.current = line;
      void speakNow(line, voiceIdRef.current, { priority: "low" });
      timer = setTimeout(tick, 11000 + Math.random() * 13000);
    };
    // first line a few seconds in, so it doesn't collide with a phase-entry beat
    timer = setTimeout(tick, 5000 + Math.random() * 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceEnabled, isAudioDevice]);

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
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="font-semibold">Management Console</h2>
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              Facilitator access
            </p>
          </div>

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
                <p className="text-gray-400 text-sm mb-2">Select review intensity:</p>
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
                  ? "Convening the department..."
                  : players.length < 3
                  ? MIN_HEADCOUNT_LABEL
                  : "Open the Investigation"}
              </button>
            </div>
          )}

          {phase === "intro" && (
            <p className="text-gray-500 text-xs">
              Orientation controls are attached to the module below.
            </p>
          )}

          {phase === "accusation" && (
            <button
              onClick={handleCloseAccusation}
              disabled={isClosingAcc || accFiledCount === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isClosingAcc
                ? "Sealing reports..."
                : `Seal Reports (${accFiledCount}/${reporters.length} received)`}
            </button>
          )}

          {phase === "reframing" && (
            <button
              onClick={handleForceReframe}
              disabled={isForcingReframe}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isForcingReframe
                ? "Applying standard wording..."
                : "Processing stalled? Apply standard wording"}
            </button>
          )}

          {phase === "interview" && (
            <button
              onClick={handleSkipInterview}
              disabled={isSkipping}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isSkipping
                ? "Closing interviews..."
                : `Close Interviews (${explainedCount}/${players.length} statements in)`}
            </button>
          )}

          {phase === "case_prep" && (
            <button
              onClick={handleForceResolve}
              disabled={isForcingResolve || !!currentCase?.guideline}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isForcingResolve
                ? "Issuing standing ruling..."
                : "Deliberation stalled? Issue a standing ruling"}
            </button>
          )}

          {phase === "a_stance" && (
            <p className="text-gray-400 text-sm">
              Awaiting policy feedback from{" "}
              <span className="text-white font-semibold">{rater?.name ?? "the reviewer"}</span>.
            </p>
          )}

          {phase === "a_guess" && (
            <button
              onClick={handleForceReveal}
              disabled={isRevealing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isRevealing
                ? "Compiling findings..."
                : `Close Estimates & Reveal (${guessedCount}/${guessers.length} in)`}
            </button>
          )}

          {phase === "b_comment" && (
            <button
              onClick={handleCloseComments}
              disabled={isClosingComments || commentedCount === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isClosingComments
                ? "Locking the thread..."
                : `Close Thread & Open Voting (${commentedCount}/${players.length} posted)`}
            </button>
          )}

          {phase === "b_vote" && (
            <button
              onClick={handleForceReveal}
              disabled={isRevealing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isRevealing
                ? "Tallying recognition..."
                : `Close Voting & Tally (${votedCount}/${players.length} in)`}
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
                  ? `Authorize Reporting Cycle ${investigationRound + 1}`
                  : "Conclude the Investigation"
                : "Open the Next Case"}
            </button>
          )}

          {phase === "game_over" && (
            <button
              onClick={handlePlayAgain}
              disabled={isResetting}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isResetting ? "Reconvening..." : "Reconvene — New Cycle"}
            </button>
          )}
        </section>
      )}

      <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
        {phase !== "lobby" && phase !== "intro" && (
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-mono">
            CYCLE {investigationRound}/{totalInvestigationRounds}
            {phase === "accusation" || phase === "reframing" || phase === "interview"
              ? " · CASE INTAKE"
              : ` · CASE ${String(Math.min(challengeIndex + 1, totalCases)).padStart(2, "0")}/${String(totalCases).padStart(2, "0")} · ${CHALLENGE_LABEL[challenge].toUpperCase()}`}
            {" · "}INTENSITY: {heat.toUpperCase()} · ROOM {room.roomCode}
          </p>
        )}

        <h2 className="font-semibold mb-4">
          {phase === "lobby" && "HR Investigation"}
          {phase === "intro" && "Personnel Orientation"}
          {phase === "accusation" && "Peer Documentation"}
          {phase === "reframing" && "Processing Statements"}
          {phase === "interview" && "Employee Response"}
          {phase === "case_prep" && "Case Preparation"}
          {phase === "a_stance" && "Spectrum Review"}
          {phase === "a_guess" && "Spectrum Review"}
          {phase === "b_comment" && "Guideline Thread"}
          {phase === "b_vote" && "Peer Recognition Vote"}
          {phase === "reveal" && "Case Closed"}
          {phase === "game_over" && "Final Review"}
        </h2>

        <Terminal
          to={terminal.to}
          text={terminal.text}
          live={voiceEnabled}
          delayMs={
            voiceEnabled && isAudioDevice && terminal.speak ? SPEECH_TEXT_DELAY_MS : 0
          }
        />

        {/* lobby */}
        {phase === "lobby" && (
          <p className="text-gray-500 text-xs">{LOBBY_EXPLAINER}</p>
        )}

        {/* intro — Personnel Orientation, administered by the host */}
        {phase === "intro" &&
          (() => {
            const modules = buildOrientationModules(players.map((p) => p.name));
            const mod = modules[tutorialStep];
            return (
              <div className="space-y-4">
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between gap-3 mb-3 font-mono">
                    <p className="text-[10px] uppercase tracking-widest text-blue-300">
                      {mod.procedureId}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500">
                      {mod.tag}
                    </p>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{mod.title}</h3>
                  <p className="text-sm text-gray-300 mb-4">{mod.body}</p>

                  {mod.kind === "roster" ? (
                    <div className="bg-black/40 border border-gray-700 rounded-lg p-3 font-mono">
                      <p className="text-[10px] uppercase tracking-widest text-green-500 mb-2">
                        Personnel manifest
                      </p>
                      <ul className="space-y-1">
                        {players.map((p, i) => (
                          <li
                            key={p.id}
                            className="flex items-baseline justify-between gap-3 text-xs"
                          >
                            <span className="text-green-200">
                              {p.name}
                              {p.id === playerId && (
                                <span className="text-green-700"> (you)</span>
                              )}
                            </span>
                            <span className="text-green-600 tracking-wider whitespace-nowrap">
                              {rosterStatus(p.name, i, room.roomCode, players.length)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="bg-black/40 border border-gray-700 rounded-lg p-3 font-mono">
                      <p className="text-[10px] uppercase tracking-widest text-green-500 mb-2">
                        {mod.mockTitle}
                      </p>
                      <p className="text-xs text-green-200 whitespace-pre-wrap">
                        {mod.mockBody}
                      </p>
                    </div>
                  )}
                </div>

                {isHost ? (
                  <div className="space-y-2">
                    <button
                      onClick={() =>
                        tutorialStep < ORIENTATION_MODULE_COUNT - 1
                          ? handleTutorialStep(tutorialStep + 1)
                          : handleBegin()
                      }
                      disabled={isProceeding || !introText}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      {!introText
                        ? ORIENTATION_PREPARING_LABEL
                        : isProceeding
                        ? "Opening case intake..."
                        : tutorialStep < ORIENTATION_MODULE_COUNT - 1
                        ? ORIENTATION_NEXT_LABEL
                        : ORIENTATION_BEGIN_LABEL}
                    </button>
                    <button
                      onClick={handleWaive}
                      disabled={isProceeding || !introText}
                      className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      {ORIENTATION_WAIVE_LABEL}
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500 text-xs text-center">
                    {ORIENTATION_NONHOST_HINT}
                  </p>
                )}
              </div>
            );
          })()}

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
                  <p className="text-gray-500 text-xs italic">
                    {pickStable(REPORT_FILED_LINES, `${phaseSeed}:${playerId}`)}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitAccusation} className="space-y-3">
                  <textarea
                    value={accusationInput}
                    onChange={(e) => setAccusationInput(e.target.value)}
                    maxLength={280}
                    rows={3}
                    placeholder={`Document the incident involving ${myAssignment.subjectName}. Be specific.`}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isAccusing || !accusationInput.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    {isAccusing ? "Filing..." : "File HR Report"}
                  </button>
                  <p className="text-gray-600 text-xs italic text-center pt-1">
                    {accusationShade}
                  </p>
                </form>
              )
            ) : (
              <p className="text-gray-500 text-xs text-center">
                You joined mid-cycle. An assignment will be issued next cycle.
              </p>
            )}
            <p className="text-gray-500 text-xs">
              {accFiledCount} of {reporters.length} reports received. Everyone is investigated eventually.
            </p>
          </div>
        )}

        {/* reframing */}
        {phase === "reframing" && (
          <div className="text-center py-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-3">
              <span className="animate-pulse">▌</span> STATUS: PROCESSING
            </p>
            <p className="text-gray-300">
              Every complaint is being converted into approved language.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              You will be shown the version written about you shortly.
            </p>
          </div>
        )}

        {/* interview */}
        {phase === "interview" && (
          <div className="space-y-4">
            {hasExplained ? (
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Your statement, as retained
                </p>
                <p className="text-sm text-gray-300 mb-2">{explanations[playerId]}</p>
                <p className="text-gray-500 text-xs italic">
                  Your statement has been added to the appropriate record.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitExplanation} className="space-y-3">
                <textarea
                  value={explanationInput}
                  onChange={(e) => setExplanationInput(e.target.value)}
                  maxLength={400}
                  rows={4}
                  placeholder="Provide the version of events you would prefer retained..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
                <button
                  type="submit"
                  disabled={isExplaining || !explanationInput.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {isExplaining ? "Submitting..." : "Submit Statement"}
                </button>
                <p className="text-gray-600 text-xs italic text-center pt-1">
                  {interviewShade}
                </p>
              </form>
            )}
            <p className="text-gray-500 text-xs">
              {explainedCount} of {players.length} statements received. Silence may be
              interpreted as confidence.
            </p>
          </div>
        )}

        {/* case_prep */}
        {phase === "case_prep" && (
          <div className="text-center py-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mb-3">
              <span className="animate-pulse">▌</span> STATUS: IN DELIBERATION
            </p>
            <p className="text-gray-300">
              Management is reviewing both versions of events and selecting the useful one.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              A ruling and a new Company Guideline will follow.
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
                    Mark your position privately. Your colleagues will estimate it. Your
                    response may be considered.
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
                  {isStancing ? "Recording feedback..." : "Submit Policy Feedback"}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  <span className="font-semibold text-white">{rater?.name ?? "A reviewer"}</span>{" "}
                  has been selected to provide feedback on the new policy.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  You will estimate their position shortly. Remain available.
                </p>
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
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                Feedback on file from
              </p>
              <p className="text-2xl font-bold text-white">{rater?.name ?? "The reviewer"}</p>
              <p className="text-gray-500 text-xs mt-1">
                Estimate their position. Accuracy is a performance metric.
              </p>
            </div>
            {isRater ? (
              <div className="text-center py-4">
                <p className="text-gray-300">
                  Your colleagues are estimating your position. Remain still and recognizable.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  {guessedCount} of {guessers.length} estimates submitted.
                </p>
              </div>
            ) : hasGuessed ? (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-1">Your estimate has been recorded:</p>
                <p className="text-3xl font-bold text-green-400">{guesses[playerId]}</p>
                <p className="text-gray-500 text-xs mt-2">
                  {guessedCount} of {guessers.length} estimates in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitGuess} className="space-y-4">
                <p className="text-gray-400 text-sm">
                  Where did {rater?.name ?? "the reviewer"} place the policy?
                </p>
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
                  {isGuessing ? "Recording estimate..." : "Submit Estimate"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* b_comment */}
        {phase === "b_comment" && (
          <div>
            <ActionBanner tone="blue">
              <p className="font-semibold">The guideline has been posted to all staff.</p>
              <p className="text-xs opacity-80 mt-1">
                Add your comment to the thread, and use{" "}
                <span className="font-semibold">@</span> to identify the employee you believe
                caused this policy. Correct identification: +{ATMENTION_BONUS} Performance
                Points.
              </p>
            </ActionBanner>

            {hasCommented ? (
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Your contribution
                </p>
                <p className="text-sm text-gray-300 mb-2">
                  <CommentText text={comments[playerId]} players={players} />
                </p>
                <p className="text-gray-500 text-xs italic">
                  Posted. Edits are unnecessary. HR understood what you meant.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitComment} className="space-y-3">
                <MentionTextarea
                  value={commentInput}
                  onChange={setCommentInput}
                  players={players}
                  maxLength={240}
                  placeholder="Add your comment. Type @ to identify the responsible party."
                />
                <button
                  type="submit"
                  disabled={isCommenting || !commentInput.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {isCommenting ? "Posting..." : "Post to Thread"}
                </button>
              </form>
            )}
            <p className="text-gray-500 text-xs mt-3">
              {commentedCount} of {players.length} employees have contributed. Participation is
              noticed.
            </p>
          </div>
        )}

        {/* b_vote */}
        {phase === "b_vote" && (
          <div>
            {currentCase?.guideline && <GuidelineCard guideline={currentCase.guideline} />}
            {hasVoted ? (
              <div className="text-center py-4">
                <p className="text-gray-300">Your recognition has been recorded.</p>
                <p className="text-gray-500 text-xs mt-2">
                  {votedCount} of {players.length} votes in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitVote} className="space-y-4">
                <p className="text-sm font-semibold text-gray-200">
                  Vote for the funniest comment
                </p>
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
                            {isOwn && " (you — self-recognition is not recognized)"}
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
                  {isVoting
                    ? "Recording..."
                    : !voteFor
                    ? "Select a comment to recognize"
                    : "Submit Recognition"}
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
                <p className="text-[10px] text-amber-500/70 mt-1">
                  Further recognition will occur when appropriate.
                </p>
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
                The cycle is complete. The records are not. The host may reconvene the
                department.
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
            Original filing · submitted by {lastRound.reporterName || "HR"}
          </p>
          <p className="text-sm text-gray-200">
            “{lastRound.rawAccusation || "No report on record."}”
          </p>
        </div>
        {lastRound.accusation && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              As processed by HR
            </p>
            <p className="text-sm text-gray-300">“{lastRound.accusation}”</p>
          </div>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            Employee named
          </p>
          <p className="text-lg font-bold text-white">{lastRound.accusedName}</p>
        </div>
        {lastRound.explanation && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Employee statement
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
          <h3 className="text-sm font-semibold text-gray-300">Thread record</h3>
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
                  {r.id === accusedId && <span className="text-red-400"> · employee named</span>}
                </p>
                <p className="text-xs text-gray-400 whitespace-nowrap">
                  {r.votes} {r.votes === 1 ? "vote" : "votes"} · +{r.commentPoints + r.atBonus} pts
                </p>
              </div>
              <p className="text-sm text-gray-200 mt-1">
                <CommentText text={r.comment} players={players} />
              </p>
              {r.taggedName && (
                <p
                  className={`text-[11px] mt-1 ${
                    r.atBonus > 0 ? "text-green-400" : "text-gray-500"
                  }`}
                >
                  Identified @{r.taggedName}
                  {r.atBonus > 0 && ` — identification confirmed (+${r.atBonus})`}
                  {r.guessedTarget &&
                    !r.eligibleForBonus &&
                    " — prior knowledge; bonus withheld"}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">
          Performance Points — adjusted
        </h3>
        <ul className="space-y-1">
          {standings.map((s, i) => (
            <li
              key={s.id}
              className="flex justify-between items-center text-sm py-1.5 px-3 bg-gray-900 rounded"
            >
              <span className="text-gray-300">
                {i + 1}. {s.name}
                {s.id === accusedId && <span className="text-gray-500 text-xs"> (named)</span>}
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
