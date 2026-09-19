// Minimal mail helper. Real sending requires RESEND_API_KEY in .env.
// Without it, links are logged to the server console so the flow is still
// fully testable locally.
async function sendMail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'TideVault <onboarding@resend.dev>';

  if (!apiKey) {
    console.log('\n--- EMAIL (no RESEND_API_KEY set, logging instead) ---');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log(html);
    console.log('--- END EMAIL ---\n');
    return { simulated: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Resend send failed:', res.status, text);
    return { simulated: false, error: text };
  }
  return { simulated: false };
}

module.exports = { sendMail };
