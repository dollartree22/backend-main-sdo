const express = require('express');
const router = express.Router();
const asyncerror = require('../middlewares/catchasyncerror');
const ErrorHandler = require('../middlewares/errorhandler');
const { verifyToken, isTokenExpired } = require('../middlewares/verifyauth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { sendmsg } = require('../middlewares/sendmsg');
const User = require('../model/user');
const cloudinary = require('cloudinary').v2;
const referralCodes = require("referral-codes");
const otpgenerator = require("otp-generator");
const Reward = require('../model/Reward');
const Deposit = require('../model/Deposits');

// Auth
router.post('/login', asyncerror(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email })
    if (!user) {
        return next(new ErrorHandler('No User found', 405))
    }
    if (req.body.password !== user.password) {
        return next(new ErrorHandler('Wrong Credentials', 405))
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.status(200).send({ success: true, token })
}));

async function generateUniqueReferralCode() {
    while (true) {
        const newReferralCode = referralCodes.generate({
            length: 8,
        });
        console.log(newReferralCode)
        const exists = await User.findOne({ referralcode: newReferralCode[0] });
        if (!exists) {
            return newReferralCode[0];
        }
    }
}

router.post('/register', isTokenExpired, verifyToken, asyncerror(async (req, res, next) => {
    if (req.body.otp !== req.decoded.otp) {
        return next(new ErrorHandler("Wrong Otp Or Otp is expired!"), 405)
    }
    if (req.body.referral) {
        let referredBy = await User.findOne({ referralcode: req.body.referral });
        if (referredBy) {
            req.body.referredBy = referredBy._id;
        }
    }
    req.body.email = req.decoded.email;
    req.body.referralcode = await generateUniqueReferralCode();
    const user = await User.create(req.body);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(200).send({ success: true, token });
}));

// Define an API route to get referrals up to 3 levels deep below a given user
router.get('/referrals/:userId', asyncerror(async (req, res) => {
    const userId = req.params.userId;
    const user = await User.findById(userId).populate('referredBy');
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    const maxDepth = 2; // Maximum depth for the referrals tree
    const data = await buildReferralsTree(user, maxDepth, 0);
    res.status(200).json({
        success: true, data: {
            name: user.email, toggled: true, children: data
        }
    });
}));

// Recursive function to build the referrals tree up to a certain depth
async function buildReferralsTree(user, maxDepth, currentDepth) {
    if (currentDepth > maxDepth) {
        return [];
    }
    const referrals = await User.find({ referredBy: user._id });
    const referralsData = [];
    for (const referralId of referrals) {
        const referral = await User.findById(referralId).populate('referredBy');
        if (referral) {
            const referralData = {
                name: maskEmail(referral?.email),
                children: await buildReferralsTree(referral, maxDepth, currentDepth + 1)
            };
            referralsData.push(referralData);
        }
    }
    return referralsData;
}
function maskEmail(email) {
    const [localPart, domain] = email.split('@');
    const maskedLocalPart = localPart.substring(0, 1) + '*'.repeat(localPart.length - 2) + localPart.slice(-1);
    return maskedLocalPart + '@' + domain;
}

router.post('/resetpassword', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id);
    user.password = req.body.password;
    user.save()
    res.status(200).send({ success: true, message: "Password Changed Successfully" })
}));


router.post('/updatepassword', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id);
    const verifypass = req.body.oldpassword === user.password;
    if (!verifypass) {
        return next(new ErrorHandler("Incorrect Password", 405))
    }
    if (req.body.newpassword) {
        user.password = req.body.newpassword;
    }
    if (req.body.fpassword) {
        user.funding_password = req.body.fpassword;
    }
    user.save()
    res.status(200).send({ success: true, message: "Password Changed Successfully" })
}));

router.post('/upateme', verifyToken, asyncerror(async (req, res, next) => {
    await User.findByIdAndUpdate(req._id, req.body);

    res.status(200).send({ success: true })
}));

router.get('/me', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id).select("-password").populate('membership.plan');
    const today = new Date();
    // Set the start and end times for today
    today.setHours(0, 0, 0, 0); // 00:00:00.000
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999); // 23:59:59.999
    const todayProfit = await Reward.findOne({
        user: user._id,
        createdAt: {
            $gte: today,
            $lt: endOfDay,
        },
    });
    const verifyDeposit = await Deposit.findOne({ user: req._id, status: "approve" });
    if (!verifyDeposit) {
        user.referralcode = "Locked"
    }
    let totalPlanProfit = 0;
    let totalPlanCompleted = 0;
    if (user.membership.plan) {
        const totalduration = user.membership.plan.duration;
        const investmentplandata = await Reward.find({
            id: user.membership.id
        });
        investmentplandata.forEach(element => {
            totalPlanProfit += element.amount;
        });
        const daysCompleted = investmentplandata.length;
        totalPlanCompleted = (daysCompleted / totalduration) * 100;
    }
    const data = {
        todayProfit: todayProfit?.amount ? todayProfit.amount : 0,
        totalPlanCompleted,
        totalPlanProfit
    }
    res.status(200).send({ success: true, data, user })
}));

router.post('/changeinfo', verifyToken, asyncerror(async (req, res, next) => {
    const data = await User.findByIdAndUpdate(req._id, req.body);
    res.status(200).send({ success: true, data })
}));

// forget pass
router.post('/sendregotp', asyncerror(async (req, res, next) => {
    const user = await User.findOne({
        email: req.body.email
    })
    if (user) {
        return next(new ErrorHandler("User Already Registered!"), 404)
    }
    const otp = otpgenerator.generate(6, { upperCaseAlphabets: false, lowerCaseAlphabets: false, digits: true, specialChars: false })
    const response = await sendmsg(`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SDO Forget Password OTP</title>
        <!-- Include Bootstrap CSS -->
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
        <style>
            /* Custom Styles */
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
            }
            .container {
                background-color: #ffffff;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                padding: 20px;
                max-width: 600px;
                margin: 20px auto;
            }
            h1 {
                color: #333;
            }
            p {
                font-size: 16px;
                line-height: 1.6;
                color: #555;
            }
            .btn {
                display: inline-block;
                background-color: #007bff;
                color: white !important;
                padding: 10px 20px;
                margin: 10px 0;
                text-decoration: none;
                border-radius: 3px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>SDO Register OTP</h1>
            <p>Hello,</p>
            <p>You have requested an Account Creation for a new SDO account. Please use the following OTP to Create your Account:</p>
            <p><strong>Your OTP:</strong> <span style="font-size: 24px; color: #007bff;">${otp}</span></p>
            <p>If you did not request this Account Creation, please ignore this email.</p>
            <p>Thank you,</p>
            <p>The SDO Team</p>
        </div>
    </body>
    </html>
    `, req.body.email, "Registeration OTP")
    const token = jwt.sign({ email: req.body.email, otp }, process.env.JWT_SECRET, {
        expiresIn: "5m"
    })
    res.status(200).send({ success: true, token })

}))
router.post('/sendotp', asyncerror(async (req, res, next) => {
    const user = await User.findOne({
        email: req.body.email
    })
    if (!user) {
        return next(new ErrorHandler("User not found"), 404)
    }
    const otp = otpgenerator.generate(6, { upperCaseAlphabets: false, lowerCaseAlphabets: false, digits: true, specialChars: false })
    const response = await sendmsg(`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SDO Forget Password OTP</title>
        <!-- Include Bootstrap CSS -->
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
        <style>
            /* Custom Styles */
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
            }
            .container {
                background-color: #ffffff;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                padding: 20px;
                max-width: 600px;
                margin: 20px auto;
            }
            h1 {
                color: #333;
            }
            p {
                font-size: 16px;
                line-height: 1.6;
                color: #555;
            }
            .btn {
                display: inline-block;
                background-color: #007bff;
                color: #ffffff;
                padding: 10px 20px;
                margin: 10px 0;
                text-decoration: none;
                border-radius: 3px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>SDO Forget Password OTP</h1>
            <p>Hello,</p>
            <p>You have requested a password reset for your SDO account. Please use the following OTP to reset your password:</p>
            <p><strong>Your OTP:</strong> <span style="font-size: 24px; color: #007bff;">${otp}</span></p>
            <p>If you did not request this password reset, please ignore this email.</p>
            <p>Thank you,</p>
            <p>The SDO Team</p>
        </div>
    </body>
    </html>
    `, user.email, "Forget Password OTP")
    const token = jwt.sign({ id: user._id, otp }, process.env.JWT_SECRET, {
        expiresIn: "5m"
    })
    res.status(200).send({ success: true, token })

}))
router.post('/verifyotp', isTokenExpired, verifyToken, asyncerror(async (req, res, next) => {
    if (req.body.otp !== req.decoded.otp) {
        return next(new ErrorHandler("Wrong Otp Or Otp is expired!"), 405)
    }
    const token = jwt.sign({ id: req._id }, process.env.JWT_SECRET);
    res.status(200).send({ success: true, token })
}))

// Image
router.post('/upload', asyncerror(async (req, res, next) => {
    const result = await cloudinary.uploader.upload(req.body.file);
    const data = {
        url: result.secure_url,
        public_id: result.public_id
    }
    res.status(200).send({ success: true, data });
}));

router.delete('/upload', asyncerror(async (req, res, next) => {
    await cloudinary.uploader.destroy(req.body.public_id);
    res.status(200).send({ success: true });
}));


module.exports = router