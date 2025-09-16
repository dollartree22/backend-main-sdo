// middlewares/sendmsg.js
const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendmsg(to, otp) {
  try {
    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,   // Twilio sandbox number
      to: `whatsapp:${to}`,                     // User کا WhatsApp نمبر (+92322....)
      body: `Your OTP code is: ${otp}`,
    });

    console.log("OTP sent:", message.sid);
    return true;
  } catch (error) {
    console.error("Error sending OTP:", error);
    throw new Error("OTP sending failed");
  }
}

module.exports = sendmsg;
