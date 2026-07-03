import assert from "node:assert/strict";
import test from "node:test";
import {
  neutralizeSpreadsheetFormula,
  serializeCsv,
  serializeCsvCell
} from "../lib/csv.ts";

test("neutralizes spreadsheet formulas including whitespace and control prefixes", () => {
  for (const value of [
    "=1+1",
    "+SUM(A1:A2)",
    "-2+3",
    "@SUM(A1:A2)",
    " =1+1",
    "\t+1+1",
    "\r-1+1",
    "\u0000@SUM(A1:A2)",
    "\u00a0=1+1"
  ]) {
    assert.equal(neutralizeSpreadsheetFormula(value), `'${value}`);
    const cell = serializeCsvCell(value);
    assert.equal(cell.charCodeAt(0) === 39 || (cell.charCodeAt(0) === 34 && cell.charCodeAt(1) === 39), true);
  }
});

test("preserves ordinary values and applies standard CSV quoting", () => {
  assert.equal(serializeCsvCell(null), "");
  assert.equal(serializeCsvCell(125000), "125000");
  assert.equal(serializeCsvCell("2026-07-02"), "2026-07-02");
  assert.equal(serializeCsvCell("Room - Deluxe"), "Room - Deluxe");
  assert.equal(serializeCsvCell("Smith, Jane"), '"Smith, Jane"');
  assert.equal(serializeCsvCell('She said "hello"'), '"She said ""hello"""');
  assert.equal(serializeCsvCell("line one\nline two"), '"line one\nline two"');
});

test("serializes rows with configured line endings and trailing newline", () => {
  assert.equal(
    serializeCsv(
      [
        ["name", "note"],
        ["=malicious", "safe"]
      ],
      { trailingNewline: true }
    ),
    "name,note\r\n'=malicious,safe\r\n"
  );
  assert.equal(serializeCsv([["a"], ["b"]], { lineEnding: "\n" }), "a\nb");
});
