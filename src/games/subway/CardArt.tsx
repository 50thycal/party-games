"use client";
import { ENGINEERING_RULES } from "./engineering";
import { EngineeringArt, ENGINEERING_DIAGRAMS } from "./EngineeringArt";
export { EngineeringArt } from "./EngineeringArt";

import {
  ENGINEERING_CARDS,
  destinationById,
  destinationReward,
  engineeringById,
  stationById,
  type DestinationCard,
  type EngineeringCard,
} from "./config";

// ============================================================================
// Legacy illustration atlas remains unchanged for Destination cards.
// ============================================================================

/** Row-major mapping of the 24-panel vintage transit illustration atlas. */
export const ENGINEERING_ART_IDS = [
  "gentle", "bend", "straight", "approach", "through", "network",
  "parallel", "terminal", "minimal", "crossing", "crosstown-service", "local-service",
  "interchange", "solvent", "dest-market", "dest-grand", "dest-museum", "dest-garden",
  "dest-stadium", "dest-university", "dest-library", "dest-theatre", "dest-airport", "dest-harbor",
] as const;

function EngineeringIllustration({id}:{id:string}) {
  const illustratedId = ({perimeter:"crosstown-service", "three-fronts":"network", "four-corners":"parallel"} as Record<string,string>)[id] ?? id;
  const index = ENGINEERING_ART_IDS.findIndex(value => value === illustratedId);
  if (index < 0) return null;
  return <div aria-hidden="true" data-engineering-art={id} className="w-full rounded-lg" style={{
    aspectRatio:"1", backgroundImage:"url(/subway/engineering-cards.png)",
    backgroundSize:"600% 400%", backgroundPosition:`${(index % 6)*20}% ${Math.floor(index/6)*100/3}%`,
  }} />;
}

// ============================================================================
// Full card face — used everywhere an Engineering card is shown, so players can
// always read the whole card rather than just its name.
// ============================================================================

export type EngineeringCardState = "idle" | "selected" | "committed" | "met" | "missed";

export function EngineeringCardFace({
  card,
  color,
  state = "idle",
  footer,
  onClick,
  disabled,
  compact = false,
}: {
  card: EngineeringCard | string;
  color: string;
  state?: EngineeringCardState;
  footer?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const resolved = typeof card === "string" ? engineeringById(card) : card;
  if (!resolved) return null;
  const diagram = ENGINEERING_DIAGRAMS[resolved.id];

  const chrome: Record<EngineeringCardState, string> = {
    idle: "border-stone-300",
    selected: "border-amber-500 ring-2 ring-amber-300",
    committed: "border-stone-800",
    met: "border-emerald-600 ring-2 ring-emerald-200",
    missed: "border-stone-300 opacity-60",
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <strong className="min-w-0 text-sm leading-tight text-stone-900">{resolved.name}</strong>
        <span
          className={`shrink-0 rounded px-2 py-1 text-sm font-black ${
            "bg-amber-600 text-white"
          }`}
        >
          {resolved.vp} <span className="text-[10px]">VP</span>
        </span>
      </div>
      <p className="mb-2 mt-1 text-[10px] font-black uppercase tracking-wider text-stone-600">{resolved.category}</p>
      <EngineeringArt id={resolved.id}/>
      <p className="mt-2 text-xs font-semibold leading-snug text-stone-800">{diagram?.summary ?? resolved.requirement}</p>
      {diagram && <span className="mt-2 inline-flex items-center gap-1 rounded border border-stone-300 px-1.5 py-1 text-[10px] font-bold text-stone-700" data-engineering-scope={diagram.scope}>
        <span aria-hidden="true">{diagram.scope === "Single Line" ? "①" : diagram.scope === "Connected Network" ? "↔" : diagram.scope === "Company-wide" ? "③" : diagram.scope === "Opponent Contact" ? "⇄" : "◎"}</span>{diagram.scope}
      </span>}
    </>
  );

  const shell = `w-full min-w-0 rounded-xl border-2 bg-[#fffaf0] p-2.5 text-left shadow-sm ${chrome[state]}`;
  // Rules remain usable even when drafting is disabled. Never nest details in a button.
  return <div className={shell} data-engineering-card={resolved.id} data-compact={compact||undefined}>
    {onClick ? <button type="button" onClick={onClick} disabled={disabled} aria-label={`${resolved.name}, ${resolved.vp} VP`}
      className={`block w-full rounded text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700 ${disabled ? "opacity-45" : "hover:bg-amber-50"}`}>{body}</button> : body}
    <details className="mt-2 border-t border-stone-200 text-xs text-stone-700">
      <summary className="min-h-9 cursor-pointer py-2 font-semibold">Rules &amp; symbols</summary>
      <p className="leading-relaxed">{resolved.requirement}</p>
      <dl className="mt-2 space-y-1" data-engineering-tags={resolved.id}>{resolved.tags.map(tag=><div key={tag}><dt className="inline font-bold">{tag}: </dt><dd className="inline">{ENGINEERING_RULES[tag] ?? tag}</dd></div>)}</dl>
      <p className="mt-2">Flag = starter. Square = completed final station. Double ring = either qualifying end, never an unfinished tip.</p>
      <p className="mt-1">Outlined adjacent stations form a transfer station; stations never stack. Gray lines are your supporting lines, not additional qualifying routes.</p>
      <p className="mt-1">S / M / L = small / medium / large neighborhood. Colors and shapes are examples, not requirements.</p>
      <p className="mt-2">Scores once at game end. Live progress may change.</p>
    </details>
    {footer}
  </div>;
}

export const ALL_ENGINEERING = ENGINEERING_CARDS;

// ============================================================================
// Destination missions — two or three named stations in one company network.
// ============================================================================

export type DestinationCardState = "idle" | "selected" | "committed" | "met" | "missed";

export function DestinationCardFace({
  card,
  color,
  state = "idle",
  footer,
  onClick,
  disabled,
  compact,
  paid = false,
}: {
  card: DestinationCard | string;
  color: string;
  state?: DestinationCardState;
  footer?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  paid?: boolean;
}) {
  const resolved = typeof card === "string" ? destinationById(card) : card;
  if (!resolved) return null;
  const stations = resolved.stationIds.map(id => stationById(id)!);

  const chrome: Record<DestinationCardState, string> = {
    idle: "border-purple-300",
    selected: "border-amber-500 ring-2 ring-amber-300",
    committed: "border-purple-800",
    met: "border-emerald-600 ring-2 ring-emerald-200",
    missed: "border-purple-200 opacity-60",
  };

  // Slim face (DGLE playtest): the family label, the neighborhood pictures and
  // their names. Everything else lives behind Rules, so the card stays short.
  const body = (
    <>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-purple-700">Destination</p>
        <span className="shrink-0 rounded bg-purple-700 px-1.5 py-0.5 text-[10px] font-black text-white">
          +{resolved.vp} <span className="text-[8px]">VP</span>
        </span>
      </div>
      <div className="mt-1 flex gap-1" aria-label={`Neighborhoods: ${resolved.name}`}>{stations.map(station => <div key={station.id} className="min-w-0 flex-1 text-center">
        <EngineeringIllustration id={`dest-${station.id}`}/>
        <p className="mt-1 truncate text-[11px] font-bold text-purple-950">{station.name}</p>
      </div>)}</div>
      <p data-destination-reward className="mt-2 text-sm font-bold text-emerald-800">{paid?"Earned":"Complete to earn"} ${destinationReward(resolved.id)}M</p>
    </>
  );

  const shell = `w-full rounded-xl border-2 bg-[#fdf7ff] p-2.5 text-left shadow-sm ${chrome[state]}`;
  // Never nest the Rules disclosure inside a button.
  return <div className={shell} data-destination-card={resolved.id}>
    {onClick ? <button type="button" onClick={onClick} disabled={disabled} aria-label={`${resolved.name}, ${resolved.vp} VP`}
      className={`block w-full rounded text-left transition ${disabled ? "opacity-45" : "hover:bg-purple-50"}`}>{body}</button> : body}
    {!compact && <details className="mt-1.5 border-t border-purple-200 text-[11px] text-stone-700">
      <summary className="min-h-8 cursor-pointer py-1.5 font-semibold">Rules</summary>
      <p className="leading-snug">{resolved.requirement}</p>
      <p className="mt-1 leading-snug">Pays ${destinationReward(resolved.id)}M the first time your network connects every neighborhood. Scores {resolved.vp} VP at game end if still connected.</p>
    </details>}
    {footer}
  </div>;
}
