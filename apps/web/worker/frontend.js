const API_PREFIX = "/api/";
const GOOGLE_DRIVE_OAUTH_PREFIX = "/oauth/google-drive/";
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self' https://tiles.openfreemap.org https://www.googleapis.com",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "worker-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

function applySecurityHeaders(request, headers) {
  headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("permissions-policy", "accelerometer=(), autoplay=(), camera=(), display-capture=(self), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), usb=()");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  if (new URL(request.url).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=86400");
  }
  return headers;
}

function secureAssetResponse(request, response) {
  const headers = applySecurityHeaders(request, new Headers(response.headers));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function unavailableApiResponse(request) {
  return new Response(JSON.stringify({
    error: {
      code: "api_route_unavailable",
      message: "API route is not connected.",
    },
  }), {
    status: 503,
    headers: applySecurityHeaders(request, new Headers({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    })),
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith(API_PREFIX) || pathname.startsWith(GOOGLE_DRIVE_OAUTH_PREFIX)) {
      return unavailableApiResponse(request);
    }

    return secureAssetResponse(request, await env.ASSETS.fetch(request));
  },
};
