"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Native modal supplies focus containment, Escape and focus restoration. */
export function SettingsDialog({children,onClose}:{children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current,previous=document.activeElement;if(dialog&&!dialog.open)dialog.showModal();return()=>{dialog?.close();if(previous instanceof HTMLElement)previous.focus();};},[]);
  return <dialog ref={ref} aria-label="Table settings" onCancel={event=>{event.preventDefault();onClose();}} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(36rem,calc(100%-1.5rem))] overflow-auto rounded-xl bg-[#fff7e5] p-4 text-stone-900 backdrop:bg-stone-950/80">
    <button className="float-right rounded border px-3 py-2" onClick={onClose}>Close settings</button>
    <h2 className="text-xl font-bold">Table settings</h2>{children}
  </dialog>;
}
