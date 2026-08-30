"use client";

import { useEffect, useRef, useState } from "react";
import {
  destinationTurnId,
  starterTurnId,
  surveyTurnId,
  type SubwayEvent,
  type SubwayState,
} from "./config";

// ============================================================================
// Narration over the table, and the hotseat handoff veil (WS-004, DEC-021).
//
// The pieces themselves live in `table.tsx` inside the tabletop coordinate
// space (DEC-023); what stays here is the screen-level narration of accepted
// public events and the veil that covers the private edge between hotseat
// players.
//
// Privacy is a rendering convention, never a security claim: every client still
// receives the whole room payload (PROJECT_MODEL invariant 11). What these
// components guarantee is that no opposing private card name, assignment, or
// status is ever put into this client's DOM or accessibility tree.
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
