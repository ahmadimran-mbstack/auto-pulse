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
    headers: payload.headers || {},
    messageId: payload.messageId || undefined,
  };

  async function trySend(isSecure) {
    const transportConfig = {
      host: smtp.host,
      port: Number(smtp.port) || 587,
      secure: isSecure,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
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

  let info;
  try {
    info = await trySend(false);
  } catch (firstErr) {
    try {
      info = await trySend(true);
    } catch (secondErr) {
      console.error("Nodemailer SMTP dispatch error:", secondErr.message || firstErr.message);
      process.exit(1);
    }
  }

  const accepted = Array.isArray(info && info.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info && info.rejected) ? info.rejected : [];
  if (accepted.length === 0 || rejected.length > 0) {
    console.error(
      `SMTP server rejected recipient(s): accepted=${JSON.stringify(accepted)} rejected=${JSON.stringify(rejected)}`
    );
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    messageId: (info && info.messageId) || payload.messageId || null,
    accepted,
    rejected,
  }));
}

main().catch((err) => {
  console.error("Nodemailer SMTP fatal error:", err.message);
  process.exit(1);
});
