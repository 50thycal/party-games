'use client';
import { useState } from 'react';
import { saveMarkdownReport } from './saveReport';

export function ReportSaveControls({report,roomCode}:{report:string;roomCode:string}) {
  const [error,setError]=useState('');
  const save=(share:boolean)=>{
    setError('');
    void saveMarkdownReport(report,`subway-${roomCode}-playtest.md`,share).catch(()=>setError('Could not save. Try Download MD or copy the report text.'));
  };
  return <div className="space-y-3">
    <button className="min-h-12 rounded bg-teal-800 px-4 py-3 font-bold text-white" onClick={()=>save(true)}>Save MD · Share / Files</button>
    <button className="ml-3 min-h-12 font-bold underline" onClick={()=>save(false)}>Download MD</button>
    <p className="text-sm">On iPhone or iPad, choose Save to Files in the share sheet.</p>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
