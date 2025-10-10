const express = require('express');
const router = express.Router();
const asyncerror = require('../middlewares/catchasyncerror');
const ErrorHandler = require('../middlewares/errorhandler');
const Admin = require('../model/Admin.js');
const { verifyToken, isadmin } = require('../middlewares/verifyauth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { sendmsg } = require("../middlewares/sendmsg");
const User = require('../model/user');
const Deposit = require('../model/Deposits');
const Reward = require('../model/Reward');
const Withdrawal = require('../model/Withdrawals');

router.post('/login', asyncerror(async (req, res, next) => {
    const user = await Admin.findOne({ username: req.body.username })
    if (!user) {
        return next(new ErrorHandler('No User found', 405))
    }
    if (user.role !== 'admin') {
        return next(new ErrorHandler('Not Admin', 405))
    }
    if (req.body.password !== user.password) {
        return next(new ErrorHandler('Wrong Credentials', 405))
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(200).send({ success: true, token })
}));


router.get('/user', isadmin, asyncerror(async (req, res, next) => {
    const data = await User.find()
    res.status(200).send({ success: true, data })
}));
router.delete('/user/:id', isadmin, asyncerror(async (req, res, next) => {
    const data = await User.findByIdAndDelete(req.params.id)
    res.status(200).send({ success: true, data })
}));

router.get('/user/:id', isadmin, asyncerror(async (req, res, next) => {
    const userId = req.params.id;
    const user = await User.findById(userId).select("-password").populate('membership.plan').populate('referredBy');
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    const maxDepth = 2; // Maximum depth for the referrals tree
    const data = await buildReferralsTree(user, maxDepth, 0);
    const deposit = await Deposit.find({ user: userId })
    const withdraw = await Withdrawal.find({ user: userId })
    const reward = await Reward.find({ user: userId })
    res.status(200).send({
        success: true, user, data: {
            name: user.email, toggled: true, children: data
        },
        history: {
            deposit,
            withdraw,
            reward
        }
    })
}));

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
                name: referral?.email,
                children: await buildReferralsTree(referral, maxDepth, currentDepth + 1)
            };
            referralsData.push(referralData);
        }
    }
    return referralsData;
}
module.exports = router