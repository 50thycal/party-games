"use client";
import { useState } from "react";
import Link from "next/link";
export default function SubwayLab() {
  const [width,setWidth]=useState(1280);
  const [count,setCount]=useState(4);
  const [phase,setPhase]=useState("PROCUREMENT");
  return <main className="min-h-screen bg-slate-900 p-3 text-white">
    <div className="mb-3 flex flex-wrap items-center gap-3"><Link href="/subway">← Play Subway</Link><h1 className="font-bold">Subway visual playtest lab</h1>
      <label>Seats <select className="bg-slate-800 p-2" value={count} onChange={e=>setCount(+e.target.value)}>{[2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>
      <label>Scene <select className="bg-slate-800 p-2" value={phase} onChange={e=>setPhase(e.target.value)}>{["PROCUREMENT","ENGINEERING","SCHEDULING","STARTER_PLACEMENT","CONSTRUCTION","SCORING","RESULTS"].map(p=><option key={p}>{p}</option>)}</select></label>
      {[390,844,1280].map(w=><button className="rounded bg-slate-700 px-3 py-2" aria-pressed={width===w} key={w} onClick={()=>setWidth(w)}>{w===390?'Phone portrait':w===844?'Phone landscape':'Desktop'}</button>)}
    </div>
    <p className="mb-3 text-xs text-slate-300">Seed 7 · scenarios reached through legal reducer actions · isolated from real rooms · frame sizes test real CSS viewports</p>
    <iframe key={`${count}-${phase}`} title="Subway playtest viewport" src={`/test/subway/view?count=${count}&phase=${phase}`} style={{width,maxWidth:"100%",height:width===844?390:844}} className="mx-auto block rounded-lg border border-slate-600" />
  </main>;
}
