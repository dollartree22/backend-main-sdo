const express = require('express');
const router = express.Router();
const asyncerror = require('../middlewares/catchasyncerror');
const { verifyToken, isadmin } = require('../middlewares/verifyauth');
const Deposit = require('../model/Deposits.js');
const Withdrawal = require('../model/Withdrawals');
const User = require('../model/user');
const ErrorHandler = require('../middlewares/errorhandler');
const Reward = require('../model/Reward');


// Withdrawal
router.get('/withdraw', verifyToken, asyncerror(async (req, res, next) => {
    const data = await Withdrawal.find({ user: req._id }).sort({ createdAt: -1 });
    res.status(200).send({ success: true, data })
}));
router.get('/withdraws', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const pending = await Withdrawal.find({
        status: "pending"
    }).populate('user').sort({ createdAt: -1 });
    const approved = await Withdrawal.find({
        status: "approve"
    }).populate('user').sort({ createdAt: -1 });
    const rejected = await Withdrawal.find({
        status: "reject"
    }).populate('user').sort({ createdAt: -1 });
    res.status(200).send({ success: true, pending, approved, rejected })
}));
router.post('/withdraw', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id);
    if (req.body.password !== user.funding_password) {
        return next(new ErrorHandler('Wrong password!', 404))
    }
    if (user.balance < req.body.amount) {
        return next(new ErrorHandler('Low Balance!', 404))
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set the time to midnight to represent the start of the day

    const lastwithdraw = await Withdrawal.findOne({
        user: user._id,
        createdAt: { $gte: today }, // Find withdrawals created today or later
    });
    if (lastwithdraw) {
        return next(new ErrorHandler('You can Only request One withdrawal a day!', 404))
    }
    req.body.user = req._id
    const data = await Withdrawal.create(req.body);
    res.status(200).send({ success: true, data });
}));

router.post('/withdraw/approve', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const data = await Withdrawal.findByIdAndUpdate(req.body.id, {
        status: "approve"
    });
    const user = await User.findById(data.user);
    if (!user) {
        return next(new ErrorHandler("User not found", 404))
    }
    let balance = user.balance;
    balance -= data.amount;
    user.balance = balance;
    user.save()
    res.status(200).send({ success: true, data })
}));
router.post('/withdraw/reject', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const data = await Withdrawal.findByIdAndUpdate(req.body.id, {
        status: "reject"
    })
    res.status(200).send({ success: true, data })
}));

// Deposit
router.get('/deposit', verifyToken, asyncerror(async (req, res, next) => {
    const data = await Deposit.find({ user: req._id }).sort({ createdAt: -1 });
    res.status(200).send({ success: true, data })
}));
// Admin
router.get('/deposits', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const pending = await Deposit.find({
        status: "pending"
    }).populate('user').sort({ createdAt: -1 });
    const approved = await Deposit.find({
        status: "approve"
    }).populate('user').sort({ createdAt: -1 });
    const rejected = await Deposit.find({
        status: "reject"
    }).populate('user').sort({ createdAt: -1 });
    res.status(200).send({ success: true, pending, approved, rejected })
}));
router.post('/deposit', verifyToken, asyncerror(async (req, res, next) => {
    req.body.user = req._id;
    const data = await Deposit.create(req.body);
    res.status(200).send({ success: true, data })
}));

router.post('/deposit/approve', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const data = await Deposit.findByIdAndUpdate(req.body.id, {
        status: "approve"
    });
    const user = await User.findById(data.user);
    if (!user) {
        return next(new ErrorHandler("User not found", 404))
    }
    let balance = user.locked_amount;
    balance += data.amount;
    user.locked_amount = balance;
    user.save();
    const deposit = await Deposit.find({ user: req._id, status: "approve" })
    console.log(deposit.length)
    if (deposit.length === 0) {
        console.log('here')
        ProfitReferralsTree(user, 2, 0, data.amount)
    }
    res.status(200).send({ success: true, data })
}));

async function ProfitReferralsTree(user, maxDepth, currentDepth, amount) {
    if (currentDepth > maxDepth) {
        console.log("leaving")
        return;
    }
    const referredbyId = user.referredBy;
    const referredby = await User.findById(referredbyId);
    if (!referredby) {
        return
    }
    let profit;
    if (currentDepth == 0) {
        profit = 10;
    } else if (currentDepth == 1) {
        profit = 5;
    } else if (currentDepth == 2) {
        profit = 2.5;
    } else {
        return
    }
    let profitamount = (amount * profit) / 100
    referredby.balance += profitamount;
    await Reward.create({ amount: profitamount, user: referredby._id, type: "Refferal Team Profit" });
    console.log(`profit added in`, referredby._id, profitamount)
    referredby.save();
    ProfitReferralsTree(referredby, maxDepth, currentDepth + 1, amount);
}

router.post('/deposit/reject', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const data = await Deposit.findByIdAndUpdate(req.body.id, {
        status: "reject"
    })
    res.status(200).send({ success: true, data })
}));

// Rewwards

router.get('/reward', verifyToken, asyncerror(async (req, res, next) => {
    const data = await Reward.find({ user: req._id }).sort({ createdAt: -1 });
    res.status(200).send({ success: true, data })
}));

module.exports = router