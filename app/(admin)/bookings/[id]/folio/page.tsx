import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getBookingById } from "@/lib/bookings/data";
import { getFolioData } from "@/lib/folios/data";
import { FolioClient } from "./folio-client";

export default async function FolioPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [session, booking, folio] = await Promise.all([
    requireApprovedAdminRole(),
    getBookingById(id),
    getFolioData(id)
  ]);

  if (!booking) notFound();

  return (
    <div className="grid gap-6">
      <nav className="text-sm text-oliveMuted-500">
        <Link href="/bookings" className="hover:underline">
          Bookings
        </Link>
        <span className="mx-2">›</span>
        <span className="font-mono">{booking.reference}</span>
        <span className="mx-2">›</span>
        <Link href={`/bookings/${booking.id}`} className="hover:underline">
          History
        </Link>
        <span className="mx-2">›</span>
        <span>Folio</span>
      </nav>

      <FolioClient
        booking={booking}
        initialFolio={folio}
        role={session.role}
      />
    </div>
  );
}
