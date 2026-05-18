import type { Metadata } from "next";
import { LocalDbTester } from "./tester";

export const metadata: Metadata = {
  title: "Local DB test"
};

export default function TestLocalDbPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-oliveMuted-500">
          Local DB
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[#2a241a]">
          SQLite-WASM + OPFS test
        </h1>
        <p className="mt-3 text-sm text-[#5a4f3d]">
          Writes pings to the browser-side SQLite database. Refresh the page or
          close the tab and come back &mdash; rows should persist via OPFS.
        </p>
      </header>
      <LocalDbTester />
    </main>
  );
}
