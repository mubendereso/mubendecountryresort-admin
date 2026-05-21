import { NextResponse } from "next/server";
import { processAdminPushDispatchQueue } from "@/lib/push/admin-booking-notifications";
import { AdminAuthorizationError, requireApprovedAdminRole } from "@/lib/auth/admin-role";

export async function POST(request: Request) {
  try {
    await requireApprovedAdminRole();
    const processed = await processAdminPushDispatchQueue(5);
    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process push queue.";
    const status = error instanceof AdminAuthorizationError ? error.status : 500;
    return NextResponse.json({ message }, { status });
  }
}
