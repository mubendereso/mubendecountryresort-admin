import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline"
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="surface-card max-w-md w-full p-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-oliveMuted-500">
          Mubende Country Resort
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-[#2a241a]">You are offline</h1>
        <p className="mt-4 text-sm text-[#5a4f3d]">
          This device cannot reach the resort network right now. Anything you have
          already opened in this session should still work — pages that need fresh
          data will load again once you are back online.
        </p>
      </div>
    </main>
  );
}
