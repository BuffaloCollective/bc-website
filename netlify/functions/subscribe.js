// netlify/functions/subscribe.js
// Newsletter signup: starts Brevo double opt-in for the Herd Mentality list
// (#8). The contact only joins the list after clicking the confirmation link.

const { guard } = require("../lib/bot-guard");
const { startDoubleOptIn } = require("../lib/brevo-doi");

exports.handler = async (event) => {
  // Honeypot, validation and Turnstile all run before any Brevo call.
  const checked = await guard(event, "subscribe", { firstName: 100, email: 254 });
  if (checked.response) return checked.response;

  const { firstName, email, source } = checked.body;

  const attributes = { FIRSTNAME: firstName.trim() };
  // Optional: utm_source captured client-side, stored as SOURCE on the
  // Brevo contact. Only set if non-empty and reasonable length.
  if (typeof source === "string" && source.trim() && source.length <= 100) {
    attributes.SOURCE = source.trim();
  }

  try {
    // New and already-subscribed addresses both count as success, and the
    // browser shows one neutral "check your inbox" message for either, so the
    // form can't be used to find out whether someone is on the list.
    if (await startDoubleOptIn(email.trim(), attributes)) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to subscribe. Please try again." }),
    };
  } catch (err) {
    console.error("Function error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error. Please try again." }),
    };
  }
};
