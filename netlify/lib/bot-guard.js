// netlify/lib/bot-guard.js
// Shared bot protection for the form functions: honeypot, field validation,
// and Cloudflare Turnstile verification. Lives outside netlify/functions so
// Netlify doesn't deploy it as its own endpoint; the bundler pulls it in via
// require().
//
// Rejection logs carry the reason only — never names or email addresses.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Loose sanity check, not RFC 5322: one @, no spaces, a dot in the domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

const json = (statusCode, body) => ({ statusCode, body: JSON.stringify(body) });

function logRejection(fn, reason) {
  console.warn(`[${fn}] rejected: ${reason}`);
}

// Honeypot: real users never see the "website" field, so any value means a bot.
function isHoneypotFilled(body) {
  return typeof body.website === "string" && body.website.trim() !== "";
}

function isValidEmail(email) {
  return typeof email === "string" && email.length <= EMAIL_MAX && EMAIL_RE.test(email);
}

// limits: { fieldName: maxLength }. Every listed field must be a non-empty
// string within its cap; optional fields should be checked by the caller.
function hasRequiredFields(body, limits) {
  return Object.entries(limits).every(
    ([key, max]) =>
      typeof body[key] === "string" && body[key].trim() !== "" && body[key].length <= max
  );
}

async function verifyTurnstile(token, event) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not set");
    return false;
  }
  if (typeof token !== "string" || !token || token.length > 2048) return false;

  const params = new URLSearchParams({ secret, response: token });
  const ip = event.headers["x-nf-client-connection-ip"];
  if (ip) params.append("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body: params });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("Turnstile verify error:", err.message);
    return false;
  }
}

// Runs every check that doesn't need Brevo, in cheapest-first order.
// Returns { response } when the request should stop here (the caller returns
// it as-is), or { body } with the parsed payload when it may proceed.
async function guard(event, fn, limits) {
  if (event.httpMethod !== "POST") {
    logRejection(fn, "invalid");
    return { response: { statusCode: 405, body: "Method Not Allowed" } };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") {
    logRejection(fn, "invalid");
    return { response: json(400, { error: "Invalid request." }) };
  }

  // Fake success so bots can't tell they were caught.
  if (isHoneypotFilled(body)) {
    logRejection(fn, "honeypot");
    return { response: json(200, { success: true }) };
  }

  if (!hasRequiredFields(body, limits) || !isValidEmail(body.email)) {
    logRejection(fn, "invalid");
    return { response: json(400, { error: "Please check the form and try again." }) };
  }

  if (!(await verifyTurnstile(body["cf-turnstile-response"], event))) {
    logRejection(fn, "turnstile_failed");
    return {
      response: json(400, { error: "We couldn't verify your submission. Please try again." }),
    };
  }

  return { body };
}

module.exports = { guard };
