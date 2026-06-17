import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { RoomCreateForm } from "./room-create-form";

export default async function NewRoomPage() {
  const session = await requireApprovedAdminRole();
  if (session.role === "staff") redirect("/rooms");

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/rooms" className="text-sm font-semibold text-oliveMuted-600 hover:underline">
            Back to rooms
          </Link>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-oliveMuted-500">
            New hospitality product
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[#2a241a]">Add Room Type</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">
            Create the room and upload its photos in the same form.
          </p>
        </div>
      </header>

      <RoomCreateForm />
    </section>
  );
}
