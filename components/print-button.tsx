"use client";

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
    >
      {label}
    </button>
  );
}
