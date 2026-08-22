const API_PREFIX = "/api/";

function unavailableApiResponse() {
  return new Response(JSON.stringify({
    error: {
      code: "api_route_unavailable",
      message: "API route is not connected.",
    },
  }), {
    status: 503,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith(API_PREFIX)) {
      return unavailableApiResponse();
    }

    return env.ASSETS.fetch(request);
  },
};
