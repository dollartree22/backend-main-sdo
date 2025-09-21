const express = require("express");
const router = express.Router();
const asyncerror = require("../middlewares/catchasyncerror");
const ErrorHandler = require("../middlewares/errorhandler");
const { verifyToken } = require("../middlewares/verifyauth");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../model/user");
const cloudinary = require("cloudinary").v2;
const referralCodes = require("referral-codes");

// Auth - Login (Without password hashing)
router.post(
  "/login",
  asyncerror(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ErrorHandler("Email and password are required", 400));
    } 

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    const user = await User.findOne({ email: trimmedEmail.toLowerCase() });
    if (!user) return next(new ErrorHandler("No User found", 404));
     
    console.log("user found:", {
        "email": user.email,
        "storedPassword": user.password,
        "inputPassword": trimmedPassword,
        "match": user.password === trimmedPassword
    });

     // Direct password comparison (no hashing)
    if (trimmedPassword.trim() !== user.password.trim()) {
      return next(new ErrorHandler("Wrong Credentials", 401));
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(200).send({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        password: user.password // Return password directly
      },
    });
  })
);

// Auth - Register (Without password hashing)
router.post(
  "/register",
  asyncerror(async (req, res, next) => {
    const { name, email, password, referral } = req.body;

    if (!name || !email || !password) {
      return next(
        new ErrorHandler("Name, email and password are required", 400)
      );
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return next(new ErrorHandler("User already exists", 409));

    let referredBy = null;
    if (referral) {
      const referredByUser = await User.findOne({ referralcode: referral });
      if (referredByUser) referredBy = referredByUser._id;
    }

    const referralcode = await generateUniqueReferralCode();

    // Store password directly (no hashing)
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: password, // Direct password storage
      referralcode,
      referredBy,
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(201).send({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  })
);

// Step 1: Verify Email - Check if email exists
router.post('/verifyemail', asyncerror(async (req, res, next) => {
    const { email } = req.body;
    
    if (!email) {
        return next(new ErrorHandler("Email is required", 400));
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
        return next(new ErrorHandler("No account found with this email", 404));
    }

    // Generate a simple token for frontend navigation (optional)
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    
    res.status(200).send({ 
        success: true, 
        message: "Email verified successfully",
        token: token // Frontend can use this to maintain session
    });
}));

// Step 2: Reset Password - Direct reset after email verification
router.post('/resetpassword', asyncerror(async (req, res, next) => {
    const { token, newpassword } = req.body;
    
    if (!token || !newpassword) {
        return next(new ErrorHandler("Token and new password are required", 400));
    }

    try {
        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
            return next(new ErrorHandler("User not found", 404));
        }

        // Direct password update
        user.password = newpassword;
        await user.save();

        res.status(200).send({ 
            success: true, 
            message: "Password reset successfully" 
        });
    } catch (err) {
        return next(new ErrorHandler("Invalid or expired token", 400));
    }
}));

// Helper function
async function generateUniqueReferralCode() {
  while (true) {
    const newReferralCode = referralCodes.generate({ length: 8 });
    const exists = await User.findOne({ referralcode: newReferralCode[0] });
    if (!exists) return newReferralCode[0];
  }
}
  
// ---------------- Profile ----------------
router.post(
  "/updateme",
  verifyToken,
  asyncerror(async (req, res, next) => {
    // Prevent updating sensitive fields
    const {
      password,
      funding_password,
      balance,
      locked_amount,
      ...updateData
    } = req.body;

    const user = await User.findByIdAndUpdate(req._id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.status(200).send({ success: true, user });
  })
);

router.get(
  "/me",
  verifyToken,
  asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id)
      .select("-password")
      .populate("membership.plan")
      .populate("referredBy", "name email");

    res.status(200).send({ success: true, user });
  })
);

router.post(
  "/changeinfo",
  verifyToken,
  asyncerror(async (req, res, next) => {
    const { wallet_address, phone } = req.body;
    const updateData = {};

    if (wallet_address) updateData.wallet_address = wallet_address;
    if (phone) updateData.phone = phone;

    const user = await User.findByIdAndUpdate(req._id, updateData, {
      new: true,
    }).select("-password");

    res.status(200).send({ success: true, user });
  })
);

// ---------------- Image Upload ----------------
router.post(
  "/upload",
  verifyToken,
  asyncerror(async (req, res, next) => {
    if (!req.body.file) {
      return next(new ErrorHandler("File is required", 400));
    }

    const result = await cloudinary.uploader.upload(req.body.file);
    const data = { url: result.secure_url, public_id: result.public_id };
    res.status(200).send({ success: true, data });
  })
);

router.delete(
  "/upload",
  verifyToken,
  asyncerror(async (req, res, next) => {
    if (!req.body.public_id) {
      return next(new ErrorHandler("Public ID is required", 400));
    }

    await cloudinary.uploader.destroy(req.body.public_id);
    res
      .status(200)
      .send({ success: true, message: "Image deleted successfully" });
  })
);

// ---------------- Referrals ----------------
router.get(
  "/referrals/:userId",
  verifyToken,
  asyncerror(async (req, res, next) => {
    const referrals = await User.find({ referredBy: req.params.userId }).select(
      "name email createdAt"
    );

    res.status(200).send({ success: true, data: referrals });
  })
);

module.exports = router;
