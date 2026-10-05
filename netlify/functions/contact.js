// netlify/functions/contact.js
// Routes contact form submissions to herd@buffalocollective.co via Brevo transactional email
// Optionally adds contact to Herd Mentality list (#8) and always adds to Website Contact list (#12)

const { guard } = require("../lib/bot-guard");

// Visitor input is interpolated into the notification email's HTML.
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

exports.handler = async (event) => {
  // Honeypot, validation and Turnstile all run before any Brevo call.
  const checked = await guard(event, "contact", {
    firstName: 100,
    lastName: 100,
    email: 254,
    inquiryType: 100,
    message: 5000,
    source: 100,
  });
  if (checked.response) return checked.response;

  const { firstName, lastName, email, inquiryType, message, source } = checked.body;
  const subscribeNewsletter = checked.body.subscribeNewsletter === true;
  const h = {
    name: escapeHtml(`${firstName} ${lastName}`),
    email: escapeHtml(email),
    inquiryType: escapeHtml(inquiryType),
    message: escapeHtml(message),
  };

  const apiKey = process.env.BREVO_API_KEY;

  // 1. Send notification email to herd@buffalocollective.co
  const emailPayload = {
    sender: { name: "Buffalo Collective", email: "herd@buffalocollective.co" },
    to: [{ email: "herd@buffalocollective.co", name: "Buffalo Collective" }],
    replyTo: { email, name: `${firstName} ${lastName}` },
    subject: `New inquiry: ${inquiryType}`,
    htmlContent: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #372c1c;">
        <h2 style="color: #16462b;">New message from buffalocollective.co</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 140px;">Name</td>
            <td style="padding: 8px 0;">${h.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Email</td>
            <td style="padding: 8px 0;"><a href="mailto:${h.email}">${h.email}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Inquiry type</td>
            <td style="padding: 8px 0;">${h.inquiryType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Newsletter opt-in</td>
            <td style="padding: 8px 0;">${subscribeNewsletter ? "Yes" : "No"}</td>
          </tr>
        </table>
        <hr style="border: 1px solid #e2d5b3; margin: 16px 0;" />
        <h3 style="color: #16462b;">Message</h3>
        <p style="white-space: pre-wrap;">${h.message}</p>
      </div>
    `,
  };

  try {
    const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      console.error("Email send error:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to send message. Please try again." }),
      };
    }
  } catch (err) {
    console.error("Email function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error. Please try again." }),
    };
  }

  // 2. Add contact to Brevo — list #12 always, list #8 if newsletter opt-in
  const listIds = [12];
  if (subscribeNewsletter) listIds.push(8);

  const contactPayload = {
    email,
    attributes: {
      FIRSTNAME: firstName,
      LASTNAME: lastName,
      INQUIRY_TYPE: inquiryType,
      SOURCE: source,
    },
    listIds,
    updateEnabled: true,
  };

  try {
    const contactRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(contactPayload),
    });

    if (!contactRes.ok && contactRes.status !== 204) {
      const err = await contactRes.json();
      // Log but don't fail — email already sent successfully
      console.error("Contact creation error:", err);
    }
  } catch (err) {
    console.error("Contact function error:", err);
    // Same — log but don't fail
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
};
