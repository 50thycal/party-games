"use client";
import { useEffect, useRef, useState } from "react";
import { SUBWAY_CONFIG, cardPurchaseBlocker, type SubwayState } from "./config";

/**
 * One button, one question. Tapping "Buy a card" opens a small chooser for a
 * random Engineering goal or a random Destination mission; each choice explains
 * why it is unavailable. The reducer enforces every rule again.
 */
export function BuyCardButton({game, playerId, busy, act, size = "md"}: {
  game: SubwayState; playerId: string; busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => unknown; size?: "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const me = game.players[playerId];
  const price = SUBWAY_CONFIG.destinationPurchaseCost;
  const engineering = cardPurchaseBlocker(game, playerId, "engineering");
  const destination = cardPurchaseBlocker(game, playerId, "destination");
  const show = !!me && game.phase === "CONSTRUCTION" && game.resolveQueue[0] === playerId && !me.crewsHired && !(me.engineeringPurchased && me.destinationPurchased);
  useEffect(() => { if (!show) setOpen(false); }, [show, game.currentPeriod]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  if (!show) return null;
  const text = size === "lg" ? "text-xl" : "text-sm";
  const choice = (deck: "engineering" | "destination", blocker: string | undefined, label: string, detail: string) =>
    <button type="button" data-buy-choice={deck} disabled={busy || !!blocker} aria-disabled={!!blocker || undefined} title={blocker}
      onClick={() => { setOpen(false); act(deck === "engineering" ? "BUY_ENGINEERING" : "BUY_DESTINATION", {period: game.currentPeriod}); }}
      className={`flex min-h-12 w-full flex-col items-start rounded-lg border-2 px-3 py-2 text-left ${text} ${blocker ? "border-stone-300 bg-stone-100 text-stone-500" : deck === "engineering" ? "border-amber-600 bg-amber-50 text-stone-900 hover:bg-amber-100" : "border-purple-600 bg-purple-50 text-stone-900 hover:bg-purple-100"}`}>
      <b>{label} · ${price}M</b><span className="text-[0.8em]">{blocker ?? detail}</span>
    </button>;
  return <div ref={root} data-buy-card className="relative inline-block">
    <button type="button" aria-haspopup="dialog" aria-expanded={open} disabled={busy} onClick={() => setOpen(v => !v)}
      className={`min-h-12 rounded-xl border-2 border-stone-700 bg-white px-4 py-2 font-bold text-stone-900 disabled:opacity-40 ${text}`}>
      Buy a card · ${price}M
    </button>
    {open && <div role="dialog" aria-label="Buy a card" className="absolute bottom-full left-0 z-30 mb-2 w-72 space-y-2 rounded-xl border-2 border-stone-700 bg-[#fffaf0] p-2 shadow-2xl">
      <p className={`font-bold ${text}`}>Draw one card at random</p>
      {choice("engineering", engineering, "Engineering goal", "A random goal you do not already hold.")}
      {choice("destination", destination, "Destination mission", "A random pair or triple of neighborhoods.")}
      <button type="button" className={`w-full rounded-lg px-3 py-2 ${text} text-stone-600 underline`} onClick={() => setOpen(false)}>Not now</button>
    </div>}
  </div>;
}
