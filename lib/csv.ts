const SPREADSHEET_FORMULA_PREFIX = /^[\s\u0000-\u001f\u007f]*[=+\-@]/u;

export function neutralizeSpreadsheetFormula(value: string): string {
  return SPREADSHEET_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function serializeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = neutralizeSpreadsheetFormula(raw);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCsv(
  rows: readonly (readonly unknown[])[],
  options: { lineEnding?: "\n" | "\r\n"; trailingNewline?: boolean } = {}
): string {
  const lineEnding = options.lineEnding ?? "\r\n";
  const csv = rows.map((row) => row.map(serializeCsvCell).join(",")).join(lineEnding);
  return options.trailingNewline && csv ? `${csv}${lineEnding}` : csv;
}
type CsvStreamOptions = {
  columns: readonly string[];
  rowCount: number;
  pageSize: number;
  loadPage: (offset: number, limit: number) => Promise<readonly (readonly unknown[])[]>;
};

export function createCsvStream({
  columns,
  rowCount,
  pageSize,
  loadPage
}: CsvStreamOptions): ReadableStream<Uint8Array> {
  if (!Number.isInteger(rowCount) || rowCount < 0) throw new Error("rowCount must be non-negative");
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("pageSize must be positive");

  const encoder = new TextEncoder();
  let offset = 0;
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`\uFEFF${serializeCsv([columns], { trailingNewline: true })}`)
      );
      if (rowCount === 0) {
        closed = true;
        controller.close();
      }
    },
    async pull(controller) {
      if (closed) return;

      try {
        const remaining = rowCount - offset;
        const rows = await loadPage(offset, Math.min(pageSize, remaining));
        if (rows.length === 0) {
          closed = true;
          controller.close();
          return;
        }

        const page = rows.slice(0, remaining);
        controller.enqueue(encoder.encode(serializeCsv(page, { trailingNewline: true })));
        offset += page.length;
        if (offset >= rowCount) {
          closed = true;
          controller.close();
        }
      } catch (error) {
        closed = true;
        controller.error(error);
      }
    },
    cancel() {
      closed = true;
    }
  });
}
