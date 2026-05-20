import type { Metadata } from "next";
import { SyncTester } from "./tester";

export const metadata: Metadata = {
  title: "Sync test"
};

export default function TestSyncPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-oliveMuted-500">Sync</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#2a241a]">
          Outbox + change-feed test
        </h1>
        <p className="mt-3 text-sm text-[#5a4f3d]">
          Pull contact submissions into the local DB, mark them
          read/archived (queued in the outbox), then sync to push the change
          to Neon and pull the server-confirmed result back.
        </p>
      </header>
      <SyncTester />
    </main>
  );
}
