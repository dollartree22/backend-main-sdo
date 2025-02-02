const nodemailer = require('nodemailer');
const myemail = 'onedollartreestore@gmail.com';
const mypass = 'woganmuloxbyoopf';
// configure nodemailer transport
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: myemail,
    pass: mypass,
  },
});
const sendmsg = (msg, email, subject) => {
  return new Promise((resolve, reject) => {
    const mailOptions = {
      from: myemail,
      to: email,
      subject,
      html: msg,
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        reject(error);
      } else {
        console.log('Email sent: ' + info.response);
        resolve(true);
      }
    });
  });
};
module.exports = { sendmsg }