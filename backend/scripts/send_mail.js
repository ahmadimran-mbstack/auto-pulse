// Plain helper script to dispatch emails using nodemailer SMTP
const nodemailer = require("nodemailer");

async function main() {
  let rawData = "";
  process.stdin.setEncoding("utf-8");

  for await (const chunk of process.stdin) {
    rawData += chunk;
  }

  if (!rawData.trim()) {
    console.error("No input payload provided to send_mail.js");
    process.exit(1);
  }

  const payload = JSON.parse(rawData);
  const smtp = payload.smtp || {};

  const mailOptions = {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    headers: payload.headers || {}
  };

  // Helper to send using a specific secure setting
  async function trySend(isSecure) {
    const transportConfig = {
      host: smtp.host,
      port: Number(smtp.port) || 587,
      secure: isSecure,
      auth: (smtp.user && smtp.pass) ? {
        user: smtp.user,
        pass: smtp.pass
      } : undefined,
      tls: {
        rejectUnauthorized: false
      }
    };

    const transporter = nodemailer.createTransport(transportConfig);
    return await transporter.sendMail(mailOptions);
  }

  try {
    // Try standard STARTTLS first (secure: false)
    await trySend(false);
    console.log("Email dispatched successfully via nodemailer SMTP");
  } catch (firstErr) {
    // If standard fails, try immediate SSL (secure: true)
    try {
      await trySend(true);
      console.log("Email dispatched successfully via nodemailer SMTP (SSL)");
    } catch (secondErr) {
      console.error("Nodemailer SMTP dispatch error:", firstErr.message || secondErr.message);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Nodemailer SMTP fatal error:", err.message);
  process.exit(1);
});
