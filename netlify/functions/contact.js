// netlify/functions/contact.js
// Routes contact form submissions to herd@buffalocollective.co via Brevo transactional email
// Optionally adds contact to Herd Mentality list (#8) and always adds to Website Contact list (#12)

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

  const { firstName, lastName, email, inquiryType, message, source, subscribeNewsletter } = body;

  if (!firstName || !lastName || !email || !inquiryType || !message || !source) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "All fields are required." }),
    };
  }

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
            <td style="padding: 8px 0;">${firstName} ${lastName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Email</td>
            <td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Inquiry type</td>
            <td style="padding: 8px 0;">${inquiryType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Newsletter opt-in</td>
            <td style="padding: 8px 0;">${subscribeNewsletter ? "Yes" : "No"}</td>
          </tr>
        </table>
        <hr style="border: 1px solid #e2d5b3; margin: 16px 0;" />
        <h3 style="color: #16462b;">Message</h3>
        <p style="white-space: pre-wrap;">${message}</p>
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
