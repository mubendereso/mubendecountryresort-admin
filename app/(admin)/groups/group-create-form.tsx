"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createReservationGroupAction } from "@/lib/groups/actions";

const FIELD_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

export function GroupCreateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createReservationGroupAction(formData);
      if (result.ok) {
        router.push(`/groups/${result.groupId}`);
        router.refresh();
        return;
      }
      setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <div className="surface-card grid gap-4 p-5 sm:p-6">
        <div className="grid gap-1.5">
          <label htmlFor="groupName" className={LABEL_CLASS}>
            Group Name
          </label>
          <input
            id="groupName"
            name="groupName"
            type="text"
            autoComplete="off"
            placeholder="Family Reunion 2026"
            className={FIELD_CLASS}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="organizerName" className={LABEL_CLASS}>
              Organizer Name
            </label>
            <input
              id="organizerName"
              name="organizerName"
              type="text"
              autoComplete="off"
              className={FIELD_CLASS}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="organizerPhone" className={LABEL_CLASS}>
              Organizer Phone
            </label>
            <input
              id="organizerPhone"
              name="organizerPhone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="organizerEmail" className={LABEL_CLASS}>
            Organizer Email
          </label>
          <input
            id="organizerEmail"
            name="organizerEmail"
            type="email"
            autoComplete="off"
            className={FIELD_CLASS}
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="notes" className={LABEL_CLASS}>
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            className={FIELD_CLASS}
            placeholder="Optional internal notes about the group"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-oliveMuted-600">
          Groups are umbrellas only. Each member booking still manages its own room, folio, receipts, and housekeeping.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/groups")}
            className="rounded-2xl border border-stoneWarm-200 px-5 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-2xl bg-oliveMuted-600 px-6 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </form>
  );
}
