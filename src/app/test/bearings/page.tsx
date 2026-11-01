import Link from "next/link";

export default function BearingsLab() {
  return <main className="min-h-screen space-y-4 p-4">
    <h1 className="text-2xl font-bold">Landmark Bearings · isolated playtest</h1>
    <p className="text-sm text-slate-300">These independent games use the real reducer and view, with no room database.</p>
    <Link href="/create" className="inline-block text-teal-300 underline">Create a shared room instead</Link>
    <div className="flex flex-wrap items-start gap-6">
      <section><h2 className="mb-2 font-semibold">Phone · 390 × 844</h2>
        <iframe title="Phone bearings playtest" src="/test/bearings/view" width="390" height="844" className="max-w-full rounded-2xl border border-slate-600" />
      </section>
      <section><h2 className="mb-2 font-semibold">Desktop · 800 × 900</h2>
        <iframe title="Desktop bearings playtest" src="/test/bearings/view" width="800" height="900" className="max-w-full rounded-2xl border border-slate-600" />
      </section>
    </div>
  </main>;
}
