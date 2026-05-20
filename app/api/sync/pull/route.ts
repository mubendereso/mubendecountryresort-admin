import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminAuthorizationError,
  assertSameOriginRequest,
  requireApprovedAdminRole
} from "@/lib/auth/admin-role";
import { getSql } from "@/lib/db/client";
import { PULL_BATCH_LIMIT, type PullResponse, type SyncChange } from "@/lib/sync/protocol";

const pullSchema = z.object({
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().positive().max(PULL_BATCH_LIMIT).optional()
});

type ChangeRow = {
  seq: number | bigint | string;
  table_name: string;
  row_id: string;
  op: SyncChange["op"];
  row_data: Record<string, unknown> | null;
};

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request);
    // Any approved admin can pull; row-level visibility filtering can be added
    // per-table later if some surfaces become role-restricted.
    await requireApprovedAdminRole();

    const parsed = pullSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid pull request." }, { status: 400 });
    }

    const cursor = parsed.data.cursor;
    const limit = parsed.data.limit ?? PULL_BATCH_LIMIT;
    const sql = getSql();

    // Fetch one extra row to detect whether more changes exist beyond this
    // batch without a separate count query.
    const rows = (await sql`
      select seq, table_name, row_id, op, row_data
      from sync_changes
      where seq > ${cursor}
      order by seq
      limit ${limit + 1}
    `) as ChangeRow[];

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const changes: SyncChange[] = slice.map((r) => ({
      seq: Number(r.seq),
      table: r.table_name,
      rowId: r.row_id,
      op: r.op,
      row: r.row_data
    }));

    const newCursor = changes.length > 0 ? changes[changes.length - 1].seq : cursor;

    const body: PullResponse = { changes, cursor: newCursor, hasMore };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof AdminAuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Sync pull failed." }, { status: 500 });
  }
}
