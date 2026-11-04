/** Resend (free tier). Returns an explicit status — never pretends a message was delivered. */
export type EmailResult = { sent: boolean; reason?: string };

export async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  if (!key || !from) return { sent: false, reason: "Email isn't configured (set RESEND_API_KEY and RESEND_FROM)." };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }), signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { sent: false, reason: `Resend returned ${r.status}.` };
    return { sent: true };
  } catch { return { sent: false, reason: "Could not reach Resend." }; }
}
