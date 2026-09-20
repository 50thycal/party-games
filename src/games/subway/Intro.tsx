"use client";

import { useEffect, useRef, useState } from "react";
import type { BendMode } from "./bends";
import type { SegmentLengthMode } from "./SegmentLengthSelect";
import { introStyles } from "./introStyles";

type Options = { bendMode?: BendMode; segmentLengthMode?: SegmentLengthMode };
type Slide = { title: string; kicker: string; text: string; note: string; art: string; tiles?: string[] };
export function introSlides({ bendMode = "delayed", segmentLengthMode = "exact" }: Options): Slide[] {
  return [
    {kicker:"Welcome to the city",title:"Three lines. One company.",text:"Build a subway network that earns the most victory points.",note:"Finished lines + Engineering + Destinations + public awards + ending cash. Unfinished lines lose their printed penalty.",art:"network",tiles:["2–4 companies","$40M to start","9 rounds maximum"]},
    {kicker:"Around the table",title:"Your phone. Our city.",text:"Keep your private goals on your phone. Build together on the shared iPad.",note:"Phones draft lines and goals. On the iPad, acknowledge your company, hire crews, preview and confirm construction. Local pass & play uses one device.",art:"tiles",tiles:["PHONE · Cards & goals","iPAD · Board & crews"]},
    {kicker:"Draft your plan",title:"Read the recipe left to right.",text:"Buy three Line Contracts, one at a time. Each number is the next segment’s length in peg spaces.",note:"Draft three Engineering goals and two Destinations. Engineering scope matters: Single Line, Connected Network or Company-wide. Goals stay in hand; nothing to lock in.",art:"recipe",tiles:["Example · Pink Line","2 + 3 + 4 + 2 = 11 spaces"]},
    {kicker:"Place your starters",title:"Begin at the city edge.",text:"Place one free starter for each line on an empty border hole outside a neighborhood.",note:"One peg per hole—even for your own lines. Select a legal target, inspect it, then Confirm.",art:"starter"},
    {kicker:"A construction turn",title:"Choose. Preview. Confirm.",text:"Before hiring, you may buy optional cards for $3M each: at most one extra Engineering and one extra Destination per game, paid from cash.",note:"Engineering: face-up or random. Destination: random. Hire up to three different unfinished lines; each gets one activation. Tapping a target only previews it.",art:"tiles",tiles:["1 crew · $1M","2 crews · $3M","3 crews · $6M"]},
    {kicker:"The connection lesson · 1 of 4",title:"One space makes a transfer.",text:"Different lines of YOUR company connect when their stations are one peg space apart horizontally or vertically.",note:"Both colors in the diagram belong to Company A. Toggle the example: move the blue station beside the red station to join their networks.",art:"join"},
    {kicker:"The connection lesson · 2 of 4",title:"An area is not a connection.",text:"A neighborhood is a place to serve. A transfer station is a group of adjacent station pegs.",note:"These two stations serve the same neighborhood, but they are two spaces apart. The neighborhood does not join their lines. Transfers can also exist outside neighborhoods.",art:"area"},
    {kicker:"The connection lesson · 3 of 4",title:"Crossing is not transferring.",text:"Strings that cross do not connect. Diagonally neighboring stations do not connect either.",note:"Trace your own lines through horizontal or vertical station joins. An opponent’s line cannot bridge your company network.",art:"cross"},
    {kicker:"The connection lesson · 4 of 4",title:"Make one connected journey.",text:"A Destination scores when one connected network of your own lines has a station in every named neighborhood.",note:"Unfinished lines can contribute, in any order. A string passing through an area is not a stop. Pair: 4 VP + $2M; triple: 7 VP + $3M. Cash pays once when first connected.",art:"destination"},
    {kicker:"Read the distance",title:segmentLengthMode === "flexible" ? "Shortening is enabled." : "Build the printed length.",text:segmentLengthMode === "flexible" ? "This setup allows a segment from 1 space up to its printed length, with the game’s geometric tolerance." : "This setup uses exact lengths, with ±0.5 peg space tolerance. Optional shortening can be selected before a game.",note:"Measure the whole path, including both legs of a bend. Recipe totals always sum the printed numbers.",art:"length"},
    {kicker:"Change direction",title:bendMode === "delayed" ? "One bend. Two activations." : bendMode === "tokens" ? "One bend. One token." : "Straight segments selected.",text:bendMode === "delayed" ? "Delayed construction is selected (the default). Stop at a bend now; hire this line again to finish the remaining segment budget." : bendMode === "tokens" ? "Token mode is selected. Each company starts with 3 bend tokens; extra tokens cost $3M each from available cash." : "This game uses straight segments. Curves between segments may still be up to 90°.",note:"At most one bend per segment. A bend is not a station or a Destination stop. Each change of heading is at most 90°; no self-crossing or overlapping strings.",art:bendMode === "straight" ? "length" : "bend"},
    {kicker:"Look one step ahead",title:"Yellow means “could go next.”",text:"Green targets are legal choices. After you select one, yellow dots show possible next stations—or where a bent segment can finish.",note:"Yellow dots reserve nothing. Confirm commits your preview. Undo restores the latest placement and its payments until another accepted action; hired crews remain paid.",art:"preview"},
    {kicker:"Keep the books",title:"Free joins. Paid contacts.",text:"Adjacent station joins are free, including beside opponents. Each distinct new string contact with an opponent costs $1M; your own contacts are free.",note:"Crews and tolls may take you into debt. Completing a line pays $3M immediately. Ending debt costs −2 VP per $1M, without a cap.",art:"tiles",tiles:["−$3M → −6 VP","$0–1M → 0 VP","$2–3M → +1 VP","$4M → +2 VP","$5M+ → +3 VP"]},
    {kicker:"Public awards",title:"Build long. Gather stations.",text:"Longest Network: 5 VP, or 3 each if tied. Measure a continuous trail along built segments without reusing a segment.",note:"Largest Transfer Station counts orthogonally adjacent pegs across all companies. Total your pegs across all equally largest groups: the leader gets 6 VP; two tied get 3 each, three get 2 each, four get 0.",art:"tiles",tiles:["Longest Network · 5 VP","Largest Transfer · 6 VP"]},
    {kicker:"Ready to play",title:"Make the connections count.",text:"Check your goals. Choose your crews. Preview the route. Confirm when you’re ready.",note:"Play ends after round 9, or earlier if no unfinished line has a legal build. Score lines, goals, awards and ending cash. Reopen How to play whenever you need it.",art:"network",tiles:["Stations make connections","Neighborhoods are places","Crossings are not transfers"]},
  ];
}

const red = "#dc4941", blue = "#267ab3";
type Dot = [number, number];
export function introRoutes(kind:string,connected=false) {
  const routes: {color:string;code:string;points:Dot[]}[] = kind === "cross"
    ? [{color:red,code:"R",points:[[1,1],[5,5]]},{color:blue,code:"B",points:[[1,5],[5,1]]}]
    : kind === "bend" ? [{color:red,code:"R",points:[[1,4],[3,4],[3,1]]}]
    : kind === "length" || kind === "preview" ? [{color:red,code:"R",points:[[1,3],[4,3]]}]
    : kind === "starter" ? [{color:red,code:"R",points:[[0,3]]}]
    : [{color:red,code:"R",points:[[1,4],[3,4]]},{color:blue,code:"B",points:[[3,kind === "area" || kind === "join" && !connected ? 2 : 3],[6,1]]}];
  return routes;
}

function BoardDiagram({kind,connected}:{kind:string;connected:boolean}) {
  const routes=introRoutes(kind,connected);
  const pos = ([x,y]:Dot) => [42+x*48,42+y*48];
  return <svg viewBox="0 0 420 340" role="img" aria-label={kind === "join" ? `${connected ? "Connected: one" : "Disconnected: two"} vertical peg spaces between Company A’s red and blue stations` : `${kind} example on a peg grid`}>
    <rect x="14" y="14" width="392" height="300" rx="18" fill="#e8d6b3" stroke="#987f55" strokeWidth="3"/>
    {(kind === "area" || kind === "destination") && (kind === "area" ? <rect x="155" y="108" width="64" height="158" rx="15" fill="#bdd9cf" stroke="#337c70" strokeDasharray="6 4"/> : <g fill="#bdd9cf" stroke="#337c70"><rect x="66" y="211" width="48" height="48" rx="10"/><rect x="306" y="66" width="48" height="48" rx="10"/></g>)}
    {Array.from({length:48},(_,i)=><circle key={i} cx={42+(i%8)*48} cy={42+Math.floor(i/8)*48} r="3" fill="#a8926b"/>)}
    {routes.map(({color,code,points})=><g key={code}>
      <polyline points={points.map(p=>pos(p).join(",")).join(" ")} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((p,i)=>{const [x,y]=pos(p);return kind === "bend" && i === 1 ? <rect key={i} x={x-8} y={y-8} width="16" height="16" fill="#f5c84a" stroke="#172c34" strokeWidth="3"/> : <g key={i}><circle cx={x} cy={y} r="13" fill={color} stroke="#172c34" strokeWidth="3"/><text x={x} y={y+5} fill="white" fontSize="14" fontWeight="900" textAnchor="middle">{code}</text></g>;})}
    </g>)}
    {(kind === "join" && connected || kind === "destination" || kind === "network") && <path d="M186 201v18" stroke="#172c34" strokeWidth="5" strokeDasharray="4 3"/>}
    {kind === "preview" && <g><circle cx="234" cy="186" r="20" fill="none" stroke="#167953" strokeWidth="4"/>{[[6,1],[7,3],[6,5]].map(([x,y])=><circle key={y} cx={42+x*48} cy={42+y*48} r="9" fill="#ffcf33" stroke="#715a00" strokeWidth="2"/>)}</g>}
    {kind === "destination" && <g fontSize="18" fontWeight="900" fill="#172c34"><text x="90" y="286" textAnchor="middle">A</text><text x="330" y="55" textAnchor="middle">B</text></g>}
    {kind === "length" && <text x="162" y="152" textAnchor="middle" fontSize="22" fontWeight="800" fill="#172c34">3 peg spaces</text>}
    {kind === "bend" && <g fontSize="21" fontWeight="800" fill="#172c34"><text x="130" y="263">2</text><text x="210" y="168">3</text><text x="292" y="260">2 + 3 = 5</text></g>}
    <text x="210" y="334" textAnchor="middle" fontSize="17" fontWeight="800" fill="#172c34">{kind === "cross" ? "× No station at the crossing" : kind === "area" ? "Same area ≠ connected lines" : kind === "starter" ? "Empty border hole · free starter" : kind === "destination" ? "A → station transfer → B" : kind === "bend" ? "Square = bend, not a station" : kind === "length" || kind === "preview" ? "R · one line of Company A" : "Company A owns R + B"}</text>
  </svg>;
}

function Intro({onClose,...options}:Options&{onClose:()=>void}) {
  const [index,setIndex] = useState(0);
  const [connected,setConnected] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const slides = introSlides(options), slide = slides[index];
  useEffect(()=>{const dialog=ref.current,previous=document.activeElement;dialog?.showModal();const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{dialog?.close();document.body.style.overflow=overflow;if(previous instanceof HTMLElement)previous.focus();};},[]);
  const go=(next:number)=>{setIndex(next);setConnected(false);content.current?.scrollTo({top:0});};
  return <dialog ref={ref} className={"subwayIntro-dialog"} aria-label="Subway introduction" onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}}>
    <header className={"subwayIntro-header"}><strong>SUBWAY<span> / HOW TO PLAY</span></strong><button onClick={onClose}>Skip / Close ×</button></header>
    <div className={"subwayIntro-progress"} role="progressbar" aria-label="Walkthrough progress" aria-valuemin={1} aria-valuemax={slides.length} aria-valuenow={index+1}><span style={{width:`${(index+1)/slides.length*100}%`}}/></div>
    <div className={"subwayIntro-content"} ref={content}>
      <section className={"subwayIntro-copy"} aria-live="polite" aria-atomic="true"><p className={"subwayIntro-kicker"}>{slide.kicker}</p><h2>{slide.title}</h2><p className={"subwayIntro-lead"}>{slide.text}</p><p className={"subwayIntro-note"}>{slide.note}</p></section>
      <section className={"subwayIntro-art"} aria-label="Lesson illustration">
        {slide.art !== "tiles" && slide.art !== "recipe" && <BoardDiagram kind={slide.art} connected={connected}/>}
        {slide.art === "recipe" && <div className={"subwayIntro-recipe"}><span>PI · PINK LINE</span><div>{[2,3,4,2].map((n,i)=><b key={i}>{n}</b>)}</div><p>Start → build in this order</p></div>}
        {slide.tiles && <div className={"subwayIntro-tiles"}>{slide.tiles.map(tile=><div key={tile}>{tile}</div>)}</div>}
        {slide.art === "join" && <div className={"subwayIntro-toggle"}><button aria-pressed={!connected} onClick={()=>setConnected(false)}>Before · disconnected</button><button aria-pressed={connected} onClick={()=>setConnected(true)}>After · connected</button></div>}
        {slide.art === "cross" && <svg viewBox="0 0 420 92" role="img" aria-label="Diagonal stations do not transfer"><path d="M40 22h40v40" fill="none" stroke="#aa9774" strokeWidth="2" strokeDasharray="4 4"/><circle cx="40" cy="22" r="12" fill={red} stroke="#172c34" strokeWidth="3"/><circle cx="80" cy="62" r="12" fill={blue} stroke="#172c34" strokeWidth="3"/><text x="110" y="48" fontSize="18" fontWeight="800" fill="#172c34">× Diagonal: no transfer</text></svg>}
      </section>
    </div>
    <footer className={"subwayIntro-footer"}><button disabled={index===0} onClick={()=>go(index-1)}>← Back</button><label><span className={"subwayIntro-srOnly"}>Jump to slide</span><select aria-label="Jump to slide" value={index} onChange={e=>go(Number(e.target.value))}>{slides.map((s,i)=><option value={i} key={s.title}>{i+1} / {slides.length} · {s.title}</option>)}</select></label><button className={"subwayIntro-next"} onClick={()=>index===slides.length-1?onClose():go(index+1)}>{index===slides.length-1?"Ready to play ✓":"Next →"}</button></footer>
  </dialog>;
}

/** Local presentation only: deliberately accepts no room, reducer or action callback. */
export function HowToPlay(props:Options) {
  const [open,setOpen]=useState(false);
  return <><style>{introStyles}</style><button type="button" className={"subwayIntro-launch"} onClick={()=>setOpen(true)}>How to play <span aria-hidden>↗</span></button>{open&&<Intro {...props} onClose={()=>setOpen(false)}/>}</>;
}
