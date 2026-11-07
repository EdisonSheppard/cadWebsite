import { handleAdmin } from "./admin.js";
import { handleEnquiry } from "./enquiry.js";
import { json, SECURITY_HEADERS } from "./util.js";

// Static pages are served straight from dist/ by Workers Static Assets.
// This Worker only runs for /api/* and /admin* (see run_worker_first in wrangler.jsonc).
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/enquiry") {
        if (request.method !== "POST") return json({ ok: false, errors: ["Use POST."] }, 405, { allow: "POST" });
        if (!env.DB || !env.UPLOADS) return json({ ok: false, errors: ["The quote form isn't connected yet. Please try again later."] }, 503);
        return withHeaders(await handleEnquiry(request, env, ctx));
      }
      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
        return await handleAdmin(request, env);
      }
      if (url.pathname.startsWith("/api/")) return json({ ok: false, errors: ["Not found."] }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error("unhandled", err);
      return json({ ok: false, errors: ["Something went wrong on the server. Please try again in a few minutes."] }, 500);
    }
  },
};

function withHeaders(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}
