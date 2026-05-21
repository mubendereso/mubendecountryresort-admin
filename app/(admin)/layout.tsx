import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AdminAuthorizationError,
  requireApprovedAdminRole
} from "@/lib/auth/admin-role";
import { buildLoginRedirect } from "@/lib/auth/utils";
import { signOutAction } from "@/lib/auth/actions";
import { AdminPushAutoEnrollment } from "@/components/pwa/admin-push-auto-enrollment";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof requireApprovedAdminRole>>;

  try {
    session = await requireApprovedAdminRole();
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      if (error.status === 401) {
        redirect(buildLoginRedirect("/dashboard", "Please sign in to continue."));
      }

      redirect(buildLoginRedirect(null, error.message));
    }

    throw error;
  }

  return (
    <div className="min-h-screen bg-canvas-light text-[#2a241a]">
      <header className="border-b border-stoneWarm-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">
                Mubende Country Resort
              </p>
              <p className="mt-1 text-sm font-semibold">Admin</p>
            </div>
            <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-oliveMuted-600">
              <Link className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100" href="/dashboard">
                Dashboard
              </Link>
              <Link
                className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100"
                href="/front-desk"
              >
                Front Desk
              </Link>
              <Link className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100" href="/bookings">
                Bookings
              </Link>
              <Link className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100" href="/guests">
                Guests
              </Link>
              <Link
                className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100"
                href="/housekeeping"
              >
                Housekeeping
              </Link>
              <Link className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100" href="/calendar">
                Calendar
              </Link>
              <Link className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100" href="/rooms">
                Rooms
              </Link>
              <Link
                className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100"
                href="/availability"
              >
                Availability
              </Link>
              <Link
                className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100"
                href="/inbox"
              >
                Inbox
              </Link>
              {session.role !== "staff" && (
                <Link
                  className="rounded-xl px-3 py-1.5 transition hover:bg-stoneWarm-100"
                  href="/users"
                >
                  Users
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-oliveMuted-600">
              {session.email ?? "Signed in"}{" "}
              <span className="ml-1 rounded-full bg-stoneWarm-100 px-2 py-0.5 text-[11px] uppercase tracking-wider text-oliveMuted-600">
                {session.role}
              </span>
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-2xl border border-stoneWarm-200 px-3 py-1.5 text-sm font-medium text-oliveMuted-600 transition hover:bg-stoneWarm-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <AdminPushAutoEnrollment />
    </div>
  );
}
