// netlify/functions/subscribe.js
// Starts Brevo double opt-in for the Herd Mentality list (#8). Brevo emails a
// confirmation link; the contact only joins list #8 once they click it, then
// lands on /confirmed.

const { guard } = require("../lib/bot-guard");

const REDIRECT_URL = "https://buffalocollective.co/confirmed";

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

  const templateId = parseInt(process.env.BREVO_DOI_TEMPLATE_ID, 10);
  if (!templateId) {
    console.error("BREVO_DOI_TEMPLATE_ID is not set");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error. Please try again." }),
    };
  }

  const payload = {
    email: email.trim(),
    attributes,
    includeListIds: [8],
    templateId,
    redirectionUrl: REDIRECT_URL,
  };

  try {
    const response = await fetch("https://api.brevo.com/v3/contacts/doubleOptinConfirmation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    // 201 = new contact, confirmation email sent; 204 = existing contact
    // updated. The browser shows one neutral "check your inbox" message for
    // both (and for already-subscribed addresses below), so the form can't be
    // used to find out whether someone is on the list.
    if (response.status === 201 || response.status === 204) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }

    const errorData = await response.json().catch(() => ({}));
    if (errorData.code === "duplicate_parameter") {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }

    // Status and error code only: Brevo error messages can echo the address.
    console.error("Brevo API error:", response.status, errorData.code || "unknown");
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
