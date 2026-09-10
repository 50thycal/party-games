"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { VB_W, VB_H } from "./board";
import { activationCost, buildableLines, cardDraftBlocker, constructionById, constructionCardBlocker, contractOf, contractById, destinationById, engineeringById, objectiveMet, type SubwayState } from "./config";

/** Phone-sized pieces stay outside the map's zoom coordinate system. */
export function MobileTable({game, playerId, busy, veiled, board, actions, survey, settings, act, selectLine, previewLine, playCard}: {
  game: SubwayState; playerId: string; busy: boolean; veiled: boolean;
  board: ReactNode; actions: ReactNode; survey: ReactNode; settings: ReactNode;
  act: (type: string, payload?: Record<string, unknown>) => unknown;
  selectLine: (index: number) => void; previewLine: (index: number) => void;
  playCard: (id: string) => void;
}) {
  const [tray, setTray] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const viewport = useRef<HTMLDivElement>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const p = game.players[playerId];
  const drafting = game.phase === "PROCUREMENT" || (game.phase === "ENGINEERING" && game.engineeringStep === "CARD_DRAFT");
  const available = p ? buildableLines(game, playerId) : [];
  const hiring = game.phase === "CONSTRUCTION" && !game.priorityQueue.length && game.resolveQueue[0] === playerId && !p?.crewsHired;
  const indexes = selected.filter(i => available.includes(i));
  useEffect(() => { setSelected([]); setTray(false); }, [game.currentPeriod, playerId, game.phase]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setMapWidth(Math.min(el.clientWidth, el.clientHeight * VB_W / VB_H));
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);
  const card = "shrink-0 w-56 rounded-xl border-2 border-amber-800/60 bg-[#fff7e5] p-3 text-left shadow-md";
  const button = "rounded-lg border border-stone-400 bg-[#fff7e5] px-3 py-2 font-bold disabled:opacity-40";
  return <div className="phone-table flex flex-col gap-1 bg-[#193c40] text-stone-900" style={{height:"calc(100dvh - 80px)", minHeight:280,paddingBottom:"env(safe-area-inset-bottom)"}}>
    <style>{`.phone-map svg { width:100%; height:auto; display:block; }.phone-table .phone-survey [data-zone] {width:auto!important}.phone-table .portrait-tip{display:none}@media(orientation:portrait){.phone-table .portrait-tip{display:flex}}`}</style>
    {!rotateDismissed && <div className="portrait-tip items-center justify-between bg-amber-100 px-2 text-xs">Rotate for a larger board<button className={button} onClick={()=>setRotateDismissed(true)}>Continue portrait</button></div>}
    <div className="flex shrink-0 items-center gap-2 px-2 text-xs text-amber-50">
      <b>{p?.name} · ${p?.money}M · Round {game.currentPeriod}/16</b>
      <button className="ml-auto rounded bg-white/15 px-2 py-2" onClick={()=>{setZoom(1);setTray(false);}}>Fit board</button>
      <button aria-label="Magnify board" className="rounded bg-white/15 px-2 py-2" onClick={()=>setZoom(z=>z===1?1.8:1)}>⌕</button>
      {settings}
    </div>
    <div ref={viewport} className="min-h-0 flex-1 overflow-auto rounded-xl bg-[#254b50]" aria-label="Transit map">
      <div className="phone-map mx-auto" style={{width:mapWidth?mapWidth*zoom:"100%"}}>{board}</div>
    </div>
    {!veiled && p && <>
      {game.phase === "CONSTRUCTION" && game.priorityQueue[0] === playerId && <div className="flex shrink-0 gap-2 px-2 text-xs"><button className={button} disabled={busy} onClick={()=>playCard("expedite")}>Play Priority Dispatch</button><button className={button} disabled={busy} onClick={()=>act("PASS_PRIORITY",{period:game.currentPeriod})}>Keep card · pass priority</button></div>}
      {hiring && <div className="flex shrink-0 flex-wrap items-center gap-1 px-2 text-xs">
        {p.lines.map((l,i)=><button key={l.contractId} className={button} disabled={busy||!available.includes(i)} aria-pressed={indexes.includes(i)} style={{background:indexes.includes(i)?"#a7f3d0":undefined}} onClick={()=>setSelected(indexes.includes(i)?indexes.filter(v=>v!==i):[...indexes,i])}>{contractOf(l)?.name}</button>)}
        <button className={button} disabled={busy} onClick={()=>act("HIRE_CREWS",{lineIndexes:indexes,period:game.currentPeriod})}>{indexes.length?`Hire ${indexes.length} · $${activationCost(p,indexes.length)}M`:"No crews · end turn"}</button>
      </div>}
      <div className="flex shrink-0 items-center gap-2 px-2 text-xs text-amber-50">
        <button className="rounded bg-white/15 px-3 py-2" aria-expanded={tray||drafting} onClick={()=>setTray(v=>!v)}>{tray?"Put cards away":"Routes & cards"}</button>
        {p.lines.map((l,i)=><button key={l.contractId} className="rounded border px-2 py-2" style={{borderColor:contractOf(l)?.color}} onClick={()=>selectLine(i)}>{contractOf(l)?.code ?? contractOf(l)?.name} {Math.max(0,l.route.length-1)}/{contractOf(l)?.recipe.length}</button>)}
      </div>
      {(tray||drafting) && <div className="flex max-h-[38dvh] shrink-0 gap-2 overflow-auto px-2 pb-1 text-sm" aria-label="Cards on the table">
        {game.phase === "PROCUREMENT" ? game.procurement.row.map(id=>{const c=contractById(id)!;return <article className={card} key={id} style={{borderColor:c.color}}><b>{c.name}</b><p>{c.recipe.join(" · ")} pegs</p><p>Finish +{c.completionVp} VP</p><button className={button} disabled={busy||game.procurement.offer?.activeId!==playerId||p.money<c.cost} onClick={()=>act("PROCURE",{choice:"buy",contractId:id})}>Sign · ${c.cost}M</button></article>;}) : game.engineeringStep === "CARD_DRAFT" && game.phase === "ENGINEERING" ? (["engineering","construction"] as const).map(deck=><div key={deck} className="flex gap-2">{game.market.rows[deck].map(id=>{const c=deck==="engineering"?(engineeringById(id)??destinationById(id)):constructionById(id as Parameters<typeof constructionById>[0]);return <article className={card} key={id}><small>{deck}</small><p className="font-bold">{c?.name}</p><p>{c?.description}</p><button className={button} disabled={busy||!!cardDraftBlocker(game,playerId,deck,id)} onClick={()=>act("DRAFT_CARD",{deck,cardId:id,expectedPick:game.market.picks})}>Draft</button></article>;})}<button className={card} disabled={busy||!!cardDraftBlocker(game,playerId,deck)||!game.market.decks[deck].length} onClick={()=>act("DRAFT_CARD",{deck,expectedPick:game.market.picks})}>Blind draw<br/>{deck}</button></div>) : <>
          {p.lines.map((l,i)=><article className={card} key={l.contractId} style={{borderColor:contractOf(l)?.color}}><b>{contractOf(l)?.name}</b><p>{contractOf(l)?.recipe.map((n,j)=>j<l.route.length-1?`✓${n}`:n).join(" · ")}</p><button className={button} onClick={()=>previewLine(i)}>Preview remainder</button></article>)}
          {p.engineeringHand.map(id=>{const c=engineeringById(id)??destinationById(id);return <article className={card} key={id}><b>{c?.name}</b><p>{c?.description}</p><p>+{c?.vp} VP · {objectiveMet(id,p,game.playerOrder.filter(id=>id!==playerId).map(id=>game.players[id]))?"Achieved":"In progress"}</p></article>;})}
          {p.constructionHand.map((id,i)=><article className={card} key={`${id}-${i}`}><b>{constructionById(id)?.name}</b><p>{constructionById(id)?.description}</p><button className={button} disabled={busy||!!constructionCardBlocker(game,playerId,id)} onClick={()=>playCard(id)}>Play</button><p className="text-xs">{constructionCardBlocker(game,playerId,id)}</p></article>)}
        </>}
      </div>}
      {game.phase==="ENGINEERING" && game.engineeringStep!=="CARD_DRAFT" && <div className="phone-survey max-h-[32dvh] overflow-auto bg-amber-50">{survey}</div>}
    </>}
    <div className="max-h-[35dvh] shrink-0 overflow-auto">{actions}</div>
  </div>;
}
