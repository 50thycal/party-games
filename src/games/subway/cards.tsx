"use client";

import {
  contractActions,
  contractNodes,
  type LineContract,
  type SubwayPlayer,
} from "./config";

// ============================================================================
// Shared card and contract primitives for the Subway tabletop (WS-004).
//
// These are presentation only. Everything they show is derived from props the
// caller already holds; nothing here decides legality or reveals state the
// caller did not choose to pass in.
// ============================================================================

export const money = (n: number) => `$${n}M`;

/** The line's badge: color plus its letter code, so color is never the only cue. */
export function LineChip({ contract, subdued }: { contract: LineContract; subdued?: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-black text-white ${
        subdued ? "opacity-50" : ""
      }`}
      style={{ background: contract.color }}
      title={contract.name}
    >
      {contract.code}
    </span>
  );
}

/**
 * The ordered recipe as chips: what is built, what is being built now, and
 * what is still to come. This is the player's copy of the contract's shape.
 */
export function RecipeStrip({
  contract,
  built,
  highlightCurrent = true,
}: {
  contract: LineContract;
  built: number;
  highlightCurrent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {contract.recipe.map((length, i) => {
        const done = i < built;
        const current = highlightCurrent && i === built;
        return (
          <span
            key={i}
            className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[11px] font-black tabular-nums ${
              done
                ? "text-white"
                : current
                  ? "ring-2 ring-offset-1"
                  : "bg-stone-200 text-stone-500"
            }`}
            style={
              done
                ? { background: contract.color }
                : current
                  ? { color: contract.color, background: "#fff" }
                  : undefined
            }
            title={
              done ? `Segment ${i + 1}: ${length} pegs — built` : `Segment ${i + 1}: ${length} pegs`
            }
          >
            {done ? "✓" : length}
          </span>
        );
      })}
    </div>
  );
}

export function ContractCard({
  contract,
  /** Price actually being asked, when it differs from the list price. */
  price,
  progress,
  status,
  owner,
  children,
}: {
  contract: LineContract;
  price?: number;
  progress?: { built: number; total: number };
  status?: string;
  owner?: SubwayPlayer;
  children?: React.ReactNode;
}) {
  const discounted = price !== undefined && price < contract.cost;
  return (
    <div
      className="w-full rounded-xl border-2 bg-[#fffaf0] p-3 text-left text-stone-900 shadow-sm"
      style={{ borderColor: contract.color }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <strong className="flex items-center gap-1.5 text-sm">
          <LineChip contract={contract} />
          {contract.name}
        </strong>
        {status ? (
          <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-100">
            {status}
          </span>
        ) : progress ? (
          <span className="text-sm font-black">
            {progress.built}/{progress.total}
          </span>
        ) : (
          <span className="text-sm font-black">
            {discounted && <span className="mr-1 font-normal text-stone-400 line-through">{money(contract.cost)}</span>}
            {money(price ?? contract.cost)}
          </span>
        )}
      </div>
      {owner && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-stone-500">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: owner.color }} />
          {owner.name}
        </p>
      )}
      <div className="mt-1.5">
        <RecipeStrip
          contract={contract}
          built={progress ? Math.max(0, progress.built - 1) : 0}
          highlightCurrent={!!progress && progress.built > 0}
        />
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-stone-400">
          ordered segment lengths (pegs)
        </p>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-stone-600">
        <span>{contractNodes(contract)} nodes</span>
        <span>{contractActions(contract)} build periods</span>
        <span>Complete +{contract.completionVp} VP</span>
        <span>Major +{contract.stationBonus} VP</span>
        <span className="col-span-2">Incomplete {contract.incompletePenalty} VP</span>
      </div>
      {contract.special && <p className="mt-1 text-[11px] font-semibold text-amber-800">{contract.special}</p>}
      {progress && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full"
            style={{ width: `${(progress.built / progress.total) * 100}%`, background: contract.color }}
          />
        </div>
      )}
      {children}
    </div>
  );
}

// ============================================================================
// Consistent face template for the card families without dedicated artwork
// (Scheduling and Construction).
// ============================================================================

const FAMILY_CHROME: Record<string, { tag: string; border: string; accent: string }> = {
  scheduling: { tag: "Scheduling", border: "border-sky-700", accent: "bg-sky-800 text-sky-50" },
  construction: { tag: "Construction", border: "border-amber-700", accent: "bg-amber-700 text-amber-50" },
};

export function MiniCardFace({
  family,
  name,
  description,
  note,
  onClick,
  compact,
}: {
  family: "scheduling" | "construction";
  name: string;
  description: string;
  /** Current-state line, e.g. "Played" or "In hand". */
  note?: string;
  onClick?: () => void;
  compact?: boolean;
}) {
  const chrome = FAMILY_CHROME[family];
  const body = (
    <>
      <div className="flex items-start justify-between gap-1">
        <strong className="text-[13px] leading-tight text-stone-900">{name}</strong>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${chrome.accent}`}>
          {chrome.tag}
        </span>
      </div>
      {!compact && <p className="mt-1.5 text-[11px] leading-snug text-stone-600">{description}</p>}
      {note && <p className="mt-1 text-[11px] font-black text-stone-500">{note}</p>}
    </>
  );
  const shell = `w-full rounded-xl border-2 bg-[#fffaf0] p-2.5 text-left shadow-sm ${chrome.border}`;
  if (!onClick) return <div className={shell}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`${shell} transition hover:-translate-y-0.5`}>
      {body}
    </button>
  );
}
