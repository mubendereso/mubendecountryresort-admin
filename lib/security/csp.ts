type CspOptions = {
  isDevelopment?: boolean;
  r2PublicHostname?: string;
};

function toHttpsSource(hostname: string | undefined): string | null {
  const normalized = hostname?.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::\d{1,5})?$/.test(normalized)) {
    return null;
  }
  return `https://${normalized}`;
}

export function buildAdminContentSecurityPolicy({
  isDevelopment = false,
  r2PublicHostname
}: CspOptions = {}): string {
  const customR2Source = toHttpsSource(r2PublicHostname);
  const imageSources = ["'self'", "data:", "blob:", "https://*.r2.dev"];
  if (customR2Source && !imageSources.includes(customR2Source)) imageSources.push(customR2Source);

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ];

  if (!isDevelopment) directives.push("upgrade-insecure-requests");
  return `${directives.join("; ")};`;
}
