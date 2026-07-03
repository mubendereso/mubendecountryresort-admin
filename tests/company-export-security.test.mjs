import assert from "node:assert/strict";
import test from "node:test";
import { createCsvStream } from "../lib/csv.ts";
import {
  COMPANY_EXPORT_MAX_RANGE_DAYS,
  parseCompanyExportDataset,
  parseCompanyExportDateRange
} from "../lib/companies/export-policy.ts";

test("requires a valid bounded company export date range", () => {
  assert.deepEqual(
    parseCompanyExportDateRange(new URLSearchParams("from=2026-01-01&to=2026-01-31")),
    { ok: true, from: "2026-01-01", to: "2026-01-31", days: 31 }
  );
  assert.equal(parseCompanyExportDateRange(new URLSearchParams()).ok, false);
  assert.equal(
    parseCompanyExportDateRange(new URLSearchParams("from=2026-02-30&to=2026-03-01")).ok,
    false
  );
  assert.equal(
    parseCompanyExportDateRange(new URLSearchParams("from=2026-03-02&to=2026-03-01")).ok,
    false
  );
  const tooWide = parseCompanyExportDateRange(
    new URLSearchParams("from=2025-01-01&to=2026-01-02")
  );
  assert.equal(tooWide.ok, false);
  assert.match(tooWide.error, new RegExp(String(COMPANY_EXPORT_MAX_RANGE_DAYS)));
});

test("accepts only known company export datasets", () => {
  assert.equal(parseCompanyExportDataset("invoices"), "invoices");
  assert.equal(parseCompanyExportDataset("allocations"), "allocations");
  assert.equal(parseCompanyExportDataset("unknown"), null);
  assert.equal(parseCompanyExportDataset(null), null);
});

test("streams bounded CSV pages without losing formula neutralization", async () => {
  const source = Array.from({ length: 1_201 }, (_, index) => [
    index,
    index === 0 ? "=SUM(A1:A2)" : `row-${index}`
  ]);
  const calls = [];
  const stream = createCsvStream({
    columns: ["id", "label"],
    rowCount: source.length,
    pageSize: 500,
    async loadPage(offset, limit) {
      calls.push({ offset, limit });
      return source.slice(offset, offset + limit);
    }
  });

  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(bytes);
  assert.equal(csv.startsWith("id,label\r\n0,'=SUM(A1:A2)\r\n"), true);
  assert.equal(csv.endsWith("1200,row-1200\r\n"), true);
  assert.deepEqual(calls, [
    { offset: 0, limit: 500 },
    { offset: 500, limit: 500 },
    { offset: 1_000, limit: 201 }
  ]);
});

test("emits a header-only CSV without calling the loader", async () => {
  let loads = 0;
  const stream = createCsvStream({
    columns: ["id"],
    rowCount: 0,
    pageSize: 500,
    async loadPage() {
      loads += 1;
      return [];
    }
  });

  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
  assert.equal(new TextDecoder().decode(bytes), "id\r\n");
  assert.equal(loads, 0);
});
