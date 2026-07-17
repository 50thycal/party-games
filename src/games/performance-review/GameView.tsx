"use client";

import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { GameViewProps } from "@/games/views";
import {
  ATMENTION_BONUS,
  FAVORITE_VOTE_PTS,
  MAX_BLACKOUT,
  MAX_REPLACEMENT_LENGTH,
  PR_VOICES,
  parseMention,
  reconstructGuideline,
  tokenizeGuideline,
} from "./config";
import type { PRCase, PRHeat, PRState } from "./config";
import {
  ACCUSATION_SHADE,
  BANTER_LINES,
  CASE_PREP_LINES,
  EDITING_BLACKOUT_HINT,
  EDITING_BLACKOUT_LABEL,
  EDITING_DONE_LINE,
  EDITING_REWRITE_HINT,
  EDITING_REWRITE_LABEL,
  EDITING_WAIT_LINES,
  FALLBACK_GUIDELINES,
  FALLBACK_GUIDELINE_COMMENTS,
  FALLBACK_HR_RESPONSES,
  FALLBACK_NUDGES,
  GUIDELINE_CARD_LABEL,
  HEAT_DESCRIPTIONS,
  HR_COMMENT_LABEL,
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
  REVEAL_COMMENT_HINT,
  REVEAL_POSTED_LINE,
  ROUND_OPENINGS,
  VOTE_TERMINAL,
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
const BANTER_PHASES = new Set(["accusation", "interview", "editing"]);

// Policy Revision timings.
const BLACKOUT_MS = 10_000; // window 1: redact
const REWRITE_MS = 20_000; // window 2: rewrite
const COMMENT_WINDOW_MS = 15_000; // comment window after a guideline is read

const HEAT_OPTIONS: Array<{ value: PRHeat; label: string; desc: string }> = [
  { value: "mild", label: "Mild", desc: HEAT_DESCRIPTIONS.mild },
  { value: "spicy", label: "Spicy", desc: HEAT_DESCRIPTIONS.spicy },
  { value: "scorched", label: "Scorched", desc: HEAT_DESCRIPTIONS.scorched },
];

// Orientation module count is fixed; the modules themselves are built per room
// so the briefing can address the actual roster.
const ORIENTATION_MODULE_COUNT = 4;

// ============================================================================
// Small presentational helpers
// ============================================================================

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

function GuidelineCard({
  guideline,
  label = GUIDELINE_CARD_LABEL,
}: {
  guideline: string;
  label?: string;
}) {
  return (
    <div className="bg-gradient-to-br from-indigo-950 to-gray-900 border border-indigo-700 rounded-lg p-4 mb-4">
      <p className="text-[10px] uppercase tracking-widest text-indigo-400 mb-1">{label}</p>
      <p className="text-base font-semibold text-indigo-100">{guideline}</p>
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

// Show a guideline with the Editor's redactions marked: removed words struck
// through, replacements highlighted.
function EditedGuideline({
  original,
  blackedOut,
  replacements,
}: {
  original: string;
  blackedOut: number[];
  replacements: Record<number, string>;
}) {
  const tokens = tokenizeGuideline(original);
  const bset = new Set(blackedOut);
  return (
    <p className="text-sm leading-relaxed">
      {tokens.map((tok, i) => {
        if (!bset.has(i)) return <span key={i}>{tok} </span>;
        const r = replacements[i];
        return (
          <span key={i}>
            <span className="line-through text-gray-600 mr-1">{tok}</span>
            {r ? <span className="text-amber-300 font-semibold">{r}</span> : null}{" "}
          </span>
        );
      })}
    </p>
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

  const revealIndex = gameState?.revealIndex ?? 0;
  const revealComments = gameState?.revealComments ?? {};
  const guidelineComments = gameState?.guidelineComments ?? {};
  const favorites = gameState?.favorites ?? {};

  const scores = gameState?.scores ?? {};
  const roundScores = gameState?.roundScores ?? {};

  const introText = gameState?.introText ?? null;
  const nudges = gameState?.nudges ?? [];
  const caseLog = gameState?.caseLog ?? [];
  const finalCommentary = gameState?.finalCommentary ?? null;

  const voiceEnabled = gameState?.voiceEnabled ?? false;
  const voiceId = gameState?.voiceId ?? "onyx";

  const players = room.players;
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

  // case_prep derived
  const guidelinesReady = cases.filter((c) => c.guideline).length;

  // editing derived — every employee edits exactly one guideline.
  const myEditIndex = cases.findIndex((c) => c.editorId === playerId);
  const myEditCase = myEditIndex >= 0 ? cases[myEditIndex] : null;
  const myHasEdited = myEditCase ? myEditCase.editedGuideline !== null : false;
  const editorsDone = cases.filter((c) => c.editedGuideline !== null).length;
  const editorsTotal = cases.filter((c) => c.editorId !== null).length;

  // reveal derived
  const revealCase: PRCase | null = cases[revealIndex] ?? null;
  const revealThread = revealComments[revealIndex] ?? {};
  const hasCommentedThis = revealThread[playerId] !== undefined;
  const hrComment = guidelineComments[revealIndex] ?? null;
  const revealedGuideline =
    revealCase?.editedGuideline ?? revealCase?.guideline ?? "";

  // voting derived
  const votableCases = cases
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.editorId !== playerId && (c.editedGuideline || c.guideline));
  const hasVotedFav = favorites[playerId] !== undefined;
  const favVotedCount = players.filter((p) => favorites[p.id] !== undefined).length;

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
  const [commentInput, setCommentInput] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [voteFor, setVoteFor] = useState<number | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  const [isProceeding, setIsProceeding] = useState(false);
  const [isClosingAcc, setIsClosingAcc] = useState(false);
  const [isForcingReframe, setIsForcingReframe] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isForcingResolve, setIsForcingResolve] = useState(false);
  const [isClosingEditing, setIsClosingEditing] = useState(false);
  const [isNextReveal, setIsNextReveal] = useState(false);
  const [isClosingVoting, setIsClosingVoting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // --- editing working state (the two windows) ---
  const [editStep, setEditStep] = useState<"blackout" | "rewrite">("blackout");
  const [blackedOut, setBlackedOut] = useState<Set<number>>(new Set());
  const [replacements, setReplacements] = useState<Record<number, string>>({});
  const [editDeadline, setEditDeadline] = useState(0);
  const blackedRef = useRef(blackedOut);
  blackedRef.current = blackedOut;
  const replRef = useRef(replacements);
  replRef.current = replacements;
  const submittingEditRef = useRef(false);

  // Reset comment/vote inputs when the phase or revealed guideline changes.
  useEffect(() => {
    setCommentInput("");
    setVoteFor(null);
  }, [phase, revealIndex, playerId]);

  // A coarse clock for the on-screen countdowns during timed phases.
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    if (phase !== "editing" && phase !== "reveal") return;
    setNowTs(Date.now());
    const iv = setInterval(() => setNowTs(Date.now()), 300);
    return () => clearInterval(iv);
  }, [phase]);

  const canDrive = room.mode !== "multiplayer" || isHost;

  // ==========================================================================
  // Editing — the two timed windows. Sequenced locally on each Editor's device;
  // auto-submits whatever they have when the rewrite window closes.
  // ==========================================================================
  async function submitEditNow() {
    if (submittingEditRef.current) return;
    submittingEditRef.current = true;
    const bo = Array.from(blackedRef.current);
    const repl: Record<number, string> = {};
    for (const i of bo) {
      const w = (replRef.current[i] ?? "").trim();
      if (w) repl[i] = w;
    }
    try {
      await dispatchAction("SUBMIT_EDIT", { blackedOut: bo, replacements: repl });
    } finally {
      // leave the guard set; myHasEdited flips and the UI moves on.
    }
  }
  useEffect(() => {
    if (phase !== "editing" || !myEditCase || myHasEdited) return;
    submittingEditRef.current = false;
    setBlackedOut(new Set());
    setReplacements({});
    setEditStep("blackout");
    setEditDeadline(Date.now() + BLACKOUT_MS);
    const t1 = setTimeout(() => {
      setEditStep("rewrite");
      setEditDeadline(Date.now() + REWRITE_MS);
    }, BLACKOUT_MS);
    const t2 = setTimeout(() => {
      void submitEditNow();
    }, BLACKOUT_MS + REWRITE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, myEditIndex, myHasEdited]);

  function toggleBlackout(i: number) {
    setBlackedOut((prev) => {
      const n = new Set(prev);
      if (n.has(i)) {
        n.delete(i);
      } else {
        if (n.size >= MAX_BLACKOUT) return prev;
        n.add(i);
      }
      return n;
    });
  }

  // ==========================================================================
  // AI integration helpers. The automatic beats run on the "compute device":
  // the host in multiplayer, or any client in hotseat/simulation (one device),
  // so pass-and-play never stalls waiting for the host seat.
  // ==========================================================================
  function reporterEntryFor(accusedId: string): [string, string] | null {
    for (const [reporterId, a] of Object.entries(assignments)) {
      if (a.subjectId === accusedId) {
        return [reporterId, accusations[reporterId] ?? ""];
      }
    }
    return null;
  }

  function buildHostRequest(
    kind: "intro" | "reframe" | "resolve" | "comment" | "final",
    opts: { caseIndex?: number; guideline?: string } = {}
  ) {
    const c = opts.caseIndex != null ? cases[opts.caseIndex] : null;
    return {
      kind,
      heat,
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
      accusedName: c?.accusedName ?? "",
      reporterName: c?.reporterName ?? "",
      accusation: c?.accusation ?? "",
      explanation: c?.explanation ?? "",
      guideline: opts.guideline ?? c?.editedGuideline ?? c?.guideline ?? "",
      // Guidelines already drafted this cycle, so the AI won't repeat itself.
      recentGuidelines: cases
        .map((x) => x.guideline ?? "")
        .filter((g) => g && g !== (c?.guideline ?? ""))
        .slice(-8),
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

  // Draft the ruling + guideline for EVERY case, in one pass.
  const casePrepRequested = useRef(false);
  useEffect(() => {
    if (phase !== "case_prep") {
      casePrepRequested.current = false;
      return;
    }
    if (!canDrive || casePrepRequested.current) return;
    casePrepRequested.current = true;
    const snapshot = cases;
    (async () => {
      for (let i = 0; i < snapshot.length; i++) {
        if (snapshot[i].guideline) continue;
        const accusedName = snapshot[i].accusedName || "The employee";
        const json = await fetchHost(buildHostRequest("resolve", { caseIndex: i }));
        const ok =
          json &&
          typeof json.hrResponse === "string" &&
          json.hrResponse.trim() &&
          typeof json.guideline === "string" &&
          json.guideline.trim();
        await dispatchAction("SET_CASE_RESOLUTION", {
          index: i,
          hrResponse: ok
            ? (json!.hrResponse as string)
            : pick(FALLBACK_HR_RESPONSES).replace(/\{name\}/g, accusedName),
          guideline: ok ? (json!.guideline as string) : pick(FALLBACK_GUIDELINES),
          nudges:
            json && Array.isArray(json.nudges) && json.nudges.length > 0
              ? json.nudges
              : FALLBACK_NUDGES.slice(0, 3),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost]);

  // Reveal loop — for the current guideline: after it's read, HR posts one
  // comment, and (on the driver) advance once the comment window elapses.
  useEffect(() => {
    if (phase !== "reveal" || !canDrive) return;
    const idx = revealIndex;
    const c = cases[idx];
    if (!c) return;
    const guidelineText = c.editedGuideline ?? c.guideline ?? "";
    const words = guidelineText.split(/\s+/).filter(Boolean).length;
    const readMs =
      voiceEnabled && isAudioDevice
        ? Math.min(12_000, Math.max(2_500, words * 380))
        : 1_200;
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    // HR posts its own comment shortly after the guideline is read.
    timers.push(
      setTimeout(async () => {
        if (cancelled || guidelineComments[idx]) return;
        const json = await fetchHost({
          ...buildHostRequest("comment", { caseIndex: idx, guideline: guidelineText }),
        });
        const comment =
          json && typeof json.comment === "string" && json.comment.trim()
            ? (json.comment as string)
            : pick(FALLBACK_GUIDELINE_COMMENTS);
        if (!cancelled) {
          await dispatchAction("SET_GUIDELINE_COMMENT", { index: idx, comment });
        }
      }, readMs + 500)
    );

    // Advance after the read + the comment window.
    timers.push(
      setTimeout(() => {
        if (!cancelled) void dispatchAction("NEXT_REVEAL");
      }, readMs + COMMENT_WINDOW_MS)
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealIndex, canDrive, voiceEnabled]);

  // A local deadline just for the "next in Ns" display (advance is driver-owned).
  const [revealDeadline, setRevealDeadline] = useState(0);
  useEffect(() => {
    if (phase !== "reveal") return;
    setRevealDeadline(Date.now() + COMMENT_WINDOW_MS + 3_000);
  }, [phase, revealIndex]);

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

  async function handleForceResolveAll() {
    await withFlag(setIsForcingResolve, async () => {
      for (let i = 0; i < cases.length; i++) {
        if (cases[i].guideline) continue;
        const accusedName = cases[i].accusedName || "The employee";
        await dispatchAction("SET_CASE_RESOLUTION", {
          index: i,
          hrResponse: pick(FALLBACK_HR_RESPONSES).replace(/\{name\}/g, accusedName),
          guideline: pick(FALLBACK_GUIDELINES),
          nudges: FALLBACK_NUDGES.slice(0, 3),
        });
      }
    });
  }

  const handleCloseEditing = () =>
    withFlag(setIsClosingEditing, () => dispatchAction("CLOSE_EDITING"));

  async function handleSubmitComment(e: FormEvent) {
    e.preventDefault();
    const text = commentInput.trim();
    if (!text) return;
    await withFlag(setIsCommenting, () =>
      dispatchAction("SUBMIT_COMMENT", { comment: text })
    );
  }
  const handleNextReveal = () =>
    withFlag(setIsNextReveal, () => dispatchAction("NEXT_REVEAL"));

  async function handleSubmitVote(e: FormEvent) {
    e.preventDefault();
    if (voteFor === null) return;
    await withFlag(setIsVoting, () =>
      dispatchAction("SUBMIT_FAVORITE", { favorite: voteFor })
    );
  }
  const handleCloseVoting = () =>
    withFlag(setIsClosingVoting, () => dispatchAction("CLOSE_VOTING"));
  const handleNextRound = () =>
    withFlag(setIsAdvancing, () => dispatchAction("NEXT_ROUND"));
  const handlePlayAgain = () =>
    withFlag(setIsResetting, () => dispatchAction("PLAY_AGAIN"));

  // ==========================================================================
  // HR terminal content + voice
  // ==========================================================================

  // Ambient rotation drives the host's shade / nudges while employees write
  // reports, statements, and revisions — so the terminal is never dead air.
  const [nudgeIdx, setNudgeIdx] = useState(0);
  useEffect(() => {
    if (phase !== "editing" && phase !== "accusation" && phase !== "interview") return;
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
  const phaseSeed = `${roomSeed}:${investigationRound}:${revealIndex}`;

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
        if (hasAccused) return silent(myName, accusationShade);
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
      case "editing":
        return silent(ALL, pickStable(EDITING_WAIT_LINES, phaseSeed));
      case "reveal":
        return revealedGuideline
          ? {
              to: ALL,
              text: `REVISED COMPANY GUIDELINE:\n${revealedGuideline}`,
              speak: `A revised company guideline. ${revealedGuideline}`,
              speakKey: `reveal:${investigationRound}:${revealIndex}`,
            }
          : silent(ALL, "The revised guideline is being retrieved.");
      case "voting":
        return silent(ALL, VOTE_TERMINAL);
      case "round_over":
        return silent(ALL, "The reporting cycle is under review. Standings have been adjusted.");
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

  // Read each orientation module aloud as the host advances.
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
  // ==========================================================================
  const aiBanterRef = useRef<string[]>([]);
  const lastBanterRef = useRef<string>("");
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
  } else if (phase === "editing") {
    banterSnippets = cases
      .map((c) => c.guideline ?? "")
      .filter(Boolean)
      .map(truncSnip)
      .slice(-8);
  }
  banterCtxRef.current = { phase, snippets: banterSnippets };

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

  useEffect(() => {
    if (!voiceEnabled || !isAudioDevice || !BANTER_PHASES.has(phase)) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const pool =
        aiBanterRef.current.length > 0
          ? [...aiBanterRef.current, ...BANTER_LINES]
          : BANTER_LINES;
      let line = pool[Math.floor(Math.random() * pool.length)];
      for (let i = 0; i < 4 && line === lastBanterRef.current; i++) {
        line = pool[Math.floor(Math.random() * pool.length)];
      }
      lastBanterRef.current = line;
      void speakNow(line, voiceIdRef.current, { priority: "low" });
      timer = setTimeout(tick, 11000 + Math.random() * 13000);
    };
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
  // Derived countdowns
  // ==========================================================================
  const editSecondsLeft = Math.max(0, Math.ceil((editDeadline - nowTs) / 1000));
  const revealSecondsLeft = Math.max(0, Math.ceil((revealDeadline - nowTs) / 1000));

  // Header sub-label per phase.
  let headerDetail = "";
  if (phase === "accusation" || phase === "reframing" || phase === "interview") {
    headerDetail = " · CASE INTAKE";
  } else if (phase === "case_prep") {
    headerDetail = " · DELIBERATION";
  } else if (phase === "editing") {
    headerDetail = " · POLICY REVISION";
  } else if (phase === "reveal") {
    headerDetail = ` · REVISION ${String(revealIndex + 1).padStart(2, "0")}/${String(
      totalCases
    ).padStart(2, "0")}`;
  } else if (phase === "voting") {
    headerDetail = " · RECOGNITION";
  } else if (phase === "round_over") {
    headerDetail = " · CYCLE REVIEW";
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
              onClick={handleForceResolveAll}
              disabled={isForcingResolve || guidelinesReady >= totalCases}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isForcingResolve
                ? "Issuing standing rulings..."
                : `Deliberation stalled? Issue standing rulings (${guidelinesReady}/${totalCases})`}
            </button>
          )}

          {phase === "editing" && (
            <button
              onClick={handleCloseEditing}
              disabled={isClosingEditing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isClosingEditing
                ? "Filing revisions..."
                : `Close Editing & Begin Review (${editorsDone}/${editorsTotal} filed)`}
            </button>
          )}

          {phase === "reveal" && (
            <button
              onClick={handleNextReveal}
              disabled={isNextReveal}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isNextReveal
                ? "Advancing..."
                : revealIndex >= totalCases - 1
                ? "Close Review & Open Voting"
                : "Skip to Next Revision"}
            </button>
          )}

          {phase === "voting" && (
            <button
              onClick={handleCloseVoting}
              disabled={isClosingVoting || favVotedCount === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isClosingVoting
                ? "Tallying recognition..."
                : `Close Voting & Tally (${favVotedCount}/${players.length} in)`}
            </button>
          )}

          {phase === "round_over" && (
            <button
              onClick={handleNextRound}
              disabled={isAdvancing}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isAdvancing
                ? "Filing..."
                : investigationRound < totalInvestigationRounds
                ? `Authorize Reporting Cycle ${investigationRound + 1}`
                : "Conclude the Investigation"}
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
            {headerDetail}
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
          {phase === "editing" && "Policy Revision — Editing"}
          {phase === "reveal" && "Policy Revision — Review"}
          {phase === "voting" && "Recognition Vote"}
          {phase === "round_over" && "Cycle Review"}
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
        {phase === "lobby" && <p className="text-gray-500 text-xs">{LOBBY_EXPLAINER}</p>}

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
                  <p className="text-sm text-gray-300 mb-4 whitespace-pre-wrap">{mod.body}</p>

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
              Management is reviewing every case and drafting a guideline for each.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              {guidelinesReady} of {totalCases} guidelines drafted.
            </p>
          </div>
        )}

        {/* editing */}
        {phase === "editing" && (
          <div>
            {myEditCase && myEditCase.guideline ? (
              myHasEdited ? (
                <div className="space-y-3">
                  <ActionBanner tone="gray">{EDITING_DONE_LINE}</ActionBanner>
                  <div className="bg-gray-900 rounded-lg p-4">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                      Your revision
                    </p>
                    <EditedGuideline
                      original={myEditCase.guideline}
                      blackedOut={myEditCase.blackedOut}
                      replacements={myEditCase.replacements}
                    />
                  </div>
                  <p className="text-gray-500 text-xs text-center">
                    {editorsDone} of {editorsTotal} revisions filed. {currentNudge}
                  </p>
                </div>
              ) : (
                <EditorWorkspace
                  original={myEditCase.guideline}
                  step={editStep}
                  secondsLeft={editSecondsLeft}
                  blackedOut={blackedOut}
                  replacements={replacements}
                  onToggle={toggleBlackout}
                  onReplacement={(i, v) =>
                    setReplacements((prev) => ({
                      ...prev,
                      [i]: v.replace(/\s/g, "").slice(0, MAX_REPLACEMENT_LENGTH),
                    }))
                  }
                  onSubmit={() => void submitEditNow()}
                />
              )
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-300">
                  The department is revising its guidelines.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  {editorsDone} of {editorsTotal} revisions filed. {currentNudge}
                </p>
              </div>
            )}
          </div>
        )}

        {/* reveal */}
        {phase === "reveal" && revealCase && (
          <div className="space-y-4">
            <GuidelineCard
              guideline={revealedGuideline}
              label={`Revised Company Guideline — ${revealIndex + 1} of ${totalCases}`}
            />

            {/* the thread */}
            <div className="space-y-2">
              {hrComment && (
                <div className="rounded-lg border border-indigo-800 bg-indigo-950/40 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-indigo-400 mb-1">
                    {HR_COMMENT_LABEL}
                  </p>
                  <p className="text-sm text-indigo-100">{hrComment}</p>
                </div>
              )}
              {players
                .filter((p) => revealThread[p.id] !== undefined)
                .map((p) => (
                  <div key={p.id} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                      {p.name}
                      {p.id === playerId && " (you)"}
                    </p>
                    <p className="text-sm text-gray-200">
                      <CommentText text={revealThread[p.id]} players={players} />
                    </p>
                  </div>
                ))}
            </div>

            {hasCommentedThis ? (
              <p className="text-gray-500 text-xs italic text-center">{REVEAL_POSTED_LINE}</p>
            ) : (
              <form onSubmit={handleSubmitComment} className="space-y-3">
                <p className="text-xs text-gray-400">{REVEAL_COMMENT_HINT}</p>
                <MentionTextarea
                  value={commentInput}
                  onChange={setCommentInput}
                  players={players}
                  maxLength={240}
                  rows={2}
                  placeholder="Add your comment. Type @ to identify who it was really about."
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
            <p className="text-gray-500 text-xs text-center">
              Correct @-identification earns +{ATMENTION_BONUS}. Next guideline in{" "}
              {revealSecondsLeft}s.
            </p>
          </div>
        )}

        {/* voting */}
        {phase === "voting" && (
          <div>
            <ActionBanner tone="blue">
              <p className="font-semibold">Vote for your favorite revised guideline.</p>
              <p className="text-xs opacity-80 mt-1">
                You cannot vote for the one you edited. Each vote credits that guideline&apos;s
                Editor +{FAVORITE_VOTE_PTS} Performance Points.
              </p>
            </ActionBanner>
            {hasVotedFav ? (
              <div className="text-center py-4">
                <p className="text-gray-300">Your recognition has been recorded.</p>
                <p className="text-gray-500 text-xs mt-2">
                  {favVotedCount} of {players.length} votes in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitVote} className="space-y-4">
                <div className="space-y-2">
                  {votableCases.map(({ c, i }) => {
                    const selected = voteFor === i;
                    return (
                      <button
                        type="button"
                        key={i}
                        onClick={() => setVoteFor(i)}
                        className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${
                          selected
                            ? "bg-green-900/40 border-green-600"
                            : "bg-gray-900 border-gray-700 hover:border-gray-500"
                        }`}
                      >
                        <span className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                          Revision {i + 1}
                        </span>
                        <span className="text-gray-200">
                          {c.editedGuideline ?? c.guideline}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="submit"
                  disabled={isVoting || voteFor === null}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isVoting
                    ? "Recording..."
                    : voteFor === null
                    ? "Select a guideline to recognize"
                    : "Submit Recognition"}
                </button>
              </form>
            )}
            <p className="text-gray-500 text-xs mt-3 text-center">
              {favVotedCount} of {players.length} votes in.
            </p>
          </div>
        )}

        {/* round_over */}
        {phase === "round_over" && (
          <RoundReviewPanel
            cases={cases}
            players={players}
            playerId={playerId}
            revealComments={revealComments}
            guidelineComments={guidelineComments}
            favorites={favorites}
            standings={standings}
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
// Editor workspace — the two editing windows
// ============================================================================

function EditorWorkspace({
  original,
  step,
  secondsLeft,
  blackedOut,
  replacements,
  onToggle,
  onReplacement,
  onSubmit,
}: {
  original: string;
  step: "blackout" | "rewrite";
  secondsLeft: number;
  blackedOut: Set<number>;
  replacements: Record<number, string>;
  onToggle: (i: number) => void;
  onReplacement: (i: number, v: string) => void;
  onSubmit: () => void;
}) {
  const tokens = tokenizeGuideline(original);
  const selected = Array.from(blackedOut).sort((a, b) => a - b);
  const preview = reconstructGuideline(tokens, selected, replacements);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">
          {step === "blackout" ? EDITING_BLACKOUT_LABEL : EDITING_REWRITE_LABEL}
        </p>
        <span
          className={`font-mono text-lg font-bold ${
            secondsLeft <= 3 ? "text-red-400" : "text-amber-300"
          }`}
        >
          {secondsLeft}s
        </span>
      </div>
      <p className="text-xs text-gray-400">
        {step === "blackout" ? EDITING_BLACKOUT_HINT : EDITING_REWRITE_HINT}
      </p>

      {step === "blackout" ? (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-widest text-indigo-400 mb-2">
            {GUIDELINE_CARD_LABEL}
          </p>
          <p className="leading-loose">
            {tokens.map((tok, i) => {
              const on = blackedOut.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onToggle(i)}
                  className={`inline rounded px-1 mr-1 mb-1 text-sm transition-colors ${
                    on
                      ? "bg-black text-black ring-1 ring-gray-600"
                      : "text-indigo-100 hover:bg-gray-700"
                  }`}
                >
                  {tok}
                </button>
              );
            })}
          </p>
          <p className="text-[11px] text-gray-500 mt-3">
            {blackedOut.size}/{MAX_BLACKOUT} words redacted.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {selected.length === 0 ? (
            <p className="text-sm text-gray-400 bg-gray-900 rounded-lg p-4 text-center">
              You redacted nothing. The guideline will stand as written — unless you go
              back and strike a word.
            </p>
          ) : (
            <div className="space-y-2">
              {selected.map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 line-through w-24 shrink-0 truncate text-right">
                    {tokens[i]}
                  </span>
                  <span className="text-gray-600">→</span>
                  <input
                    value={replacements[i] ?? ""}
                    onChange={(e) => onReplacement(i, e.target.value)}
                    maxLength={MAX_REPLACEMENT_LENGTH}
                    placeholder="one word"
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Preview</p>
            <p className="text-sm text-indigo-100">{preview || "…"}</p>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            File Revision
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Round review — the cycle scoreboard and the unsealing of the raw filings
// ============================================================================

function RoundReviewPanel({
  cases,
  players,
  playerId,
  revealComments,
  guidelineComments,
  favorites,
  standings,
}: {
  cases: PRCase[];
  players: Array<{ id: string; name: string }>;
  playerId: string;
  revealComments: Record<number, Record<string, string>>;
  guidelineComments: Record<number, string>;
  favorites: Record<string, number>;
  standings: Array<{ id: string; name: string; score: number; roundDelta: number }>;
}) {
  // Favorite-vote tally per case.
  const favCounts: Record<number, number> = {};
  for (const idx of Object.values(favorites)) {
    favCounts[idx] = (favCounts[idx] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
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

      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">
          Case files — unsealed
        </h3>
        <div className="space-y-4">
          {cases.map((c, i) => {
            const thread = revealComments[i] ?? {};
            const hrComment = guidelineComments[i] ?? null;
            const favVotes = favCounts[i] ?? 0;
            return (
              <div
                key={i}
                className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500">
                    Revision {i + 1}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {favVotes} {favVotes === 1 ? "vote" : "votes"} · Editor{" "}
                    <span className="text-amber-300">{c.editorName ?? "—"}</span>
                  </p>
                </div>

                {c.editedGuideline && c.editedGuideline !== c.guideline ? (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-gray-600">
                      As revised
                    </p>
                    <p className="text-sm text-indigo-100 font-semibold">
                      {c.editedGuideline}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-gray-600 pt-1">
                      Originally issued
                    </p>
                    <p className="text-xs text-gray-500">{c.guideline}</p>
                  </div>
                ) : (
                  <p className="text-sm text-indigo-100 font-semibold">
                    {c.editedGuideline ?? c.guideline}
                  </p>
                )}

                <div className="rounded bg-black/30 p-3 space-y-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">
                      It was really about
                    </p>
                    <p className="text-sm font-bold text-white">
                      {c.accusedName}
                      {c.accusedId === playerId && (
                        <span className="text-gray-500 text-xs"> (you)</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">
                      Filed by {c.reporterName}
                    </p>
                    <p className="text-sm text-gray-300">
                      “{c.rawAccusation || "No report on record."}”
                    </p>
                  </div>
                  {c.explanation && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">
                        Employee statement
                      </p>
                      <p className="text-sm text-gray-400 italic">“{c.explanation}”</p>
                    </div>
                  )}
                </div>

                {(hrComment || Object.keys(thread).length > 0) && (
                  <div className="space-y-1.5">
                    {hrComment && (
                      <p className="text-xs text-indigo-300">
                        <span className="text-indigo-500">{HR_COMMENT_LABEL}:</span> {hrComment}
                      </p>
                    )}
                    {players
                      .filter((p) => thread[p.id] !== undefined)
                      .map((p) => {
                        const taggedId = parseMention(thread[p.id], players);
                        const correct = taggedId === c.accusedId;
                        const eligible = p.id !== c.reporterId && p.id !== c.accusedId;
                        return (
                          <p key={p.id} className="text-xs text-gray-400">
                            <span className="text-gray-500">{p.name}:</span>{" "}
                            <CommentText text={thread[p.id]} players={players} />
                            {correct && eligible && (
                              <span className="text-green-400"> · +{ATMENTION_BONUS}</span>
                            )}
                            {correct && !eligible && (
                              <span className="text-gray-600"> · prior knowledge</span>
                            )}
                          </p>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
