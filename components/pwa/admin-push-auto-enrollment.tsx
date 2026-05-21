"use client";

import { useEffect, useState } from "react";
import {
  decodeVapidPublicKey,
  getAppServiceWorkerRegistration,
  supportsPushNotifications
} from "@/lib/pwa/service-worker";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function encodeKey(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function keyMatchesVapid(sub: PushSubscription): boolean {
  return encodeKey(sub.options.applicationServerKey) === vapidPublicKey;
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Push subscription is missing required keys.");
  }

  const res = await fetch("/api/admin/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: json.keys })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "Unable to save push subscription.");
  }
}

type Status = "checking" | "active" | "needs_permission" | "blocked" | "unsupported" | "not_configured" | "error";

export function AdminPushAutoEnrollment() {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);

  async function enroll(options?: { requestPermission?: boolean }) {
    if (!supportsPushNotifications()) {
      setStatus("unsupported");
      setMessage("This browser cannot receive push alerts.");
      return;
    }

    if (!vapidPublicKey) {
      setStatus("not_configured");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("blocked");
      setMessage("Notifications are blocked in this browser.");
      return;
    }

    if (Notification.permission !== "granted") {
      if (!options?.requestPermission) {
        setStatus("needs_permission");
        setMessage("Enable alerts to receive new booking notifications.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "needs_permission");
        setMessage(
          permission === "denied"
            ? "Notifications are blocked in this browser."
            : "Enable alerts to receive new booking notifications."
        );
        return;
      }
    }

    setStatus("checking");
    setMessage("Setting up booking alerts...");

    try {
      const registration = await getAppServiceWorkerRegistration();
      if (!registration) throw new Error("Service worker is unavailable.");

      let sub = await registration.pushManager.getSubscription();
      if (sub && !keyMatchesVapid(sub)) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidPublicKey(vapidPublicKey)
        });
      }

      await saveSubscription(sub);
      void fetch("/api/admin/push/process", { method: "POST" }).catch(() => undefined);
      setStatus("active");
      setMessage(null);
    } catch (err) {
      console.warn("admin_push_enrollment_failed", err);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to set up booking alerts.");
    }
  }

  useEffect(() => {
    void enroll({ requestPermission: false });
  }, []);

  if (status === "active" || status === "checking" || status === "not_configured") return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-widest text-oliveMuted-500">
        Booking alerts
      </p>
      {message && <p className="mt-2 leading-5 text-zinc-700">{message}</p>}
      {(status === "needs_permission" || status === "error") && (
        <button
          type="button"
          onClick={() => { void enroll({ requestPermission: true }); }}
          className="mt-3 rounded-full bg-oliveMuted-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-oliveMuted-600"
        >
          Enable alerts
        </button>
      )}
    </div>
  );
}
