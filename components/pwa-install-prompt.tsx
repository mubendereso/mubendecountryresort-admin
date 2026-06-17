"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneDisplay()) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };

    const onAppInstalled = () => {
      setInstallEvent(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (!installEvent || dismissed) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
      setInstallEvent(null);
      setDismissed(true);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div className="surface-card flex w-full max-w-md items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[#2a241a]">Install admin app</p>
          <p className="mt-0.5 text-xs text-oliveMuted-600">
            Open the PMS faster and keep the offline shell available.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => void install()}
            className="rounded-full bg-oliveMuted-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-oliveMuted-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-oliveMuted-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-light"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
