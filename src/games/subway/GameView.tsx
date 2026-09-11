"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CrewBoard } from "./CrewBoard";
import { constructionCardBlocker, objectiveMet } from "./config";
import { lessonForPhase } from "./tutorial";
import type { GameViewProps } from "@/games/views";
import { DestinationCardFace, EngineeringCardFace } from "./CardArt";
import { ContractCard, MiniCardFace, money } from "./cards";
import { Board, VB_W, type DrawnLine } from "./board";
import { TabletopCanvas, type CameraApi, type TableZone } from "./canvas";
import {
  CardFlight,
  CardFocus,
  CardPiece,
  ContractOffice,
  LineTile,
  RouteBuildGuide,
  Logbook,
  OpponentEdge,
  Pill,
  PlayerTabletop,
  Printed,
  ScheduleBoard,
  TABLE,
  TableButton,
  type FocusAction,
  type FocusRef,
  type PlanChip,
} from "./table";
import { HandoffVeil, NarrationOverlay, currentActorId, useNarration } from "./tabletop";
import { loadPlan, savePlan, planStorageKey, preparePlan, reconcilePlan, type PlanStatus, type SavedPlan } from "./plans";
import { generateAiPlaytestReport } from "./report";
import {
  SUBWAY_CONFIG,
  blockPeriods,
  SUBWAY_STATE_VERSION,
  basePriorityId,
  cardDraftBlocker,
  cardDraftTurnId,
  draftPicks,
  constructionById,
  contestedPeriods,
  contractById,
  contractNodes,
  committedStatus,
  contractOf,
  crewCost,
  contractsOutstanding,
  destinationById,
  destinationMet,
  destinationProblems,
  destinationTurnId,
  destinationsHeld,
  engineeringById,
  legalTargets,
  lineComplete,
  nextSegmentLength,
  pendingStarters,
  schedulingById,
  segmentsBuilt,
  starterTurnId,
  stationAt,
  stationById,
  surveyBlocker,
  surveyTurnId,
  surveysPending,
  validateNode,
  type CardDeckId,
  type ConstructionCardId,
  type PlacementTarget,
  type PlayerLine,
  type Point,
  type RouteNode,
  type SchedulingCardId,
  type SubwayPlayer,
  type SubwayState,
} from "./config";

// ============================================================================
// Subway is played on one continuous, zoomable tabletop (DEC-023).
//
// This file composes that table — opponent edge, schedule board, contract
// office, pegboard, site logbook, the viewer's own edge — inside a single
// camera, and keeps only the thin screen-level HUD outside it: status, camera
// controls, narration, and the Confirm/Cancel strip.
//
// The reducer stays authoritative for every rule; nothing here decides
// legality. Privacy remains a rendering convention under invariant 11.
// ============================================================================

const PHASE_LABELS: Record<string, string> = {
  SETUP: "Setup",
  PROCUREMENT: "Procurement",
  ENGINEERING: "Engineering",
  SCHEDULING: "Scheduling",
  STARTER_PLACEMENT: "Starter placement",
  CONSTRUCTION: "Construction",
  SCORING: "Scoring",
  RESULTS: "Results",
};

/** The table is as wide as its three columns; the camera does the rest. */
const BOARD_FRAME_W = VB_W + 52;
const WORLD_W = TABLE.margin * 2 + TABLE.side * 2 + TABLE.gap * 2 + BOARD_FRAME_W;

const lineLabel = (line: PlayerLine): string => contractOf(line)?.name ?? "Line";

const opponentOf = (game: SubwayState, me: SubwayPlayer): SubwayPlayer | undefined =>
  game.playerOrder.map((id) => game.players[id]).find((p) => p && p.id !== me.id);

/** Room state is plain JSON by invariant, so this is a safe deep copy. */
const cloneState = (s: SubwayState): SubwayState => JSON.parse(JSON.stringify(s)) as SubwayState;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Status = { headline: string; tone: "act" | "wait" | "info"; detail?: string };

/** Per-client status derived from authoritative state, never from the shared
 *  broadcast message — so it can never claim the wrong player is acting. */
function statusFor(game: SubwayState, me: SubwayPlayer | undefined, isHost: boolean): Status {
  if (!me) return { headline: "You are spectating this transit contest.", tone: "info" };
  const oppName = "the other companies";

  switch (game.phase) {
    case "SETUP":
      return isHost
        ? { headline: "Start the game when all companies are ready.", tone: "act" }
        : { headline: "Waiting for the host to start.", tone: "wait" };
    case "PROCUREMENT": {
      const offer = game.procurement.offer;
      if (!offer) return { headline: "Shuffling the contract deck…", tone: "wait" };
      return {
        headline: offer.activeId === me.id ? "Choose one route contract." : `${game.players[offer.activeId]?.name} is choosing a route.`,
        tone: offer.activeId === me.id ? "act" : "wait",
        detail: "Pick at list price. Three draft rounds, with alternating order.",
      };
    }
    case "ENGINEERING": {
      if (game.engineeringStep === "BUY_SURVEYS") return {headline:me.engineeringLocked ? "Waiting for survey purchases." : "Optionally buy Survey Pins at your cards.",tone:me.engineeringLocked?"wait":"act"};
      if (game.engineeringStep === "CARD_DRAFT") return {headline: cardDraftTurnId(game) === me.id ? `Draft your hand: ${draftPicks(me)}/6 cards.` : `${game.players[cardDraftTurnId(game) ?? ""]?.name} is drafting.`, tone: cardDraftTurnId(game) === me.id ? "act" : "wait", detail:"Two face-up cards per category or a blind draw. Choose any mix; every Engineering card can score."};
      if (game.engineeringStep === "DESTINATION_DRAFT") {
        const turn = destinationTurnId(game);
        const owed = SUBWAY_CONFIG.destinationsPerPlayer - destinationsHeld(me);
        return turn === me.id
          ? {
              headline: `Draft a Destination — ${owed} to go.`,
              tone: "act",
              detail: "Three are face up in the contract office. Picks are free.",
            }
          : {
              headline: `${game.players[turn ?? ""]?.name ?? oppName} is drafting a Destination.`,
              tone: "wait",
            };
      }
      if (game.engineeringStep === "PLAN") {
        return me.engineeringLocked
          ? { headline: `Plan locked — waiting for ${oppName}.`, tone: "wait" }
          : {
              headline: "Lock your Engineering plan.",
              tone: "act",
              detail: "Three objectives, any Destination assignments, and 0–5 Survey Pins.",
            };
      }
      const turn = surveyTurnId(game);
      if (turn !== me.id) {
        return {
          headline: `${game.players[turn ?? ""]?.name ?? oppName} is placing a Survey Pin.`,
          tone: "wait",
        };
      }
      return {
        headline: `Place a Survey Pin — ${surveysPending(game, me.id)} left.`,
        tone: "act",
        detail: "Tap a normal hole. Pins are public and reserve nothing.",
      };
    }
    case "SCHEDULING":
      if (game.schedulingStep === "PLANNING") {
        return me.scheduleSubmitted
          ? { headline: `Schedule submitted — waiting for ${oppName}.`, tone: "wait" }
          : {
              headline: "Plan your entire construction programme.",
              tone: "act",
              detail: "Every contract gets one contiguous block. Submit when the costs work.",
            };
      }
      return me.scheduleConfirmed
        ? { headline: `Schedule locked — waiting for ${oppName}.`, tone: "wait" }
        : {
            headline: "Both schedules are revealed.",
            tone: "act",
            detail: "Optionally play one Scheduling card, then confirm to pay and lock.",
          };
    case "STARTER_PLACEMENT": {
      const turn = starterTurnId(game);
      if (turn !== me.id) {
        return { headline: `${game.players[turn ?? ""]?.name ?? oppName} is placing a starter peg.`, tone: "wait" };
      }
      const pending = pendingStarters(me);
      return {
        headline: `Place the free starter peg for your ${lineLabel(me.lines[pending[0]])}.`,
        tone: "act",
        detail: "Starters enter from the edge: only border holes glow.",
      };
    }
    case "CONSTRUCTION": {
      const actorId = game.priorityQueue[0] ?? game.resolveQueue[0];
      if (actorId === me.id) {
        return {
          headline: game.priorityQueue.length ? "Use Priority Dispatch or keep your card." : !me.crewsHired ? "Choose crews at Construction schedule." : `Round ${game.currentPeriod} — your build.`,
          tone: "act",
          detail:
            me.pendingActions.length > 1
              ? `${me.pendingActions.length} hired crews ready to build.`
              : "Tap a highlighted target to select it, then Confirm.",
        };
      }
      return {
        headline: `Period ${game.currentPeriod} — ${game.players[actorId]?.name ?? "opponent"} builds.`,
        tone: "wait",
        detail: game.resolveQueue.includes(me.id) ? "You build next this period." : undefined,
      };
    }
    case "SCORING":
      return isHost
        ? { headline: "Construction is over. Reveal Engineering and score.", tone: "act" }
        : { headline: "Waiting for the host to reveal the scoring.", tone: "wait" };
    case "RESULTS":
      return { headline: game.message, tone: "info" };
    default:
      return { headline: game.message, tone: "info" };
  }
}

/** What the next tap on the board does. */
type BoardMode = "none" | "place" | "survey" | "planner";

const PLAN_PHASES = new Set(["ENGINEERING", "SCHEDULING", "STARTER_PLACEMENT", "CONSTRUCTION"]);

export function SubwayGameView({ state, room, playerId, isHost, dispatchAction, lessonZone, lessonBeat = 0 }: GameViewProps<SubwayState> & {lessonZone?: TableZone; lessonBeat?: number}) {
  const raw = state as SubwayState | undefined;
  const stale = !!raw && raw.version !== SUBWAY_STATE_VERSION;
  const game = raw && !stale ? raw : undefined;
  const me = game?.players[playerId];
  const isHotseat = room.mode === "hotseat";

  const [chosen, setChosen] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [surveys, setSurveys] = useState(0);
  useEffect(() => { setSurveys(0); }, [room.roomCode, playerId]);
  const [selectedLine, setSelectedLine] = useState(0);
  const [preview, setPreview] = useState<PlacementTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [mobile, setMobile] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showOpponents, setShowOpponents] = useState(false);
  const [showResults, setShowResults] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px)");
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [notice, setNotice] = useState<string | null>(null);

  // Card focus and its card-play targets.
  const [focus, setFocus] = useState<FocusRef | null>(null);
  const [cardLine, setCardLine] = useState(0);
  const [cardDirection, setCardDirection] = useState<number>(-1);
  const [cardPeriod, setCardPeriod] = useState(1);
  const [flight, setFlight] = useState<{ from: DOMRect; to: { x: number; y: number }; label: string; color: string } | null>(
    null
  );

  // The camera. Client-local by construction: no poll can move it (SA-9).
  const cam = useRef<CameraApi | null>(null);
  useEffect(() => {
    if (!lessonZone) return;
    const timer = setTimeout(() => cam.current?.focus(lessonZone), 150);
    return () => clearTimeout(timer);
  }, [lessonZone, lessonBeat]);
  const [zoomPct, setZoomPct] = useState(100);
  const boardRef = useRef<HTMLDivElement | null>(null);
  // The HUD's real bands, measured: the camera frames zones clear of them, so
  // nothing important ever ends up under the status plate or the action strip.
  const hudTopRef = useRef<HTMLDivElement | null>(null);
  const hudBottomRef = useRef<HTMLDivElement | null>(null);
  const [bands, setBands] = useState({ top: 96, bottom: 140 });
  useEffect(() => {
    const measure = () => {
      const top = (hudTopRef.current?.offsetHeight ?? 80) + 16;
      const bottom = (hudBottomRef.current?.offsetHeight ?? 120) + 16;
      setBands((prev) =>
        Math.abs(prev.top - top) < 3 && Math.abs(prev.bottom - bottom) < 3 ? prev : { top, bottom }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (hudTopRef.current) ro.observe(hudTopRef.current);
    if (hudBottomRef.current) ro.observe(hudBottomRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Saved Plan Mode (DEC-022): all client-local, keyed per room/player/line.
  const [planMode, setPlanMode] = useState(false);
  const [manualPlanner, setManualPlanner] = useState(false);
  const [plannerLine, setPlannerLine] = useState<number | null>(null);
  const [sketch, setSketch] = useState<RouteNode[]>([]);
  const [sketchBase, setSketchBase] = useState<RouteNode[]>([]);
  const [plans, setPlans] = useState<Record<string, SavedPlan>>({});
  const sessionPlans = useRef<Record<string, SavedPlan>>({});


  // Hotseat handoff veil: a changed controlling player keeps every private
  // surface unrendered until the newcomer confirms. Derived during render, so
  // nothing private can flash in between.
  const [seatedId, setSeatedId] = useState(playerId);
  const veiled = isHotseat && !!game && game.phase !== "SETUP" && playerId !== seatedId;
  useEffect(() => {
    if (!isHotseat) setSeatedId(playerId);
  }, [isHotseat, playerId]);

  const realRouteKey = me?.lines.map(l=>JSON.stringify(l.route)).join("|");
  const turnKey = game ? currentActorId(game) : undefined;

  const narration = useNarration(game, room.roomCode, playerId);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const act = async (type: string, payload?: Record<string, unknown>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    try {
      await dispatchAction(type, payload);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That action could not be completed. Try again.");
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  };

  // ---- Saved plans: load for this room/player/contract set -------------------
  const contractIds = me ? me.lines.map((l) => l.contractId).join(",") : "";
  useEffect(() => {
    if (!contractIds) {
      setPlans({});
      return;
    }
    const loaded: Record<string, SavedPlan> = {};
    for (const id of contractIds.split(",")) {
      const plan = sessionPlans.current[planStorageKey(room.roomCode, playerId, id)] ?? loadPlan(room.roomCode, playerId, id);
      if (plan) loaded[id] = plan;
    }
    setPlans(loaded);
    // Placement-context changes own planner initialization below. Resetting it
    // here races that effect when React replays mount effects in Strict Mode.
  }, [room.roomCode, playerId, contractIds]);

  const planAvailable = !!game && !!me && me.lines.length > 0 && PLAN_PHASES.has(game.phase) && !veiled;
  useEffect(() => {
    if (!planAvailable && planMode) {
      setPlanMode(false);
      setPlannerLine(null);
      setSketch([]);
    }
  }, [planAvailable, planMode]);

  // Where each saved plan stands against reality, refreshed with every poll.
  const planStatuses = useMemo(() => {
    const out: Record<string, PlanStatus & { nodes: RouteNode[] }> = {};
    if (!game || !me || veiled) return out;
    me.lines.forEach((line, i) => {
      const saved = plans[line.contractId];
      if (!saved) return;
      out[line.contractId] = { ...reconcilePlan(game, playerId, i, saved.nodes), nodes: saved.nodes };
    });
    return out;
  }, [game, me, plans, playerId, veiled]);

  const planChips = useMemo(() => {
    const out: Record<string, PlanChip> = {};
    for (const [contractId, status] of Object.entries(planStatuses)) {
      out[contractId] = { saved: true, stale: status.stale };
    }
    return out;
  }, [planStatuses]);

  const openPlanner = (lineIndex: number) => {
    if (!game || !me) return;
    const line = me.lines[lineIndex];
    if (!line) return;
    const initial = preparePlan(game, playerId, lineIndex, plans[line.contractId]);
    setSketchBase(initial.base);
    setPlannerLine(lineIndex);
    setSketch(initial.nodes);
    setPlanMode(true);
    setManualPlanner(true);
    setPreview(null);
    setNotice(null);
    cam.current?.focus("board");
  };

  const exitPlanner = () => {
    setPlanMode(false);
    setManualPlanner(false);
    setPlannerLine(null);
    setSketch([]);
  };

  // ---- What the board is for right now ---------------------------------------
  const myStarterTurn = !!game && game.phase === "STARTER_PLACEMENT" && starterTurnId(game) === playerId;
  const starterLine = game && me ? pendingStarters(me)[0] ?? -1 : -1;
  const placingStarter = myStarterTurn && starterLine >= 0;
  const myBuild =
    !!game && !!me && game.phase === "CONSTRUCTION" && game.resolveQueue[0] === me.id && me.pendingActions.length > 0;
  const mySurvey =
    !!game && !!me && game.phase === "ENGINEERING" && game.engineeringStep === "SURVEY" && surveyTurnId(game) === me.id;

  const activeLineIndex = placingStarter
    ? starterLine
    : myBuild && me
      ? me.pendingActions.includes(selectedLine)
        ? selectedLine
        : me.pendingActions[0]
      : -1;

  // Open once per actual placement context, never on ordinary state polls or taps.
  const automaticContext = `${room.roomCode}:${playerId}:${game?.phase}:${game?.currentPeriod}:${turnKey}:${activeLineIndex}:${realRouteKey}:${veiled}`;
  const openedContext = useRef("");
  useEffect(() => {
    if (openedContext.current === automaticContext) return;
    openedContext.current = automaticContext;
    setPlanMode(false); setManualPlanner(false); setPlannerLine(null); setSketch([]); setSketchBase([]); setPreview(null);
    if (!planAvailable || !game || !me || activeLineIndex < 0) return;
    const line = me.lines[activeLineIndex];
    const saved = sessionPlans.current[planStorageKey(room.roomCode, playerId, line.contractId)] ?? loadPlan(room.roomCode, playerId, line.contractId);
    const initial = preparePlan(game, playerId, activeLineIndex, saved);
    setSketchBase(initial.base);
    setSketch(initial.nodes);
    setPlannerLine(activeLineIndex);
    setManualPlanner(false);
    setPlanMode(true);
    // A saved ghost is guidance, never an implicit live build choice.
    setPreview(null);
    cam.current?.focus("board");
  }, [automaticContext, planAvailable, game, me, activeLineIndex, room.roomCode, playerId]);

  const plannerActive =
    planMode && plannerLine !== null && !!game && !!me && planAvailable && !!me.lines[plannerLine];

  // Plan Mode pauses live placement without surrendering it (R 5.2).
  const mode: BoardMode = plannerActive
    ? "planner"
    : placingStarter || myBuild
      ? "place"
      : mySurvey
        ? "survey"
        : "none";
  const canAct = mode !== "none" && !busy && !veiled && (mode !== "place" || activeLineIndex >= 0);

  // The planner works against a copy of the board with the sketch dropped into
  // the chosen line, so legality comes from the reducer's own helpers.
  const plannerState = useMemo(() => {
    if (!game || !me || !plannerActive || plannerLine === null) return undefined;
    const clone = cloneState(game);
    const line = clone.players[me.id]?.lines[plannerLine];
    if (!line) return undefined;
    line.route = sketch;
    return clone;
  }, [game, me, plannerActive, plannerLine, sketch]);

  const targets = useMemo<PlacementTarget[]>(() => {
    if (!game || !me) return [];
    if (mode === "place" && activeLineIndex >= 0) {
      return legalTargets(game, me.id, activeLineIndex, placingStarter);
    }
    if (mode === "survey") {
      const out: PlacementTarget[] = [];
      for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
        for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
          if (!surveyBlocker(game, me.id, { x, y })) out.push({ x, y });
        }
      }
      return out;
    }
    if (mode === "planner" && plannerState && plannerLine !== null) {
      if (!manualPlanner && !preview && activeLineIndex >= 0) {
        return legalTargets(game, me.id, activeLineIndex, placingStarter);
      }
      return legalTargets(plannerState, me.id, plannerLine, sketch.length === 0);
    }
    return [];
  }, [game, me, mode, activeLineIndex, placingStarter, plannerState, plannerLine, sketch, manualPlanner, preview]);

  // The board as it would be if the selected target were confirmed. Yellow is
  // derived from this by the reducer's own rules (OD-5).
  const previewState = useMemo(() => {
    if (!game || !me || !preview || activeLineIndex < 0 || mode !== "place") return undefined;
    const clone = cloneState(game);
    const line = clone.players[me.id]?.lines[activeLineIndex];
    if (!line) return undefined;
    const station = stationAt(preview, game.stations);
    line.route.push({
      x: preview.x,
      y: preview.y,
      ...(station ? { stationId: station.id, stationSlot: preview.slot ?? 0 } : {}),
    });
    return clone;
  }, [game, me, preview, activeLineIndex, mode]);

  const following = useMemo<PlacementTarget[]>(() => {
    if (!previewState || !me || activeLineIndex < 0) return [];
    return legalTargets(previewState, me.id, activeLineIndex, false);
  }, [previewState, me, activeLineIndex]);

  const privateVisible = !!me && !veiled;

  const drawn = useMemo<DrawnLine[]>(() => {
    if (!game) return [];
    const out: DrawnLine[] = [];
    for (const id of game.playerOrder) {
      const p = game.players[id];
      if (!p) continue;
      p.lines.forEach((line, li) => {
        const contract = contractOf(line);
        if (!contract || !line.route.length) return;
        out.push({
          key: `${id}-${li}`,
          route: line.route,
          contract,
          ownerColor: p.color,
          active: id === playerId && li === activeLineIndex,
          growing: !lineComplete(line),
        });
      });
    }
    // Selecting the next construction node draws the exact unconfirmed segment
    // in route colour. It follows selection changes and disappears on Cancel,
    // Confirm, Cancel, or a line switch. Confirm revalidates against current
    // state, so routine multiplayer polls cannot erase a valid selection.
    if (privateVisible && me && preview && (mode === "place" || (mode === "planner" && !manualPlanner)) && activeLineIndex >= 0) {
      const line = me.lines[activeLineIndex];
      const contract = line && contractOf(line);
      const anchor = line?.route.at(-1);
      if (line && contract) {
        const station = stationAt(preview, game.stations);
        out.push({
          key: `live-preview-${activeLineIndex}`,
          route: [
            ...(anchor ? [anchor] : []),
            {
              x: preview.x,
              y: preview.y,
              ...(station ? { stationId: station.id, stationSlot: preview.slot ?? 0 } : {}),
            },
          ],
          contract,
          ownerColor: me.color,
          active: true,
          growing: true,
          pending: true,
          anchored: !!anchor,
          numberOffset: Math.max(0, line.route.length - 1),
        });
      }
    }
    // Phantom plans and the live sketch draw only on their owner's UI, and
    // never while the hotseat veil is up.
    if (privateVisible && me) {
      me.lines.forEach((line, li) => {
        const contract = contractOf(line);
        if (!contract) return;
        const editing = plannerActive && plannerLine === li;
        if (editing && sketch.length > line.route.length) {
          // The first unbuilt node is the solid pending placement in auto mode.
          const visibleSketch = !manualPlanner && preview ? sketch.slice(line.route.length) : sketch;
          const startOffset = !manualPlanner && preview ? line.route.length : 0;
          if (!manualPlanner && preview) {
            if (visibleSketch.length > 1) out.push({key:`sketch-${li}`,route:visibleSketch,contract,ownerColor:me.color,active:true,growing:true,ghost:true,anchored:true,numberOffset:startOffset});
            return;
          }
          if (line.route.length === 0) {
            if (sketch.length) {
              out.push({
                key: `sketch-${li}`,
                route: sketch,
                contract,
                ownerColor: me.color,
                active: true,
                growing: true,
                ghost: true,
                numberOffset: 0,
              });
            }
          } else if (sketch.length > line.route.length) {
            const anchor = line.route.length - 1;
            out.push({
              key: `sketch-${li}`,
              route: sketch.slice(anchor),
              contract,
              ownerColor: me.color,
              active: true,
              growing: true,
              ghost: true,
              anchored: true,
              numberOffset: anchor,
            });
          }
          return;
        }
        const status = planStatuses[line.contractId];
        if (!status) return;
        if (status.stale) {
          // A diverged plan stays visible as sketched — faint, never rewritten.
          out.push({
            key: `plan-${li}`,
            route: status.nodes,
            contract,
            ownerColor: me.color,
            active: false,
            growing: false,
            ghost: true,
            stale: true,
            numberOffset: 0,
          });
        } else if (status.phantom.length) {
          const anchored = line.route.length > 0;
          out.push({
            key: `plan-${li}`,
            route: anchored ? [line.route[line.route.length - 1], ...status.phantom] : status.phantom,
            contract,
            ownerColor: me.color,
            active: false,
            growing: false,
            ghost: true,
            anchored,
            numberOffset: anchored ? line.route.length - 1 : 0,
          });
        }
      });
    }
    return out;
  }, [game, playerId, activeLineIndex, privateVisible, me, mode, preview, plannerActive, plannerLine, sketch, planStatuses, manualPlanner]);

  const onTapHole = (p: Point, slot?: number) => {
    if (!game || !me || !canAct) return;

    if (mode === "planner" && plannerState && plannerLine !== null) {
      if (!manualPlanner && !preview) {
        const reason = validateNode(game, me.id, plannerLine, p, placingStarter, slot);
        if (reason) {
          setNotice(reason);
          return;
        }
        const station = stationAt(p, game.stations);
        const node: RouteNode = {
          x: p.x,
          y: p.y,
          ...(station ? {stationId: station.id, stationSlot: slot ?? 0} : {}),
        };
        const savedNext = sketch[sketchBase.length];
        const followsSavedPlan = savedNext && savedNext.x === node.x && savedNext.y === node.y &&
          (savedNext.stationSlot ?? -1) === (node.stationSlot ?? -1);
        if (!followsSavedPlan) setSketch([...sketchBase, node]);
        setPreview({x:p.x,y:p.y,...(station ? {slot:slot ?? 0} : {})});
        setNotice(null);
        return;
      }
      // Edit the route by tapping an unbuilt peg, rather than opening tools.
      const rewind = sketch.findIndex((n, i) => i >= sketchBase.length && n.x === p.x && n.y === p.y && (n.stationSlot ?? -1) === (slot ?? -1));
      if (rewind >= 0) {
        resetSketch(sketch.slice(0, rewind));
        setNotice(null);
        return;
      }
      const reason = validateNode(plannerState, me.id, plannerLine, p, sketch.length === 0, slot);
      if (reason) {
        setNotice(reason);
        return;
      }
      const station = stationAt(p, game.stations);
      setNotice(null);
      if (!manualPlanner && sketch.length === me.lines[plannerLine].route.length) {
        setPreview({x:p.x,y:p.y,...(station ? {slot:slot ?? 0} : {})});
      }
      setSketch([...sketch, { ...p, ...(station ? { stationId: station.id, stationSlot: slot ?? 0 } : {}) }]);
      return;
    }

    if (mode === "survey") {
      const reason = surveyBlocker(game, me.id, p);
      if (reason) {
        setNotice(reason);
        return;
      }
      setNotice(null);
      act("PLACE_SURVEY", { x: p.x, y: p.y });
      return;
    }

    if (mode === "place" && activeLineIndex >= 0) {
      const reason = validateNode(game, me.id, activeLineIndex, p, placingStarter, slot);
      if (reason) {
        setNotice(reason);
        return;
      }
      setNotice(null);
      // Selection only — tapping never commits (OD-3 / OD-4).
      setPreview({ x: p.x, y: p.y, ...(stationAt(p, game.stations) ? { slot } : {}) });
    }
  };

  const confirmPlacement = () => {
    if (!game || !me || !preview || activeLineIndex < 0 || (mode !== "place" && !(mode === "planner" && plannerLine === activeLineIndex))) return;
    // Revalidate the exact target against current state before dispatching; the
    // reducer revalidates again and a rejection costs nothing (R 5.3).
    const reason = validateNode(game, me.id, activeLineIndex, preview, placingStarter, preview.slot);
    if (reason) {
      setNotice(reason);
      setPreview(null);
      return;
    }
    const target = preview;
    exitPlanner();
    setPreview(null);
    act(placingStarter ? "PLACE_STARTER" : "BUILD", {
      lineIndex: activeLineIndex,
      x: target.x,
      y: target.y,
      ...(target.slot !== undefined ? { slot: target.slot } : {}),
    });
  };

  // Which part of the table this phase is played on: it decides the opening
  // shot and what `Reset view` returns to.
  const phaseKey = game ? `${game.phase}:${game.engineeringStep}:${game.schedulingStep}` : "";
  const phaseZone: TableZone = (() => {
    const [phase, step] = phaseKey.split(":");
    if (phase === "PROCUREMENT") return "office";
    if (phase === "SCHEDULING") return "schedule";
    if (phase === "ENGINEERING") {
      return step === "CARD_DRAFT" ? "office" : step === "BUY_SURVEYS" ? "survey" : "board";
    }
    if (phase === "CONSTRUCTION") return "schedule";
    if (phase === "RESULTS") return "results";
    if (phase === "SCORING") return "table";
    return "board";
  })();

  // Reframe after a phase change or a completed handoff, once the receiving
  // company's private pieces exist. Routine polls never move the camera.
  const cameraContext = `${phaseKey}:${game?.currentPeriod}:${playerId}:${veiled}`;
  const prevPhaseKey = useRef<string | null>(null);
  useEffect(() => {
    if (!phaseKey || veiled) return;
    if (prevPhaseKey.current !== null && prevPhaseKey.current !== cameraContext) {
      cam.current?.focus(activeLineIndex >= 0 ? "board" : phaseZone);
    }
    prevPhaseKey.current = cameraContext;
  }, [cameraContext, phaseKey, phaseZone, activeLineIndex, veiled]);

  // ---- Pre-game lobby ---------------------------------------------------------
  if (!game || game.phase === "SETUP") {
    const enough = room.players.length >= 2 && room.players.length <= 4;
    return (
      <section className="rounded-2xl bg-[#ede1c7] p-6 text-center text-stone-900 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-amber-800">Metropolitan Transit Authority · 2–4 players</p>
        <h2 className="mt-2 font-serif text-3xl font-black">Subway</h2>
        <p className="mx-auto my-4 max-w-xl text-sm text-stone-600">
          Build a city that connects. Each company takes three routes from a pool of twelve services. Each carries an
          ordered recipe of segment lengths and its own line color. Draft goals and Construction cards,
          optionally buy Survey Pins, choose crews each round, then
          engineer the routes hole by hole — all on one table you pan and zoom around.
        </p>
        {stale && (
          <p className="mx-auto mb-4 max-w-md rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
            This room is running an older version of Subway. Starting a new game will reset it to the
            current rules.
          </p>
        )}
        <p className="mb-4 text-sm font-semibold text-stone-700">
          Companies: {room.players.slice(0, 4).map((p) => p.name).join(" vs ") || "waiting…"}
          {room.players.length > 4 && ` · ${room.players.length - 4} spectating`}
        </p>
        {isHost ? (
          <button
            disabled={busy || !enough}
            onClick={() => act("START_GAME")}
            className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Starting…" : enough ? "Start Subway" : "Waiting for a second player"}
          </button>
        ) : (
          <p className="text-sm text-stone-600">Waiting for the host to start Subway…</p>
        )}
      </section>
    );
  }

  const status = statusFor(game, me, isHost);
  const schedulingRevealed = game.phase !== "SCHEDULING" || game.schedulingStep === "RESOLUTION";
  const canUndo = game.undo?.playerId === playerId && !veiled;
  const activeLine = activeLineIndex >= 0 && me ? me.lines[activeLineIndex] : undefined;
  const opponents = game.playerOrder.map((id) => game.players[id]).filter((p) => p && p.id !== playerId);
  const plannerLineObj = plannerActive && me && plannerLine !== null ? me.lines[plannerLine] : undefined;
  const plannerContract = plannerLineObj ? contractOf(plannerLineObj) : undefined;
  const minSketch = sketchBase.length;
  const saveSketch = () => {
    if (plannerLine === null || !me || !sketch.length) return;
    const contractId = me.lines[plannerLine].contractId;
    const saved = savePlan(room.roomCode, playerId, contractId, sketch);
    const value = {nodes:[...sketch],savedAt:Date.now()};
    sessionPlans.current[planStorageKey(room.roomCode, playerId, contractId)] = value;
    setPlans(prev => ({...prev, [contractId]:value}));
    setNotice(saved ? "Ghost route saved on this device. Nothing built or reserved." : "Storage unavailable: ghost kept for this session only.");
  };
  const resetSketch = (nodes: RouteNode[]) => {
    setSketch(nodes);
    if (!manualPlanner) {
      const next = nodes[minSketch];
      setPreview(next ? {x:next.x,y:next.y,...(next.stationId ? {slot:next.stationSlot ?? 0} : {})} : null);
    }
  };
  const contested = contestedPeriods(game).filter((period) => !!me && me.lines.some((l) => blockPeriods(l).includes(period)) && !game.priorityOverrides[period]);

  // ---- Card focus: read a card, and do the legal thing with it ---------------

  /** Send a card on its way, then dispatch. Decoration only. */
  const playWithFlight = (label: string, color: string, zone: TableZone, run: () => void) => {
    const card = document.querySelector<HTMLElement>("[data-focus-card]");
    const dest = document.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
    if (card && dest && !reducedMotion()) {
      const from = card.getBoundingClientRect();
      const dr = dest.getBoundingClientRect();
      setFlight({
        from,
        to: { x: dr.left + dr.width / 2 - from.width / 2, y: dr.top + dr.height / 2 - from.height / 2 },
        label,
        color,
      });
      setTimeout(() => setFlight(null), 460);
    }
    setFocus(null);
    run();
  };

  const schedulingReason = (id: SchedulingCardId): string | undefined => {
    if (!me) return "Spectating";
    if (game.phase !== "SCHEDULING" || game.schedulingStep !== "RESOLUTION")
      return "Only after all schedules are revealed";
    if (me.schedulingCardPlayed) return "One Scheduling card per company per game";
    if (me.scheduleConfirmed) return "Your schedule is already locked";
    if (id === "priority" && !contested.length) return "No contested periods to reorder";
    if (id === "coordination" && crewCost(me) <= 0) return "No crew-overlap cost to waive";
    if (id !== "priority" && !me.lines.some((l) => l.start !== undefined)) return "Nothing scheduled to move";
    return undefined;
  };

  const constructionReason = (id: ConstructionCardId) => constructionCardBlocker(game, playerId, id);

  const constructionTargets = (id: ConstructionCardId): number[] =>
    !me
      ? []
      : id === "overtime"
        ? Array.from(new Set(me.pendingActions))
        : me.lines.map((_, i) => i).filter((i) => !me.pendingActions.includes(i) && !lineComplete(me.lines[i]));

  /** A row of choices as real buttons. Native <select> menus draw outside the
   *  dialog, so picking one reads as a click on the backdrop and closes the
   *  card before the choice lands — and they are poor targets on touch. */
  const choiceRow = <T,>({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: T;
    options: { value: T; label: React.ReactNode; key: string }[];
    onChange: (v: T) => void;
  }) => (
    <div>
      <p className="text-xs font-black uppercase tracking-wider text-stone-500">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-bold transition ${
                active
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-stone-400 bg-white text-stone-700 hover:border-stone-600"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const lineChoice = (value: number, onChange: (n: number) => void, options: number[]) =>
    me && options.length > 0
      ? choiceRow({
          label: "Line",
          value: options.includes(value) ? value : options[0],
          onChange,
          options: options.map((i) => {
            const contract = contractOf(me.lines[i]);
            return {
              key: String(i),
              value: i,
              label: (
                <span className="flex items-center gap-1.5">
                  {contract && <LineTile contract={contract} size={18} />}
                  {lineLabel(me.lines[i])}
                </span>
              ),
            };
          }),
        })
      : null;

  const quickCard = (id: ConstructionCardId) => {
    const why = constructionReason(id);
    if (why || busy || veiled) { if (why) setNotice(why); return; }
    if (id === "overtime" || id === "surge") { setFocus({family:"construction", id, slot:"hand"}); return; }
    act("PLAY_CONSTRUCTION_CARD", {cardId:id, period:game.currentPeriod});
  };

  const focusPanel = (() => {
    if (!focus || !me) return null;
    const close = () => setFocus(null);

    if (focus.family === "contract") {
      const contract = contractById(focus.id);
      if (!contract) return null;
      const offer = game.procurement.offer;
      const onOffer = game.phase === "PROCUREMENT" && game.procurement.row.includes(focus.id);
      const mine = onOffer && offer?.activeId === me.id;
      const actions: FocusAction[] = mine ? [{
        label: `Sign route for ${money(contract.cost)}`,
        disabled: busy || me.money < contract.cost,
        run: () => playWithFlight(contract.name, contract.color, "lines", () => act("PROCURE", {choice:"buy", contractId:contract.id})),
      }] : [];
      return (
        <CardFocus
          title={contract.name}
          onClose={close}
          face={<ContractCard contract={contract} price={focus.price} />}
          note={
            <>
              {contractNodes(contract)} nodes over {contract.recipe.length} segments.{" "}
              {contractsOutstanding(game)} contract{contractsOutstanding(game) === 1 ? "" : "s"} still need an
              owner; you hold {me.lines.length} of {SUBWAY_CONFIG.maxContractsPerPlayer}.
            </>
          }
          reason={!mine && onOffer ? `${game.players[offer!.activeId]?.name ?? "The opposition"} is deciding.` : undefined}
          actions={actions}
        />
      );
    }

    if (focus.family === "market") {
      const card = focus.cardId ? focus.id === "engineering" ? (engineeringById(focus.cardId) ?? destinationById(focus.cardId)) : focus.id === "scheduling" ? schedulingById(focus.cardId as SchedulingCardId) : constructionById(focus.cardId as ConstructionCardId) : undefined;
      const why = cardDraftBlocker(game, me.id, focus.id, focus.cardId);
      const available = focus.cardId ? game.market.rows[focus.id].includes(focus.cardId) : game.market.decks[focus.id].length > 0;
      return <CardFocus title={card?.name ?? `Blind ${focus.id} draw`} onClose={close}
        face={focus.id === "engineering" && focus.cardId ? (destinationById(focus.cardId) ? <DestinationCardFace card={focus.cardId} color={me.color}/> : <EngineeringCardFace card={focus.cardId} color={me.color}/>) : <MiniCardFace family={focus.id === "construction" ? "construction" : "scheduling"} name={card?.name ?? "Mystery card"} description={card?.description ?? `Draw one random ${focus.id} card. Engineering draws always give a goal you do not already hold.`} note={focus.cardId ? "Face-up draft" : "Blind draw"}/>}
        note={`${draftPicks(me)}/6 picks used. Choose any mix of Engineering goals and Construction cards. Every goal you hold can score.`}
        reason={why ?? (!available ? "That card or blind pile is no longer available." : undefined)}
        actions={[{label:card ? "Draft this card" : "Draw a random card", disabled:busy || !!why || !available,
          run:() => playWithFlight(card?.name ?? "Card drafted", "#a16207", "hand", () => act("DRAFT_CARD", {deck:focus.id, cardId:focus.cardId, expectedPick:game.market.picks}))}]}/>;
    }

    if (focus.family === "engineering" || focus.family === "destination") {
      const card = engineeringById(focus.id) ?? destinationById(focus.id);
      if (!card) return null;
      const met = objectiveMet(focus.id,me,opponents);
      return <CardFocus title={card.name} onClose={close}
        face={destinationById(focus.id)?<DestinationCardFace card={focus.id} color={me.color}/>:<EngineeringCardFace card={focus.id} color={me.color} state={met?"met":"idle"}/>}
        note={`${met ? "✓ Achieved" : "In progress"} · +${card.vp} VP if achieved at scoring. Any of your routes can qualify. No commitment needed.`} actions={[]}/>;
    }

    if (focus.family === "scheduling") {
      const card = schedulingById(focus.id);
      if (!card) return null;
      const why = schedulingReason(focus.id);
      const options = me.lines.map((_, i) => i).filter((i) => me.lines[i].start !== undefined);
      return (
        <CardFocus
          title={card.name}
          onClose={close}
          face={<MiniCardFace family="scheduling" name={card.name} description={card.description} note="Scheduling card" />}
          note="One Scheduling card per company per game, played after all schedules are revealed."
          reason={why}
          extra={
            !why ? (
              focus.id === "priority" ? (
                choiceRow({
                  label: "Contested period",
                  value: contested.includes(cardPeriod) ? cardPeriod : contested[0],
                  onChange: (v: number) => setCardPeriod(v),
                  options: contested.map((q) => ({
                    key: String(q),
                    value: q,
                    label: (
                      <span>
                        Period {q}
                        <span className="ml-1 font-normal text-stone-500">
                          ({game.players[basePriorityId(game, q)]?.name} first)
                        </span>
                      </span>
                    ),
                  })),
                })
              ) : (
                <div className="space-y-2">
                  {lineChoice(cardLine, setCardLine, options)}
                  {focus.id === "float" && (
                    <div className="flex overflow-hidden rounded-lg border-2 border-stone-400 text-sm font-bold">
                      <button
                        type="button"
                        className={`flex-1 px-3 py-2 ${cardDirection === -1 ? "bg-stone-800 text-white" : "bg-white"}`}
                        onClick={() => setCardDirection(-1)}
                      >
                        Earlier
                      </button>
                      <button
                        type="button"
                        className={`flex-1 px-3 py-2 ${cardDirection === 1 ? "bg-stone-800 text-white" : "bg-white"}`}
                        onClick={() => setCardDirection(1)}
                      >
                        Later
                      </button>
                    </div>
                  )}
                  {focus.id === "stagger" && (
                    <div className="flex overflow-hidden rounded-lg border-2 border-stone-400 text-sm font-bold">
                      {[1, 2, 3].map((periods) => (
                        <button
                          key={periods}
                          type="button"
                          className={`flex-1 px-3 py-2 ${cardDirection === periods ? "bg-stone-800 text-white" : "bg-white"}`}
                          onClick={() => setCardDirection(periods)}
                        >
                          +{periods}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : undefined
          }
          actions={[
            {
              label: `Play ${card.name}`,
              tone: "warn",
              disabled: busy || !!why,
              reason: why,
              run: () =>
                playWithFlight(card.name, "#075985", "schedule", () =>
                  act("PLAY_SCHEDULING_CARD", {
                    cardId: focus.id,
                    ...(focus.id === "priority"
                      ? { period: contested.includes(cardPeriod) ? cardPeriod : contested[0] }
                      : {
                          lineIndex: options.includes(cardLine) ? cardLine : options[0],
                          ...((focus.id === "float" || focus.id === "stagger") ? { direction: cardDirection } : {}),
                        }),
                  })
                ),
            },
          ]}
        />
      );
    }

    // Construction card
    const card = constructionById(focus.id);
    if (!card) return null;
    const why = constructionReason(focus.id);
    const options = constructionTargets(focus.id);
    return (
      <CardFocus
        title={card.name}
        onClose={close}
        face={<MiniCardFace family="construction" name={card.name} description={card.description} note="Construction card" />}
        note="One Construction card per round, including Priority Dispatch. The card is discarded when played."
        reason={why}
        extra={!why && (focus.id === "overtime" || focus.id === "surge") ? lineChoice(cardLine, setCardLine, options) : undefined}
        actions={[
          {
            label: `Play ${card.name}`,
            tone: "warn",
            disabled: busy || !!why,
            reason: why,
            run: () =>
              playWithFlight(card.name, "#b45309", "board", () =>
                act("PLAY_CONSTRUCTION_CARD", {
                  cardId: focus.id,
                  period: game.currentPeriod,
                  ...(!["overtime", "surge"].includes(focus.id)
                    ? {}
                    : { lineIndex: options.includes(cardLine) ? cardLine : options[0] }),
                })
              ),
          },
        ]}
      />
    );
  })();

  // ---- The screen-level strip: the only commitment control -------------------

  const actionStrip = (
    <div className="pointer-events-auto rounded-2xl border-2 border-[#6b4b2c] bg-[#fffaf0]/95 p-2.5 text-stone-900 shadow-2xl backdrop-blur-sm">
      {notice && (
        <p className="mb-1.5 rounded-lg bg-red-100 px-2 py-1 text-center text-xs font-bold text-red-900">{notice}</p>
      )}

      {mode === "planner" && plannerContract && plannerLineObj && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-purple-700 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">{manualPlanner ? "Plan Mode" : "Building now"}</span>
            <b>{plannerContract.name}</b>
            {manualPlanner && <select value={plannerLine ?? -1} onChange={e => openPlanner(Number(e.target.value))} className="rounded border border-stone-400 bg-white p-1" style={{fontSize:16}} aria-label="Plan a different line">
              {me?.lines.map((l,i)=><option key={i} value={i}>{lineLabel(l)}</option>)}
            </select>}
          </div>
          {!manualPlanner && activeLine && <RouteBuildGuide line={activeLine} compact />}
          <div className="flex flex-wrap gap-1.5">
            <StripButton disabled={busy || sketch.length <= minSketch} onClick={() => {
              resetSketch(sketch.slice(0, -1));
              setNotice(null);
            }}>Undo step</StripButton>
            <StripButton tone="plan" disabled={sketch.length <= minSketch} onClick={saveSketch}>Save ghost</StripButton>
            {!manualPlanner && <StripButton aria-label="Confirm real peg" tone="go" disabled={busy || !preview} onClick={confirmPlacement} data-confirm-placement>Confirm peg</StripButton>}
            {manualPlanner && <StripButton tone="dark" onClick={() => {
              if (activeLineIndex < 0 || !me) { exitPlanner(); return; }
              const line = me.lines[activeLineIndex];
              const initial = preparePlan(game, playerId, activeLineIndex, plans[line.contractId]);
              setSketchBase(initial.base);
              setSketch(initial.nodes);
              setPlannerLine(activeLineIndex);
              setManualPlanner(false);
              setPreview(null);
              setNotice(null);
            }}>Close plan</StripButton>}
          </div>
        </div>
      )}

      {mode === "place" && activeLine && me && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <b>{lineLabel(activeLine)}</b>
            <span className="text-xs text-stone-500">
              {placingStarter
                ? "starter peg · border holes only"
                : `segment ${segmentsBuilt(activeLine) + 1}/${contractOf(activeLine)?.recipe.length} · ${
                    nextSegmentLength(activeLine) ?? "—"
                  } pegs`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StripButton disabled={busy || !preview} onClick={() => setPreview(null)}>
              Cancel
            </StripButton>
            <StripButton tone="go" disabled={busy || !preview} onClick={confirmPlacement} data-confirm-placement>
              Confirm placement
            </StripButton>
            {planAvailable && (
              <StripButton tone="plan" onClick={() => openPlanner(activeLineIndex >= 0 ? activeLineIndex : 0)}>
                Plan
              </StripButton>
            )}
            {myBuild && (
              <StripButton tone="dark" disabled={busy} onClick={() => act("SKIP_ACTION")}>
                Give up
              </StripButton>
            )}
            {canUndo && (
              <StripButton tone="dark" className="ml-auto" disabled={busy} onClick={() => act("UNDO_PLACEMENT")}>
                Undo {game.undo?.label}
              </StripButton>
            )}
          </div>
        </div>
      )}

      {mode === "survey" && me && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">Survey</span>
          <span className="text-xs text-stone-600">
            Tap a glowing hole to place a pin — {surveysPending(game, me.id)} left. Pins are public and reserve nothing.
          </span>
          {planAvailable && (
            <StripButton tone="plan" className="ml-auto" onClick={() => openPlanner(0)}>
              Plan
            </StripButton>
          )}
        </div>
      )}

      {mode === "none" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${status.tone === "act" ? "animate-pulse bg-emerald-600" : "bg-stone-400"}`}
          />
          <span className="text-xs font-bold text-stone-700">{status.headline}</span>
          {game.phase === "SCORING" && isHost && (
            <StripButton tone="go" disabled={busy} onClick={() => act("ADVANCE_SCORING")}>
              Reveal Engineering &amp; score
            </StripButton>
          )}
          {planAvailable && (
            <StripButton tone="plan" className="ml-auto" onClick={() => openPlanner(0)}>
              Plan
            </StripButton>
          )}
          {canUndo && (
            <StripButton tone="dark" className={planAvailable ? "" : "ml-auto"} disabled={busy} onClick={() => act("UNDO_PLACEMENT")}>
              Undo {game.undo?.label}
            </StripButton>
          )}
        </div>
      )}
    </div>
  );

  const engineeringSlip = me && game.phase === "ENGINEERING" && game.engineeringStep === "BUY_SURVEYS" && !veiled ? (
    <Printed zone="survey" title="Optional Survey Pins" tone="slip" style={{width:660}}>
      <p className="text-xl">Every goal in your hand is active. Buy up to five Survey Pins for $1M each; earn +1 VP per pin your network reaches.</p>
      {me.engineeringLocked ? <p className="text-xl">Survey purchase complete. Waiting for the other companies.</p> : <div className="mt-4 flex flex-wrap items-center gap-4">
        <TableButton aria-label="Remove a Survey Pin" disabled={busy||surveys===0} onClick={()=>setSurveys(surveys-1)}>−</TableButton><b className="text-3xl">{surveys}</b>
        <TableButton aria-label="Add a Survey Pin" disabled={busy||surveys>=5||surveys>=me.money} onClick={()=>setSurveys(surveys+1)}>+</TableButton>
        <TableButton disabled={busy||surveys>me.money} onClick={()=>act("BUY_SURVEYS",{surveys})}>{surveys ? `Buy for $${surveys}M` : "No pins · continue"}</TableButton>
      </div>}
    </Printed>
  ) : null;

  // ---- The table --------------------------------------------------------------

  // Quick-focus controls, one-handed on a phone: the short label is what a
  // narrow screen shows, the long one is the accessible name everywhere.
  const officeOpen = game.phase === "PROCUREMENT" || (game.phase === "ENGINEERING" && game.engineeringStep === "CARD_DRAFT");
  const focusButtons: { zone: TableZone; label: string; short: string }[] = [
    ...(officeOpen ? [{ zone: "office" as TableZone, label: "Market", short: "Market" }] : []),
    { zone: "board", label: "Pegboard", short: "Board" },
    { zone: "schedule", label: "Construction schedule", short: "Crews" },
    { zone: "lines", label: "Lines", short: "Lines" },
    { zone: "hand", label: "Cards", short: "Cards" },
    { zone: "table", label: "Whole table", short: "All" },
  ];

  const settingsButton = <button className="rounded-lg bg-stone-800 px-3 py-2 text-xs text-white" onClick={()=>setSettingsOpen(true)}>Settings</button>;
  const hud = (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2 sm:p-3">
      <div ref={hudTopRef} className="flex flex-wrap items-start justify-between gap-2">
        <div
          className={`${mobile ? "hidden" : ""} pointer-events-auto max-w-[52%] rounded-xl border-l-4 bg-[#fffaf0]/95 px-2.5 py-1.5 shadow-lg sm:max-w-[42%] sm:px-3 sm:py-2 ${
            status.tone === "act" ? "border-emerald-600" : status.tone === "wait" ? "border-stone-400" : "border-amber-500"
          }`}
        >
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-800">
            {PHASE_LABELS[game.phase] ?? game.phase}
            {game.phase === "CONSTRUCTION" &&
              ` · period ${Math.min(game.currentPeriod, SUBWAY_CONFIG.timelinePeriods)}/${SUBWAY_CONFIG.timelinePeriods}`}
          </p>
          <p className="flex items-center gap-2 text-[12px] font-bold leading-snug text-stone-900 sm:text-sm">
            {status.tone === "act" && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-600" />}
            {status.headline}
          </p>
          {status.detail && <p className="hidden text-xs text-stone-600 sm:block">{status.detail}</p>}
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 rounded-xl bg-stone-900/85 p-1.5 text-amber-50 shadow-lg">
          {settingsButton}
          {!lessonZone && !mobile && <Link href={`/subway/tutorial?lesson=${lessonForPhase(game.phase,game.engineeringStep)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/15 px-2 py-1 text-xs">Phase lesson ↗</Link>}
          <button
            onClick={() => cam.current?.zoomBy(1 / 1.3)}
            aria-label="Zoom out"
            className="rounded-lg bg-white/15 px-2.5 py-1 text-base font-black leading-none hover:bg-white/25"
          >
            −
          </button>
          <span className="w-10 text-center text-[11px] tabular-nums sm:w-12 sm:text-xs">{zoomPct}%</span>
          <button
            onClick={() => cam.current?.zoomBy(1.3)}
            aria-label="Zoom in"
            className="rounded-lg bg-white/15 px-2.5 py-1 text-base font-black leading-none hover:bg-white/25"
          >
            +
          </button>
          <button
            onClick={() => cam.current?.focus("board", {fit:true})}
            aria-label="Fit entire board"
            className="rounded-lg bg-white/15 px-2 py-1 text-[11px] font-bold hover:bg-white/25 sm:text-xs"
          >
            Fit board
          </button>
        </div>
      </div>

      <NarrationOverlay event={mobile ? null : narration.overlay} onDismiss={narration.dismiss} />

      <div
        ref={hudBottomRef}
        data-bottom-controls
        className="flex flex-col items-center gap-3 rounded-xl bg-[#18343f] p-2 shadow-[0_-8px_20px_#18343f]"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        {/* Quick-focus lives one thumb away from the action buttons. */}
        <div className="pointer-events-auto flex flex-wrap justify-center gap-1 rounded-xl bg-stone-900/85 p-1 text-amber-50 shadow-lg">
          {focusButtons.map((b) => (
            <button
              key={b.zone}
              onClick={() => cam.current?.focus(b.zone)}
              aria-label={`Focus ${b.label}`}
              className="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold hover:bg-white/25 sm:text-xs"
            >
              <span>{mobile ? b.short : b.label}</span>
            </button>
          ))}
        </div>
        <div className="w-full max-w-3xl">{actionStrip}</div>
      </div>
    </div>
  );


  const settingsPanel = settingsOpen && <div role="dialog" aria-modal="true" aria-label="Table settings" className="fixed inset-0 z-50 overflow-auto bg-stone-950/80 p-3"><div className="mx-auto max-w-xl rounded-xl bg-[#fff7e5] p-4 text-stone-900"><button autoFocus className="float-right rounded border px-3 py-2" onClick={()=>setSettingsOpen(false)}>Close settings</button><h2 className="text-xl font-bold">Table settings</h2><p className="my-4"><Link href="/subway/tutorial">How to play</Link></p><button className="rounded border px-3 py-2" onClick={()=>setShowLog(v=>!v)}>Action log</button>{showLog && <ol className="mt-3 space-y-2 text-sm">{game.events.map(e=><li key={e.seq}>{e.text}</li>)}</ol>}</div></div>;
  const resultsPanel = game.phase === "RESULTS" && showResults && <div role="dialog" aria-modal="true" aria-label="Final results" className="fixed inset-0 z-40 overflow-auto bg-[#fff7e5] p-3 text-stone-900"><button autoFocus className="mb-3 rounded border px-4 py-2" onClick={()=>setShowResults(false)}>Back to board</button><ResultsSheet game={game} roomCode={room.roomCode} mode={room.mode}/></div>;

  return (
    <div className="relative" data-tutorial-zone={lessonZone} style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {lessonZone && lessonZone !== "table" && <style>{`[data-tutorial-zone="${lessonZone}"] [data-zone="${lessonZone}"] { outline: 6px solid #14b8a6; outline-offset: 8px; }`}</style>}
      {veiled && me && <HandoffVeil name={me.name} color={me.color} onConfirm={() => setSeatedId(playerId)} />}
      {/* Screen readers hear every accepted public event, animation or not. */}
      <div aria-live="polite" className="sr-only">
        {narration.liveText}
      </div>

      <TabletopCanvas
        worldWidth={WORLD_W}
        apiRef={cam}
        onCamera={(scale) => setZoomPct((prev) => (Math.round(scale * 100) === prev ? prev : Math.round(scale * 100)))}
        overlay={hud}
        openZone={lessonZone ?? phaseZone}
        bottomInset={0}
        hudTop={bands.top}
        hudBottom={bands.bottom}
        label="Subway tabletop — drag to pan, pinch or scroll to zoom"
      >
        {/* Printed pieces carry dark ink whatever the surrounding page theme is. */}
        <div className="flex flex-col text-stone-900" style={{ gap: TABLE.gap, padding: TABLE.margin }}>
          <div data-zone="opponent" className="grid gap-[24px]">
            <button className="w-fit rounded-xl bg-white/10 px-5 py-3 text-[22px] text-white" aria-expanded={showOpponents} onClick={()=>setShowOpponents(v=>!v)}>{showOpponents ? "Hide opponents" : "Show opponents"}</button>
            {showOpponents && opponents.map((opponent) => <OpponentEdge key={opponent.id} game={game} opponent={opponent} scheduleRevealed={schedulingRevealed} />)}
          </div>

          <div className="flex justify-center" style={{width:BOARD_FRAME_W, marginLeft:officeOpen ? TABLE.side + TABLE.gap : 0}}>
            <CrewBoard key={`${game.currentPeriod}:${playerId}`} game={game} viewerId={playerId} busy={busy} veiled={veiled} act={act}/>
          </div>

          <div className="flex items-start" style={{ gap: TABLE.gap }}>
            {officeOpen && <ContractOffice
              game={game}
              me={me}
              veiled={veiled}
              busy={busy}
              onBuyContract={(id) => {
                const contract = contractById(id);
                if (busy || veiled || !me || !contract || game.phase !== "PROCUREMENT" || game.procurement.offer?.activeId !== me.id || !game.procurement.row.includes(id) || me.money < contract.cost) return;
                act("PROCURE", {choice:"buy", contractId:id});
              }}
              onOpenMarket={(deck: CardDeckId, cardId?: string) => {
                if (busy || veiled || !me) return;
                const why = cardDraftBlocker(game, me.id, deck, cardId);
                if (why) { setNotice(why); return; }
                act("DRAFT_CARD", {deck, cardId, expectedPick:game.market.picks});
              }}
              onOpenDestination={(id) => setFocus({ family: "destination", id, slot: "row" })}
            />}

            <div
              ref={boardRef}
              data-zone="board"
              className="rounded-[34px] border-[10px] border-[#1b3945] bg-[#234b57] p-[16px] shadow-[0_24px_50px_rgba(0,0,0,.5)]"
              style={{ width: BOARD_FRAME_W }}
            >
              <div className="mb-[12px] flex items-center justify-between px-[8px] text-[#f5e6c8]">
                <strong className="text-[26px] font-black uppercase tracking-[.3em]">Metropolitan Transit Map</strong>
                <span className="text-[20px] font-bold opacity-80">
                  {SUBWAY_CONFIG.board.columns} × {SUBWAY_CONFIG.board.rows} holes
                </span>
              </div>
              <Board
                game={game}
                targets={canAct ? targets : []}
                following={mode === "place" ? following : []}
                selected={mode === "place" || (mode === "planner" && !manualPlanner) ? preview ?? undefined : undefined}
                planningTargets={mode === "planner" && (manualPlanner || !!preview)}
                canAct={canAct}
                drawn={drawn}
                onTapHole={onTapHole}
              />
            </div>


          </div>

          {me && (
            <PlayerTabletop
              game={game}
              me={me}
              veiled={veiled}
              busy={busy}
              activeLineIndex={activeLineIndex}
              planChips={planChips}
              planAvailable={planAvailable}
              onOpenPlanner={openPlanner}
              onSelectLine={(i) => setSelectedLine(i)}
              selectableLines={myBuild && !veiled}
              onOpenCard={(ref) => ref.family === "construction" ? quickCard(ref.id) : setFocus(ref)}
            >
              {engineeringSlip}
            </PlayerTabletop>
          )}

          {game.phase === "RESULTS" && <button onClick={()=>setShowResults(true)}>Show results</button>}

          <footer className="flex items-center justify-between text-[20px] text-[#e6d7b4]">
            <span>
              Room <code className="rounded bg-black/30 px-[10px] py-[4px] font-bold">{room.roomCode}</code>
            </span>
            <Link href="/" className="underline hover:text-white">
              Leave room
            </Link>
          </footer>
        </div>
      </TabletopCanvas>

      {settingsPanel}{resultsPanel}
      {focusPanel}
      {flight && <CardFlight from={flight.from} to={flight.to} label={flight.label} color={flight.color} />}
    </div>
  );
}

/** Whether a committed objective currently reads as met, for the focus panel. */
function committedStatusFor(game: SubwayState, me: SubwayPlayer, cardId: string): boolean {
  const entry = committedStatus(game, me.id).find((c) => c.cardId === cardId);
  return !!entry?.met;
}

function StripButton({
  children,
  onClick,
  disabled,
  tone = "plain",
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "plain" | "go" | "plan" | "danger" | "dark";
  className?: string;
} & Record<string, unknown>) {
  const skin =
    tone === "go"
      ? "bg-emerald-700 text-white"
      : tone === "plan"
        ? "bg-purple-700 text-white"
        : tone === "danger"
          ? "border border-red-300 text-red-800"
          : tone === "dark"
            ? "bg-stone-900 text-white"
            : "border border-stone-400 text-stone-700";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-35 ${skin} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The final scoring sheet, laid on the table like everything else. */
function ResultsSheet({ game, roomCode, mode }: { game: SubwayState; roomCode: string; mode: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const report = useMemo(() => generateAiPlaytestReport(game, {roomCode, mode}), [game, roomCode, mode]);
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  return (
    <Printed zone="results" title="Final scoring" subtitle={game.message} className="w-full min-w-0 !p-3 sm:!p-[26px]">
      <div className="flex flex-col gap-[26px]">
        {game.playerOrder.map((id) => {
          const p = game.players[id];
          if (!p) return null;
          const winner = game.winnerIds.includes(id);
          return (
            <div
              key={id}
              className="min-w-0 rounded-[22px] border-[5px] bg-[#fffaf0] p-3 sm:p-[22px]"
              style={{ borderColor: p.color, opacity: winner ? 1 : 0.95 }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3 text-2xl font-black sm:text-[34px]">
                <span className="flex min-w-0 flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
                  <span className="h-[20px] w-[20px] shrink-0 rounded-full" style={{ background: p.color }} />
                  {p.name}
                  {winner && <Pill tone="good">🏆 Winner</Pill>}
                </span>
                <span className="shrink-0">{p.score} VP</span>
              </div>
              <div className="mt-[14px] max-w-[1400px]">
                {p.scoreBreakdown?.map((item, i) => (
                  <div
                    key={i}
                    className={`flex justify-between gap-3 border-b border-stone-200 py-[6px] text-base sm:text-[21px] ${
                      item.met === false ? "text-stone-400" : ""
                    }`}
                  >
                    <span>
                      {item.label}
                      {item.met === false && " (not met)"}
                    </span>
                    <b className="shrink-0">
                      {item.points > 0 ? "+" : ""}
                      {item.points}
                    </b>
                  </div>
                ))}
                <div className="flex justify-between gap-3 py-[6px] text-base text-stone-500 sm:text-[19px]">
                  <span>Remaining money (tiebreak)</span>
                  <span>{money(p.money)}</span>
                </div>
              </div>
              <div className="mt-[18px] flex flex-wrap gap-[18px]">
                {p.engineeringHand.map((cardId,i) => {
                  const card=engineeringById(cardId)??destinationById(cardId);
                  const scored=p.scoreBreakdown?.find(item=>item.label===card?.name);
                  return <div key={i} className="w-full min-w-0 sm:w-[360px]">
                    {destinationById(cardId)?<DestinationCardFace card={cardId} color={p.color} compact state={scored?.met?"met":"missed"}/>:<EngineeringCardFace card={cardId} color={p.color} compact state={scored?.met?"met":"missed"}/>}
                    <p className="text-lg">{scored?.met?`Scored +${scored.points}`:"Not achieved"}</p>
                  </div>;
                })}
              </div>
            </div>
          );
        })}
        <details className="rounded-xl border-2 border-stone-300 p-3"><summary className="cursor-pointer py-2 font-bold">Playtest report &amp; export</summary>
        <div className="flex flex-wrap items-center justify-between gap-[14px] rounded-[18px] border-[4px] border-[#1b3945] bg-[#eaf3f2] p-[18px]">
          <div>
            <p className="text-[24px] font-black">AI playtest report</p>
            <p className="text-[17px] text-stone-600">Copies the full action log, routes, cards, budgets, scoring, and end condition.</p>
          </div>
          <button
            type="button"
            onClick={copyReport}
            className="rounded-[12px] bg-[#1b3945] px-[20px] py-[12px] text-[18px] font-black text-white hover:bg-[#2d6170] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500"
          >
            {copyState === "copied" ? "Copied!" : copyState === "failed" ? "Copy failed — try again" : "Copy AI Report"}
          </button>
        </div>
        <details><summary className="cursor-pointer font-bold">View report text</summary><textarea aria-label="AI playtest report text" readOnly className="mt-2 h-64 w-full border p-2 text-sm" value={report}/></details>
        <a className="font-bold underline" download="subway-playtest.md" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(report)}`}>Download AI Report</a>
        </details>
      </div>
    </Printed>
  );
}
