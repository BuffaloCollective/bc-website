// netlify/lib/brevo-doi.js
// Starts Brevo double opt-in for the Herd Mentality list (#8). Brevo emails a
// confirmation link (template BREVO_DOI_TEMPLATE_ID); the contact only joins
// list #8 once they click it, then lands on /confirmed.

const REDIRECT_URL = "https://buffalocollective.co/confirmed";

// Returns true when the confirmation flow started or the address is already
// subscribed. Logs status and error code only: Brevo error messages can echo
// the address.
async function startDoubleOptIn(email, attributes) {
  const templateId = parseInt(process.env.BREVO_DOI_TEMPLATE_ID, 10);
  if (!templateId) {
    console.error("BREVO_DOI_TEMPLATE_ID is not set");
    return false;
  }

  const response = await fetch("https://api.brevo.com/v3/contacts/doubleOptinConfirmation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      email,
      attributes,
      includeListIds: [8],
      templateId,
      redirectionUrl: REDIRECT_URL,
    }),
  });

  // 201 = new contact, confirmation email sent; 204 = existing contact updated.
  if (response.status === 201 || response.status === 204) return true;

  const errorData = await response.json().catch(() => ({}));
  if (errorData.code === "duplicate_parameter") return true;

  console.error("Brevo DOI error:", response.status, errorData.code || "unknown");
  return false;
}

module.exports = { startDoubleOptIn };
