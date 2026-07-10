import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminContentSecurityPolicy } from "../lib/security/csp.ts";

function directive(policy, name) {
  return policy.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name} `)) ?? "";
}

test("admin production CSP defaults to same-origin and blocks unsafe embedding", () => {
  const policy = buildAdminContentSecurityPolicy();

  assert.equal(directive(policy, "default-src"), "default-src 'self'");
  assert.equal(directive(policy, "frame-src"), "frame-src 'none'");
  assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors 'none'");
  assert.equal(directive(policy, "object-src"), "object-src 'none'");
  assert.equal(directive(policy, "base-uri"), "base-uri 'self'");
  assert.equal(directive(policy, "form-action"), "form-action 'self'");
  assert.match(policy, /(?:^|; )upgrade-insecure-requests;/);
  assert.doesNotMatch(policy, /[\r\n]/);
});

test("admin CSP permits required local SQLite workers and WebAssembly only", () => {
  const policy = buildAdminContentSecurityPolicy();
  const scripts = directive(policy, "script-src");

  assert.match(scripts, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(scripts, /(?:^| )'unsafe-eval'(?: |$)/);
  assert.equal(directive(policy, "worker-src"), "worker-src 'self' blob:");
  assert.equal(directive(policy, "connect-src"), "connect-src 'self'");
});

test("admin development CSP permits Next hot reload without weakening production", () => {
  const policy = buildAdminContentSecurityPolicy({ isDevelopment: true });

  assert.match(directive(policy, "script-src"), /(?:^| )'unsafe-eval'(?: |$)/);
  assert.equal(directive(policy, "connect-src"), "connect-src 'self' ws: wss:");
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("admin CSP allows only a syntactically safe custom R2 image hostname", () => {
  const valid = buildAdminContentSecurityPolicy({ r2PublicHostname: "media.example.com" });
  const injected = buildAdminContentSecurityPolicy({
    r2PublicHostname: "media.example.com; script-src https://evil.example"
  });

  assert.match(directive(valid, "img-src"), /https:\/\/media\.example\.com/);
  assert.doesNotMatch(injected, /evil\.example/);
});
