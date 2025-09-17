const express = require('express');
const router = express.Router();
const asyncerror = require('../middlewares/catchasyncerror');
const ErrorHandler = require('../middlewares/errorhandler');
const { verifyToken, isTokenExpired } = require('../middlewares/verifyauth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../model/user');
const cloudinary = require('cloudinary').v2;
const referralCodes = require("referral-codes");
const Reward = require('../model/Reward');
const Deposit = require('../model/Deposits');

// Auth
router.post('/login', asyncerror(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email })
    if (!user) {
        return next(new ErrorHandler('No User found', 405))
    }
    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
        return next(new ErrorHandler('Wrong Credentials', 405))
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.status(200).send({ success: true, token })
}));

async function generateUniqueReferralCode() {
    while (true) {
        const newReferralCode = referralCodes.generate({ length: 8 });
        const exists = await User.findOne({ referralcode: newReferralCode[0] });
        if (!exists) {
            return newReferralCode[0];
        }
    }
}

// ---------------- Register ----------------
router.post('/register', asyncerror(async (req, res, next) => {
    const { email, password, referral } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return next(new ErrorHandler("User already exists", 400));

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle referral
    if (referral) {
        const referredByUser = await User.findOne({ referralcode: referral });
        if (referredByUser) req.body.referredBy = referredByUser._id;
    }

    req.body.email = email;
    req.body.password = hashedPassword;
    req.body.referralcode = await generateUniqueReferralCode();

    const user = await User.create(req.body);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(200).send({ success: true, token });
}));

// ---------------- Referrals ----------------
router.get('/referrals/:userId', asyncerror(async (req, res) => {
    const userId = req.params.userId;
    const user = await User.findById(userId).populate('referredBy');
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    const maxDepth = 2;
    const data = await buildReferralsTree(user, maxDepth, 0);
    res.status(200).json({
        success: true, data: { name: user.email, toggled: true, children: data }
    });
}));

async function buildReferralsTree(user, maxDepth, currentDepth) {
    if (currentDepth > maxDepth) return [];
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

// ---------------- Reset & Update Password ----------------
router.post('/resetpassword', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id);
    user.password = await bcrypt.hash(req.body.password, 10);
    await user.save();
    res.status(200).send({ success: true, message: "Password Changed Successfully" })
}));

router.post('/updatepassword', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id);
    const isMatch = await bcrypt.compare(req.body.oldpassword, user.password);
    if (!isMatch) return next(new ErrorHandler("Incorrect Password", 405))

    if (req.body.newpassword) {
        user.password = await bcrypt.hash(req.body.newpassword, 10);
    }
    if (req.body.fpassword) {
        user.funding_password = req.body.fpassword;
    }
    await user.save();
    res.status(200).send({ success: true, message: "Password Changed Successfully" })
}));

// ---------------- Update Profile ----------------
router.post('/upateme', verifyToken, asyncerror(async (req, res, next) => {
    await User.findByIdAndUpdate(req._id, req.body);
    res.status(200).send({ success: true })
}));

router.get('/me', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id).select("-password").populate('membership.plan');
    res.status(200).send({ success: true, user })
}));

router.post('/changeinfo', verifyToken, asyncerror(async (req, res, next) => {
    const data = await User.findByIdAndUpdate(req._id, req.body);
    res.status(200).send({ success: true, data })
}));

// ---------------- Image Upload ----------------
router.post('/upload', asyncerror(async (req, res, next) => {
    const result = await cloudinary.uploader.upload(req.body.file);
    const data = { url: result.secure_url, public_id: result.public_id }
    res.status(200).send({ success: true, data });
}));

router.delete('/upload', asyncerror(async (req, res, next) => {
    await cloudinary.uploader.destroy(req.body.public_id);
    res.status(200).send({ success: true });
}));

module.exports = router;
