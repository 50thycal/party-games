export type SegmentLengthMode = 'exact' | 'flexible';
export function SegmentLengthSelect({value,onChange,disabled=false}:{value:SegmentLengthMode;onChange:(value:SegmentLengthMode)=>void;disabled?:boolean}) {
 return <fieldset className="my-4 rounded-xl border border-current/25 p-3"><legend className="px-1 font-bold">Segment length</legend>
 <select aria-label="Segment length" disabled={disabled} value={value} onChange={e=>onChange(e.target.value as SegmentLengthMode)} className="w-full rounded-lg bg-white p-3 text-base text-slate-900"><option value="exact">Exact length (default)</option><option value="flexible">Flexible length</option></select>
 <p className="mt-2 text-sm">{value==='exact'?'Build each segment at its printed length.':'Build from 1 space up to the printed length.'} Bends share the same total length budget. This choice stays fixed for the game.</p></fieldset>;
}
