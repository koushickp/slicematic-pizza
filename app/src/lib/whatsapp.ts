/**
 * whatsapp.ts — WhatsApp Notification Service
 * Sends WhatsApp messages via Twilio, or logs to console if no keys are provided.
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE       = process.env.TWILIO_PHONE_NUMBER; // e.g. "whatsapp:+14155238886"

export async function sendWhatsAppMessage(toPhone: string, message: string) {
  // Format phone number to E.164 standard (assuming Indian numbers for Slicematic)
  // E.g., "9876543210" -> "whatsapp:+919876543210"
  const formattedPhone = `whatsapp:+91${toPhone}`;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) {
    // ── MOCK MODE ──
    console.log("\n==========================================");
    console.log("🟢 [MOCK WHATSAPP] Message sent!");
    console.log(`To: ${formattedPhone}`);
    console.log("------------------------------------------");
    console.log(message);
    console.log("==========================================\n");
    return { success: true, mock: true };
  }

  // ── LIVE MODE ──
  try {
    const data = new URLSearchParams();
    data.append("To", formattedPhone);
    data.append("From", TWILIO_PHONE);
    data.append("Body", message);

    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: data,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[whatsapp] Twilio API error:", errorText);
      return { success: false, error: "Twilio error" };
    }

    console.log(`[whatsapp] Live message sent to ${formattedPhone}`);
    return { success: true, mock: false };
  } catch (error: any) {
    console.error("[whatsapp] Request failed:", error.message);
    return { success: false, error: error.message };
  }
}
