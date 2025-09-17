const express = require('express');
const router = express.Router();
const asyncerror = require('../middlewares/catchasyncerror');
const ErrorHandler = require('../middlewares/errorhandler');
const { verifyToken } = require('../middlewares/verifyauth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../model/user');
const cloudinary = require('cloudinary').v2;
const referralCodes = require("referral-codes");

// Auth - Login
router.post('/login', asyncerror(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email })
    if (!user) return next(new ErrorHandler('No User found', 405));

    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) return next(new ErrorHandler('Wrong Credentials', 405));

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(200).send({ success: true, token });
}));

// Auth - Register
async function generateUniqueReferralCode() {
    while (true) {
        const newReferralCode = referralCodes.generate({ length: 8 });
        const exists = await User.findOne({ referralcode: newReferralCode[0] });
        if (!exists) return newReferralCode[0];
    }
}

router.post('/register', asyncerror(async (req, res, next) => {
    const { email, password, referral } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return next(new ErrorHandler("User already exists", 400));

    const hashedPassword = await bcrypt.hash(password, 10);

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

// ---------------- Reset Password ----------------
router.post('/forgetpass', asyncerror(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return next(new ErrorHandler("User not found", 404));

    // Generate token for reset
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Normally you send email here with the token link
    // Example: `${FRONTEND_URL}/resetpassword?token=${token}`

    res.status(200).send({ success: true, message: "Password reset link generated", token });
}));

router.post('/resetpassword', asyncerror(async (req, res, next) => {
    const { token, password } = req.body;
    if (!token) return next(new ErrorHandler("Token is required", 400));

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return next(new ErrorHandler("Token is invalid or expired", 400));
    }

    const user = await User.findById(decoded.id);
    if (!user) return next(new ErrorHandler("User not found", 404));

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    res.status(200).send({ success: true, message: "Password changed successfully" });
}));

// ---------------- Update Password ----------------
router.post('/updatepassword', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id);
    const isMatch = await bcrypt.compare(req.body.oldpassword, user.password);
    if (!isMatch) return next(new ErrorHandler("Incorrect Password", 405));

    if (req.body.newpassword) user.password = await bcrypt.hash(req.body.newpassword, 10);
    if (req.body.fpassword) user.funding_password = req.body.fpassword;

    await user.save();
    res.status(200).send({ success: true, message: "Password changed successfully" });
}));

// ---------------- Profile ----------------
router.post('/upateme', verifyToken, asyncerror(async (req, res) => {
    await User.findByIdAndUpdate(req._id, req.body);
    res.status(200).send({ success: true });
}));

router.get('/me', verifyToken, asyncerror(async (req, res) => {
    const user = await User.findById(req._id).select("-password").populate('membership.plan');
    res.status(200).send({ success: true, user });
}));

router.post('/changeinfo', verifyToken, asyncerror(async (req, res) => {
    const data = await User.findByIdAndUpdate(req._id, req.body);
    res.status(200).send({ success: true, data });
}));

// ---------------- Image Upload ----------------
router.post('/upload', asyncerror(async (req, res) => {
    const result = await cloudinary.uploader.upload(req.body.file);
    const data = { url: result.secure_url, public_id: result.public_id };
    res.status(200).send({ success: true, data });
}));

router.delete('/upload', asyncerror(async (req, res) => {
    await cloudinary.uploader.destroy(req.body.public_id);
    res.status(200).send({ success: true });
}));

module.exports = router;
