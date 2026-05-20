// netlify/functions/subscribe.js
// Adds a contact to Brevo Herd Mentality list (#8)

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { firstName, email, source } = body;

  if (!firstName || !email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "First name and email are required." }),
    };
  }

  const attributes = { FIRSTNAME: firstName };
  // Optional: utm_source captured client-side, stored as SOURCE on the
  // Brevo contact. Only set if non-empty and reasonable length.
  if (typeof source === "string" && source.trim() && source.length <= 100) {
    attributes.SOURCE = source.trim();
  }

  const payload = {
    email,
    attributes,
    listIds: [8],
    updateEnabled: true,
  };

  try {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    // 201 = created, 204 = already exists and updated
    if (response.status === 201 || response.status === 204) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }

    const errorData = await response.json();
    console.error("Brevo API error:", errorData);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to subscribe. Please try again." }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error. Please try again." }),
    };
  }
};
