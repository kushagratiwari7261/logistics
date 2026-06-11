import { Resend } from 'resend';

// Vercel serverless function endpoint
// This file runs natively on Vercel infrastructure when navigating to /api/send-email

export default async function handler(req, res) {
  // CORS configuration for serverless function
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return res.status(500).json({ error: "Resend API key not configured in Vercel environment variables" });
  }

  const resend = new Resend(resendApiKey);

  try {
    const { to, cc, bcc, subject, body, fileName, fileBase64 } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: "Missing required fields: to, subject" });
    }

    const emailPayload = {
      from: 'Seal Logistics <alerts@mail.prudata.info>',
      to: to.split(',').map(e => e.trim()),
      subject: subject,
      html: `<div style="font-family: sans-serif;">
              <p>${body ? body.replace(/\n/g, '<br/>') : 'Please find the attached file.'}</p>
             </div>`
    };

    if (cc) emailPayload.cc = cc.split(',').map(e => e.trim());
    if (bcc) emailPayload.bcc = bcc.split(',').map(e => e.trim());

    if (fileBase64) {
      emailPayload.attachments = [
        {
          filename: fileName || 'attachment.xlsx',
          content: Buffer.from(fileBase64, 'base64'),
        }
      ];
    }

    const result = await resend.emails.send(emailPayload);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return res.status(200).json({ success: true, message: "Email sent successfully via Vercel" });
  } catch (err) {
    console.error("Vercel Email Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
