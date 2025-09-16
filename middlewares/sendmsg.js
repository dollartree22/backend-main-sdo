const nodemailer = require('nodemailer');
const twilio = require("twilio");
// const myemail = 'onedollartreestore@gmail.com';
// const mypass = 'woganmuloxbyoopf'; 
// const myemail = process.env.SMTP_USER;
// const mypass = process.env.SMTP_PASS;

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// configure nodemailer transport
// const transporter = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 465,
//   secure: true, // use SSL
//   auth: {
//     user: myemail,
//     pass: mypass,
//   },
// });

// const sendmsg = (msg, email, subject) => {
//   return new Promise((resolve, reject) => {
//     const mailOptions = {
//       from: myemail,
//       to: email,
//       subject,
//       html: msg,
//     };

    async function sendmsg(to, otp) {
  try {
    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,   // Twilio sandbox number
      to: `whatsapp:${to}`,                     // user کا WhatsApp نمبر (+92322....)
      body: `Your OTP code is: ${otp}`,
    });

    console.log("OTP sent:", message.sid);
    return true;
  } catch (error) {
    console.error("Error sending OTP:", error);
    return false;
  }
}

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        reject(error);
      } else {
        console.log('Email sent: ' + info.response);
        resolve(true);
        console.log("SMTP_USER:", myemail);
        console.log("SMTP_PASS:", mypass ? "FOUND" : "NOT FOUND");
      }
    });
  });
};
module.exports = sendmsg;


