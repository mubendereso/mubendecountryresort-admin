"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { createReservationGroupBundleAction } from "@/lib/groups/actions";
import type { GroupBookingRoomOption } from "@/lib/rooms/types";

type GroupRoomCard = {
  id: string;
  roomTypeSlug: string;
  checkIn: string;
  checkOut: string;
  guestsAdults: number;
  guestsChildren: number;
  specialRequests: string;
  notes: string;
  inheritDates: boolean;
};

const FIELD_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function allocateAmount(amount: number, bases: number[]): number[] {
  const totalBase = bases.reduce((sum, base) => sum + Math.max(0, Math.trunc(base)), 0);
  if (amount <= 0 || totalBase <= 0) return bases.map(() => 0);

  let remainingAmount = Math.trunc(amount);
  let remainingBase = totalBase;

  return bases.map((base, index) => {
    const sanitizedBase = Math.max(0, Math.trunc(base));
    if (index === bases.length - 1) return remainingAmount;
    if (remainingAmount <= 0 || remainingBase <= 0 || sanitizedBase <= 0) {
      remainingBase -= sanitizedBase;
      return 0;
    }

    const share = Math.min(remainingAmount, Math.floor((remainingAmount * sanitizedBase) / remainingBase));
    remainingAmount -= share;
    remainingBase -= sanitizedBase;
    return share;
  });
}

function createCard(defaultRoomSlug: string, checkIn: string, checkOut: string): GroupRoomCard {
  return {
    id: crypto.randomUUID(),
    roomTypeSlug: defaultRoomSlug,
    checkIn,
    checkOut,
    guestsAdults: 1,
    guestsChildren: 0,
    specialRequests: "",
    notes: "",
    inheritDates: true
  };
}

function firstAvailableRoomSlug(
  rooms: GroupBookingRoomOption[],
  selectedCounts?: Map<string, number>
): string {
  return (
    rooms.find((room) => room.available_count > (selectedCounts?.get(room.slug) ?? 0))?.slug ??
    rooms[0]?.slug ??
    ""
  );
}

export function GroupBookingForm({
  rooms,
  initialCheckIn,
  initialCheckOut
}: {
  rooms: GroupBookingRoomOption[];
  initialCheckIn: string;
  initialCheckOut: string;
}) {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [organizerPhone, setOrganizerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [groupDiscountAmount, setGroupDiscountAmount] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositMethod, setDepositMethod] = useState("cash");
  const [depositReference, setDepositReference] = useState("");
  const [cards, setCards] = useState<GroupRoomCard[]>(() => {
    const defaultRoomSlug = firstAvailableRoomSlug(rooms);
    return defaultRoomSlug ? [createCard(defaultRoomSlug, initialCheckIn, initialCheckOut)] : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) {
      counts.set(card.roomTypeSlug, (counts.get(card.roomTypeSlug) ?? 0) + 1);
    }
    return counts;
  }, [cards]);

  const cardTotals = useMemo(
    () =>
      cards.map((card) => {
        const room = rooms.find((roomType) => roomType.slug === card.roomTypeSlug);
        if (!room) return 0;
        return room.price_ugx * Math.max(1, nightsBetween(card.checkIn, card.checkOut));
      }),
    [cards, rooms]
  );

  const grandTotal = cardTotals.reduce((sum, total) => sum + total, 0);
  const discountAmount = Math.min(Math.max(0, groupDiscountAmount), grandTotal);
  const finalGroupTotal = Math.max(0, grandTotal - discountAmount);
  const depositValue = Math.min(Math.max(0, depositAmount), finalGroupTotal);
  const balanceDue = Math.max(0, finalGroupTotal - depositValue);
  const discountShares = useMemo(() => allocateAmount(discountAmount, cardTotals), [cardTotals, discountAmount]);
  const finalCardTotals = useMemo(
    () => cardTotals.map((total, index) => Math.max(0, total - discountShares[index])),
    [cardTotals, discountShares]
  );
  const depositShares = useMemo(() => allocateAmount(depositValue, finalCardTotals), [depositValue, finalCardTotals]);

  const cardPayload = useMemo(
    () =>
      cards.map((card, index) => ({
        roomTypeSlug: card.roomTypeSlug,
        checkIn: card.checkIn,
        checkOut: card.checkOut,
        guestsAdults: card.guestsAdults,
        guestsChildren: card.guestsChildren,
        specialRequests: card.specialRequests.trim(),
        notes: card.notes.trim(),
        agreedRoomPriceUgx: finalCardTotals[index],
        depositAmountUgx: depositShares[index]
      })),
    [cards, depositShares, finalCardTotals]
  );

  function updateGroupDates(nextCheckIn: string, nextCheckOut: string) {
    // Group dates seed the default stay window for member bookings.
    // Individual cards can still diverge, which is required for future room blocks.
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    setCards((current) =>
      current.map((card) =>
        card.inheritDates
          ? {
              ...card,
              checkIn: nextCheckIn,
              checkOut: nextCheckOut
            }
          : card
      )
    );
  }

  function addCard() {
    const defaultRoomSlug = firstAvailableRoomSlug(rooms, selectedCounts);
    if (!defaultRoomSlug) return;
    setCards((current) => [...current, createCard(defaultRoomSlug, checkIn, checkOut)]);
  }

  function removeCard(id: string) {
    setCards((current) => {
      if (current.length <= 1) return current;
      return current.filter((card) => card.id !== id);
    });
  }

  function updateCard(id: string, patch: Partial<GroupRoomCard>) {
    setCards((current) =>
      current.map((card) => {
        if (card.id !== id) return card;
        const next = { ...card, ...patch };
        if (patch.checkIn !== undefined || patch.checkOut !== undefined) {
          next.inheritDates = false;
        }
        return next;
      })
    );
  }

  function resetCardDates(id: string) {
    setCards((current) =>
      current.map((card) =>
        card.id === id
          ? {
              ...card,
              checkIn,
              checkOut,
              inheritDates: true
            }
          : card
      )
    );
  }

  function availableForCard(card: GroupRoomCard, slug: string): number {
    const room = rooms.find((roomType) => roomType.slug === slug);
    if (!room) return 0;
    const selectedCount = selectedCounts.get(slug) ?? 0;
    return room.available_count - selectedCount + (card.roomTypeSlug === slug ? 1 : 0);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (grandTotal <= 0) {
      setError("Add at least one room card.");
      return;
    }
    if (discountAmount > grandTotal) {
      setError("Discount cannot exceed the grand total.");
      return;
    }
    if (depositValue > finalGroupTotal) {
      setError("Deposit cannot exceed the final group total.");
      return;
    }

    const formData = new FormData();
    formData.set("groupName", groupName);
    formData.set("organizerName", organizerName);
    formData.set("organizerEmail", organizerEmail);
    formData.set("organizerPhone", organizerPhone);
    formData.set("notes", notes);
    formData.set("checkIn", checkIn);
    formData.set("checkOut", checkOut);
    formData.set("depositMethod", depositMethod);
    formData.set("depositReference", depositReference);
    formData.set("cardsJson", JSON.stringify(cardPayload));

    startTransition(async () => {
      const result = await createReservationGroupBundleAction(formData);
      if (result.ok) {
        router.push(`/groups/${result.groupId}`);
        router.refresh();
        return;
      }
      setError(result.error);
    });
  }

  if (rooms.length === 0) {
    return (
      <section className="grid gap-6">
        <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">Guest operations</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
              Group booking
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              No published room types are available. Publish a room first.
            </p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="grid gap-8 lg:gap-10">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">Guest operations</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
              Group booking
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              Create the group and its member bookings in one pass. Each room remains an ordinary booking, so folios, receipts, check-in, check-out, and housekeeping stay unchanged.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-stoneWarm-100/70 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600">
              {cards.length} room{cards.length === 1 ? "" : "s"}
              <span className="text-oliveMuted-400">|</span>
              Grand {fmtUgx(grandTotal)}
              {discountAmount > 0 && (
                <>
                  <span className="text-oliveMuted-400">|</span>
                  Discount {fmtUgx(discountAmount)}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-stretch gap-3">
            <Link
              href="/front-desk"
              className="group flex min-h-[68px] items-center gap-3 rounded-[20px] border border-stoneWarm-200 bg-[#fffdf8]/90 px-5 py-3 text-oliveMuted-600 shadow-[0_14px_30px_rgba(55,43,30,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_36px_rgba(55,43,30,0.12)]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-stoneWarm-100 text-lg font-light transition-transform duration-200 group-hover:-translate-x-0.5">
                Back
              </span>
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                  Front desk
                </span>
                <span className="mt-0.5 block text-sm font-semibold">Back to operations</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={addCard}
              className="group flex min-h-[68px] items-center gap-3 rounded-[20px] bg-oliveMuted-600 px-5 py-3 text-canvas-light shadow-[0_14px_30px_rgba(82,88,69,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500 hover:shadow-[0_18px_36px_rgba(82,88,69,0.3)] active:translate-y-0"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xl font-light transition-transform duration-200 group-hover:rotate-90">
                +
              </span>
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-canvas-light/70">
                  Room card
                </span>
                <span className="mt-0.5 block text-sm font-semibold">Add room</span>
              </span>
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5">
        <section className="grid gap-5 rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_18px_45px_rgba(55,43,30,0.08)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
                Group details
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
                Organiser and stay window
              </h2>
            </div>
            <p className="text-sm text-oliveMuted-500">
              Shared dates default every room card. Card dates can still be overridden when needed.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-1.5">
              <label className={LABEL_CLASS} htmlFor="groupName">
                Group name
              </label>
              <input
                id="groupName"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className={FIELD_CLASS}
                placeholder="e.g. Kampala Teachers Retreat"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label className={LABEL_CLASS} htmlFor="organizerName">
                Organiser name
              </label>
              <input
                id="organizerName"
                value={organizerName}
                onChange={(event) => setOrganizerName(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-1.5">
              <label className={LABEL_CLASS} htmlFor="organizerEmail">
                Organiser email
              </label>
              <input
                id="organizerEmail"
                type="email"
                value={organizerEmail}
                onChange={(event) => setOrganizerEmail(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Required for the group booking"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label className={LABEL_CLASS} htmlFor="organizerPhone">
                Organiser phone
              </label>
              <input
                id="organizerPhone"
                value={organizerPhone}
                onChange={(event) => setOrganizerPhone(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="grid gap-1.5">
              <label className={LABEL_CLASS} htmlFor="checkIn">
                Group check-in
              </label>
              <input
                id="checkIn"
                type="date"
                value={checkIn}
                onChange={(event) => {
                  const nextCheckIn = event.target.value;
                  const nextCheckOut = checkOut <= nextCheckIn ? addDays(nextCheckIn, 1) : checkOut;
                  updateGroupDates(nextCheckIn, nextCheckOut);
                }}
                className={FIELD_CLASS}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label className={LABEL_CLASS} htmlFor="checkOut">
                Group check-out
              </label>
              <input
                id="checkOut"
                type="date"
                value={checkOut}
                min={addDays(checkIn, 1)}
                onChange={(event) => updateGroupDates(checkIn, event.target.value)}
                className={FIELD_CLASS}
                required
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className={LABEL_CLASS} htmlFor="notes">
              Group notes
            </label>
            <textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${FIELD_CLASS} min-h-[120px]`}
              placeholder="Optional group-level notes"
            />
          </div>
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
                Member rooms
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
                Add the rooms inside this group
              </h2>
            </div>
            <p className="text-sm text-oliveMuted-500">
              Room type options are grayed out when the selected stay already uses the available inventory.
            </p>
          </div>

          <div className="grid gap-4">
            {cards.map((card, index) => {
              const room = rooms.find((roomType) => roomType.slug === card.roomTypeSlug) ?? rooms[0];
              const cardNights = Math.max(1, nightsBetween(card.checkIn, card.checkOut));
              const roomAvailableCount = availableForCard(card, card.roomTypeSlug);

              return (
                <article
                  key={card.id}
                  className="grid gap-5 rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(55,43,30,0.07)] sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-oliveMuted-500">
                        Room {index + 1}
                      </p>
                      <h3 className="mt-1 font-serif text-xl font-semibold tracking-[-0.02em] text-[#2a241a]">
                        {room?.title ?? "Select a room type"}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-stoneWarm-200 bg-stoneWarm-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-oliveMuted-600">
                        {card.inheritDates ? "Using group dates" : "Custom dates"}
                      </span>
                      {cards.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCard(card.id)}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-700 transition hover:bg-red-100"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className={LABEL_CLASS} htmlFor={`roomType-${card.id}`}>
                        Room type
                      </label>
                      <select
                        id={`roomType-${card.id}`}
                        value={card.roomTypeSlug}
                        onChange={(event) => updateCard(card.id, { roomTypeSlug: event.target.value })}
                        className={FIELD_CLASS}
                        required
                      >
                        {rooms.map((roomType) => {
                          const available = availableForCard(card, roomType.slug);
                          const selected = roomType.slug === card.roomTypeSlug;
                          return (
                            <option key={roomType.slug} value={roomType.slug} disabled={!selected && available <= 0}>
                              {roomType.title} - {fmtUgx(roomType.price_ugx)}/night{" "}
                              {available <= 0 && !selected ? "(unavailable)" : `(${Math.max(0, available)} available)`}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[11px] text-oliveMuted-500">
                        Availability is checked against the shared group dates. Custom room dates are re-checked when the bundle is saved.
                      </p>
                    </div>

                    <div className="grid gap-1.5">
                      <label className={LABEL_CLASS}>Stay summary</label>
                      <div className="rounded-2xl border border-stoneWarm-200 bg-stoneWarm-100/50 px-4 py-3 text-sm text-oliveMuted-700">
                        {room ? (
                          <>
                            <span className="font-semibold text-[#2a241a]">{fmtUgx(room.price_ugx * cardNights)}</span>
                            <span className="text-oliveMuted-500">
                              {" "}
                              for {cardNights} {cardNights === 1 ? "night" : "nights"}
                            </span>
                            <span className="mx-2 text-oliveMuted-300">|</span>
                            <span>
                              {roomAvailableCount > 0 ? `${roomAvailableCount} available now` : "Unavailable now"}
                            </span>
                            {discountAmount > 0 && (
                              <>
                                <span className="mx-2 text-oliveMuted-300">|</span>
                                <span className="text-green-700">Agreed {fmtUgx(finalCardTotals[index])}</span>
                              </>
                            )}
                            {depositValue > 0 && (
                              <>
                                <span className="mx-2 text-oliveMuted-300">|</span>
                                <span className="text-oliveMuted-700">Deposit {fmtUgx(depositShares[index])}</span>
                              </>
                            )}
                          </>
                        ) : (
                          "Choose a room type"
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className={LABEL_CLASS} htmlFor={`checkIn-${card.id}`}>
                        Check-in
                      </label>
                      <input
                        id={`checkIn-${card.id}`}
                        type="date"
                        value={card.checkIn}
                        onChange={(event) => updateCard(card.id, { checkIn: event.target.value, inheritDates: false })}
                        className={FIELD_CLASS}
                        required
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label className={LABEL_CLASS} htmlFor={`checkOut-${card.id}`}>
                        Check-out
                      </label>
                      <input
                        id={`checkOut-${card.id}`}
                        type="date"
                        min={addDays(card.checkIn, 1)}
                        value={card.checkOut}
                        onChange={(event) => updateCard(card.id, { checkOut: event.target.value, inheritDates: false })}
                        className={FIELD_CLASS}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className={LABEL_CLASS} htmlFor={`adults-${card.id}`}>
                        Adults
                      </label>
                      <input
                        id={`adults-${card.id}`}
                        type="number"
                        min={1}
                        value={card.guestsAdults}
                        onChange={(event) =>
                          updateCard(card.id, { guestsAdults: Math.max(1, parseInt(event.target.value, 10) || 1) })
                        }
                        className={FIELD_CLASS}
                        required
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label className={LABEL_CLASS} htmlFor={`children-${card.id}`}>
                        Children
                      </label>
                      <input
                        id={`children-${card.id}`}
                        type="number"
                        min={0}
                        value={card.guestsChildren}
                        onChange={(event) =>
                          updateCard(card.id, { guestsChildren: Math.max(0, parseInt(event.target.value, 10) || 0) })
                        }
                        className={FIELD_CLASS}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-1.5">
                      <label className={LABEL_CLASS} htmlFor={`special-${card.id}`}>
                        Special requests
                      </label>
                      <textarea
                        id={`special-${card.id}`}
                        rows={3}
                        value={card.specialRequests}
                        onChange={(event) => updateCard(card.id, { specialRequests: event.target.value })}
                        className={`${FIELD_CLASS} min-h-[96px]`}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label className={LABEL_CLASS} htmlFor={`notes-${card.id}`}>
                        Room notes
                      </label>
                      <textarea
                        id={`notes-${card.id}`}
                        rows={3}
                        value={card.notes}
                        onChange={(event) => updateCard(card.id, { notes: event.target.value })}
                        className={`${FIELD_CLASS} min-h-[96px]`}
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  {!card.inheritDates && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <span>This room uses custom dates instead of the group default.</span>
                      <button
                        type="button"
                        onClick={() => resetCardDates(card.id)}
                        className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900 transition hover:bg-amber-100"
                      >
                        Use group dates
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <p className="text-sm text-oliveMuted-500">
              Every room card remains an independent booking. That keeps folios, receipts, and housekeeping unchanged.
            </p>
            <button
              type="button"
              onClick={addCard}
              className="rounded-full border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
            >
              Add room
            </button>
          </div>
        </section>

        <section className="grid gap-4 rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_18px_45px_rgba(55,43,30,0.08)] sm:p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">Group pricing</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
              Grand total, discount, and deposit
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-[20px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                Grand total
              </p>
              <p className="mt-2 font-serif text-2xl font-semibold text-[#2a241a]">{fmtUgx(grandTotal)}</p>
              <p className="mt-1 text-xs text-oliveMuted-500">Before any discount</p>
            </div>
            <div className="grid gap-1.5 rounded-[20px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
              <label htmlFor="groupDiscountAmount" className={LABEL_CLASS}>
                Discount
              </label>
              <UgxAmountInput
                id="groupDiscountAmount"
                value={groupDiscountAmount}
                onValueChange={setGroupDiscountAmount}
                className={FIELD_CLASS}
                placeholder="Optional"
              />
              {discountAmount > 0 ? (
                <p className="text-xs font-medium text-green-700">
                  Final group total {fmtUgx(finalGroupTotal)}
                </p>
              ) : (
                <p className="text-xs text-oliveMuted-500">Leave blank to use the grand total.</p>
              )}
            </div>
            <div className="grid gap-1.5 rounded-[20px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
              <label htmlFor="depositAmount" className={LABEL_CLASS}>
                Deposit received
              </label>
              <UgxAmountInput
                id="depositAmount"
                value={depositAmount}
                onValueChange={setDepositAmount}
                className={FIELD_CLASS}
              />
              <p className="text-xs text-oliveMuted-500">Recorded across the member bookings.</p>
            </div>
            <div className="grid gap-1.5 rounded-[20px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
              <label htmlFor="depositMethod" className={LABEL_CLASS}>
                Method
              </label>
              <select
                id="depositMethod"
                value={depositMethod}
                onChange={(event) => setDepositMethod(event.target.value)}
                className={FIELD_CLASS}
                disabled={depositValue <= 0}
              >
                <option value="cash">Cash</option>
                <option value="mpesa">Mobile Money</option>
                <option value="card">Card</option>
                <option value="transfer">Bank Transfer</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="grid gap-1.5">
              <label htmlFor="depositReference" className={LABEL_CLASS}>
                Payment reference
              </label>
              <input
                id="depositReference"
                value={depositReference}
                onChange={(event) => setDepositReference(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Receipt, mobile money ID, or note"
                disabled={depositValue <= 0}
              />
            </div>
            <div className="grid gap-1.5 rounded-[20px] border border-stoneWarm-200/70 bg-white/70 p-4">
              <p className={LABEL_CLASS}>Balance due</p>
              <p className="mt-1 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(balanceDue)}</p>
              <p className="text-xs text-oliveMuted-500">After discount and deposit.</p>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] px-5 py-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <div className="text-sm text-oliveMuted-600">
            <span className="font-semibold text-[#2a241a]">{cards.length}</span> room cards ready to create.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/front-desk"
              className="rounded-full border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isPending || grandTotal <= 0 || discountAmount > grandTotal || depositValue > finalGroupTotal}
              className="rounded-full bg-oliveMuted-600 px-5 py-2.5 text-sm font-semibold text-canvas-light shadow-[0_10px_24px_rgba(82,88,69,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Creating group..." : "Create group booking"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
