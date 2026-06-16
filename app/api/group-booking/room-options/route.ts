import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminAuthorizationError,
  assertSameOriginRequest,
  requireApprovedAdminRole
} from "@/lib/auth/admin-role";
import { getGroupBookingRoomOptions } from "@/lib/rooms/data";

const querySchema = z.object({
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export async function GET(request: NextRequest) {
  try {
    assertSameOriginRequest(request);
    await requireApprovedAdminRole();

    const parsed = querySchema.safeParse({
      checkIn: request.nextUrl.searchParams.get("checkIn") ?? "",
      checkOut: request.nextUrl.searchParams.get("checkOut") ?? ""
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
    }

    if (parsed.data.checkOut <= parsed.data.checkIn) {
      return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });
    }

    const rooms = await getGroupBookingRoomOptions(parsed.data.checkIn, parsed.data.checkOut);
    return NextResponse.json({ rooms });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Room options lookup failed." }, { status: 500 });
  }
}
