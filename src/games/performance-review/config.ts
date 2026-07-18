import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";

// ============================================================================
// HR Investigation — three investigation rounds, one case per employee per round
// ----------------------------------------------------------------------------
// A full game:
//   1. Accusation   every employee files an HR report on an assigned colleague
//                   (prompts drawn from a fixed corporate-grievance bank)
//   2. Interview    EVERY employee is shown a manager-reframed version of the
//                   accusation about them and explains what actually happened
//   3. Resolution   for each employee, HR issues a ruling + a new Company
//                   Guideline born from that incident
//   4. Policy Revision — a single challenge for the whole cycle:
//                   a) Editing    every guideline is handed to an UNINVOLVED
//                      employee (never its reporter or accused). The Editor
//                      blacks out up to 10 words, then types one-word
//                      replacements. All editors work in parallel.
//                   b) Reveal     each edited guideline is read aloud one at a
//                      time; the room comments and @-tags who they think it was
//                      really about (the accused), and HR posts one comment of
//                      its own. Correct @-tags earn a small bonus.
//                   c) Vote       once every guideline has been read, everyone
//                      votes for their favorite; each vote earns that
//                      guideline's Editor points (the Editor's main payday).
//   5. Round close  the round scoreboard, and only now the raw filings are
//                   unsealed — who each guideline was really about.
// ============================================================================

// ============================================================================
// Tunable constants
// ============================================================================

// --- Policy Revision scoring ---
export const ATMENTION_BONUS = 3; // correctly @-tagging the accused in a comment
export const FAVORITE_VOTE_PTS = 4; // points to the Editor per favorite-vote received

// --- Editing limits ---
export const MAX_BLACKOUT = 10; // words an Editor may black out per guideline
export const MAX_REPLACEMENT_LENGTH = 30; // chars per one-word replacement

const MAX_ACCUSATION_LENGTH = 280;
const MAX_EXPLANATION_LENGTH = 400;
const MAX_COMMENT_LENGTH = 240;
const MAX_GUIDELINE_COMMENT_LENGTH = 240;
const MAX_CASE_LOG = 40;
const MAX_NUDGES = 5;
const MAX_NUDGE_LENGTH = 140;
export const TOTAL_INVESTIGATION_ROUNDS = 3;

// ============================================================================
// The corporate grievance bank — HR report prompts ({subject} interpolated).
// Three tiers, dealt by weight rather than deck position:
//   ordinary (20%) — relatable office grievances. No wrongness at all.
//   tamed    (50%) — dry, bureaucratic, quietly wrong. Never explained.
//   untamed  (30%) — the register where the fiction stops being polite.
// ============================================================================

export type HRQuestionTier = "ordinary" | "tamed" | "untamed";

export const HR_TIER_WEIGHTS: Record<HRQuestionTier, number> = {
  ordinary: 0.2,
  tamed: 0.5,
  untamed: 0.3,
};

export const HR_QUESTIONS_ORDINARY: string[] = [
  "Has {subject} ghosted a calendar invite they clearly saw?",
  "Does {subject} wield 'per my last email' as a weapon?",
  "Does {subject} log off at exactly 4:59 every single day?",
  "Does {subject} take a two-hour lunch and call it a 'working lunch'?",
  "Has {subject} been taking suspiciously long bathroom breaks?",
  "Does {subject} say 'let's circle back' and then never circle back?",
  "Has {subject} been 'in a meeting' for suspiciously long stretches with nothing on the shared calendar?",
  "Does {subject} send a message and then immediately walk over to ask if you saw it?",
  "Has {subject} used the last of the printer paper and left the tray empty for the next person?",
  "Does {subject} take personal calls on speakerphone at their desk like the rest of us don't exist?",
];

export const HR_QUESTIONS_TAMED: string[] = [
  "Has {subject} shown signs of remembering the previous cohort? Give one example.",
  "Does {subject} greet the building when arriving? The building has commented on this.",
  "Has {subject} attended the mandatory retreat? Attendance records show no one attended the mandatory retreat.",
  "Does {subject} eat lunch at their desk in a way that suggests they are being observed? They are not being observed. Describe the behavior anyway.",
  "Does {subject} respond to their name on the first attempt, or does it take several? Which name?",
  "Does {subject} water the third-floor plant? Someone does. It is thriving. It should not be.",
  "Does {subject} maintain eye contact with the lobby portrait? The portrait has filed no complaints. Yet.",
  "Does {subject} know why the third floor has no employees on it? Did they explain, or just look at you?",
  "Has {subject} referred to their badge number instead of their name? More than once?",
  "Does {subject} take the stairs instead of the elevator on days the elevator is working fine?",
  "Has {subject} mentioned a team that no longer appears in the directory?",
  "Does {subject} keep a second lanyard? Whose name is on it?",
  "Does {subject} know why the fire drill headcount never matches the badge count? Did they offer a theory?",
  "Does {subject} know about the layoffs before they are announced, or after?",
  "Has {subject} been seen speaking to someone at a desk that has been empty since March?",
  "Does {subject} still badge into a door that was sealed last quarter?",
  "Has {subject} referred to today as a day of the week it is not? Which one?",
  "Does {subject} address the security cameras when entering a room? What do they say?",
  "Has {subject} noticed their headshot on the company website isn't the photo they submitted? Whose photo is it?",
  "Does {subject} know the name of the employee they replaced? HR does not have this on file.",
];

export const HR_QUESTIONS_UNTAMED: string[] = [
  "Has {subject} tried to leave through an exit that isn't on the floor plan? How far did they get?",
  "Does {subject} ask when they get to go home? What do you tell them?",
  "Has {subject} figured out what is in the basement? Who told them?",
  "Do you consider {subject} a flight risk? Would restraints be premature, or overdue?",
  "Has {subject} asked about the employees who no longer appear in the directory? What did you say to end the conversation?",
  "Has {subject} stopped mentioning their family? When did that start, and should HR be concerned or relieved?",
  "Has {subject} tried to warn a new hire about something? What did you do about it?",
  "Does {subject} count the days out loud? Should someone ask them to stop?",
  "Has {subject} asked what's behind the door with no handle? What did you tell them was behind it?",
  "Does {subject} still flinch at the sound of the elevator? Describe the flinch.",
  "Has {subject} tried to unionize the sub-basement? Name everyone involved.",
  "Does {subject} still believe someone is coming to get them out? Should they?",
  "Has {subject} been added to the list of employees who ask too many questions? Who keeps that list?",
  "Does {subject} still recognize the sound of their own name? Test it and report back.",
  "Has {subject} requested a wellness check on themselves? Was it granted?",
];

const HR_QUESTION_TIERS: Record<HRQuestionTier, string[]> = {
  ordinary: HR_QUESTIONS_ORDINARY,
  tamed: HR_QUESTIONS_TAMED,
  untamed: HR_QUESTIONS_UNTAMED,
};

// ============================================================================
// Types
// ============================================================================

export type PRPhase =
  | "lobby"
  | "intro" // HR's opening address + synchronized tutorial
  | "accusation" // everyone files a report on an assigned colleague
  | "reframing" // HR reframes every accusation into managerial language
  | "interview" // everyone explains the accusation about them
  | "case_prep" // HR drafts the ruling + guideline for every case
  | "editing" // every guideline is edited by an uninvolved employee (in parallel)
  | "reveal" // each edited guideline is read + commented on, one at a time
  | "voting" // once all are read, everyone votes their favorite guideline
  | "round_over" // round scoreboard + the raw filings are unsealed
  | "game_over";

export type PRHeat = "mild" | "spicy" | "scorched";

// HR voice options for text-to-speech. IDs are OpenAI TTS voices.
export const PR_VOICES: Array<{ id: string; label: string; blurb: string }> = [
  { id: "onyx", label: "The Overlord", blurb: "Deep, ominous" },
  { id: "ash", label: "Middle Management", blurb: "Dry, clipped" },
  { id: "sage", label: "The Consultant", blurb: "Calm, knowing" },
  { id: "echo", label: "Facilities", blurb: "Flat, official" },
  { id: "shimmer", label: "The New Hire", blurb: "Bright, unsettling" },
  { id: "alloy", label: "Reception", blurb: "Neutral" },
];
export const PR_VOICE_IDS = PR_VOICES.map((v) => v.id);
const DEFAULT_VOICE_ID = "onyx";

export type PRAssignment = { subjectId: string; subjectName: string };

// One case per employee — everything the investigation knows about one incident.
export type PRCase = {
  accusedId: string;
  accusedName: string;
  reporterId: string | null;
  reporterName: string;
  question: string; // the bank prompt the reporter answered
  rawAccusation: string; // exactly what the reporter wrote
  accusation: string | null; // AI manager-reframed version (shown everywhere)
  explanation: string | null; // the accused's interview answer
  // filled during case_prep
  hrResponse: string | null;
  guideline: string | null; // the AI's original Company Guideline
  // the Editor — an employee who is neither the reporter nor the accused
  editorId: string | null;
  editorName: string | null;
  // filled during editing
  editedGuideline: string | null; // guideline after the Editor's revision
  blackedOut: number[]; // word indices the Editor removed
  replacements: Record<number, string>; // word index -> one-word replacement
};

// An archived accusation for the AI's callbacks.
export type PRCaseRecord = {
  reporterName: string;
  accusedName: string;
  question: string;
  accusation: string;
};

export type PRState = {
  phase: PRPhase;
  heat: PRHeat;
  investigationRound: number;
  totalInvestigationRounds: number;
  tutorialStep: number;

  // --- accusation window ---
  assignments: Record<string, PRAssignment>; // reporterId -> subject
  questions: Record<string, string>; // reporterId -> bank prompt
  accusations: Record<string, string>; // reporterId -> raw text
  usedQuestions: string[]; // bank templates already dealt this game (and any earlier Play Again cycle) — never dealt twice

  // --- reframing + interview (keyed by accused) ---
  reframes: Record<string, string>; // accusedId -> managerial reframe
  explanations: Record<string, string>; // accusedId -> defense

  // --- the built docket ---
  cases: PRCase[];
  totalCases: number;

  // --- editing: two collective, server-synced windows (blackout, then rewrite) ---
  editStep: "blackout" | "rewrite";
  editStartedAt: number; // server timestamp the current window opened (shared clock)
  editReady: Record<string, boolean>; // editorId -> ready in the current window

  // --- Policy Revision working state (reset per cycle) ---
  revealIndex: number; // which guideline is currently being read (0-based)
  revealStartedAt: number; // server timestamp the current guideline reveal began
  revealComments: Record<number, Record<string, string>>; // caseIndex -> playerId -> comment
  guidelineComments: Record<number, string>; // caseIndex -> HR's own posted comment
  favorites: Record<string, number>; // voterId -> caseIndex they voted favorite

  // --- scoring ---
  scores: Record<string, number>;
  roundScores: Record<string, number>; // this cycle's delta

  // --- HR terminal ---
  introText: string | null;
  nudges: string[];

  // --- context / final ---
  caseLog: PRCaseRecord[];
  finalCommentary: string | null;

  // --- voice ---
  voiceEnabled: boolean;
  voiceId: string;
};

export type PRActionType =
  | "START_GAME"
  | "SET_INTRO"
  | "SET_TUTORIAL_STEP"
  | "BEGIN"
  | "SUBMIT_ACCUSATION"
  | "CLOSE_ACCUSATION"
  | "SET_REFRAMES"
  | "SUBMIT_EXPLANATION"
  | "SKIP_INTERVIEW"
  | "SET_CASE_RESOLUTION"
  | "SAVE_EDIT"
  | "SET_EDIT_READY"
  | "ADVANCE_EDIT_STEP"
  | "CLOSE_EDITING"
  | "SET_GUIDELINE_COMMENT"
  | "SUBMIT_COMMENT"
  | "NEXT_REVEAL"
  | "SUBMIT_FAVORITE"
  | "CLOSE_VOTING"
  | "NEXT_ROUND"
  | "SET_FINAL"
  | "SET_VOICE"
  | "PLAY_AGAIN";

export interface PRAction extends BaseAction {
  type: PRActionType;
  payload?: {
    heat?: PRHeat;
    enabled?: boolean;
    voiceId?: string;
    commentary?: string;
    tutorialStep?: number;
    accusation?: string;
    reframes?: Record<string, string>; // accusedId -> reframe
    explanation?: string;
    // case resolution (batched, per index)
    index?: number;
    hrResponse?: string;
    guideline?: string;
    nudges?: string[];
    // editing
    blackedOut?: number[];
    replacements?: Record<number, string>;
    ready?: boolean;
    // reveal + voting
    comment?: string; // player comment, or HR's guideline comment
    favorite?: number; // caseIndex voted favorite
  };
}

// ============================================================================
// Helpers
// ============================================================================

function initialState(_players: Player[]): PRState {
  return {
    phase: "lobby",
    heat: "spicy",
    investigationRound: 1,
    totalInvestigationRounds: TOTAL_INVESTIGATION_ROUNDS,
    tutorialStep: 0,
    assignments: {},
    questions: {},
    accusations: {},
    usedQuestions: [],
    reframes: {},
    explanations: {},
    cases: [],
    totalCases: 0,
    editStep: "blackout",
    editStartedAt: 0,
    editReady: {},
    revealIndex: 0,
    revealStartedAt: 0,
    revealComments: {},
    guidelineComments: {},
    favorites: {},
    scores: {},
    roundScores: {},
    introText: null,
    nudges: [],
    caseLog: [],
    finalCommentary: null,
    voiceEnabled: false,
    voiceId: DEFAULT_VOICE_ID,
  };
}

function getPhase(state: PRState): GamePhase {
  return state.phase;
}

function isHost(ctx: GameContext): boolean {
  return ctx.room.hostId === ctx.playerId;
}

// Automatic "HR" beats (intro / reframes / rulings / comments / final) are
// fetched from the AI by one client and written back via an action. In
// multiplayer only the host runs them; in hotseat/simulation the whole game
// lives on one device, so any active player may commit them — otherwise the
// game stalls waiting for the host seat to come back around during pass-and-play.
function canDrive(ctx: GameContext): boolean {
  return isHost(ctx) || ctx.room.mode !== "multiplayer";
}

function sanitizeNudges(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, MAX_NUDGE_LENGTH))
    .filter((v) => v.length > 0)
    .slice(0, MAX_NUDGES);
}

/** The raw accusation written about `accusedId`, via their assigned reporter. */
function accusationAbout(
  state: PRState,
  accusedId: string
): { reporterId: string | null; raw: string; question: string } {
  for (const [reporterId, a] of Object.entries(state.assignments)) {
    if (a.subjectId === accusedId) {
      return {
        reporterId,
        raw: state.accusations[reporterId] ?? "",
        question: state.questions[reporterId] ?? "",
      };
    }
  }
  return { reporterId: null, raw: "", question: "" };
}

/**
 * Which player @-tag a comment contains: the earliest "@Name" that resolves to
 * a real player (ties broken by the longest matching name). Returns the tagged
 * player's id, or null.
 */
export function parseMention(
  text: string,
  players: Array<{ id: string; name: string }>
): string | null {
  const lower = text.toLowerCase();
  let best: { index: number; id: string; len: number } | null = null;
  for (const p of players) {
    const needle = "@" + p.name.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx < 0) continue;
    if (
      best === null ||
      idx < best.index ||
      (idx === best.index && p.name.length > best.len)
    ) {
      best = { index: idx, id: p.id, len: p.name.length };
    }
  }
  return best?.id ?? null;
}

// --- editing helpers: tokenize a guideline, then rebuild it after a revision ---

/** Split a guideline into whitespace-delimited tokens (punctuation stays put). */
export function tokenizeGuideline(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

function sanitizeBlackout(raw: unknown, tokenCount: number): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const v of raw) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < tokenCount) {
      set.add(v);
    }
  }
  return Array.from(set).sort((a, b) => a - b).slice(0, MAX_BLACKOUT);
}

function sanitizeReplacements(
  raw: unknown,
  blackedOut: number[]
): Record<number, string> {
  const out: Record<number, string> = {};
  if (!raw || typeof raw !== "object") return out;
  const allow = new Set(blackedOut);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || !allow.has(idx)) continue;
    if (typeof v !== "string") continue;
    // one word: strip all whitespace, cap length.
    const word = v.replace(/\s+/g, "").slice(0, MAX_REPLACEMENT_LENGTH);
    if (word) out[idx] = word;
  }
  return out;
}

/** Rebuild the guideline: blacked-out words become their replacement, or vanish. */
export function reconstructGuideline(
  tokens: string[],
  blackedOut: number[],
  replacements: Record<number, string>
): string {
  const bset = new Set(blackedOut);
  const parts: string[] = [];
  tokens.forEach((tok, i) => {
    if (!bset.has(i)) {
      parts.push(tok);
      return;
    }
    const r = replacements[i];
    if (r) parts.push(r); // else: removed entirely
  });
  return parts.join(" ").trim();
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deal `n` distinct question templates, weighted by HR_TIER_WEIGHTS rather
 * than picked uniformly from one flat bank, while honoring `usedUp` — the
 * templates already dealt earlier this game (or an earlier Play Again cycle
 * with this same group) that must not be dealt again.
 *
 * Each tier's still-available questions are pre-shuffled and drawn from
 * without repeats; if a tier runs dry mid-deal, the draw spills into the
 * next tier (ordinary -> tamed -> untamed order). If the whole bank has been
 * exhausted (fewer questions remain than players to deal to), the "used"
 * history is cleared and every question becomes available again — a fresh
 * shoe, not a crash.
 */
function dealWeightedQuestions(
  n: number,
  random: () => number,
  usedUp: ReadonlySet<string>
): { templates: string[]; used: Set<string> } {
  const order: HRQuestionTier[] = ["ordinary", "tamed", "untamed"];

  const remaining = (tier: HRQuestionTier, exclude: ReadonlySet<string>) =>
    HR_QUESTION_TIERS[tier].filter((q) => !exclude.has(q));

  let exclude = usedUp;
  const totalRemaining = order.reduce(
    (sum, t) => sum + remaining(t, exclude).length,
    0
  );
  if (totalRemaining < n) {
    exclude = new Set(); // every question has been seen — reshuffle the whole bank
  }

  const pools: Record<HRQuestionTier, string[]> = {
    ordinary: shuffle(remaining("ordinary", exclude), random),
    tamed: shuffle(remaining("tamed", exclude), random),
    untamed: shuffle(remaining("untamed", exclude), random),
  };

  const dealt: string[] = [];
  for (let i = 0; i < n; i++) {
    let roll = random();
    let tier: HRQuestionTier = order[order.length - 1];
    for (const t of order) {
      roll -= HR_TIER_WEIGHTS[t];
      if (roll <= 0) {
        tier = t;
        break;
      }
    }

    const startIdx = order.indexOf(tier);
    for (let k = 0; k < order.length; k++) {
      const candidate = order[(startIdx + k) % order.length];
      const picked = pools[candidate].pop();
      if (picked !== undefined) {
        dealt.push(picked);
        break;
      }
    }
  }

  const used = new Set(exclude);
  for (const q of dealt) used.add(q);
  return { templates: dealt, used };
}

/**
 * Open the accusation window: assign each employee a colleague to report on
 * (cyclic shift => a permutation, so everyone is reported on exactly once) and
 * hand each reporter a distinct prompt from the grievance bank.
 */
function openAccusationWindow(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;
  const n = players.length;
  if (n < 2) return state;

  const shift = 1 + Math.floor(ctx.random() * (n - 1)); // 1..n-1, never 0
  const assignments: Record<string, PRAssignment> = {};
  players.forEach((p, i) => {
    const subject = players[(i + shift) % n];
    assignments[p.id] = { subjectId: subject.id, subjectName: subject.name };
  });

  // Deal distinct prompts, weighted across the three tiers, never a template
  // already dealt earlier this game (or an earlier Play Again cycle).
  const { templates, used } = dealWeightedQuestions(
    n,
    ctx.random,
    new Set(state.usedQuestions)
  );
  const questions: Record<string, string> = {};
  players.forEach((p, i) => {
    questions[p.id] = templates[i].replace(
      /\{subject\}/g,
      assignments[p.id].subjectName
    );
  });

  return {
    ...state,
    phase: "accusation",
    assignments,
    questions,
    usedQuestions: Array.from(used),
    accusations: {},
    reframes: {},
    explanations: {},
    cases: [],
    editStep: "blackout",
    editStartedAt: 0,
    editReady: {},
    revealIndex: 0,
    revealStartedAt: 0,
    revealComments: {},
    guidelineComments: {},
    favorites: {},
    roundScores: {},
  };
}

/** Everyone has filed (or the host force-closed): move on to reframing. */
function closeAccusationWindow(state: PRState, ctx: GameContext): PRState {
  const records: PRCaseRecord[] = [];
  for (const [reporterId, text] of Object.entries(state.accusations)) {
    const a = state.assignments[reporterId];
    if (!a) continue;
    const reporter = ctx.room.players.find((p) => p.id === reporterId);
    records.push({
      reporterName: reporter?.name ?? "Former employee",
      accusedName: a.subjectName,
      question: state.questions[reporterId] ?? "",
      accusation: text,
    });
  }
  return {
    ...state,
    caseLog: [...state.caseLog, ...records].slice(-MAX_CASE_LOG),
    phase: "reframing",
  };
}

/**
 * Build the docket once interviews close: one case per employee, in seating
 * order. Each guideline gets an Editor — an employee who is neither its reporter
 * nor its accused — assigned by a single rotation offset so every employee edits
 * exactly one guideline.
 */
function buildCases(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;
  const n = players.length;

  // First pass: the cases themselves (case i's accused is players[i]).
  const cases: PRCase[] = players.map((accused) => {
    const src = accusationAbout(state, accused.id);
    const reporter = src.reporterId
      ? players.find((p) => p.id === src.reporterId)
      : undefined;
    return {
      accusedId: accused.id,
      accusedName: accused.name,
      reporterId: src.reporterId,
      reporterName: reporter?.name ?? "HR",
      question: src.question,
      rawAccusation: src.raw,
      accusation: state.reframes[accused.id] ?? null,
      explanation: state.explanations[accused.id] ?? null,
      hrResponse: null,
      guideline: null,
      editorId: null,
      editorName: null,
      editedGuideline: null,
      blackedOut: [],
      replacements: {},
    };
  });

  // Editor for case i is players[(i + k) % n] for a single offset k. Pick a k
  // (1..n-1) such that no case's editor is that case's accused (k != 0, always)
  // or its reporter. A valid k always exists for n >= 3; if the assignment map
  // is irregular (mid-round joins) we fall back to a per-case skip search.
  const reporterIdxOf = (i: number): number =>
    cases[i].reporterId
      ? players.findIndex((p) => p.id === cases[i].reporterId)
      : -1;

  let chosenK = 0;
  if (n >= 2) {
    const start = 1 + Math.floor(ctx.random() * (n - 1));
    for (let t = 0; t < n - 1; t++) {
      const k = ((start - 1 + t) % (n - 1)) + 1; // cycles through 1..n-1
      let ok = true;
      for (let i = 0; i < n; i++) {
        const e = (i + k) % n;
        if (e === i || e === reporterIdxOf(i)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        chosenK = k;
        break;
      }
    }
  }

  cases.forEach((c, i) => {
    let editorIdx: number;
    if (chosenK !== 0) {
      editorIdx = (i + chosenK) % n;
    } else {
      // Fallback: walk forward until we find someone eligible.
      editorIdx = (i + 1) % n;
      const rep = reporterIdxOf(i);
      let tries = 0;
      while ((editorIdx === i || editorIdx === rep) && tries < n) {
        editorIdx = (editorIdx + 1) % n;
        tries++;
      }
    }
    const editor = players[editorIdx];
    c.editorId = editor?.id ?? null;
    c.editorName = editor?.name ?? null;
  });

  return {
    ...state,
    cases,
    totalCases: cases.length,
    editStep: "blackout",
    editStartedAt: 0,
    editReady: {},
    revealIndex: 0,
    revealStartedAt: 0,
    revealComments: {},
    guidelineComments: {},
    favorites: {},
    phase: "case_prep",
  };
}

function currentRevealCase(state: PRState): PRCase | undefined {
  return state.cases[state.revealIndex];
}

/** The distinct employees who are an Editor on some case (each edits one). */
function editorIds(cases: PRCase[]): string[] {
  const ids = new Set<string>();
  for (const c of cases) if (c.editorId) ids.add(c.editorId);
  return Array.from(ids);
}

/** Bake each editor's saved selection/replacements into the final guideline. */
function finalizeEdits(state: PRState): PRState {
  const cases = state.cases.map((c) => {
    if (c.editedGuideline !== null) return c;
    const tokens = tokenizeGuideline(c.guideline ?? "");
    const rebuilt = reconstructGuideline(tokens, c.blackedOut, c.replacements);
    return { ...c, editedGuideline: rebuilt || (c.guideline ?? "") };
  });
  return { ...state, cases };
}

/**
 * A collective editing window closed (all editors readied, or the timer ran
 * out): blackout -> rewrite opens a fresh synced window; rewrite -> the edits
 * are finalized and the reveal begins.
 */
function advanceEditStep(state: PRState, ctx: GameContext): PRState {
  if (state.editStep === "blackout") {
    return {
      ...state,
      editStep: "rewrite",
      editStartedAt: ctx.now(),
      editReady: {},
    };
  }
  return {
    ...finalizeEdits(state),
    editReady: {},
    revealIndex: 0,
    revealStartedAt: ctx.now(),
    phase: "reveal",
  };
}

/**
 * Tally the whole cycle once voting closes:
 *   - a correct @-tag of the accused earns ATMENTION_BONUS (the reporter and
 *     accused already know, so they are never eligible),
 *   - each favorite-vote earns that guideline's Editor FAVORITE_VOTE_PTS.
 */
function scoreRound(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;
  const scores = { ...state.scores };
  const roundScores: Record<string, number> = {};
  for (const p of players) roundScores[p.id] = 0;

  // @-tag bonuses, per guideline thread.
  state.cases.forEach((c, i) => {
    const thread = state.revealComments[i] ?? {};
    for (const [pid, text] of Object.entries(thread)) {
      const eligible = pid !== c.reporterId && pid !== c.accusedId;
      if (!eligible) continue;
      if (parseMention(text, players) === c.accusedId) {
        roundScores[pid] = (roundScores[pid] ?? 0) + ATMENTION_BONUS;
      }
    }
  });

  // Favorite votes reward the Editor of the chosen guideline.
  for (const idx of Object.values(state.favorites)) {
    const c = state.cases[idx];
    if (!c || !c.editorId) continue;
    roundScores[c.editorId] = (roundScores[c.editorId] ?? 0) + FAVORITE_VOTE_PTS;
  }

  for (const p of players) {
    scores[p.id] = Math.max(0, (scores[p.id] ?? 0) + (roundScores[p.id] ?? 0));
  }

  return { ...state, phase: "round_over", scores, roundScores };
}

// ============================================================================
// Reducer
// ============================================================================

function reducer(state: PRState, action: PRAction, ctx: GameContext): PRState {
  switch (action.type) {
    case "START_GAME": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "lobby") return state;
      if (ctx.room.players.length === 0) return state;

      const heat = action.payload?.heat;
      const validHeat: PRHeat =
        heat === "mild" || heat === "spicy" || heat === "scorched"
          ? heat
          : "spicy";

      const scores: Record<string, number> = {};
      for (const p of ctx.room.players) scores[p.id] = 0;

      return {
        ...initialState(ctx.room.players),
        phase: "intro",
        heat: validHeat,
        totalCases: ctx.room.players.length,
        investigationRound: 1,
        totalInvestigationRounds: TOTAL_INVESTIGATION_ROUNDS,
        tutorialStep: 0,
        scores,
        voiceEnabled: state.voiceEnabled,
        voiceId: state.voiceId,
        usedQuestions: state.usedQuestions,
      };
    }

    case "SET_INTRO": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "intro") return state;
      const commentary = action.payload?.commentary;
      if (typeof commentary !== "string" || !commentary.trim()) return state;
      return { ...state, introText: commentary.trim() };
    }

    case "SET_TUTORIAL_STEP": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "intro") return state;
      const step = action.payload?.tutorialStep;
      if (typeof step !== "number" || !Number.isFinite(step)) return state;
      return { ...state, tutorialStep: Math.max(0, Math.round(step)) };
    }

    case "BEGIN": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "intro") return state;
      return openAccusationWindow(state, ctx);
    }

    case "SUBMIT_ACCUSATION": {
      if (state.phase !== "accusation") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;
      if (!state.assignments[ctx.playerId]) return state;

      const text =
        typeof action.payload?.accusation === "string"
          ? action.payload.accusation.trim().slice(0, MAX_ACCUSATION_LENGTH)
          : "";
      if (!text) return state;

      const next: PRState = {
        ...state,
        accusations: { ...state.accusations, [ctx.playerId]: text },
      };

      const reporters = ctx.room.players.filter(
        (p) => next.assignments[p.id] !== undefined
      );
      const allFiled =
        reporters.length > 0 &&
        reporters.every((p) => next.accusations[p.id] !== undefined);

      return allFiled ? closeAccusationWindow(next, ctx) : next;
    }

    case "CLOSE_ACCUSATION": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "accusation") return state;
      // Need at least one filing to build a docket.
      if (Object.keys(state.accusations).length === 0) return state;
      return closeAccusationWindow(state, ctx);
    }

    case "SET_REFRAMES": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "reframing") return state;
      const raw = action.payload?.reframes;
      if (!raw || typeof raw !== "object") return state;

      const reframes: Record<string, string> = {};
      for (const p of ctx.room.players) {
        const val = raw[p.id];
        if (typeof val === "string" && val.trim()) {
          reframes[p.id] = val.trim().slice(0, MAX_ACCUSATION_LENGTH);
        }
      }
      if (Object.keys(reframes).length === 0) return state;
      return { ...state, reframes, phase: "interview" };
    }

    case "SUBMIT_EXPLANATION": {
      if (state.phase !== "interview") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      const text =
        typeof action.payload?.explanation === "string"
          ? action.payload.explanation.trim().slice(0, MAX_EXPLANATION_LENGTH)
          : "";
      if (!text) return state;

      const next: PRState = {
        ...state,
        explanations: { ...state.explanations, [ctx.playerId]: text },
      };

      const allDone = ctx.room.players.every(
        (p) => next.explanations[p.id] !== undefined
      );
      return allDone ? buildCases(next, ctx) : next;
    }

    case "SKIP_INTERVIEW": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "interview") return state;
      return buildCases(state, ctx);
    }

    case "SET_CASE_RESOLUTION": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "case_prep") return state;
      const index = action.payload?.index;
      if (
        typeof index !== "number" ||
        index < 0 ||
        index >= state.cases.length
      ) {
        return state;
      }

      const hrResponse =
        typeof action.payload?.hrResponse === "string"
          ? action.payload.hrResponse.trim()
          : "";
      const guideline =
        typeof action.payload?.guideline === "string"
          ? action.payload.guideline.trim()
          : "";
      if (!hrResponse || !guideline) return state;

      const cases = state.cases.map((x, i) =>
        i === index ? { ...x, hrResponse, guideline } : x
      );

      const nudges = sanitizeNudges(action.payload?.nudges);
      const allReady = cases.every((c) => c.guideline);

      if (allReady) {
        // Open the first editing window on a shared clock.
        return {
          ...state,
          cases,
          nudges: nudges.length > 0 ? nudges : state.nudges,
          phase: "editing",
          editStep: "blackout",
          editStartedAt: ctx.now(),
          editReady: {},
        };
      }
      return {
        ...state,
        cases,
        nudges: nudges.length > 0 ? nudges : state.nudges,
        phase: "case_prep",
      };
    }

    // Autosave the current selection/replacements onto the editor's case so
    // nothing is lost when a window closes — even if they never hit Ready.
    case "SAVE_EDIT": {
      if (state.phase !== "editing") return state;
      const index = state.cases.findIndex((c) => c.editorId === ctx.playerId);
      if (index < 0) return state;
      const c = state.cases[index];
      const tokens = tokenizeGuideline(c.guideline ?? "");
      const blackedOut = sanitizeBlackout(action.payload?.blackedOut, tokens.length);
      const replacements = sanitizeReplacements(
        action.payload?.replacements,
        blackedOut
      );
      const cases = state.cases.map((x, i) =>
        i === index ? { ...x, blackedOut, replacements } : x
      );
      return { ...state, cases };
    }

    // Save + mark this editor ready for the current window. When every editor is
    // ready, the window advances early (no waiting on the timer).
    case "SET_EDIT_READY": {
      if (state.phase !== "editing") return state;
      const index = state.cases.findIndex((c) => c.editorId === ctx.playerId);
      if (index < 0) return state;
      const c = state.cases[index];
      const tokens = tokenizeGuideline(c.guideline ?? "");
      const blackedOut = sanitizeBlackout(action.payload?.blackedOut, tokens.length);
      const replacements = sanitizeReplacements(
        action.payload?.replacements,
        blackedOut
      );
      const ready = action.payload?.ready !== false;
      const cases = state.cases.map((x, i) =>
        i === index ? { ...x, blackedOut, replacements } : x
      );
      const editReady = { ...state.editReady, [ctx.playerId]: ready };
      const next: PRState = { ...state, cases, editReady };
      const editors = editorIds(cases);
      const allReady =
        editors.length > 0 && editors.every((id) => editReady[id]);
      return allReady ? advanceEditStep(next, ctx) : next;
    }

    // Timer for the current window expired (driver-owned) — advance for everyone.
    case "ADVANCE_EDIT_STEP": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "editing") return state;
      return advanceEditStep(state, ctx);
    }

    case "CLOSE_EDITING": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "editing") return state;
      return {
        ...finalizeEdits(state),
        revealIndex: 0,
        revealStartedAt: ctx.now(),
        phase: "reveal",
      };
    }

    case "SET_GUIDELINE_COMMENT": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "reveal") return state;
      const index = action.payload?.index;
      if (
        typeof index !== "number" ||
        index < 0 ||
        index >= state.cases.length
      ) {
        return state;
      }
      const comment =
        typeof action.payload?.comment === "string"
          ? action.payload.comment.trim().slice(0, MAX_GUIDELINE_COMMENT_LENGTH)
          : "";
      if (!comment) return state;
      if (state.guidelineComments[index]) return state; // already posted
      return {
        ...state,
        guidelineComments: { ...state.guidelineComments, [index]: comment },
      };
    }

    case "SUBMIT_COMMENT": {
      if (state.phase !== "reveal") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;
      const text =
        typeof action.payload?.comment === "string"
          ? action.payload.comment.trim().slice(0, MAX_COMMENT_LENGTH)
          : "";
      if (!text) return state;
      const idx = state.revealIndex;
      const thread = { ...(state.revealComments[idx] ?? {}) };
      thread[ctx.playerId] = text;
      return {
        ...state,
        revealComments: { ...state.revealComments, [idx]: thread },
      };
    }

    case "NEXT_REVEAL": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "reveal") return state;
      if (state.revealIndex < state.totalCases - 1) {
        return {
          ...state,
          revealIndex: state.revealIndex + 1,
          revealStartedAt: ctx.now(),
        };
      }
      return { ...state, phase: "voting" };
    }

    case "SUBMIT_FAVORITE": {
      if (state.phase !== "voting") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;
      const index = action.payload?.favorite;
      if (
        typeof index !== "number" ||
        index < 0 ||
        index >= state.cases.length
      ) {
        return state;
      }
      // Cannot vote for a guideline you edited.
      if (state.cases[index].editorId === ctx.playerId) return state;

      const next: PRState = {
        ...state,
        favorites: { ...state.favorites, [ctx.playerId]: index },
      };
      const allVoted = ctx.room.players.every(
        (p) => next.favorites[p.id] !== undefined
      );
      return allVoted ? scoreRound(next, ctx) : next;
    }

    case "CLOSE_VOTING": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "voting") return state;
      return scoreRound(state, ctx);
    }

    case "NEXT_ROUND": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "round_over") return state;
      if (state.investigationRound < state.totalInvestigationRounds) {
        return openAccusationWindow(
          {
            ...state,
            investigationRound: state.investigationRound + 1,
            totalCases: ctx.room.players.length,
            cases: [],
            nudges: [],
          },
          ctx
        );
      }
      return { ...state, phase: "game_over" };
    }

    case "SET_FINAL": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "game_over") return state;
      const commentary = action.payload?.commentary;
      if (typeof commentary !== "string" || !commentary.trim()) return state;
      return { ...state, finalCommentary: commentary.trim() };
    }

    case "SET_VOICE": {
      if (!isHost(ctx)) return state;
      let voiceEnabled = state.voiceEnabled;
      let voiceId = state.voiceId;
      if (typeof action.payload?.enabled === "boolean") {
        voiceEnabled = action.payload.enabled;
      }
      if (
        typeof action.payload?.voiceId === "string" &&
        PR_VOICE_IDS.includes(action.payload.voiceId)
      ) {
        voiceId = action.payload.voiceId;
      }
      return { ...state, voiceEnabled, voiceId };
    }

    case "PLAY_AGAIN": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "game_over") return state;
      return {
        ...initialState(ctx.room.players),
        heat: state.heat,
        voiceEnabled: state.voiceEnabled,
        voiceId: state.voiceId,
        usedQuestions: state.usedQuestions,
      };
    }

    default:
      return state;
  }
}

// ============================================================================
// Game template
// ============================================================================

export const performanceReviewGame = defineGame<PRState, PRAction>({
  id: "performance-review",
  name: "HR Investigation",
  description:
    "File a complaint, survive the interview, and turn every workplace incident into company policy. HR thanks you in advance.",
  minPlayers: 3,
  maxPlayers: 8,
  initialState,
  reducer,
  getPhase,
  isActionAllowed(state, action, ctx) {
    switch (action.type) {
      case "START_GAME":
        return isHost(ctx) && state.phase === "lobby";
      case "SET_INTRO":
        return canDrive(ctx) && state.phase === "intro";
      case "SET_TUTORIAL_STEP":
        return isHost(ctx) && state.phase === "intro";
      case "BEGIN":
        return isHost(ctx) && state.phase === "intro";
      case "SUBMIT_ACCUSATION":
        return (
          state.phase === "accusation" &&
          state.assignments[ctx.playerId] !== undefined
        );
      case "CLOSE_ACCUSATION":
        return isHost(ctx) && state.phase === "accusation";
      case "SET_REFRAMES":
        return canDrive(ctx) && state.phase === "reframing";
      case "SUBMIT_EXPLANATION":
        return state.phase === "interview";
      case "SKIP_INTERVIEW":
        return isHost(ctx) && state.phase === "interview";
      case "SET_CASE_RESOLUTION":
        return canDrive(ctx) && state.phase === "case_prep";
      case "SAVE_EDIT":
      case "SET_EDIT_READY":
        return (
          state.phase === "editing" &&
          state.cases.some((c) => c.editorId === ctx.playerId)
        );
      case "ADVANCE_EDIT_STEP":
        return canDrive(ctx) && state.phase === "editing";
      case "CLOSE_EDITING":
        return isHost(ctx) && state.phase === "editing";
      case "SET_GUIDELINE_COMMENT":
        return canDrive(ctx) && state.phase === "reveal";
      case "SUBMIT_COMMENT":
        return state.phase === "reveal";
      case "NEXT_REVEAL":
        return canDrive(ctx) && state.phase === "reveal";
      case "SUBMIT_FAVORITE":
        return state.phase === "voting";
      case "CLOSE_VOTING":
        return isHost(ctx) && state.phase === "voting";
      case "NEXT_ROUND":
        return isHost(ctx) && state.phase === "round_over";
      case "SET_FINAL":
        return canDrive(ctx) && state.phase === "game_over";
      case "SET_VOICE":
        return isHost(ctx);
      case "PLAY_AGAIN":
        return isHost(ctx) && state.phase === "game_over";
      default:
        return true;
    }
  },
});
