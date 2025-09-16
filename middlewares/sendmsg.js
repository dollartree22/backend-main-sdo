const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendmsg(to, otp) {
  try {
    const message = await client.messages.create({
      body: `Your OTP is ${otp}`,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`, // prefix whatsapp: add karo
      to: `whatsapp:${to}` // e.g. whatsapp:+92322XXXXXXX
    });

    console.log("WhatsApp OTP sent:", message.sid);
    return true;
  } catch (err) {
    console.error("WhatsApp OTP sending failed:", err);
    throw err;
  }
}

module.exports = sendmsg; // ✅
