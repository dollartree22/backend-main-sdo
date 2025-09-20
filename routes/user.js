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
    const { email, password } = req.body;
    
    if (!email || !password) {
        return next(new ErrorHandler('Email and password are required', 400));
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return next(new ErrorHandler('No User found', 404));

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return next(new ErrorHandler('Wrong Credentials', 401));

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(200).send({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
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
    const { name, email, password, referral } = req.body;
    
    if (!name || !email || !password) {
        return next(new ErrorHandler("Name, email and password are required", 400));
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return next(new ErrorHandler("User already exists", 409));

    const hashedPassword = await bcrypt.hash(password, 10);
    let referredBy = null;

    if (referral) {
        const referredByUser = await User.findOne({ referralcode: referral });
        if (referredByUser) referredBy = referredByUser._id;
    }

    const referralcode = await generateUniqueReferralCode();

    const user = await User.create({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        referralcode,
        referredBy
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(201).send({ 
        success: true, 
        token, 
        user: { id: user._id, name: user.name, email: user.email } 
    });
}));

// ---------------- Reset Password ----------------
router.post('/forgetpassword', asyncerror(async (req, res, next) => {
    const { email } = req.body;
    if (!email) return next(new ErrorHandler("Email is required", 400));

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return next(new ErrorHandler("User not found", 404));

    // Generate token for reset with shorter expiry
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET + user.password, { expiresIn: '15m' });

    // In production, you would send an email here
    console.log(`Password reset token for ${email}: ${resetToken}`);
    
    res.status(200).send({ 
        success: true, 
        message: "Password reset link would be sent to email", 
        token: resetToken 
    });
}));

router.post('/resetpassword', asyncerror(async (req, res, next) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return next(new ErrorHandler("Token and password are required", 400));
    }

    if (password.length < 6) {
        return next(new ErrorHandler("Password must be at least 6 characters", 400));
    }

    try {
        // Find user without verification first to get their password for secret
        const decoded = jwt.decode(token);
        if (!decoded || !decoded.id) {
            return next(new ErrorHandler("Invalid token", 400));
        }

        const user = await User.findById(decoded.id);
        if (!user) return next(new ErrorHandler("User not found", 404));

        // Verify token with user-specific secret
        jwt.verify(token, process.env.JWT_SECRET + user.password);

        user.password = await bcrypt.hash(password, 10);
        await user.save();

        res.status(200).send({ success: true, message: "Password changed successfully" });
    } catch (err) {
        return next(new ErrorHandler("Token is invalid or expired", 400));
    }
}));

// ---------------- Update Password ----------------
router.post('/updatepassword', verifyToken, asyncerror(async (req, res, next) => {
    const { oldpassword, newpassword, fpassword } = req.body;
    
    if (!oldpassword || !newpassword) {
        return next(new ErrorHandler("Old and new password are required", 400));
    }

    const user = await User.findById(req._id);
    const isMatch = await bcrypt.compare(oldpassword, user.password);
    if (!isMatch) return next(new ErrorHandler("Incorrect Password", 401));

    user.password = await bcrypt.hash(newpassword, 10);
    if (fpassword) user.funding_password = await bcrypt.hash(fpassword, 10);

    await user.save();
    res.status(200).send({ success: true, message: "Password changed successfully" });
}));

// ---------------- Profile ----------------
router.post('/updateme', verifyToken, asyncerror(async (req, res, next) => {
    // Prevent updating sensitive fields
    const { password, funding_password, balance, locked_amount, ...updateData } = req.body;
    
    const user = await User.findByIdAndUpdate(
        req._id, 
        updateData, 
        { new: true, runValidators: true }
    ).select("-password");
    
    res.status(200).send({ success: true, user });
}));

router.get('/me', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id)
        .select("-password")
        .populate('membership.plan')
        .populate('referredBy', 'name email');
    
    res.status(200).send({ success: true, user });
}));

router.post('/changeinfo', verifyToken, asyncerror(async (req, res, next) => {
    const { wallet_address, phone } = req.body;
    const updateData = {};
    
    if (wallet_address) updateData.wallet_address = wallet_address;
    if (phone) updateData.phone = phone;

    const user = await User.findByIdAndUpdate(
        req._id, 
        updateData, 
        { new: true }
    ).select("-password");
    
    res.status(200).send({ success: true, user });
}));

// ---------------- Image Upload ----------------
router.post('/upload', verifyToken, asyncerror(async (req, res, next) => {
    if (!req.body.file) {
        return next(new ErrorHandler("File is required", 400));
    }

    const result = await cloudinary.uploader.upload(req.body.file);
    const data = { url: result.secure_url, public_id: result.public_id };
    res.status(200).send({ success: true, data });
}));

router.delete('/upload', verifyToken, asyncerror(async (req, res, next) => {
    if (!req.body.public_id) {
        return next(new ErrorHandler("Public ID is required", 400));
    }

    await cloudinary.uploader.destroy(req.body.public_id);
    res.status(200).send({ success: true, message: "Image deleted successfully" });
}));

// ---------------- Referrals ----------------
router.get('/referrals/:userId', verifyToken, asyncerror(async (req, res, next) => {
    const referrals = await User.find({ referredBy: req.params.userId })
        .select('name email createdAt');
    
    res.status(200).send({ success: true, data: referrals });
}));

module.exports = router;