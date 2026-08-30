"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DestinationCardFace, EngineeringCardFace } from "./CardArt";
import { money } from "./cards";
import {
  SUBWAY_CONFIG,
  SUBWAY_EVENT_LIMIT,
  blockFits,
  blockPeriods,
  committedStatus,
  concurrentBlocks,
  constructionById,
  contractActions,
  contractById,
  contractNodes,
  contractOf,
  crewCost,
  destinationById,
  destinationMet,
  destinationsHeld,
  lineComplete,
  lineMobilization,
  marketConstruction,
  marketEngineering,
  marketScheduling,
  mobilizationCost,
  nextSegmentLength,
  periodPriorityId,
  scheduleCost,
  scheduleProblems,
  schedulingById,
  segmentsBuilt,
  stationById,
  surveyFulfilled,
  type CardDeckId,
  type ConstructionCardId,
  type LineContract,
  type PlayerLine,
  type SchedulingCardId,
  type SubwayPlayer,
  type SubwayState,
} from "./config";

// ============================================================================
// The pieces on the table (WS-004 clarification, DEC-023 / Addendum A).
//
// Everything here is world content: it is laid out in world pixels inside the
// single tabletop coordinate space and is reached by moving the camera, not by
// scrolling a panel. Nothing in this file has its own scroll region.
//
// Privacy stays a rendering convention under invariant 11: the opponent's edge
// is built from public fields plus counts, and no opposing card face, private
// assignment, or private status is ever placed in this client's DOM.
// ============================================================================

// ---------------------------------------------------------------------------
// Table furniture
// ---------------------------------------------------------------------------

export const TABLE = {
  margin: 70,
  gap: 70,
  side: 660,
};

/** A printed board or mat lying on the table. */
export function Printed({
  title,
  subtitle,
  tone = "board",
  children,
  className = "",
  style,
  zone,
  accent,
}: {
  title?: string;
  subtitle?: ReactNode;
  tone?: "board" | "mat" | "slip";
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  zone?: string;
  accent?: string;
}) {
  const skin =
    tone === "board"
      ? "bg-[#f2e6cb] border-[#6b4b2c]"
      : tone === "mat"
        ? "bg-[#e6dcc2] border-[#5a4a35]"
        : "bg-[#fffaf0] border-[#a58a63]";
  return (
    <section
      {...(zone ? { "data-zone": zone } : {})}
      className={`rounded-[30px] border-[7px] ${skin} p-[26px] shadow-[0_20px_44px_rgba(0,0,0,.45)] ${className}`}
      style={style}
    >
      {(title || subtitle) && (
        <header className="mb-[18px] flex flex-wrap items-baseline justify-between gap-[16px] border-b-[3px] border-[#6b4b2c]/25 pb-[12px]">
          {title && (
            <h3
              className="text-[30px] font-black uppercase tracking-[.16em] text-[#4b3520]"
              style={accent ? { color: accent } : undefined}
            >
              {title}
            </h3>
          )}
          {subtitle && <div className="text-[19px] font-semibold text-stone-600">{subtitle}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Existing card artwork rendered at a physical size on the table. The faces
 * were drawn for a web column, so they are laid out at their natural width and
 * scaled up as one piece; the wrapper tracks the scaled height so the table
 * still lays out normally.
 */
export function Scaled({
  width,
  scale,
  children,
  className = "",
}: {
  width: number;
  scale: number;
  children: ReactNode;
  className?: string;
}) {
  const inner = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={className} style={{ width: width * scale, height: h * scale }}>
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

const CARD_W = 232;
const CARD_SCALE = 1.55;

/** One card lying on the table: tap or Enter opens its focused state. */
export function CardPiece({
  onOpen,
  label,
  dimmed,
  ring,
  children,
  badge,
}: {
  onOpen: () => void;
  label: string;
  dimmed?: boolean;
  ring?: string;
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={`group relative rounded-[20px] text-left transition duration-150 hover:-translate-y-[6px] focus-visible:outline-none focus-visible:ring-[6px] focus-visible:ring-amber-400 ${
        dimmed ? "opacity-55" : ""
      }`}
      style={ring ? { boxShadow: `0 0 0 5px ${ring}, 0 14px 26px rgba(0,0,0,.35)` } : { boxShadow: "0 14px 26px rgba(0,0,0,.35)" }}
    >
      <Scaled width={CARD_W} scale={CARD_SCALE}>
        {children}
      </Scaled>
      {badge && <div className="absolute -top-[14px] left-[14px]">{badge}</div>}
    </button>
  );
}

export function Pill({
  children,
  tone = "neutral",
  color,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "solid";
  color?: string;
}) {
  const skin =
    tone === "good"
      ? "bg-emerald-600 text-white"
      : tone === "warn"
        ? "bg-amber-400 text-stone-900"
        : tone === "bad"
          ? "bg-red-700 text-white"
          : tone === "solid"
            ? "text-white"
            : "bg-stone-800/10 text-stone-700";
  return (
    <span
      className={`inline-flex items-center gap-[8px] rounded-full px-[14px] py-[5px] text-[17px] font-black uppercase tracking-[.1em] ${skin}`}
      style={tone === "solid" && color ? { background: color } : undefined}
    >
      {children}
    </span>
  );
}

/** The line's badge: colour plus its letter code, so colour is never alone. */
export function LineTile({ contract, size = 46, subdued }: { contract: LineContract; size?: number; subdued?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] font-black text-white shadow-inner ${
        subdued ? "opacity-45" : ""
      }`}
      style={{ background: contract.color, width: size, height: size, fontSize: size * 0.5 }}
      title={contract.name}
    >
      {contract.code}
    </span>
  );
}

export function TableButton({
  children,
  onClick,
  tone = "plain",
  disabled,
  size = "md",
  title,
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "plain" | "go" | "warn" | "danger" | "plan";
  disabled?: boolean;
  size?: "sm" | "md";
  title?: string;
} & Record<string, unknown>) {
  const skin =
    tone === "go"
      ? "bg-emerald-700 text-white border-emerald-900"
      : tone === "warn"
        ? "bg-amber-600 text-white border-amber-800"
        : tone === "danger"
          ? "bg-red-700 text-white border-red-900"
          : tone === "plan"
            ? "bg-purple-700 text-white border-purple-900"
            : "bg-[#fffaf0] text-stone-800 border-stone-500";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-[14px] border-[3px] font-black shadow-[0_5px_0_rgba(0,0,0,.25)] transition active:translate-y-[2px] active:shadow-none disabled:opacity-40 disabled:shadow-none ${skin} ${
        size === "sm" ? "px-[14px] py-[7px] text-[18px]" : "px-[22px] py-[12px] text-[22px]"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Hidden opposing hand: backs plus a count. Only the count is information. */
function Backs({ label, count, tone }: { label: string; count: number; tone: string }) {
  const shown = Math.min(count, 4);
  return (
    <div className="flex items-center gap-[12px]" aria-label={`${label}: ${count} hidden card${count === 1 ? "" : "s"}`}>
      <div className="flex">
        {count === 0 ? (
          <span className="flex h-[72px] w-[50px] items-center justify-center rounded-[8px] border-[3px] border-dashed border-stone-400 text-[20px] text-stone-400">
            –
          </span>
        ) : (
          Array.from({ length: shown }, (_, i) => (
            <span
              key={i}
              className={`h-[72px] w-[50px] rounded-[8px] border-[3px] border-white/60 shadow ${tone} ${i > 0 ? "-ml-[28px]" : ""}`}
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,.18) 0 5px, transparent 5px 10px)",
              }}
            />
          ))
        )}
      </div>
      <div className="leading-tight">
        <p className="text-[26px] font-black tabular-nums text-stone-800">{count}</p>
        <p className="text-[15px] font-bold uppercase tracking-wide text-stone-500">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The opponent's edge of the table — public information only.
// ---------------------------------------------------------------------------

export function OpponentEdge({
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
    <Printed zone="opponent" tone="mat" className="w-full">
      <div className="flex flex-wrap items-center gap-x-[40px] gap-y-[18px]">
        <span className="flex items-center gap-[16px]">
          <span className="h-[38px] w-[38px] rounded-full shadow-inner" style={{ background: opponent.color }} />
          <b className="text-[34px] font-black text-stone-800">{opponent.name}</b>
          <Pill>Opposition</Pill>
          <Pill tone={oddPriority ? "warn" : "neutral"}>{oddPriority ? "Odd first" : "Even first"}</Pill>
        </span>
        <span className={`text-[34px] font-black ${opponent.money < 0 ? "text-red-700" : "text-stone-800"}`}>
          {opponent.money < 0 ? `−${money(-opponent.money)}` : money(opponent.money)}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-x-[34px] gap-y-[14px]">
          <Backs label="Engineering" count={opponent.engineeringHand.length} tone="bg-amber-700" />
          <Backs label="Committed" count={opponent.committedEngineering.length} tone="bg-stone-700" />
          <Backs label="Destinations" count={destinationsHeld(opponent)} tone="bg-purple-700" />
          <Backs label="Scheduling" count={opponent.schedulingHand.length} tone="bg-sky-800" />
          <Backs label="Construction" count={opponent.constructionHand.length} tone="bg-orange-800" />
        </div>
      </div>

      <div className="mt-[18px] flex flex-wrap items-center gap-x-[36px] gap-y-[14px] border-t-[3px] border-[#6b4b2c]/20 pt-[16px]">
        {opponent.lines.map((line, i) => {
          const contract = contractOf(line);
          if (!contract) return null;
          const shelved = line.start === undefined;
          return (
            <span key={i} className="flex items-center gap-[12px] text-[20px]">
              <LineTile contract={contract} size={38} subdued={scheduleRevealed && shelved} />
              <b className="tabular-nums">
                {line.route.length}/{contractNodes(contract)}
              </b>
              <span className="text-stone-600">
                {scheduleRevealed
                  ? shelved
                    ? "shelved"
                    : `periods ${line.start}–${line.start! + contractActions(contract) - 1}`
                  : "schedule sealed"}
              </span>
            </span>
          );
        })}
        {!opponent.lines.length && <span className="text-[20px] italic text-stone-500">No contracts yet.</span>}
        <span className="ml-auto text-[18px] leading-snug text-stone-600">
          {opponent.schedulingCardPlayed && (
            <span className="mr-[20px]">
              Played <b>{schedulingById(opponent.schedulingCardPlayed)?.name}</b>
              {permits.length > 0 && ` (period ${permits.join(", ")})`}
            </span>
          )}
          {pins.length > 0 && (
            <span className="mr-[20px]">
              {pins.length} Survey Pin{pins.length === 1 ? "" : "s"} on the board
            </span>
          )}
          {opponent.tollsPaid > 0 && <span>Paid {money(opponent.tollsPaid)} in contact tolls</span>}
        </span>
      </div>
    </Printed>
  );
}

// ---------------------------------------------------------------------------
// The public construction schedule board.
// ---------------------------------------------------------------------------

const PERIODS = SUBWAY_CONFIG.timelinePeriods;

function ScheduleRow({
  line,
  player,
  game,
}: {
  line: PlayerLine;
  player: SubwayPlayer;
  game: SubwayState;
}) {
  const active = new Set(blockPeriods(line));
  const contract = contractOf(line);
  return (
    <>
      {Array.from({ length: PERIODS }, (_, i) => {
        const period = i + 1;
        const on = active.has(period);
        const doubled = on && concurrentBlocks(player, period) > 1;
        const past = game.phase === "CONSTRUCTION" && period < game.currentPeriod;
        const live = game.phase === "CONSTRUCTION" && period === game.currentPeriod;
        return (
          <div
            key={period}
            className={`flex h-[46px] items-center justify-center rounded-[8px] text-[18px] font-black text-white ${
              on ? "" : "bg-stone-900/10"
            } ${live && on ? "ring-[4px] ring-emerald-500" : ""} ${doubled ? "outline outline-[3px] outline-amber-500" : ""}`}
            style={on ? { background: contract?.color ?? player.color, opacity: past ? 0.45 : 1 } : undefined}
            title={
              on
                ? `${contract?.name}: period ${period}${doubled ? " (second crew)" : ""}${past ? " — worked" : ""}`
                : undefined
            }
          >
            {on ? (past ? "✓" : doubled ? "2×" : contract?.code) : ""}
          </div>
        );
      })}
    </>
  );
}

export function ScheduleBoard({
  game,
  viewerId,
  revealed,
  editable,
  busy,
  act,
  veiled,
}: {
  game: SubwayState;
  viewerId: string;
  revealed: boolean;
  editable: boolean;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
  veiled: boolean;
}) {
  const me = game.players[viewerId];
  const planning = game.phase === "SCHEDULING" && game.schedulingStep === "PLANNING";
  const cost = me ? scheduleCost(me) : 0;
  const problems = me ? scheduleProblems(me) : [];
  const columns = `520px repeat(${PERIODS}, minmax(0, 1fr))`;

  return (
    <Printed
      zone="schedule"
      title="Public construction schedule"
      subtitle={`${PERIODS} periods · one crew per company · odd and even priority alternate`}
      className="w-full"
    >
      <div className="grid items-center gap-[6px]" style={{ gridTemplateColumns: columns }}>
        <div className="text-[19px] font-black uppercase tracking-[.14em] text-stone-500">Period</div>
        {Array.from({ length: PERIODS }, (_, i) => {
          const period = i + 1;
          const live = game.phase === "CONSTRUCTION" && period === game.currentPeriod;
          const past = game.phase === "CONSTRUCTION" && period < game.currentPeriod;
          return (
            <div
              key={period}
              className={`flex h-[46px] items-center justify-center rounded-[8px] text-[24px] font-black tabular-nums ${
                live ? "bg-emerald-600 text-white" : past ? "bg-stone-900/5 text-stone-400" : "bg-stone-900/5 text-stone-600"
              }`}
            >
              {period}
            </div>
          );
        })}

        <div className="text-[19px] font-black uppercase tracking-[.14em] text-stone-500">Builds first</div>
        {Array.from({ length: PERIODS }, (_, i) => {
          const period = i + 1;
          const firstId = periodPriorityId(game, period);
          const overridden = game.priorityOverrides[period] !== undefined;
          const first = game.players[firstId];
          return (
            <div
              key={period}
              className={`flex h-[34px] items-center justify-center rounded-[8px] text-[17px] font-black text-white ${
                overridden ? "outline outline-[3px] outline-amber-500" : ""
              }`}
              style={{ background: first?.color ?? "transparent" }}
              title={`${first?.name ?? "?"} builds first in period ${period}${
                overridden ? " (Priority Permit)" : period % 2 === 1 ? " (odd periods)" : " (even periods)"
              }`}
            >
              {overridden ? "P" : first?.name?.slice(0, 1).toUpperCase() ?? ""}
            </div>
          );
        })}

        {game.playerOrder.map((id) => {
          const p = game.players[id];
          if (!p) return null;
          const mine = id === viewerId;
          const hidden = (!revealed && !mine) || (mine && veiled);
          return (
            <div key={id} className="contents">
              <div className="col-span-full mt-[16px] flex items-center gap-[16px]">
                <span className="h-[26px] w-[26px] rounded-full" style={{ background: p.color }} />
                <b className="text-[24px]">{p.name}</b>
                {mine && <Pill tone="solid" color={p.color}>You</Pill>}
                {!hidden && (
                  <span className="text-[19px] text-stone-600">
                    mobilization {money(mobilizationCost(p))} · second crew {money(crewCost(p))}
                  </span>
                )}
              </div>
              {hidden ? (
                <div className="col-span-full rounded-[10px] bg-stone-900/5 px-[16px] py-[12px] text-[19px] italic text-stone-500">
                  Sealed until both schedules are submitted — {p.scheduleSubmitted ? "submitted" : "still drafting"}.
                </div>
              ) : (
                p.lines.map((line, li) => {
                  const contract = contractOf(line);
                  if (!contract) return null;
                  const shelved = line.start === undefined;
                  const end = shelved ? undefined : line.start! + contractActions(contract) - 1;
                  return (
                    <div key={li} className="contents">
                      <div className="flex items-center gap-[12px] pr-[16px]">
                        <LineTile contract={contract} size={38} subdued={shelved} />
                        <span className={`text-[20px] font-bold ${shelved ? "text-stone-400" : ""}`}>{contract.name}</span>
                        <span className="text-[17px] text-stone-500">
                          {shelved ? "shelved" : `p${line.start}–${end} · ${money(lineMobilization(line))}`}
                        </span>
                        {editable && mine && (
                          <span className="ml-auto flex items-center gap-[6px]">
                            <TableButton
                              size="sm"
                              disabled={busy || shelved || !blockFits(line, (line.start ?? 1) - 1)}
                              onClick={() => act("SET_SCHEDULE", { lineIndex: li, start: (line.start ?? 1) - 1 })}
                              title={`Start ${contract.name} earlier`}
                            >
                              ◀
                            </TableButton>
                            <TableButton
                              size="sm"
                              disabled={busy || shelved || !blockFits(line, (line.start ?? 1) + 1)}
                              onClick={() => act("SET_SCHEDULE", { lineIndex: li, start: (line.start ?? 1) + 1 })}
                              title={`Start ${contract.name} later`}
                            >
                              ▶
                            </TableButton>
                            <TableButton
                              size="sm"
                              disabled={busy}
                              onClick={() => act("SET_SCHEDULE", { lineIndex: li, start: shelved ? 1 : null })}
                            >
                              {shelved ? "Schedule" : "Shelve"}
                            </TableButton>
                          </span>
                        )}
                      </div>
                      <ScheduleRow line={line} player={p} game={game} />
                    </div>
                  );
                })
              )}
              {!hidden && !p.lines.length && (
                <div className="col-span-full text-[19px] italic text-stone-400">No contracts.</div>
              )}
            </div>
          );
        })}
      </div>

      {/* The planning slip clipped to the board while Scheduling is live. */}
      {me && game.phase === "SCHEDULING" && !veiled && (
        <div className="mt-[22px] rounded-[18px] border-[4px] border-[#a58a63] bg-[#fffaf0] p-[20px]">
          <div className="flex flex-wrap items-center gap-x-[36px] gap-y-[10px] text-[21px]">
            <span>
              Mobilization <b>{money(mobilizationCost(me))}</b>
            </span>
            <span>
              Second crew <b>{money(crewCost(me))}</b>
            </span>
            <span>
              Total <b className={cost > me.money ? "text-red-700" : ""}>{money(cost)}</b>
            </span>
            <span>
              Cash after <b className={cost > me.money ? "text-red-700" : ""}>{money(me.money - cost)}</b>
            </span>
            <span className="ml-auto flex gap-[12px]">
              {planning ? (
                <TableButton
                  tone="go"
                  disabled={busy || me.scheduleSubmitted || problems.length > 0}
                  onClick={() => act("SUBMIT_SCHEDULE")}
                >
                  {me.scheduleSubmitted ? "Submitted — waiting" : "Submit schedule"}
                </TableButton>
              ) : (
                <TableButton
                  tone="go"
                  disabled={busy || me.scheduleConfirmed || problems.length > 0}
                  onClick={() => act("CONFIRM_SCHEDULE")}
                >
                  {me.scheduleConfirmed ? "Locked — waiting" : `Confirm & pay ${money(cost)}`}
                </TableButton>
              )}
            </span>
          </div>
          {problems.length > 0 && (
            <ul className="mt-[10px] space-y-[4px] text-[19px] font-bold text-red-800">
              {problems.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          )}
          {!planning && !me.scheduleConfirmed && (
            <p className="mt-[10px] text-[18px] text-stone-600">
              Both schedules are revealed. You may play one Scheduling card from your tabletop before
              confirming.
            </p>
          )}
        </div>
      )}
    </Printed>
  );
}

// ---------------------------------------------------------------------------
// Contract office: the market side of the table.
// ---------------------------------------------------------------------------

function DeckStack({ label, tone, note }: { label: string; tone: string; note?: string }) {
  return (
    <div className="flex items-center gap-[14px]">
      <span
        className={`h-[92px] w-[64px] rounded-[10px] border-[3px] border-white/60 shadow-lg ${tone}`}
        style={{
          backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.18) 0 6px, transparent 6px 12px)",
        }}
      />
      <div className="leading-tight">
        <p className="text-[19px] font-black uppercase tracking-wide text-stone-700">{label}</p>
        {note && <p className="text-[17px] text-stone-500">{note}</p>}
      </div>
    </div>
  );
}

export function ContractOffice({
  game,
  me,
  veiled,
  onOpenContract,
  onOpenMarket,
  onOpenDestination,
  children,
}: {
  game: SubwayState;
  me?: SubwayPlayer;
  veiled: boolean;
  onOpenContract: (contractId: string, price?: number) => void;
  onOpenMarket: (deck: CardDeckId) => void;
  onOpenDestination: (id: string) => void;
  /** Phase controls that belong on this piece (buy/pass, and so on). */
  children?: ReactNode;
}) {
  const offer = game.procurement.offer;
  const contract = offer ? contractById(offer.contractId) : undefined;
  const drafting = game.phase === "ENGINEERING" && game.engineeringStep === "DESTINATION_DRAFT";

  return (
    <Printed zone="office" title="Contract office" className="w-full" style={{ width: TABLE.side }}>
      {contract && offer ? (
        <div>
          <p className="text-[19px] font-bold uppercase tracking-wide text-stone-500">
            On offer{offer.fromYard ? " · Discount Yard" : ""}
          </p>
          <button
            type="button"
            onClick={() => onOpenContract(contract.id, offer.price)}
            className="mt-[10px] w-full rounded-[18px] border-[5px] bg-[#fffaf0] p-[18px] text-left shadow-lg transition hover:-translate-y-[4px] focus-visible:outline-none focus-visible:ring-[6px] focus-visible:ring-amber-400"
            style={{ borderColor: contract.color }}
          >
            <span className="flex items-center gap-[14px]">
              <LineTile contract={contract} size={46} />
              <b className="text-[26px]">{contract.name}</b>
              <b className="ml-auto text-[26px]">{money(offer.price)}</b>
            </span>
            <span className="mt-[10px] flex flex-wrap gap-[8px]">
              {contract.recipe.map((n, i) => (
                <span
                  key={i}
                  className="inline-flex h-[38px] min-w-[38px] items-center justify-center rounded-[8px] bg-stone-900/10 text-[21px] font-black tabular-nums"
                >
                  {n}
                </span>
              ))}
            </span>
          </button>
        </div>
      ) : (
        <p className="text-[20px] italic text-stone-500">
          {game.phase === "PROCUREMENT" ? "Shuffling the contract deck…" : "Every contract has an owner."}
        </p>
      )}

      {game.procurement.yard.length > 0 && (
        <div className="mt-[20px]">
          <p className="text-[19px] font-bold uppercase tracking-wide text-stone-500">Discount Yard</p>
          <ul className="mt-[8px] space-y-[6px] text-[19px]">
            {game.procurement.yard.map((entry, i) => {
              const c = contractById(entry.contractId)!;
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onOpenContract(c.id, entry.price)}
                    className="flex w-full items-center gap-[10px] rounded-[10px] px-[8px] py-[4px] text-left hover:bg-stone-900/5 focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-amber-400"
                  >
                    <LineTile contract={c} size={32} />
                    <span>{c.name}</span>
                    <span className="ml-auto">
                      <span className="mr-[8px] text-stone-400 line-through">{money(c.cost)}</span>
                      <b>{money(entry.price)}</b>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* The three face-up market cards a passing company may draft. */}
      {game.phase === "PROCUREMENT" && (
        <div className="mt-[20px] space-y-[10px]">
          <p className="text-[19px] font-bold uppercase tracking-wide text-stone-500">Face-up market</p>
          {(
            [
              { id: "engineering" as CardDeckId, name: marketEngineering(game.market).name, tone: "bg-amber-700" },
              { id: "scheduling" as CardDeckId, name: marketScheduling(game.market).name, tone: "bg-sky-800" },
              { id: "construction" as CardDeckId, name: marketConstruction(game.market).name, tone: "bg-orange-800" },
            ] as const
          ).map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onOpenMarket(card.id)}
              className="flex w-full items-center gap-[14px] rounded-[14px] border-[3px] border-stone-400 bg-[#fffaf0] px-[14px] py-[10px] text-left transition hover:-translate-y-[3px] focus-visible:outline-none focus-visible:ring-[5px] focus-visible:ring-amber-400"
            >
              <span className={`h-[54px] w-[38px] rounded-[8px] ${card.tone}`} />
              <span className="text-[20px] font-bold">{card.name}</span>
              <span className="ml-auto text-[17px] uppercase tracking-wide text-stone-500">{card.id}</span>
            </button>
          ))}
        </div>
      )}

      {/* The Destination row is public: three faces anyone may read. */}
      {drafting && (
        <div className="mt-[20px]">
          <p className="text-[19px] font-bold uppercase tracking-wide text-stone-500">Destination row</p>
          <div className="mt-[10px] flex flex-wrap gap-[16px]">
            {game.destinationRow.map((id) => (
              <CardPiece key={id} label={`Destination ${destinationById(id)?.name ?? id}`} onOpen={() => onOpenDestination(id)}>
                <DestinationCardFace card={id} color={me?.color ?? "#334155"} compact />
              </CardPiece>
            ))}
            {!game.destinationRow.length && <p className="text-[19px] italic text-stone-400">The row is empty.</p>}
          </div>
        </div>
      )}

      <div className="mt-[20px] flex flex-wrap items-center gap-[24px] border-t-[3px] border-[#6b4b2c]/20 pt-[16px]">
        <DeckStack label="Engineering" tone="bg-amber-700" />
        <DeckStack label="Scheduling" tone="bg-sky-800" />
        <DeckStack label="Construction" tone="bg-orange-800" />
      </div>

      {!veiled && children}
    </Printed>
  );
}

// ---------------------------------------------------------------------------
// Site logbook — the bounded public record, printed on the table.
// ---------------------------------------------------------------------------

export function Logbook({ game, actorId }: { game: SubwayState; actorId?: string }) {
  const events = [...(game.events ?? [])].reverse();
  const actorName = actorId ? game.players[actorId]?.name : undefined;
  return (
    <Printed
      zone="log"
      title="Site logbook"
      className="w-full"
      style={{ width: TABLE.side }}
      subtitle={
        actorName ? (
          <span className="flex items-center gap-[10px]">
            <span
              className="h-[16px] w-[16px] animate-pulse rounded-full"
              style={{ background: game.players[actorId!]?.color }}
            />
            {actorName} to act
          </span>
        ) : undefined
      }
    >
      <ol className="space-y-[8px] text-[19px]">
        {events.map((e) => (
          <li
            key={e.seq}
            className={`flex items-start gap-[12px] rounded-[10px] px-[10px] py-[7px] ${
              e.emphasis === "banner" ? "bg-stone-900/10 font-bold" : "text-stone-700"
            }`}
          >
            <span
              className="mt-[8px] h-[12px] w-[12px] shrink-0 rounded-full"
              style={{ background: e.actorId ? game.players[e.actorId]?.color ?? "#a8a29e" : "#a8a29e" }}
            />
            <span>{e.text}</span>
          </li>
        ))}
        {!events.length && <li className="italic text-stone-400">Nothing public has happened yet.</li>}
      </ol>
      <p className="mt-[14px] text-[16px] text-stone-500">
        The latest {SUBWAY_EVENT_LIMIT} accepted public actions. Private cards, assignments, and saved
        plans never appear here.
      </p>
    </Printed>
  );
}

// ---------------------------------------------------------------------------
// Line contract boards — one printed board per owned line.
// ---------------------------------------------------------------------------

export function LineContractBoard({
  line,
  lineIndex,
  owner,
  game,
  active,
  planChip,
  planAvailable,
  onOpenPlanner,
  onSelectLine,
  selectable,
  onOpenCard,
  veiled,
}: {
  line: PlayerLine;
  lineIndex: number;
  owner: SubwayPlayer;
  game: SubwayState;
  active: boolean;
  planChip?: { saved: boolean; stale: boolean };
  planAvailable: boolean;
  onOpenPlanner: (lineIndex: number) => void;
  onSelectLine?: (lineIndex: number) => void;
  selectable: boolean;
  onOpenCard: (id: string, lineIndex: number) => void;
  veiled: boolean;
}) {
  const contract = contractOf(line);
  if (!contract) return null;
  const built = segmentsBuilt(line);
  const next = nextSegmentLength(line);
  const complete = lineComplete(line);
  const shelved = line.start === undefined;
  const nodes = contractNodes(contract);
  const assigned = veiled
    ? []
    : owner.destinationCommitments
        .map((c, i) => ({ ...c, key: `${c.cardId}-${i}` }))
        .filter((c) => c.lineIndex === lineIndex);
  const pendingActions = game.phase === "CONSTRUCTION" ? owner.pendingActions.filter((i) => i === lineIndex).length : 0;

  return (
    <section
      className="rounded-[26px] border-[6px] bg-[#fffaf0] p-[22px] shadow-[0_16px_34px_rgba(0,0,0,.4)]"
      style={{
        width: 940,
        borderColor: contract.color,
        outline: active ? "6px solid #f59e0b" : undefined,
        outlineOffset: active ? 6 : undefined,
      }}
    >
      <div className="flex flex-wrap items-center gap-[14px]">
        <LineTile contract={contract} size={54} subdued={shelved} />
        <b className="text-[30px]">{contract.name}</b>
        {complete ? (
          <Pill tone="good">✓ Complete</Pill>
        ) : shelved ? (
          <Pill tone="bad">Shelved</Pill>
        ) : (
          <Pill tone="solid" color={contract.color}>
            Periods {line.start}–{line.start! + contractActions(contract) - 1}
          </Pill>
        )}
        {pendingActions > 0 && <Pill tone="warn">{pendingActions} action{pendingActions === 1 ? "" : "s"} due</Pill>}
        <span className="ml-auto text-[28px] font-black tabular-nums">
          {line.route.length}/{nodes} <span className="text-[19px] font-bold text-stone-500">nodes</span>
        </span>
      </div>

      {/* The recipe, big enough to read as the line's shape. */}
      <div className="mt-[18px]">
        <p className="text-[17px] font-black uppercase tracking-[.14em] text-stone-500">Ordered recipe (pegs per segment)</p>
        <div className="mt-[10px] flex flex-wrap items-center gap-[10px]">
          {contract.recipe.map((length, i) => {
            const done = i < built;
            const current = i === built && !complete;
            return (
              <span key={i} className="flex items-center gap-[10px]">
                {i > 0 && <span className="text-[26px] font-black text-stone-400">—</span>}
                <span
                  className={`relative inline-flex h-[62px] min-w-[62px] items-center justify-center rounded-[12px] border-[4px] text-[30px] font-black tabular-nums ${
                    done ? "text-white" : current ? "bg-white" : "border-stone-300 bg-stone-100 text-stone-400"
                  }`}
                  style={
                    done
                      ? { background: contract.color, borderColor: contract.color }
                      : current
                        ? { borderColor: contract.color, color: contract.color, boxShadow: `0 0 0 5px ${contract.color}33` }
                        : undefined
                  }
                  title={`Segment ${i + 1}: ${length} pegs${done ? " — built" : current ? " — next" : ""}`}
                >
                  {done ? <s className="opacity-90">{length}</s> : length}
                  {current && (
                    <span
                      className="absolute -bottom-[24px] text-[15px] font-black uppercase tracking-widest"
                      style={{ color: contract.color }}
                    >
                      Next
                    </span>
                  )}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-[34px] grid grid-cols-4 gap-x-[20px] gap-y-[8px] text-[19px] text-stone-700">
        <span className="text-stone-500">Segments built</span>
        <b>
          {built}/{contract.recipe.length}
        </b>
        <span className="text-stone-500">Nodes remaining</span>
        <b>{Math.max(0, nodes - line.route.length)}</b>
        <span className="text-stone-500">Next segment</span>
        <b>{next === undefined ? "—" : `${next} pegs`}</b>
        <span className="text-stone-500">Paid</span>
        <b>
          {money(line.paid)}
          {line.paid < contract.cost && " (yard)"}
        </b>
        <span className="text-stone-500">Complete</span>
        <b>+{contract.completionVp} VP</b>
        <span className="text-stone-500">Incomplete</span>
        <b>{contract.incompletePenalty} VP</b>
      </div>
      {contract.special && (
        <p className="mt-[10px] text-[18px] font-bold text-amber-800">{contract.special}</p>
      )}

      {/* Destination cards assigned to this line sit attached to its board. */}
      {assigned.length > 0 && (
        <div className="mt-[18px] border-t-[3px] border-stone-200 pt-[14px]">
          <p className="text-[17px] font-black uppercase tracking-[.14em] text-stone-500">
            Assigned Destinations — hidden from the opposition
          </p>
          <div className="mt-[12px] flex flex-wrap gap-[16px]">
            {assigned.map((commitment) => {
              const met = destinationMet(owner, commitment);
              return (
                <CardPiece
                  key={commitment.key}
                  label={`Destination ${destinationById(commitment.cardId)?.name ?? commitment.cardId}`}
                  ring={met ? "#059669" : undefined}
                  onOpen={() => onOpenCard(commitment.cardId, lineIndex)}
                >
                  <DestinationCardFace
                    card={commitment.cardId}
                    color={owner.color}
                    compact
                    state={met ? "met" : "committed"}
                    footer={
                      <p className={`mt-1 text-[11px] font-black ${met ? "text-emerald-700" : "text-stone-400"}`}>
                        {met ? "✓ COMPLETE" : "In progress"}
                      </p>
                    }
                  />
                </CardPiece>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-[18px] flex flex-wrap items-center gap-[12px] border-t-[3px] border-stone-200 pt-[14px]">
        {planChip?.saved ? (
          <Pill tone={planChip.stale ? "bad" : "neutral"}>{planChip.stale ? "Plan stale" : "Plan saved"}</Pill>
        ) : (
          <span className="text-[18px] text-stone-400">No saved plan</span>
        )}
        {planAvailable && (
          <TableButton size="sm" tone="plan" onClick={() => onOpenPlanner(lineIndex)}>
            {planChip?.saved ? "Edit plan" : "Plan route"}
          </TableButton>
        )}
        {selectable && onSelectLine && (
          <TableButton
            size="sm"
            tone={active ? "go" : "plain"}
            onClick={() => onSelectLine(lineIndex)}
            data-build-line={lineIndex}
          >
            {active ? "Building this line" : "Build this line"}
          </TableButton>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Survey pin supply — physical tokens on the player's edge.
// ---------------------------------------------------------------------------

function PinSupply({ game, me }: { game: SubwayState; me: SubwayPlayer }) {
  const placed = game.surveyPins.filter((p) => p.playerId === me.id);
  const left = Math.max(0, me.surveysPurchased - placed.length);
  return (
    <div className="flex items-center gap-[14px]">
      <div className="flex items-center gap-[6px]">
        {Array.from({ length: Math.max(me.surveysPurchased, 1) }, (_, i) => {
          const used = i < placed.length;
          const pin = placed[i];
          const done = used && pin ? surveyFulfilled(me, pin) : false;
          return (
            <span
              key={i}
              className="inline-flex h-[34px] w-[34px] rotate-45 items-center justify-center rounded-[6px] border-[3px] text-[15px] font-black"
              style={{
                borderColor: me.color,
                background: me.surveysPurchased === 0 ? "transparent" : done ? me.color : used ? "#ffffff" : "#fde68a",
                color: done ? "#fff" : me.color,
                opacity: me.surveysPurchased === 0 ? 0.3 : 1,
              }}
              title={
                me.surveysPurchased === 0
                  ? "No Survey Pins bought"
                  : used
                    ? `Placed at ${pin.x + 1},${pin.y + 1}${done ? " — fulfilled" : ""}`
                    : "In supply"
              }
            >
              <span className="-rotate-45">{done ? "✓" : used ? "·" : ""}</span>
            </span>
          );
        })}
      </div>
      <div className="leading-tight">
        <p className="text-[20px] font-black text-stone-800">
          {left} <span className="text-[16px] font-bold text-stone-500">to place</span>
        </p>
        <p className="text-[16px] uppercase tracking-wide text-stone-500">Survey pins</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The player's own edge of the table.
// ---------------------------------------------------------------------------

export type PlanChip = { saved: boolean; stale: boolean };

export function PlayerTabletop({
  game,
  me,
  veiled,
  activeLineIndex,
  planChips,
  planAvailable,
  onOpenPlanner,
  onSelectLine,
  selectableLines,
  onOpenCard,
  children,
}: {
  game: SubwayState;
  me: SubwayPlayer;
  veiled: boolean;
  activeLineIndex: number;
  planChips: Record<string, PlanChip>;
  planAvailable: boolean;
  onOpenPlanner: (lineIndex: number) => void;
  onSelectLine: (lineIndex: number) => void;
  selectableLines: boolean;
  onOpenCard: (ref: FocusRef) => void;
  /** Phase controls that belong on the player's own edge. */
  children?: ReactNode;
}) {
  const status = veiled ? [] : committedStatus(game, me.id);
  const planningStep = game.phase === "ENGINEERING" && game.engineeringStep === "PLAN";
  const unassignedDestinations = veiled ? [] : me.destinationHand;

  return (
    <div className="w-full">
      {/* Company plaque */}
      <div
        className="flex flex-wrap items-center gap-x-[36px] gap-y-[16px] rounded-[26px] border-[6px] p-[22px] shadow-[0_16px_34px_rgba(0,0,0,.4)]"
        style={{ borderColor: me.color, background: "#f7efdb" }}
      >
        <span className="flex items-center gap-[16px]">
          <span className="h-[42px] w-[42px] rounded-full shadow-inner" style={{ background: me.color }} />
          <b className="text-[36px] font-black">{me.name}</b>
          <Pill tone="solid" color={me.color}>
            Your company
          </Pill>
        </span>
        <span className={`text-[40px] font-black tabular-nums ${me.money < 0 ? "text-red-700" : "text-stone-800"}`}>
          {me.money < 0 ? `−${money(-me.money)}` : money(me.money)}
        </span>
        <span className="text-[20px] text-stone-600">
          Builds first in <b>{me.id === game.oddPriorityId ? "odd" : "even"}</b> periods
          {me.tollsPaid > 0 && <> · paid {money(me.tollsPaid)} in contacts</>}
        </span>
        {!veiled && <PinSupply game={game} me={me} />}
        {me.money < 0 && (
          <p className="w-full rounded-[12px] bg-red-100 px-[16px] py-[10px] text-[19px] font-bold text-red-900">
            In debt {money(-me.money)} from route contacts. Finishing here costs{" "}
            {me.money * SUBWAY_CONFIG.contact.debtVpPerMillion} VP; contacts the opposition pays you reduce it.
          </p>
        )}
      </div>

      {/* Line contract boards */}
      <div data-zone="lines" className="mt-[26px]">
        <p className="mb-[14px] text-[22px] font-black uppercase tracking-[.16em] text-[#f0e2c0]">
          Your line contracts
        </p>
        <div className="flex flex-wrap gap-[26px]">
          {me.lines.map((line, i) => (
            <LineContractBoard
              key={i}
              line={line}
              lineIndex={i}
              owner={me}
              game={game}
              active={i === activeLineIndex}
              planChip={planChips[line.contractId]}
              planAvailable={planAvailable}
              onOpenPlanner={onOpenPlanner}
              onSelectLine={onSelectLine}
              selectable={selectableLines}
              onOpenCard={(id, lineIndex) =>
                onOpenCard({ family: "destination", id, slot: "committed", lineIndex })
              }
              veiled={veiled}
            />
          ))}
          {!me.lines.length && (
            <p className="rounded-[18px] bg-black/20 px-[22px] py-[16px] text-[22px] text-[#f0e2c0]">
              No Line Contract yet — buy one at the contract office.
            </p>
          )}
        </div>
      </div>

      {/* Hands and company objectives */}
      <div data-zone="hand" className="mt-[26px] flex flex-wrap items-start gap-[26px]">
        {!veiled && (status.length > 0 || me.engineeringHand.length > 0) && !planningStep && (
          <Printed
            title="Company objectives"
            subtitle="Committed face down — hidden from the opposition"
            tone="slip"
            style={{ maxWidth: 1520 }}
          >
            <p className="mb-[12px] text-[18px] text-stone-600">
              Engineering objectives are committed by the company, not by line, so they sit on the
              company shelf rather than on a line board.
            </p>
            <div className="flex flex-wrap gap-[18px]">
              {status.map(({ cardId, met }, i) => (
                <CardPiece
                  key={`c-${cardId}-${i}`}
                  label={`Committed objective ${cardId}`}
                  ring={met ? "#059669" : undefined}
                  onOpen={() => onOpenCard({ family: "engineering", id: cardId, slot: "committed" })}
                >
                  <EngineeringCardFace
                    card={cardId}
                    color={me.color}
                    compact
                    state={met ? "met" : "committed"}
                    footer={
                      <p className={`mt-1 text-[11px] font-black ${met ? "text-emerald-700" : "text-stone-400"}`}>
                        {met ? "✓ COMPLETE" : "In progress"}
                      </p>
                    }
                  />
                </CardPiece>
              ))}
              {me.engineeringHand.map((id, i) => (
                <CardPiece
                  key={`h-${id}-${i}`}
                  label={`Engineering card ${id} in hand`}
                  dimmed
                  onOpen={() => onOpenCard({ family: "engineering", id, slot: "hand" })}
                >
                  <EngineeringCardFace
                    card={id}
                    color={me.color}
                    compact
                    footer={<p className="mt-1 text-[11px] font-black text-stone-400">In hand — not scoring</p>}
                  />
                </CardPiece>
              ))}
            </div>
          </Printed>
        )}

        {!veiled && unassignedDestinations.length > 0 && !planningStep && (
          <Printed title="Destinations in hand" tone="slip">
            <div className="flex flex-wrap gap-[18px]">
              {unassignedDestinations.map((id, i) => (
                <CardPiece
                  key={`${id}-${i}`}
                  label={`Destination ${id} in hand`}
                  dimmed
                  onOpen={() => onOpenCard({ family: "destination", id, slot: "hand" })}
                >
                  <DestinationCardFace
                    card={id}
                    color={me.color}
                    compact
                    footer={<p className="mt-1 text-[11px] font-black text-stone-400">Unassigned</p>}
                  />
                </CardPiece>
              ))}
            </div>
          </Printed>
        )}

        {!veiled && (me.schedulingHand.length > 0 || me.constructionHand.length > 0) && (
          <Printed title="Action cards" tone="slip">
            <div className="flex flex-wrap gap-[18px]">
              {me.schedulingHand.map((id, i) => (
                <button
                  key={`s-${id}-${i}`}
                  type="button"
                  onClick={() => onOpenCard({ family: "scheduling", id, slot: "hand" })}
                  className="w-[300px] rounded-[18px] border-[4px] border-sky-700 bg-[#fffaf0] p-[16px] text-left shadow-[0_12px_24px_rgba(0,0,0,.3)] transition hover:-translate-y-[5px] focus-visible:outline-none focus-visible:ring-[6px] focus-visible:ring-amber-400"
                >
                  <span className="flex items-start justify-between gap-[10px]">
                    <b className="text-[22px] leading-tight">{schedulingById(id)?.name}</b>
                    <Pill tone="solid" color="#075985">
                      Sched
                    </Pill>
                  </span>
                  <p className="mt-[10px] text-[17px] leading-snug text-stone-600">
                    {schedulingById(id)?.description}
                  </p>
                </button>
              ))}
              {me.constructionHand.map((id, i) => (
                <button
                  key={`x-${id}-${i}`}
                  type="button"
                  onClick={() => onOpenCard({ family: "construction", id, slot: "hand" })}
                  className="w-[300px] rounded-[18px] border-[4px] border-amber-700 bg-[#fffaf0] p-[16px] text-left shadow-[0_12px_24px_rgba(0,0,0,.3)] transition hover:-translate-y-[5px] focus-visible:outline-none focus-visible:ring-[6px] focus-visible:ring-amber-400"
                >
                  <span className="flex items-start justify-between gap-[10px]">
                    <b className="text-[22px] leading-tight">{constructionById(id)?.name}</b>
                    <Pill tone="solid" color="#b45309">
                      Constr
                    </Pill>
                  </span>
                  <p className="mt-[10px] text-[17px] leading-snug text-stone-600">
                    {constructionById(id)?.description}
                  </p>
                </button>
              ))}
            </div>
            {me.schedulingCardPlayed && (
              <p className="mt-[12px] text-[18px] text-stone-600">
                Played publicly: <b>{schedulingById(me.schedulingCardPlayed)?.name}</b>
              </p>
            )}
          </Printed>
        )}

        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focused card — the readable state, with its legal action attached.
// ---------------------------------------------------------------------------

export type FocusRef =
  | { family: "engineering"; id: string; slot: "hand" | "committed" }
  | { family: "destination"; id: string; slot: "hand" | "committed" | "row"; lineIndex?: number }
  | { family: "scheduling"; id: SchedulingCardId; slot: "hand" }
  | { family: "construction"; id: ConstructionCardId; slot: "hand" }
  | { family: "contract"; id: string; price?: number }
  | { family: "market"; id: CardDeckId };

export type FocusAction = {
  label: string;
  tone?: "go" | "warn" | "plain" | "plan";
  disabled?: boolean;
  reason?: string;
  run: () => void;
};

export function CardFocus({
  title,
  face,
  note,
  reason,
  extra,
  actions,
  onClose,
}: {
  title: string;
  face: ReactNode;
  note?: ReactNode;
  reason?: string;
  extra?: ReactNode;
  actions: FocusAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/70 p-[16px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-3xl border-4 border-[#6b4b2c] bg-[#f2e6cb] p-4 shadow-2xl outline-none"
        style={{ maxHeight: "92vh", overflowY: "auto" }}
      >
        <div data-focus-card className="rounded-2xl bg-[#fffaf0] p-2 shadow-inner">{face}</div>
        {note && <div className="mt-3 text-sm font-semibold text-stone-700">{note}</div>}
        {reason && (
          <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">{reason}</p>
        )}
        {extra && <div className="mt-3">{extra}</div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              disabled={a.disabled}
              title={a.reason}
              onClick={a.run}
              className={`rounded-xl px-4 py-2.5 text-sm font-black text-white shadow disabled:opacity-40 ${
                a.tone === "warn"
                  ? "bg-amber-600"
                  : a.tone === "plan"
                    ? "bg-purple-700"
                    : a.tone === "plain"
                      ? "bg-stone-700"
                      : "bg-emerald-700"
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-xl border-2 border-stone-500 px-4 py-2.5 text-sm font-black text-stone-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A card visibly travelling between zones. Purely decorative: the action has
 * already been dispatched, and reduced-motion callers skip it entirely.
 */
export function CardFlight({
  from,
  to,
  label,
  color,
}: {
  from: DOMRect;
  to: { x: number; y: number };
  label: string;
  color: string;
}) {
  const [at, setAt] = useState({ x: from.left, y: from.top });
  useEffect(() => {
    const id = requestAnimationFrame(() => setAt({ x: to.x, y: to.y }));
    return () => cancelAnimationFrame(id);
  }, [to.x, to.y]);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 flex items-center justify-center rounded-xl border-4 text-center text-xs font-black text-stone-800 shadow-2xl"
      style={{
        left: 0,
        top: 0,
        width: Math.max(90, from.width),
        height: Math.max(120, from.height),
        borderColor: color,
        background: "#fffaf0",
        transform: `translate3d(${at.x}px, ${at.y}px, 0) rotate(${at.x === from.left ? 0 : -8}deg)`,
        transition: "transform 420ms cubic-bezier(.22,.8,.25,1), opacity 420ms ease-out",
        opacity: at.x === from.left ? 1 : 0.15,
      }}
    >
      {label}
    </div>
  );
}

export function stationName(id: string): string {
  return stationById(id)?.name ?? id;
}
