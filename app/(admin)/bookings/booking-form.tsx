"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { createStaffBookingAction, modifyBookingAction } from "@/lib/bookings/actions";

export type RoomOption = { slug: string; title: string; priceUgx: number };

export type BookingFormInitial = {
  roomSlug: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  fullName: string;
  phone: string;
  email: string;
  specialRequests: string;
  notes: string;
};

export type BookingFormGroup = {
  id: string;
  reference: string;
  groupName: string;
  status?: "active" | "archived" | "closed";
  companyAccountId?: string | null;
  companyName?: string | null;
};

export type BookingCompanyOption = {
  id: string;
  companyName: string;
  isActive: boolean;
  isSuspended: boolean;
  creditStatus: "clear" | "warning" | "over_limit" | "overdue" | "suspended";
  availableCreditUgx: number;
  overdueInvoicesUgx: number;
};

export type BookingCorporateRate = {
  id: string;
  companyAccountId: string;
  roomTypeSlug: string;
  rateUgx: number;
  validFrom: string;
  validTo: string | null;
};

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut || checkIn >= checkOut) return 0;
  const a = new Date(checkIn + "T00:00:00Z");
  const b = new Date(checkOut + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const FIELD_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

export function BookingForm({
  mode,
  rooms,
  bookingId,
  status,
  initial,
  group,
  companies = [],
  corporateRates = [],
  role = "staff"
}: {
  mode: "create" | "edit";
  rooms: RoomOption[];
  bookingId?: string;
  status?: "confirmed" | "checked_in";
  initial?: BookingFormInitial;
  group?: BookingFormGroup | null;
  companies?: BookingCompanyOption[];
  corporateRates?: BookingCorporateRate[];
  role?: "staff" | "admin" | "superadmin";
}) {
  const router = useRouter();
  const today = todayISO();
  const isEdit = mode === "edit";
  const isCheckedIn = status === "checked_in";

  const [roomSlug, setRoomSlug] = useState(initial?.roomSlug ?? rooms[0]?.slug ?? "");
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? today);
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? addDays(today, 1));
  const [adults, setAdults] = useState(initial?.adults ?? 1);
  const [children, setChildren] = useState(initial?.children ?? 0);
  const [agreedRoomPrice, setAgreedRoomPrice] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [companyId, setCompanyId] = useState(group?.companyAccountId ?? "");
  const [applyCorporateRate, setApplyCorporateRate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.slug === roomSlug) ?? null,
    [rooms, roomSlug]
  );
  const nights = nightsBetween(checkIn, checkOut);
  const total = selectedRoom ? selectedRoom.priceUgx * nights : 0;
  const lastNight = checkOut ? addDays(checkOut, -1) : checkOut;
  const selectedCompany = companies.find((company) => company.id === companyId) ?? null;
  const corporateRate = corporateRates.find((rate) =>
    rate.companyAccountId === companyId &&
    rate.roomTypeSlug === roomSlug &&
    rate.validFrom <= checkIn &&
    (!rate.validTo || rate.validTo >= lastNight)
  ) ?? null;
  const corporateTotal = corporateRate ? Math.min(total, corporateRate.rateUgx * nights) : 0;
  const finalRoomPrice = agreedRoomPrice > 0 ? agreedRoomPrice : total;
  const discountAmount = Math.max(0, total - finalRoomPrice);
  const discountPercent = total > 0 ? (discountAmount / total) * 100 : 0;
  const invalidAgreedPrice = agreedRoomPrice > total;
  const balanceDue = Math.max(0, finalRoomPrice - depositAmount);
  const projectedCompanyBalance = Math.max(0, finalRoomPrice - depositAmount);
  const needsCreditOverride = Boolean(
    selectedCompany &&
    (selectedCompany.creditStatus === "overdue" ||
      selectedCompany.creditStatus === "over_limit" ||
      projectedCompanyBalance > selectedCompany.availableCreditUgx)
  );

  useEffect(() => {
    if (!isEdit && applyCorporateRate && corporateRate && nights > 0) {
      setAgreedRoomPrice(corporateTotal);
    } else if (!isEdit && !companyId) {
      setAgreedRoomPrice(0);
    }
  }, [applyCorporateRate, companyId, corporateRate, corporateTotal, isEdit, nights]);

  // A checked-in guest may keep a past check-in date; otherwise no past dates.
  const checkInMin = isCheckedIn ? undefined : today;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEdit
        ? await modifyBookingAction(formData)
        : await createStaffBookingAction(formData);
      if (result.ok) {
        router.push(`/bookings/${result.bookingId}/folio`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (rooms.length === 0) {
    return (
      <section className="grid gap-6">
        <h1 className="text-3xl font-semibold">{isEdit ? "Edit Booking" : "New Booking"}</h1>
        <div className="surface-card px-5 py-6 text-sm text-oliveMuted-600">
          No published room types are available. Publish a room first.
        </div>
      </section>
    );
  }

  return (
    <section className="grid max-w-3xl gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{isEdit ? "Edit Booking" : "New Booking"}</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">
            {isEdit
              ? "Update room, dates, guest count, or contact details."
              : "Create a walk-in or phone reservation, record any deposit, and send the balance to the folio."}
          </p>
        </div>
        <Link
          href={
            isEdit && bookingId
              ? `/bookings/${bookingId}/folio`
              : group
                ? `/groups/${group.id}`
                : "/front-desk"
          }
          className="rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          Cancel
        </Link>
      </header>

      {!isEdit && group && (
        <div className="rounded-2xl border border-oliveMuted-200 bg-oliveMuted-50 px-4 py-3 text-sm text-oliveMuted-700">
          This booking will be added to <span className="font-semibold">{group.groupName}</span>{" "}
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-oliveMuted-500">
            ({group.reference})
          </span>
          .
        </div>
      )}

      {!isEdit && group?.status && group.status !== "active" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This group is {group.status}. You can still add a booking from this direct link, but it stays hidden from the normal group list.
        </div>
      )}

      {isCheckedIn && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This guest is checked in. Changing the room or dates will update the
          accommodation charge already posted to the folio.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5">
        {isEdit && bookingId && <input type="hidden" name="bookingId" value={bookingId} />}
        {!isEdit && group && <input type="hidden" name="groupId" value={group.id} />}

        {/* Room + dates */}
        <div className="surface-card grid gap-4 p-5">
          <div className="grid gap-1.5">
            <label htmlFor="roomTypeSlug" className={LABEL_CLASS}>Room Type</label>
            <select
              id="roomTypeSlug"
              name="roomTypeSlug"
              value={roomSlug}
              onChange={(e) => setRoomSlug(e.target.value)}
              className={FIELD_CLASS}
              required
            >
              {rooms.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.title} — {fmtUgx(r.priceUgx)}/night
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="checkIn" className={LABEL_CLASS}>Check-in</label>
              <input
                id="checkIn"
                name="checkIn"
                type="date"
                value={checkIn}
                min={checkInMin}
                onChange={(e) => {
                  const v = e.target.value;
                  setCheckIn(v);
                  if (v >= checkOut) setCheckOut(addDays(v, 1));
                }}
                className={FIELD_CLASS}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="checkOut" className={LABEL_CLASS}>Check-out</label>
              <input
                id="checkOut"
                name="checkOut"
                type="date"
                value={checkOut}
                min={addDays(checkIn, 1)}
                onChange={(e) => setCheckOut(e.target.value)}
                className={FIELD_CLASS}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="guestsAdults" className={LABEL_CLASS}>Adults</label>
              <input
                id="guestsAdults"
                name="guestsAdults"
                type="number"
                min={1}
                value={adults}
                onChange={(e) => setAdults(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={FIELD_CLASS}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="guestsChildren" className={LABEL_CLASS}>Children</label>
              <input
                id="guestsChildren"
                name="guestsChildren"
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className={FIELD_CLASS}
              />
            </div>
          </div>
        </div>

        {/* Guest details */}
        <div className="surface-card grid gap-4 p-5">
          <div className="grid gap-1.5">
            <label htmlFor="guestFullName" className={LABEL_CLASS}>Guest Full Name</label>
            <input
              id="guestFullName"
              name="guestFullName"
              type="text"
              autoComplete="off"
              defaultValue={initial?.fullName ?? ""}
              className={FIELD_CLASS}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="guestPhone" className={LABEL_CLASS}>Phone (required)</label>
              <input
                id="guestPhone"
                name="guestPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                defaultValue={initial?.phone ?? ""}
                className={FIELD_CLASS}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="guestEmail" className={LABEL_CLASS}>Email (optional)</label>
              <input
                id="guestEmail"
                name="guestEmail"
                type="email"
                autoComplete="off"
                defaultValue={initial?.email ?? ""}
                className={FIELD_CLASS}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="specialRequests" className={LABEL_CLASS}>Special Requests</label>
            <textarea
              id="specialRequests"
              name="specialRequests"
              rows={2}
              defaultValue={initial?.specialRequests ?? ""}
              className={FIELD_CLASS}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="notes" className={LABEL_CLASS}>Internal Notes</label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={initial?.notes ?? ""}
              className={FIELD_CLASS}
            />
          </div>
        </div>

        {!isEdit && (
          <div className="surface-card grid gap-4 p-5">
            <div>
              <p className={LABEL_CLASS}>Billing party</p>
              <p className="mt-1 text-sm text-oliveMuted-600">
                Choose guest-paid or a direct company payer. Group bookings inherit the payer from their group.
              </p>
            </div>
            {group ? (
              <div className="rounded-2xl border border-stoneWarm-200 bg-stoneWarm-50 px-4 py-3 text-sm text-oliveMuted-700">
                {group.companyAccountId
                  ? `Company payer inherited from group: ${group.companyName ?? "Company account"}.`
                  : "This group has no company payer; the booking remains guest/group paid."}
                {group.companyAccountId && <input type="hidden" name="companyId" value="" />}
              </div>
            ) : (
              <div className="grid gap-1.5">
                <label htmlFor="companyId" className={LABEL_CLASS}>Company payer</label>
                <select id="companyId" name="companyId" value={companyId} onChange={(event) => setCompanyId(event.target.value)} className={FIELD_CLASS}>
                  <option value="">Guest paid</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id} disabled={!company.isActive || company.isSuspended}>
                      {company.companyName}{!company.isActive ? " (inactive)" : company.isSuspended ? " (suspended)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {companyId && corporateRate && (
              <label className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <input type="checkbox" checked={applyCorporateRate} onChange={(event) => setApplyCorporateRate(event.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>
                  Apply negotiated rate of {fmtUgx(corporateRate.rateUgx)} per night. Final corporate stay rate: {fmtUgx(corporateTotal)}.
                </span>
              </label>
            )}
            {applyCorporateRate && corporateRate && <input type="hidden" name="applyCorporateRate" value="true" />}

            {selectedCompany && selectedCompany.creditStatus !== "clear" && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Credit status: <span className="font-semibold">{selectedCompany.creditStatus.replace("_", " ")}</span>. Available credit {fmtUgx(selectedCompany.availableCreditUgx)}
                {selectedCompany.overdueInvoicesUgx > 0 ? `; overdue ${fmtUgx(selectedCompany.overdueInvoicesUgx)}` : ""}.
              </div>
            )}
            {needsCreditOverride && role !== "staff" && (
              <div className="grid gap-1.5">
                <label htmlFor="creditOverrideReason" className={LABEL_CLASS}>Credit override reason</label>
                <textarea id="creditOverrideReason" name="creditOverrideReason" rows={2} minLength={5} maxLength={500} required className={FIELD_CLASS} />
              </div>
            )}
            {needsCreditOverride && role === "staff" && (
              <p className="text-sm font-medium text-red-700">An admin or superadmin must approve this company-billed booking.</p>
            )}
          </div>
        )}

        {!isEdit && (
          <div className="surface-card grid gap-4 p-5">
            <div>
              <p className={LABEL_CLASS}>Agreed Room Price</p>
              <p className="mt-1 text-sm text-oliveMuted-600">
                Optional. Enter the final room price agreed with the guest. The folio keeps the
                standard charge and posts the difference as a discount.
              </p>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="agreedRoomPriceUgx" className={LABEL_CLASS}>
                Final Room Price (UGX)
              </label>
              <UgxAmountInput
                id="agreedRoomPriceUgx"
                name="agreedRoomPriceUgx"
                value={agreedRoomPrice}
                onValueChange={setAgreedRoomPrice}
                placeholder={`Standard price ${new Intl.NumberFormat("en-UG").format(total)}`}
                className={FIELD_CLASS}
              />
              {invalidAgreedPrice ? (
                <p className="text-xs font-medium text-red-600">
                  Final room price cannot exceed the standard total.
                </p>
              ) : discountAmount > 0 ? (
                <p className="text-xs font-medium text-green-700">
                  Discount {fmtUgx(discountAmount)} ({discountPercent.toFixed(1)}%)
                </p>
              ) : (
                <p className="text-xs text-oliveMuted-500">
                  Leave blank to use the standard total of {fmtUgx(total)}.
                </p>
              )}
            </div>
          </div>
        )}

        {!isEdit && (
          <div className="surface-card grid gap-4 p-5">
            <div>
              <p className={LABEL_CLASS}>Deposit Received</p>
              <p className="mt-1 text-sm text-oliveMuted-600">
                Optional. The room total is posted to Total Charges; when entered, this payment is recorded in Total Paid and reduces Balance Due.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="depositAmountUgx" className={LABEL_CLASS}>Amount (UGX)</label>
                <UgxAmountInput
                  id="depositAmountUgx"
                  name="depositAmountUgx"
                  value={depositAmount}
                  onValueChange={setDepositAmount}
                  className={FIELD_CLASS}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="depositMethod" className={LABEL_CLASS}>Method</label>
                <select
                  id="depositMethod"
                  name="depositMethod"
                  className={FIELD_CLASS}
                  disabled={depositAmount <= 0}
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">Mobile Money</option>
                  <option value="card">Card</option>
                  <option value="transfer">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="depositReference" className={LABEL_CLASS}>Payment Reference</label>
              <input
                id="depositReference"
                name="depositReference"
                type="text"
                autoComplete="off"
                placeholder="Receipt, mobile money ID, or note"
                className={FIELD_CLASS}
                disabled={depositAmount <= 0}
              />
            </div>
            {depositAmount > finalRoomPrice && (
              <p className="text-xs font-medium text-red-600">
                Deposit cannot exceed the final room price of {fmtUgx(finalRoomPrice)}.
              </p>
            )}
          </div>
        )}

        {/* Quote + submit */}
        <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className={LABEL_CLASS}>Total</p>
            <p className="mt-1 text-2xl font-semibold">{fmtUgx(finalRoomPrice)}</p>
            <p className="text-xs text-oliveMuted-500">
              {nights} {nights === 1 ? "night" : "nights"}
              {selectedRoom ? ` × ${fmtUgx(selectedRoom.priceUgx)}` : ""}
            </p>
            {!isEdit && discountAmount > 0 && (
              <p className="mt-2 text-sm font-semibold text-green-700">
                Standard {fmtUgx(total)} - discount {fmtUgx(discountAmount)}
              </p>
            )}
            {!isEdit && depositAmount > 0 && (
              <p className="mt-2 text-sm font-semibold text-oliveMuted-700">
                Deposit {fmtUgx(depositAmount)} - balance {fmtUgx(balanceDue)}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending || nights <= 0 || invalidAgreedPrice || depositAmount > finalRoomPrice}
            className="rounded-2xl bg-oliveMuted-600 px-6 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:opacity-50"
          >
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Booking"}
          </button>
        </div>
      </form>
    </section>
  );
}
