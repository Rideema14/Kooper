const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",           // Next.js inline bootstrap scripts
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const headers = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers }, { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }]; },
};
export default nextConfig;
