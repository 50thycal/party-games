"use client";

import { useEffect, useRef, useState } from "react";
import { DestinationCardFace, EngineeringCardFace } from "./CardArt";
import { CardBacks, CardZoomModal, ContractCard, LineChip, MiniCardFace, money } from "./cards";
import {
  SUBWAY_CONFIG,
  SUBWAY_EVENT_LIMIT,
  actionsRemaining,
  committedStatus,
  constructionById,
  contractActions,
  contractOf,
  contractNodes,
  destinationById,
  destinationMet,
  destinationTurnId,
  destinationsHeld,
  engineeringById,
  schedulingById,
  starterTurnId,
  surveyFulfilled,
  surveyTurnId,
  type ConstructionCardId,
  type SchedulingCardId,
  type SubwayEvent,
  type SubwayPlayer,
  type SubwayState,
} from "./config";

// ============================================================================
// Tabletop furniture around the pegboard (WS-004, DEC-021): the opponent's
// public mat, the viewer's private mat, the public event rail, the pegboard
// narration overlay, and the hotseat handoff veil.
//
// Privacy is a rendering convention here, never a security claim: every client
// still receives the whole room payload (PROJECT_MODEL invariant 11). What
// these components guarantee is that no opposing private card name, assignment,
// or status is ever put into this client's DOM or accessibility tree.
// ============================================================================

// ----------------------------------------------------------------------------
// Whose action the table is waiting on, for the rail's current-turn marker.
// ----------------------------------------------------------------------------

export function currentActorId(game: SubwayState): string | undefined {
  switch (game.phase) {
    case "PROCUREMENT":
      return game.procurement.offer?.activeId;
    case "ENGINEERING":
      if (game.engineeringStep === "DESTINATION_DRAFT") return destinationTurnId(game);
      if (game.engineeringStep === "SURVEY") return surveyTurnId(game);
      return undefined; // both plan simultaneously
    case "STARTER_PLACEMENT":
      return starterTurnId(game);
    case "CONSTRUCTION":
      return game.resolveQueue[0];
    default:
      return undefined;
  }
}

// ----------------------------------------------------------------------------
// Narration: unseen public events become brief overlays over the pegboard.
// ----------------------------------------------------------------------------

const seenStorageKey = (roomCode: string, playerId: string) =>
  `subway-seen-v8:${roomCode}:${playerId}`;

/** Drop turn notices that are immediately superseded by a newer turn/period. */
const coalesceQueue = (list: SubwayEvent[]): SubwayEvent[] => {
  const kept = list.filter((e, i) => {
    if (e.kind !== "TURN") return true;
    return !list.slice(i + 1).some((later) => later.kind === "TURN" || later.kind === "PERIOD");
  });
  // Never build a long animation backlog: order is preserved, the oldest
  // overflow simply stays rail-only.
  return kept.length > 5 ? kept.slice(kept.length - 5) : kept;
};

/**
 * Tracks the last event sequence this room/player pairing has seen, queues the
 * unseen ones, and pumps them one at a time. A routine poll that carries no
 * new sequence numbers queues nothing, so nothing ever replays; the first look
 * at a room shows current state without replaying the backlog.
 */
export function useNarration(
  game: SubwayState | undefined,
  roomCode: string,
  playerId: string
): { overlay: SubwayEvent | null; dismiss: () => void; liveText: string } {
  const [queue, setQueue] = useState<SubwayEvent[]>([]);
  const [overlay, setOverlay] = useState<SubwayEvent | null>(null);
  const lastSeen = useRef<number | null>(null);
  const storageKey = seenStorageKey(roomCode, playerId);

  // A different room or (hotseat) player is a different pair of eyes.
  useEffect(() => {
    lastSeen.current = null;
    setQueue([]);
    setOverlay(null);
  }, [storageKey]);

  const latestSeq = game?.events?.length ? game.events[game.events.length - 1].seq : 0;

  useEffect(() => {
    if (!game) return;
    const events = game.events ?? [];
    if (lastSeen.current === null) {
      // Initial load: adopt the stored marker when it is plausible, otherwise
      // treat everything already in state as seen rather than replaying it.
      let stored: number | null = null;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw !== null && /^\d+$/.test(raw)) stored = Number(raw);
      } catch {
        stored = null;
      }
      lastSeen.current = stored !== null && stored <= latestSeq ? stored : latestSeq;
      if (lastSeen.current === latestSeq) {
        try {
          window.localStorage.setItem(storageKey, String(latestSeq));
        } catch {
          // Seen-tracking simply restarts next load without storage.
        }
        return;
      }
    }
    const seen = lastSeen.current;
    const unseen = events.filter((e) => e.seq > seen);
    if (!unseen.length) return;
    lastSeen.current = latestSeq;
    try {
      window.localStorage.setItem(storageKey, String(latestSeq));
    } catch {
      // Seen-tracking simply restarts next load without storage.
    }
    setQueue((q) => coalesceQueue([...q, ...unseen]));
  }, [game, latestSeq, storageKey]);

  // Pump: one overlay at a time, banners longer than notices.
  useEffect(() => {
    if (overlay || !queue.length) return;
    setOverlay(queue[0]);
    setQueue((q) => q.slice(1));
  }, [queue, overlay]);

  useEffect(() => {
    if (!overlay) return;
    const t = setTimeout(() => setOverlay(null), overlay.emphasis === "banner" ? 2200 : 1300);
    return () => clearTimeout(t);
  }, [overlay]);

  const liveText = game?.events?.length ? game.events[game.events.length - 1].text : "";
  return { overlay, dismiss: () => setOverlay(null), liveText };
}

/**
 * The overlay itself, rendered inside the board section. The wrapper ignores
 * the pointer so board input is never blocked; the plate itself is tappable to
 * dismiss. Animation is skipped under prefers-reduced-motion.
 */
export function NarrationOverlay({
  event,
  onDismiss,
}: {
  event: SubwayEvent | null;
  onDismiss: () => void;
}) {
  if (!event) return null;
  const banner = event.emphasis === "banner";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-10 z-20 flex justify-center px-4 sm:top-12">
      <style>{`
        @keyframes subway-overlay-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .subway-overlay-anim { animation: subway-overlay-in 180ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .subway-overlay-anim { animation: none; }
        }
      `}</style>
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss"
        className={`subway-overlay-anim pointer-events-auto max-w-[92%] rounded-2xl border text-left shadow-2xl ${
          banner
            ? "border-amber-300/60 bg-stone-900/90 px-6 py-3 text-amber-50"
            : "border-stone-300/50 bg-[#fffaf0]/95 px-4 py-2 text-stone-900"
        }`}
      >
        <span className={`block font-bold ${banner ? "text-base sm:text-lg" : "text-sm"}`}>
          {event.text}
        </span>
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Public event rail — the bounded history behind the overlays.
// ----------------------------------------------------------------------------

export function EventRail({ game }: { game: SubwayState }) {
  const [open, setOpen] = useState(true);
  const events = [...(game.events ?? [])].reverse();
  const actor = currentActorId(game);
  const actorName = actor ? game.players[actor]?.name : undefined;

  return (
    <section className="rounded-2xl border border-stone-300 bg-[#f6edda] p-3 text-stone-900">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-wider">Public record</h3>
        <div className="flex items-center gap-2">
          {actorName && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold">
              <span
                className="h-2 w-2 animate-pulse rounded-full"
                style={{ background: game.players[actor!]?.color }}
              />
              {actorName} to act
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="rounded border border-stone-400 px-1.5 text-xs font-bold text-stone-600"
            aria-expanded={open}
          >
            {open ? "−" : "+"}
          </button>
        </div>
      </div>
      {open && (
        <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1 text-xs">
          {events.map((e) => {
            const color = e.actorId ? game.players[e.actorId]?.color : undefined;
            return (
              <li
                key={e.seq}
                className={`flex items-start gap-2 rounded px-1.5 py-1 ${
                  e.emphasis === "banner" ? "bg-white/70 font-bold" : "text-stone-700"
                }`}
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color ?? "#a8a29e" }}
                />
                <span>{e.text}</span>
              </li>
            );
          })}
          {!events.length && <li className="italic text-stone-400">Nothing public has happened yet.</li>}
        </ol>
      )}
      <p className="mt-1.5 text-[10px] text-stone-500">
        The latest {SUBWAY_EVENT_LIMIT} accepted public actions. Private cards, assignments, and
        saved plans never appear here.
      </p>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Opponent public mat: identity, cash, contracts, and card backs/counts only.
// ----------------------------------------------------------------------------

export function OpponentMat({
  game,
  opponent,
  scheduleRevealed,
}: {
  game: SubwayState;
  opponent: SubwayPlayer;
  scheduleRevealed: boolean;
}) {
  const oddPriority = opponent.id === game.oddPriorityId;
  const permits = Object.entries(game.priorityOverrides)
    .filter(([, id]) => id === opponent.id)
    .map(([period]) => period);
  const pins = game.surveyPins.filter((pin) => pin.playerId === opponent.id);

  return (
    <section className="rounded-2xl border border-stone-300 bg-[#efe7d4] p-3 text-stone-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 font-black">
          <span className="h-3 w-3 rounded-full" style={{ background: opponent.color }} />
          {opponent.name}
        </span>
        <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-100">
          Opposition
        </span>
        <span
          className={`rounded px-1.5 text-[10px] font-black ${
            oddPriority ? "bg-amber-400 text-stone-900" : "bg-sky-200 text-stone-700"
          }`}
        >
          {oddPriority ? "ODD" : "EVEN"}
        </span>
        <span className={`ml-auto text-sm font-black ${opponent.money < 0 ? "text-red-700" : ""}`}>
          {opponent.money < 0 ? `−${money(-opponent.money)}` : money(opponent.money)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {opponent.lines.map((line, i) => {
          const contract = contractOf(line);
          if (!contract) return null;
          const shelved = line.start === undefined;
          return (
            <span key={i} className="flex items-center gap-1.5 text-xs">
              <LineChip contract={contract} subdued={scheduleRevealed && shelved} />
              <b>
                {line.route.length}/{contractNodes(contract)}
              </b>
              <span className="text-stone-500">
                {scheduleRevealed
                  ? shelved
                    ? "shelved"
                    : `p${line.start}–${line.start! + contractActions(contract) - 1}`
                  : "schedule hidden"}
              </span>
            </span>
          );
        })}
        {!opponent.lines.length && <span className="text-xs italic text-stone-400">No contracts yet.</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-stone-300/70 pt-2">
        <CardBacks label="Engineering" count={opponent.engineeringHand.length} tone="bg-amber-700" />
        <CardBacks label="Committed" count={opponent.committedEngineering.length} tone="bg-stone-700" />
        <CardBacks label="Destinations" count={destinationsHeld(opponent)} tone="bg-purple-700" />
        <CardBacks label="Scheduling" count={opponent.schedulingHand.length} tone="bg-sky-800" />
        <CardBacks label="Construction" count={opponent.constructionHand.length} tone="bg-orange-800" />
        <div className="text-[11px] leading-snug text-stone-600">
          {opponent.schedulingCardPlayed && (
            <p>
              Played <b>{schedulingById(opponent.schedulingCardPlayed)?.name}</b>
              {permits.length > 0 && ` (period ${permits.join(", ")})`}
            </p>
          )}
          {pins.length > 0 && (
            <p>
              {pins.length} Survey Pin{pins.length === 1 ? "" : "s"} on the board
            </p>
          )}
          {opponent.tollsPaid > 0 && <p>Paid {money(opponent.tollsPaid)} in contact tolls</p>}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// The viewer's private mat: organized, face-up cards plus live private status.
// ----------------------------------------------------------------------------

type ZoomTarget =
  | { kind: "engineering"; id: string; met?: boolean; committed?: boolean }
  | { kind: "destination"; id: string; met?: boolean; committed?: boolean; lineName?: string }
  | { kind: "mini"; family: "scheduling" | "construction"; id: string };

export type PlanChip = {
  saved: boolean;
  stale: boolean;
};

export function PlayerMat({
  game,
  me,
  activeLineIndex,
  planChips,
  planAvailable,
  onOpenPlanner,
}: {
  game: SubwayState;
  me: SubwayPlayer;
  activeLineIndex: number;
  planChips: Record<string, PlanChip>;
  planAvailable: boolean;
  onOpenPlanner: (lineIndex: number) => void;
}) {
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);
  const planningStep = game.phase === "ENGINEERING" && game.engineeringStep === "PLAN";
  const owed = actionsRemaining(me);
  const status = committedStatus(game, me.id);
  const myPins = game.surveyPins.filter((pin) => pin.playerId === me.id);

  const section = (title: string, hint?: string) => (
    <div className="flex items-baseline justify-between">
      <b className="text-xs uppercase tracking-wide text-stone-500">{title}</b>
      {hint && <span className="text-[10px] font-bold uppercase text-stone-400">{hint}</span>}
    </div>
  );

  return (
    <section className="rounded-2xl bg-[#fffaf0] p-4 text-stone-900 shadow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black">Your player mat</h3>
        <span
          className="rounded-full px-3 py-1 text-sm font-bold text-white"
          style={{ background: me.money < 0 ? "#b91c1c" : me.color }}
        >
          {me.name} · {me.money < 0 ? `−${money(-me.money)}` : money(me.money)}
        </span>
      </div>

      {me.money < 0 && (
        <p className="mt-1 rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-900">
          In debt {money(-me.money)} from route contacts. If you finish here it costs{" "}
          {me.money * SUBWAY_CONFIG.contact.debtVpPerMillion} VP. Contacts the opposition pays you
          reduce it.
        </p>
      )}
      <p className="mt-1 text-xs text-stone-600">
        You build first in <b>{me.id === game.oddPriorityId ? "odd" : "even"}</b> periods.
        {me.tollsPaid > 0 && ` Paid ${money(me.tollsPaid)} in route contacts so far.`}
        {game.phase === "CONSTRUCTION" &&
          ` ${owed} action${owed === 1 ? "" : "s"} of work left across ${me.lines.length} contract${me.lines.length === 1 ? "" : "s"}.`}
      </p>

      {/* Line Contracts, each with its plan chip. */}
      <div className="mt-3">
        {section("Line Contracts")}
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {me.lines.length === 0 && (
            <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-500">No Line Contract yet.</p>
          )}
          {me.lines.map((line, i) => {
            const contract = contractOf(line);
            if (!contract) return null;
            const active = i === activeLineIndex;
            const chip = planChips[line.contractId];
            return (
              <div key={i} className={active ? "rounded-xl ring-2 ring-amber-400 ring-offset-2" : ""}>
                <ContractCard
                  contract={contract}
                  progress={{ built: line.route.length, total: contractNodes(contract) }}
                >
                  <p className="mt-1 text-[11px] text-stone-500">
                    Paid {money(line.paid)}
                    {line.paid < contract.cost && " (Discount Yard)"}
                    {line.start !== undefined
                      ? ` · periods ${line.start}–${line.start + contractActions(contract) - 1}`
                      : " · shelved"}
                    {active && " · ACTIVE"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-stone-200 pt-1.5 text-[11px]">
                    {chip?.saved ? (
                      <span
                        className={`rounded px-1.5 py-0.5 font-black uppercase ${
                          chip.stale ? "bg-red-100 text-red-800" : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {chip.stale ? "Plan stale" : "Plan saved"}
                      </span>
                    ) : (
                      <span className="text-stone-400">No saved plan</span>
                    )}
                    {planAvailable && (
                      <button
                        type="button"
                        onClick={() => onOpenPlanner(i)}
                        className="ml-auto rounded border border-purple-400 px-2 py-0.5 font-bold text-purple-800 hover:bg-purple-50"
                      >
                        {chip?.saved ? "Edit plan" : "Plan route"}
                      </button>
                    )}
                  </div>
                </ContractCard>
              </div>
            );
          })}
        </div>
      </div>

      {/* Engineering — hidden commitments with live status, then the rest of the hand. */}
      {!planningStep && (me.committedEngineering.length > 0 || me.engineeringHand.length > 0) && (
        <div className="mt-4">
          {section("Engineering", "Hidden from the opposition")}
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {status.map(({ cardId, met }, i) => (
              <EngineeringCardFace
                key={`c-${cardId}-${i}`}
                card={cardId}
                color={me.color}
                state={met ? "met" : "committed"}
                compact
                onClick={() => setZoom({ kind: "engineering", id: cardId, met, committed: true })}
                footer={
                  <p className={`mt-1 text-[11px] font-black ${met ? "text-emerald-700" : "text-stone-400"}`}>
                    {met ? "✓ COMPLETE" : "In progress"}
                  </p>
                }
              />
            ))}
            {me.engineeringHand.map((id, i) => (
              <EngineeringCardFace
                key={`h-${id}-${i}`}
                card={id}
                color={me.color}
                compact
                onClick={() => setZoom({ kind: "engineering", id })}
                footer={<p className="mt-1 text-[11px] font-black text-stone-400">In hand — not scoring</p>}
              />
            ))}
          </div>
        </div>
      )}

      {/* Destinations — assignments with live status, then unassigned drafts. */}
      {!planningStep && (me.destinationCommitments.length > 0 || me.destinationHand.length > 0) && (
        <div className="mt-4">
          {section("Destinations", "Hidden from the opposition")}
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {me.destinationCommitments.map((commitment, i) => {
              const met = destinationMet(me, commitment);
              const assigned = me.lines[commitment.lineIndex];
              const lineName = assigned ? contractOf(assigned)?.name : undefined;
              return (
                <DestinationCardFace
                  key={`c-${commitment.cardId}-${i}`}
                  card={commitment.cardId}
                  color={me.color}
                  compact
                  state={met ? "met" : "committed"}
                  onClick={() =>
                    setZoom({ kind: "destination", id: commitment.cardId, met, committed: true, lineName })
                  }
                  footer={
                    <p className={`mt-1 text-[11px] font-black ${met ? "text-emerald-700" : "text-stone-400"}`}>
                      {lineName ?? "unassigned"} · {met ? "✓ COMPLETE" : "In progress"}
                    </p>
                  }
                />
              );
            })}
            {me.destinationHand.map((id, i) => (
              <DestinationCardFace
                key={`h-${id}-${i}`}
                card={id}
                color={me.color}
                compact
                onClick={() => setZoom({ kind: "destination", id })}
                footer={<p className="mt-1 text-[11px] font-black text-stone-400">Unassigned — not scoring</p>}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scheduling and Construction hands as real faces. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          {section("Scheduling cards")}
          <div className="mt-1.5 space-y-2">
            {me.schedulingHand.map((id, i) => {
              const card = schedulingById(id)!;
              return (
                <MiniCardFace
                  key={`${id}-${i}`}
                  family="scheduling"
                  name={card.name}
                  description={card.description}
                  compact
                  onClick={() => setZoom({ kind: "mini", family: "scheduling", id })}
                />
              );
            })}
            {me.schedulingCardPlayed && (
              <p className="text-[11px] text-stone-500">
                Played publicly: <b>{schedulingById(me.schedulingCardPlayed)?.name}</b>
              </p>
            )}
            {!me.schedulingHand.length && !me.schedulingCardPlayed && (
              <p className="text-[11px] italic text-stone-400">None.</p>
            )}
          </div>
        </div>
        <div>
          {section("Construction cards")}
          <div className="mt-1.5 space-y-2">
            {me.constructionHand.map((id, i) => {
              const card = constructionById(id)!;
              return (
                <MiniCardFace
                  key={`${id}-${i}`}
                  family="construction"
                  name={card.name}
                  description={card.description}
                  compact
                  onClick={() => setZoom({ kind: "mini", family: "construction", id })}
                />
              );
            })}
            {!me.constructionHand.length && <p className="text-[11px] italic text-stone-400">None.</p>}
          </div>
        </div>
      </div>

      {/* Survey pins are public, but their payout status is this company's. */}
      {myPins.length > 0 && (
        <div className="mt-4">
          {section("Survey Pins", "Public")}
          <ul className="mt-1 space-y-0.5 text-xs">
            {myPins.map((pin, i) => {
              const done = surveyFulfilled(me, pin);
              return (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-stone-600">
                    {pin.x + 1},{pin.y + 1} · any of your lines
                  </span>
                  <span className={`ml-auto font-black ${done ? "text-emerald-700" : "text-stone-400"}`}>
                    {done ? `✓ +${SUBWAY_CONFIG.survey.vp}` : "pending"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {zoom && (
        <CardZoomModal onClose={() => setZoom(null)}>
          {zoom.kind === "engineering" && (
            <EngineeringCardFace
              card={zoom.id}
              color={me.color}
              state={zoom.committed ? (zoom.met ? "met" : "committed") : "idle"}
              footer={
                <p className={`mt-1.5 text-xs font-black ${zoom.met ? "text-emerald-700" : "text-stone-500"}`}>
                  {zoom.committed
                    ? zoom.met
                      ? `✓ COMPLETE — scores +${engineeringById(zoom.id)?.vp} VP as it stands`
                      : "Committed · in progress — hidden from the opposition until scoring"
                    : "In hand — commits at Engineering plan lock, scores nothing otherwise"}
                </p>
              }
            />
          )}
          {zoom.kind === "destination" && (
            <DestinationCardFace
              card={zoom.id}
              color={me.color}
              state={zoom.committed ? (zoom.met ? "met" : "committed") : "idle"}
              footer={
                <p className={`mt-1.5 text-xs font-black ${zoom.met ? "text-emerald-700" : "text-stone-500"}`}>
                  {zoom.committed
                    ? `Assigned to ${zoom.lineName ?? "a line"} · ${
                        zoom.met
                          ? `✓ COMPLETE — scores +${destinationById(zoom.id)?.vp} VP`
                          : "not connected yet"
                      }`
                    : "Drafted — assign it to a line at Engineering plan lock"}
                </p>
              }
            />
          )}
          {zoom.kind === "mini" && (
            <MiniCardFace
              family={zoom.family}
              name={
                (zoom.family === "scheduling"
                  ? schedulingById(zoom.id as SchedulingCardId)?.name
                  : constructionById(zoom.id as ConstructionCardId)?.name) ?? zoom.id
              }
              description={
                (zoom.family === "scheduling"
                  ? schedulingById(zoom.id as SchedulingCardId)?.description
                  : constructionById(zoom.id as ConstructionCardId)?.description) ?? ""
              }
              note={
                zoom.family === "scheduling"
                  ? "One Scheduling card per company per game, after the reveal."
                  : "One Construction card per company per period, on a period you build."
              }
            />
          )}
        </CardZoomModal>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Hotseat handoff veil — private mats stay covered until the next player
// confirms who they are. The public board stays visible behind the scrim.
// ----------------------------------------------------------------------------

export function HandoffVeil({
  name,
  color,
  onConfirm,
}: {
  name: string;
  color: string;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-[#f6edda] p-6 text-center text-stone-900 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-amber-800">Hotseat handoff</p>
        <h3 className="mt-2 font-serif text-2xl font-black">Pass the device to {name}</h3>
        <p className="mt-2 text-sm text-stone-600">
          Private mats, hands, and saved route plans stay hidden until {name} confirms. The public
          board and event record are safe for everyone to see.
        </p>
        <button
          type="button"
          onClick={onConfirm}
          className="mt-4 w-full rounded-xl px-4 py-3 font-bold text-white shadow"
          style={{ background: color }}
        >
          I am {name}
        </button>
      </div>
    </div>
  );
}
