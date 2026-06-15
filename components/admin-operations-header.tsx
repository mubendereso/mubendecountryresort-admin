"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";

type AdminRole = "staff" | "admin" | "superadmin";

const primaryNavigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/front-desk", label: "Front Desk" },
  { href: "/bookings", label: "Bookings" },
  { href: "/night-audit", label: "Night Audit" },
  { href: "/guests", label: "Guests" },
  { href: "/housekeeping", label: "Housekeeping" },
  { href: "/calendar", label: "Calendar" },
  { href: "/rooms", label: "Rooms" },
  { href: "/availability", label: "Availability" },
  { href: "/inbox", label: "Inbox" }
];

const managementNavigation = [
  { href: "/reports", label: "Reports" },
  { href: "/users", label: "Users" }
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  active
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "whitespace-nowrap rounded-full bg-oliveMuted-600 px-4 py-2 text-xs font-semibold text-canvas-light shadow-[0_8px_20px_rgba(82,88,69,0.22)]"
          : "whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold text-oliveMuted-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-stoneWarm-100 hover:text-oliveMuted-600"
      }
    >
      {label}
    </Link>
  );
}

export function AdminOperationsHeader({
  email,
  role
}: {
  email: string | null;
  role: AdminRole;
}) {
  const pathname = usePathname();
  const navigation =
    role === "staff" ? primaryNavigation : [...primaryNavigation, ...managementNavigation];

  return (
    <header className="print:hidden sticky top-0 z-50 border-b border-stoneWarm-200/80 bg-[#f8f4ec]/90 shadow-[0_12px_35px_rgba(55,43,30,0.08)] backdrop-blur-xl">
      <div className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[76px] items-center justify-between gap-6 border-b border-stoneWarm-200/70">
          <Link href="/front-desk" className="group flex min-w-0 items-center gap-3">
            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-stoneWarm-200 bg-white shadow-[0_8px_22px_rgba(55,43,30,0.08)] transition-transform duration-200 group-hover:-translate-y-0.5">
              <Image
                src="/icons/mcr-official-logo.png"
                alt=""
                fill
                sizes="44px"
                className="object-contain"
                priority
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-serif text-lg font-semibold tracking-[-0.01em] text-[#2a241a]">
                Mubende Country Resort
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.24em] text-oliveMuted-500">
                Hospitality Operations
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-52 truncate text-xs font-semibold text-[#2a241a]">
                {email ?? "Signed in"}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-bronze-500">
                {role}
              </p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-stoneWarm-200 bg-stoneWarm-100 text-xs font-bold uppercase text-oliveMuted-600">
              {(email?.charAt(0) ?? "M").toUpperCase()}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-full border border-stoneWarm-200 bg-[#fffdf8]/80 px-4 py-2 text-xs font-semibold text-oliveMuted-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-stoneWarm-300 hover:bg-white hover:shadow-sm"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav
          aria-label="Admin navigation"
          className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {navigation.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActivePath(pathname, item.href)}
            />
          ))}
        </nav>
      </div>
    </header>
  );
}
