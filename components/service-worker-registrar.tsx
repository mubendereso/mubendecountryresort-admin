"use client";

import { useCallback, useEffect, useState } from "react";

type WaitingState = {
  worker: ServiceWorker;
};

export function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<WaitingState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1";

    // Keep the PWA available on localhost for local verification, but avoid
    // registering in other non-production environments where HMR-like flows
    // may depend on a clean, un-cached page state.
    if (process.env.NODE_ENV !== "production" && !isLocalhost) return;

    const controller = new AbortController();
    let activeRegistration: ServiceWorkerRegistration | null = null;

    const trackInstalling = (installing: ServiceWorker) => {
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          // A new SW is installed and waiting. There's an existing controller,
          // so the page is currently being served by an old version. Don't
          // skip-waiting automatically — let the user choose to refresh so
          // they don't lose unsaved form state mid-edit.
          setWaiting({ worker: installing });
        }
      });
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/"
        });
        activeRegistration = registration;

        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting({ worker: registration.waiting });
        }
        if (registration.installing) {
          trackInstalling(registration.installing);
        }

        registration.addEventListener("updatefound", () => {
          if (registration.installing) {
            trackInstalling(registration.installing);
          }
        });
      } catch (error) {
        console.warn("[sw] registration failed", error);
      }
    };

    void register();

    // When a new SW takes control after the user accepts the update, reload
    // exactly once so the page is served by the new version.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
      { signal: controller.signal }
    );

    // Periodic update check — staff may keep the PWA installed for days and
    // never hard-refresh. One check per hour is plenty.
    const interval = window.setInterval(() => {
      activeRegistration?.update().catch(() => undefined);
    }, 60 * 60 * 1000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const onRefresh = useCallback(() => {
    if (!waiting) return;
    waiting.worker.postMessage({ type: "SKIP_WAITING" });
    // The controllerchange handler above will trigger the reload once the
    // new SW activates.
  }, [waiting]);

  if (!waiting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <div className="surface-card flex w-full max-w-md items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm text-[#2a241a]">
          A new version is available.
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full bg-oliveMuted-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-oliveMuted-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-oliveMuted-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-light"
        >
          Refresh to update
        </button>
      </div>
    </div>
  );
}
