import {BEND_MODES,BEND_LABELS,type BendMode} from './bends';
export function BendModeSelect({value,onChange,disabled=false}:{value:BendMode;onChange:(value:BendMode)=>void;disabled?:boolean}) {
 return <fieldset className="my-4 rounded-xl border border-current/25 p-3"><legend className="px-1 font-bold">Connection rules</legend>
 <select aria-label="Connection rules" disabled={disabled} value={value} onChange={e=>onChange(e.target.value as BendMode)} className="w-full rounded-lg bg-white p-3 text-base text-slate-900">{BEND_MODES.map(mode=><option key={mode} value={mode}>{BEND_LABELS[mode]}</option>)}</select>
 <p className="mt-2 text-sm">{value==='straight'?'Original rules: finish each straight segment in one activation.':value==='tokens'?'Three bend tokens per company. Each extra token costs $3M in available cash. Finish the whole path in one activation.':'Stop at a bend to end work on that line. Hire it again later to finish the remaining length. Other activated lines can still build.'} All curves remain at most 90°. This choice stays fixed for the game.</p></fieldset>;
}
