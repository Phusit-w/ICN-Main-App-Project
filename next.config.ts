import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SOC uploads allow one 25 MB DOCX plus up to ten 25 MB PDFs. Proxy
  // inspects the authenticated request before the route handler, so its
  // body limit must be large enough for the same validated payload.
  experimental: { proxyClientMaxBodySize: "300mb" },

  // Optional isolated build directory for CI/verification while a staged
  // standalone server is running and holding `.next/standalone` open.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Allow the current ngrok development URL to load Next.js dev assets and
  // endpoints. Keep this scoped to the assigned hostname rather than all
  // ngrok domains.
  allowedDevOrigins: ["jokingly-gills-antler.ngrok-free.dev"],

  // Produces a self-contained `.next/standalone` build (minimal node_modules
  // traced in) so the Docker image doesn't need to `npm install` at runtime.
  output: "standalone",

  // MuPDF (SOC evidence page renders) is ESM with top-level await and loads
  // its .wasm next to itself, so it is required from node_modules as is.
  serverExternalPackages: ["mupdf"],

  // The SOC Runner install script (lib/soc-runner-install.ts) hands out the
  // runner's own files, read from soc-runner/ at run time.
  outputFileTracingIncludes: {
    "/api/soc-runner/install/*": ["./soc-runner/{runner,claude_cli,server_client,install}.py", "./soc-runner/requirements.txt", "./soc-runner/bootstrap.ps1"],
  },

  // Serve images as-is, no on-the-fly optimization. The standalone server
  // has no `sharp`, so next/image's optimizer 500s on every logo request and
  // spams service-err.log (the logo renders broken). These are two tiny
  // static PNGs that never need resizing — unoptimized is the right call and
  // it also means /_next/image isn't hit, so the proxy.ts matcher doesn't
  // need to care about it. Files are requested at their public path
  // (/icn-logo.png etc.), which proxy.ts already allow-lists.
  images: { unoptimized: true },

  // Baseline security headers on every response. This app is entirely
  // first-party (no third-party scripts, fonts, or embeds anywhere), so a
  // plain same-origin CSP is enough without needing per-request nonce
  // plumbing through every Server Component. 'unsafe-inline' is kept on
  // style-src (this app styles almost everything via inline `style` props)
  // and script-src (Next's own hydration bootstrap injects inline
  // scripts) — a nonce-based CSP would tighten this further but is a
  // separate, more invasive change.
  async headers() {
    // 'unsafe-eval' is added to script-src ONLY in development — Next's
    // Fast Refresh/HMR runtime calls eval() internally to re-execute
    // changed modules on every save, and a strict CSP blocking that
    // doesn't just log a warning: it throws on every reload, which leaves
    // the page half-hydrated and breaks client-side interactivity
    // entirely under the stricter policy (confirmed — every onClick
    // handler in the app, e.g. RecordsTable's แก้ไข/ทำซ้ำ/ลบ buttons,
    // silently stopped working). Production builds never include that
    // dev-only code at all (verified: `react-refresh-utils` isn't present
    // anywhere in a `next build` output), so this widens the policy for
    // local `npm run dev` only — the actual deployed app keeps the
    // stricter policy.
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval';" : "script-src 'self' 'unsafe-inline';";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scriptSrc} frame-ancestors 'none';`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
