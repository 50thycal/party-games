"use client";
import { SUBWAY_CONFIG, cashScore, cashBand, type SubwayState } from "./config";

// ============================================================================
// Ending-cash spectrum for the shared table.
//
// Every company's balance scores on the same scale, so the bar is one public
// ladder from the worst band to the best with a token per company sitting in
// its current band. Cash is public already; only the ordering is new.
// ============================================================================

/** Worst band first so the bar reads left (deep debt) to right (cash in hand). */
const BANDS = [...SUBWAY_CONFIG.cashBands].reverse();

const tone = (vp: number) =>
  vp >= 2 ? { fill: "#bbf7d0", edge: "#15803d", ink: "#14532d" }
  : vp === 1 ? { fill: "#dcfce7", edge: "#4ade80", ink: "#166534" }
  : vp === 0 ? { fill: "#e7e5e4", edge: "#a8a29e", ink: "#44403c" }
  : vp === -1 ? { fill: "#fef08a", edge: "#ca8a04", ink: "#713f12" }
  : vp === -3 ? { fill: "#fed7aa", edge: "#ea580c", ink: "#7c2d12" }
  : { fill: "#fecaca", edge: "#b91c1c", ink: "#7f1d1d" };

const cash = (money: number) => (money < 0 ? `−$${-money}M` : `$${money}M`);

export function CashSpectrum({ game, viewerId, compact = false }: { game: SubwayState; viewerId?: string; compact?: boolean }) {
  const companies = game.playerOrder.map(id => game.players[id]).filter(Boolean);
  return (
    <section aria-label="Ending cash spectrum" data-cash-spectrum className="w-full">
      <div className={`flex items-baseline justify-between gap-2 ${compact ? "text-sm" : "text-xl"}`}>
        <b>Ending cash scores VP</b>
        <span className={compact ? "text-xs" : "text-base"}>Scored once, on the balance each company finishes with.</span>
      </div>
      <div className={`mt-2 grid gap-1 ${compact ? "text-[11px]" : "text-base"}`} style={{ gridTemplateColumns: `repeat(${BANDS.length}, minmax(0,1fr))` }}>
        {BANDS.map(band => {
          const here = companies.filter(p => cashBand(p.money) === band);
          const color = tone(band.vp);
          return (
            <div
              key={band.label}
              data-cash-band={band.label}
              aria-label={`${band.label}: ${band.min===-Infinity?"−2 VP per $1M owed":`${band.vp > 0 ? "+" : ""}${band.vp} VP`}${here.length ? `. ${here.map(p => `${p.name} at ${cash(p.money)}`).join(", ")}` : ""}`}
              className="flex min-h-[74px] flex-col rounded-lg border-2 px-1.5 py-1"
              style={{ background: color.fill, borderColor: color.edge, color: color.ink }}
            >
              <b className={compact ? "text-sm" : "text-2xl"}>{band.min===-Infinity?"−2 / $1M":band.vp > 0 ? `+${band.vp}` : band.vp}<span className={compact ? "ml-0.5 text-[10px]" : "ml-1 text-sm"}>VP</span></b>
              <span className="leading-tight">{band.label}</span>
              <div className="mt-auto flex flex-wrap gap-1 pt-1">
                {here.map(p => (
                  <span
                    key={p.id}
                    data-cash-token={p.id}
                    title={`${p.name}: ${cash(p.money)}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 font-black ${compact ? "text-[10px]" : "text-sm"} ${p.id === viewerId ? "border-stone-900" : "border-white/70"}`}
                    style={{ background: p.color, color: "#fff" }}
                  >
                    <span className="max-w-[7ch] truncate">{p.name}</span>
                    {cash(p.money)} · {cashScore(p.money)>0?"+":""}{cashScore(p.money)} VP
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
