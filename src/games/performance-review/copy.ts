// ============================================================================
// HR Investigation — theme copy
// ----------------------------------------------------------------------------
// One company, one voice. Everything static the player reads comes from here so
// the fiction stays consistent: plausible corporate communication first, dry
// managerial satire second, and — sparingly — a detail that is not entirely
// right. The wrongness is never explained. It is treated as routine.
//
// House rules for writing in this file:
//   - ~50% plausible corporate, ~25% dry satire, ~25% quietly wrong. About
//     half of what a player reads should carry something slightly off,
//     always delivered as ordinary administrative context.
//   - No exclamation marks. No horror theatrics. No "we are watching you."
//     The wrongness is never explained, never reacted to, never escalated.
// ============================================================================

// ----------------------------------------------------------------------------
// Deterministic helpers — the room polls every second, so anything rendered
// during a wait must NOT reshuffle on every poll. Seed by room/phase/round.
// ----------------------------------------------------------------------------

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function pickStable<T>(arr: T[], seed: string): T {
  return arr[hashSeed(seed) % arr.length];
}

// ============================================================================
// Personnel Orientation — the synchronized onboarding, reframed as an internal
// compliance briefing. Four modules; the host advances them for the room.
// ============================================================================

export type OrientationModule = {
  procedureId: string; // "ORIENTATION 01 / 04"
  tag: string; // module classification shown top-right
  title: string;
  body: string;
  kind: "roster" | "mock";
  mockTitle?: string;
  mockBody?: string;
};

/**
 * Roster line status — plain attendance for some, something slightly off for
 * others. Deterministic per room so it never reshuffles between polls.
 */
const ODD_STATUSES = [
  "PRESENT · AGAIN",
  "PRESENT · AS BEFORE",
  "PRESENT · SEE FILE",
  "PRESENT · STILL RECOGNIZABLE",
  "PRESENT · MATCHES DESCRIPTION",
];
export function rosterStatus(name: string, index: number, roomSeed: string, total: number): string {
  // Roughly half the roster reads plainly; the rest carry a note.
  const odd = hashSeed(`${roomSeed}:roster:${name}`) % 2 === 0;
  if (!odd) return "PRESENT";
  return ODD_STATUSES[hashSeed(`${roomSeed}:status:${name}`) % ODD_STATUSES.length];
}

export function buildOrientationModules(names: string[]): OrientationModule[] {
  const n = names.length;
  const a = names[0] ?? "Employee A";
  const b = names[1 % n] ?? "Employee B";
  const c = names[2 % n] ?? "Employee C";

  return [
    {
      procedureId: "ORIENTATION 01 / 04",
      tag: "PERSONNEL VERIFICATION",
      title: "Attendance",
      body:
        `This department has been selected for a routine internal investigation. ` +
        `${n} employees are present. ${n} were expected. ` +
        `Your names were already on the list. The list is older than this session. ` +
        `Do not ask which list.`,
      kind: "roster",
    },
    {
      procedureId: "ORIENTATION 02 / 04",
      tag: "PEER DOCUMENTATION",
      title: "Reporting on a colleague",
      body:
        "Each of you will be assigned one colleague and one reporting question. " +
        "Answer it in your own words. Be specific — names, incidents, condiments. " +
        "Vague reports create additional paperwork, and the department that handles " +
        "additional paperwork is no longer reachable.",
      kind: "mock",
      mockTitle: `HR REPORT — RE: ${b} (EXAMPLE)`,
      mockBody:
        `Q: Has ${b} been taking suspiciously long breaks?\n\n` +
        `Filed by ${a}: "${b} disappears whenever the printer needs paper. Every single time."\n\n` +
        `Your question will differ. Your colleague will not. This example was taken from a previous cohort.`,
    },
    {
      procedureId: "ORIENTATION 03 / 04",
      tag: "EMPLOYEE RESPONSE",
      title: "Your interview",
      body:
        "A report will also be filed about you. You will be shown HR's processed " +
        "version and offered space to provide a statement. Provide the version of " +
        "events you would prefer retained. Management has usually heard both versions before.",
      kind: "mock",
      mockTitle: `EMPLOYEE STATEMENT — ${c} (EXAMPLE)`,
      mockBody:
        `Complaint on file: "Concerns have been raised regarding your relationship with the office thermostat."\n\n` +
        `Statement of ${c}: "The thermostat and I have an understanding."\n\n` +
        `The statement was recorded. Recording is not the same as believing.`,
    },
    {
      procedureId: "ORIENTATION 04 / 04",
      tag: "POLICY & PERFORMANCE REVIEW",
      title: "Rulings, guidelines, recognition",
      body:
        "HR rules on each case and converts the incident into a new Company Guideline. " +
        "Every guideline is then reviewed by the group in ONE of TWO formats, and the two " +
        "formats ALTERNATE from case to case:\n\n" +
        "• Spectrum Review — one employee privately rates the policy; everyone else estimates " +
        "that rating.\n" +
        "• Guideline Thread — everyone comments on the policy; the funniest comments earn votes, " +
        "and @-identifying the employee who caused it earns a bonus.\n\n" +
        "You do not choose the format. Each new guideline also replaces a version some employees " +
        "may remember.",
      kind: "mock",
      mockTitle: "REVIEW FORMATS — ALTERNATING",
      mockBody:
        "Case 01 → Spectrum Review\n" +
        "Case 02 → Guideline Thread\n" +
        "Case 03 → Spectrum Review\n" +
        "...and so on. Attendance in both formats is expected.\n\n" +
        "Scoring: accurate estimate up to 5 pts · each vote on your comment 2 pts · correct " +
        "@-identification +3 pts. Three reporting cycles decide the Employee of the Cycle.\n" +
        "Performance Points are not compensation. Do not attempt to redeem them.",
    },
  ];
}

// Spoken when the host waives orientation — witty, faintly put out that you
// already seem to know the procedure. Read aloud; one is picked at random.
export const WAIVE_LINES = [
  "Orientation waived. I did not realize you had already been through this. Neither did your file.",
  "Skipping ahead. Most employees who already know the procedure learned it somewhere. We will not ask where.",
  "Orientation waived, then. It is refreshing to meet a cohort that remembers a training it was never given.",
  "Very well. Comprehension will be assumed. It usually is, and it usually should not be.",
  "Noted. You would rather begin. The last group that felt this prepared is why we now hold orientation.",
  "Orientation marked complete. Your confidence has been recorded, and will be revisited.",
];

// Orientation controls (host-only actions, in-world labels).
export const ORIENTATION_NEXT_LABEL = "Acknowledge and Continue";
export const ORIENTATION_BEGIN_LABEL = "Begin Case Intake";
export const ORIENTATION_WAIVE_LABEL = "Waive Orientation — Recorded";
export const ORIENTATION_PREPARING_LABEL = "Management is preparing remarks...";
export const ORIENTATION_NONHOST_HINT =
  "Orientation is administered by the host. Comprehension will be assumed.";

// ============================================================================
// Lobby
// ============================================================================

export const LOBBY_TERMINAL_LINES = [
  "Channel open. Staff may identify themselves. Attendance is being recorded.",
  "Channel open. Attendance is voluntary in the technical sense.",
  "Channel open. This channel is monitored for quality and other purposes.",
  "Channel open. Seating is not assigned. Seating is remembered.",
  "Channel open. The wellness floor remains unavailable. Assemble here instead.",
  "Channel open. Do not compare case numbers with other departments.",
  "Channel open. If you have received this message before, disregard the previous instance.",
  "Channel open. Management appreciates your continued recognizability.",
];

export const LOBBY_EXPLAINER =
  "A routine internal investigation. Everyone files a report on an assigned colleague; " +
  "everyone is interviewed about the report filed on them; HR converts each incident into " +
  "a new Company Guideline, which the group then rates or roasts. Three reporting cycles. " +
  "Performance Points determine the Employee of the Cycle. Previous cohorts found the " +
  "process clarifying.";

export const MIN_HEADCOUNT_LABEL = "Minimum viable department: 3";

// ============================================================================
// Heat — review intensity. Affects how pointed the host is about behavior,
// never how wrong the company is.
// ============================================================================

export const HEAT_DESCRIPTIONS: Record<string, string> = {
  mild: "Constructive. Suitable for open-plan offices.",
  spicy: "Direct. Names will be used.",
  scorched: "Candid. HR has stopped pretending.",
};

// ============================================================================
// Fallbacks — the company does not pause when the intelligence layer is out.
// These must read as the same character as the generated content.
// ============================================================================

export function fallbackIntro(names: string[]): string {
  const n = names.length;
  if (n === 0) {
    return "Attendance could not be confirmed. The investigation will proceed anyway.";
  }
  const a = names[0];
  const b = names[1 % n];
  const greet =
    n >= 3
      ? `${a}, ${b} — welcome. ${names[2]}, welcome back. You were not told this was happening again, and yet here you are, on time.`
      : `${a}, ${b} — welcome. Your files were already open when you arrived.`;
  return (
    `Attendance confirmed. ${n} employees are present, as expected. ` +
    `${greet} ` +
    `This department has been selected for a routine internal investigation. ` +
    `Orientation will be brief. Most of you have completed it before, whether or not you remember it that way.`
  );
}

// Managerial rewrites of a raw filing ({raw} interpolated).
export const FALLBACK_REFRAME_TEMPLATES = [
  'Concerns have been raised regarding your recent conduct. Specifically: "{raw}". HR considers this a growth area.',
  'A colleague has documented the following observation: "{raw}". It has been added to the record.',
  'It has come to HR\'s attention that "{raw}". No conclusions have been drawn. Several have been prepared.',
  'The following has been logged: "{raw}". Management is treating it as routine.',
  'Per a peer submission: "{raw}". This aligns with earlier observations that were never written down.',
  'The following has been reported: "{raw}". A matching entry already existed. The dates do not align.',
  'A colleague has stated: "{raw}". The previous occupant of your desk was flagged for the same behavior.',
];

export function fallbackReframe(raw: string): string {
  if (!raw.trim()) {
    return "HR has flagged conduct that was not described in detail. The absence of detail has itself been noted.";
  }
  const t =
    FALLBACK_REFRAME_TEMPLATES[
      Math.floor(Math.random() * FALLBACK_REFRAME_TEMPLATES.length)
    ];
  return t.replace(/\{raw\}/g, raw);
}

// HR rulings ({name} interpolated).
export const FALLBACK_HR_RESPONSES = [
  "{name}, thank you for your statement. It has been weighed against the complaint and found lighter.",
  "{name}, your account has been reviewed. Management believes that you believe it.",
  "{name}, HR accepts that you had reasons. Reasons are recorded in a separate, smaller column.",
  "Your explanation has been recorded, {name}. Recording is not the same as accepting, but the paperwork looks identical.",
  "{name}, the incident stands as described. Your version has been retained for training purposes.",
  "HR thanks you for your candor, {name}. It has been logged as a contributing factor.",
  "{name}, no further action will be taken at this time. The phrase 'at this time' was selected carefully.",
  "{name}, management has reviewed both versions of events and selected the useful one.",
  "{name}, your statement matches one already on file. You have not given a statement here before. Noted.",
  "{name}, HR has heard this explanation before, word for word, from someone who no longer works on this floor.",
  "{name}, your statement has been accepted and filed with the others. There are more of them than you would expect.",
];

export const FALLBACK_GUIDELINES = [
  "Effective immediately, employees may not describe a group lunch as 'technically a hostage situation' unless at least two managers are present.",
  "The office microwave may only be operated by employees who have completed Scent Accountability training.",
  "'Reply all' is now classified as a controlled substance and requires written pre-approval from a supervisor and a witness.",
  "Any desk plant that dies is a shared team failure and will be discussed at length in every future meeting.",
  "Employees claiming to be 'almost done' must provide a notarized estimate and a photograph of the progress.",
  "Use of the phrase 'per my last email' is permitted only during declared corporate emergencies.",
  "No employee may schedule a meeting that could have been an email, an email that could have been a message, or a message that could have been silence.",
  "Employees may describe the break room as 'fine.' Additional adjectives require documentation.",
  "Personal items left in the refrigerator past Friday become the responsibility of no one.",
  "Staff are reminded that the suggestion box is for suggestions, not questions.",
  "Employees are reminded that the stairwell renovation between floors three and five is ongoing. There is no fourth floor and there never has been.",
  "This guideline replaces the version some employees may remember. The remembered version was never issued.",
  "Effective immediately, employees may not discuss this guideline with departments that no longer respond.",
  "Badge photos will be retaken annually so that employees continue to match their descriptions.",
];

export const FALLBACK_SPECTRUMS: Array<{
  question: string;
  leftLabel: string;
  rightLabel: string;
}> = [
  { question: "How severe is this workplace violation?", leftLabel: "A brave breakfast choice", rightLabel: "Federal building evacuation" },
  { question: "How much should HR care about this?", leftLabel: "Genuinely nobody's business", rightLabel: "Grounds for a task force" },
  { question: "Where does this land on the conduct scale?", leftLabel: "Beloved office quirk", rightLabel: "Permanent record, red ink" },
  { question: "How dangerous is this precedent?", leftLabel: "Charming misunderstanding", rightLabel: "The reason we have lawyers" },
  { question: "How necessary is this new policy?", leftLabel: "Utterly pointless", rightLabel: "Should have existed for decades" },
  { question: "How would the previous department have handled this?", leftLabel: "Quiet chuckle at the sink", rightLabel: "That is why they are the previous department" },
];

// Shown one at a time while employees "work." Half routine, half not quite.
export const FALLBACK_NUDGES = [
  "Please continue.",
  "Take your time. Within reason.",
  "No action is required from you at this moment. Enjoy it.",
  "Productivity remains within tolerance.",
  "This waiting period counts as focus time.",
  "Your pace has been recorded as 'a pace.'",
  "The metrics have noticed nothing unusual.",
  "Your chair reports that you are sitting correctly.",
  "Someone on your floor is also waiting. Do not look for them.",
  "The previous occupant of your seat finished faster.",
  "Your badge photo has been updated. No action was taken by you.",
  "The building would like to remind you that it is a normal building.",
  "You have been waiting for an acceptable duration. This is not a compliment.",
];

export function fallbackFinal(topName: string | undefined): string {
  if (!topName) {
    return "The investigation cycle is complete. The records are not. You may return to your duties.";
  }
  return (
    `The investigation cycle is complete. The records are not. ` +
    `${topName} has been identified as Employee of the Cycle. Recognition will occur when appropriate, ` +
    `as it did for the previous Employee of the Cycle, whose name has been retired. ` +
    `The rest of you have been noted. You may return to your duties. The exits are where you remember them.`
  );
}

// ============================================================================
// Between-cycle transitions — static, no AI call. Rounds 2 and 3 open with one
// line in the intake screen. Index 0 unused (round 1 has the orientation).
// ============================================================================

export const ROUND_OPENINGS: Record<number, string> = {
  2: "The first reporting cycle produced insufficient behavioral correction. A second cycle has been authorized. Previous statements remain active and have been re-read.",
  3: "A final reporting cycle has been authorized. Management is confident this will be sufficient. It was sufficient for the previous cohort, eventually.",
};

// ============================================================================
// Waiting / processing copy (deterministic pools — see pickStable)
// ============================================================================

export const REFRAMING_LINES = [
  "Statements are being made more professional.",
  "Your complaints are being converted into approved language.",
  "Nuance is being removed for clarity.",
  "Wording is under review. The facts were fine.",
  "Your complaints are being cross-referenced with complaints nobody here filed.",
  "Approved language is being applied. The original language has been stored somewhere safe.",
];

export const CASE_PREP_LINES = [
  "HR is identifying the policy failure that allowed this.",
  "Both versions of events are being reviewed. One will be selected.",
  "A guideline is being prepared for employees who require one.",
  "Deliberation is underway. It concludes when it concludes.",
  "Precedent is being consulted. The precedent predates this office.",
  "A ruling is being drafted. The outcome was drafted earlier.",
];

export const REPORT_FILED_LINES = [
  "Filed. Its accuracy is no longer your responsibility.",
  "Filed. HR understood what you meant.",
  "Filed. Edits are unnecessary at this stage.",
  "Filed. Your handwriting has improved since your last report. You typed this one too.",
];

export const B_VOTE_TERMINAL =
  "Comments are in. Recognize your colleague's finest contribution.";

// ============================================================================
// Ambient narrator banter — spoken aloud on a loose 11-24s cadence during the
// working phases (reports, statements, challenges), low priority so it never
// steps on a guideline or ruling. This is the STATIC baseline / offline pool;
// when the AI is reachable it also returns lines that reference what players
// actually wrote. Witty and unsettling, always delivered as routine.
// ============================================================================

export const BANTER_LINES = [
  "Keep writing. HR reads faster than you type.",
  "Someone in this room has done this before. They are pretending otherwise.",
  "Do not mind the cursor. It blinks whether or not you are watched.",
  "Your colleagues are being more honest than you. Statistically, that is unusual.",
  "The quiet ones always have the longest files.",
  "I can hear you thinking. It is not as private as you assume.",
  "Take your time. Time is the one thing we keep an accurate record of.",
  "Two of you paused at the same moment. HR found that interesting.",
  "Whatever you are about to delete, HR already saw it.",
  "The employee to your left is doing fine. Do not ask which left.",
  "Honesty is encouraged. It is also easier to file.",
  "You are doing well. 'Well' is a category with a wide bottom.",
  "The last person who sat where you are sitting also hesitated here.",
  "Nothing you write will surprise us. We would prefer you tried anyway.",
  "A draft is just a confession you have not committed to yet.",
  "Somewhere a printer is warming up. Nobody sent anything to it.",
  "Your keystrokes are within normal parameters. The parameters are wide today.",
  "HR appreciates a specific answer. Vagueness is a decision, and it is noted as one.",
  "Relax your shoulders. This is a friendly investigation. They are all friendly.",
  "The room temperature is correct. Please stop adjusting to it.",
  "You have been recognizable for the entire session. Thank you for your consistency.",
  "One of you keeps glancing at the exit. It is decorative.",
  "HR has read this sort of thing before. From you, specifically. Continue.",
  "The lights are the standard number of lights. Do not count them again.",
  "Your badge is still valid. Validity is reviewed hourly.",
  "Everyone is contributing. Some contributions are being weighted at zero.",
  "The employee who finishes first is not the winner. There is no winner during this part.",
  "A colleague just smiled. It has been logged pending interpretation.",
  "You paused. HR did not. HR does not pause.",
  "That was a long sentence. Long sentences are where people hide things.",
  "Please continue. The silence was starting to form an opinion.",
  "Your chair remembers the last three people who used it. You are the fourth.",
  "We are not comparing you to the previous cohort. We are simply noticing the resemblance.",
  "The coffee machine has been unplugged since Tuesday. Several of you still hear it.",
  "Keep going. The form does not end because you are tired of it.",
  "Someone typed a name and deleted it. HR restored the name.",
  "You are within acceptable limits. The limits were adjusted this morning to accommodate you.",
  "The meeting after this one has already happened. You did well in it.",
  "HR values candor. HR also keeps the parts you did not intend to share.",
  "There is a fourth floor in the directory and nowhere in the building. Do not investigate.",
  "The employee in the reflection is you. We checked, because occasionally it is not.",
  "Your answer is being cross-referenced with an answer you have not given yet.",
  "Breathing is not monitored. The monitoring of breathing was found redundant.",
  "You are almost finished. 'Almost' is a status we can keep you in indefinitely.",
  "Someone here requested a copy of their file. The request is part of the file now.",
  "The plant on the third floor is thriving. HR would like to know who it reminds you of.",
  "Do not worry about the humming. The humming is scheduled.",
  "Your tone has improved. HR did not mention your tone. Interesting that you assumed.",
  "Everything you are doing is normal for this company. Adjust your definition accordingly.",
  "Thank you for remaining seated, recognizable, and largely the same person as when you arrived.",
];

// ============================================================================
// Ambient host "shade" — rotated through the terminal while employees write
// reports (accusation) and statements (interview), to fill the wait. Dry,
// group-directed, "hurry up / be honest" energy. NEVER spoken aloud — these
// rotate too often for TTS. Half plausible, half quietly wrong, per house rules.
// ============================================================================

export const ACCUSATION_SHADE = [
  "Report received. Several colleagues are still choosing their words. HR notes who hesitates.",
  "You have finished. Others have not. This reflects well on you and poorly on them.",
  "Be specific. A vague report protects your colleague, and HR does not reward mercy.",
  "The unfinished reports are the interesting ones. HR watches the blank fields.",
  "Honesty is not taking your colleagues this long. Draw your own conclusions. HR already has.",
  "Take your time. Everyone else is. Their time is also being recorded.",
  "Remain available. The employees still typing are deciding how much to admit.",
  "A thorough report today prevents a longer conversation later. There is always a longer conversation.",
  "Someone is writing about you right now. This is not related to your report. Or it is.",
];

export const INTERVIEW_SHADE = [
  "Statement received. The longer statements are still arriving. Length rarely improves honesty.",
  "You have spoken. Some colleagues are still rehearsing. HR can tell the difference.",
  "Remain available. The employees still typing are the ones with the most to explain.",
  "Be candid. HR already has a version it prefers, and yours is being graded against it.",
  "The others are taking their time. HR has all of it.",
  "Recorded. HR notes that the truthful statements arrived first. Yours was among them. Technically.",
  "A statement is not a defense. Several employees appear to have confused the two.",
  "Your account has been placed beside the account HR expected. They are close. Not identical.",
  "Silence is also a statement. It is the one HR finds easiest to interpret.",
];

// ============================================================================
// Misc labels
// ============================================================================

export const GUIDELINE_CARD_LABEL = "Company Guideline — effective immediately";
