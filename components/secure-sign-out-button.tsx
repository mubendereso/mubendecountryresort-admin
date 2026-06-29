"use client";

import { useState } from "react";
import { signOutAction } from "@/lib/auth/actions";
import {
  clearLocalAdminData,
  countPendingOfflineMutations,
  lockOfflineAccess,
  markServerLogoutPending
} from "@/lib/local-db/security";
import { pushOutbox } from "@/lib/sync/engine";

type SecureSignOutButtonProps = {
  className?: string;
  label?: string;
  onLocalSignedOut?: () => void;
};

export function SecureSignOutButton({
  className,
  label = "Sign out",
  onLocalSignedOut
}: SecureSignOutButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finishLocally() {
    onLocalSignedOut?.();
    if (!onLocalSignedOut) {
      window.location.replace("/offline?signedOut=1");
    }
  }

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      let pending = await countPendingOfflineMutations();

      if (pending > 0 && navigator.onLine) {
        try {
          await pushOutbox();
        } catch {
          // The confirmation below handles work that could not be synced.
        }
        pending = await countPendingOfflineMutations();
      }

      if (
        pending > 0 &&
        !window.confirm(
          `${pending} offline change${pending === 1 ? " is" : "s are"} still waiting to sync. ` +
            "Signing out will permanently discard that work. Sign out anyway?"
        )
      ) {
        setBusy(false);
        return;
      }

      await clearLocalAdminData();
      markServerLogoutPending();
      lockOfflineAccess();

      if (!navigator.onLine) {
        await finishLocally();
        return;
      }

      try {
        await signOutAction();
        window.location.replace("/login?message=Signed%20out.");
      } catch {
        // If connectivity disappeared between the check and the server action,
        // the pending cookie revokes the session on the next online request.
        await finishLocally();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Unable to complete a secure sign-out: ${cause.message}. You have not been signed out.`
          : "Unable to complete a secure sign-out. You have not been signed out."
      );
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={busy}
        className={className}
      >
        {busy ? "Signing out..." : label}
      </button>
      {error ? (
        <span role="alert" className="max-w-64 text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
