import site from "../../site.config.json";

export const SERVICE_LABELS = {
  replacement: "Replacement part",
  mount: "Mount or enclosure",
  print: "Print from your file",
  cad: "CAD files only",
  unsure: "Not sure yet",
};

export function emailConfigured(env) {
  return Boolean(env.RESEND_API_KEY && site.emailFrom);
}

async function send(env, msg) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: site.emailFrom, ...msg }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).id;
}

// Sends the owner alert and the customer acknowledgement. Failures are logged
// and recorded as events, never thrown, so a mail outage can't lose an enquiry.
export async function sendEnquiryEmails(env, origin, enquiry, files) {
  if (!emailConfigured(env)) return;
  const log = (action, detail) =>
    env.DB.prepare("INSERT INTO events (enquiry_id, at, actor, action, detail) VALUES (?, ?, 'system', ?, ?)")
      .bind(enquiry.id, new Date().toISOString(), action, detail)
      .run()
      .catch(() => {});

  const base = site.siteUrl || origin;
  const jobs = [];

  if (site.ownerNotifyEmail) {
    const lines = [
      `New enquiry ${enquiry.id}`,
      ``,
      `Service: ${SERVICE_LABELS[enquiry.service]}`,
      `Name: ${enquiry.name}`,
      `Email: ${enquiry.email}`,
      `Phone: ${enquiry.phone || "-"}`,
      `Prefers: ${enquiry.contact_pref}`,
      ``,
      enquiry.description,
      ``,
      ...Object.entries(enquiry.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`),
      ``,
      `Files: ${files.length ? files.map((f) => f.original_name).join(", ") : "none"}`,
      ``,
      `Open in admin: ${base}/admin/enquiry/${enquiry.id}`,
    ];
    jobs.push(
      send(env, {
        to: [site.ownerNotifyEmail],
        reply_to: enquiry.email,
        subject: `New enquiry ${enquiry.id}: ${SERVICE_LABELS[enquiry.service]} from ${enquiry.name}`,
        text: lines.join("\n"),
      })
        .then((id) => log("email_owner_sent", id))
        .catch((e) => (console.error(e), log("email_owner_failed", String(e.message).slice(0, 300))))
    );
  }

  // The acknowledgement deliberately does not repeat the customer's own text.
  // Echoing it would let spammers use the form to send their message to anyone.
  const ack = [
    `Hi ${enquiry.name.split(" ")[0].slice(0, 40)},`,
    ``,
    `Thanks for your enquiry. Your reference is ${enquiry.id}.`,
    ``,
    `I'll look at what you've sent and reply within one business day, usually sooner. If I need more measurements or photos, I'll ask.`,
    ``,
    `To add anything, reply to this email and keep the reference in the subject line.`,
    ``,
    `${site.ownerFirstName}`,
    `${site.businessName}`,
    base,
  ];
  jobs.push(
    send(env, {
      to: [enquiry.email],
      ...(site.contactEmail ? { reply_to: site.contactEmail } : {}),
      subject: `We've received your enquiry (${enquiry.id})`,
      text: ack.join("\n"),
    })
      .then((id) => log("email_customer_sent", id))
      .catch((e) => (console.error(e), log("email_customer_failed", String(e.message).slice(0, 300))))
  );

  await Promise.all(jobs);
}
