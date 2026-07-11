import assert from "node:assert/strict";
import test from "node:test";
import {
  readRequestBodyWithinLimit,
  RequestBodyTooLargeError
} from "../lib/http/limited-body.ts";

function chunkedRequest(chunks, headers = {}) {
  return new Request("https://example.test/api/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    duplex: "half",
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      }
    })
  });
}

test("reads a chunked body under the limit", async () => {
  const body = await readRequestBodyWithinLimit(
    chunkedRequest(['{"mutations":', "[]}" ]),
    64
  );

  assert.equal(body, '{"mutations":[]}');
});

test("rejects a chunked body that exceeds the limit", async () => {
  await assert.rejects(
    readRequestBodyWithinLimit(chunkedRequest(["1234", "5678", "90"]), 8),
    RequestBodyTooLargeError
  );
});

test("rejects a declared oversized body before reading it", async () => {
  let pulled = false;
  const request = {
    headers: new Headers({ "content-length": "100" }),
    body: {
      getReader() {
        pulled = true;
        throw new Error("body should not be read");
      }
    }
  };

  await assert.rejects(readRequestBodyWithinLimit(request, 10), RequestBodyTooLargeError);
  assert.equal(pulled, false);
});

test("still enforces the streamed limit when Content-Length is invalid", async () => {
  await assert.rejects(
    readRequestBodyWithinLimit(chunkedRequest(["12345", "67890"], { "content-length": "unknown" }), 8),
    RequestBodyTooLargeError
  );
});
