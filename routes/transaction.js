const express = require('express');
const router = express.Router();
const asyncerror = require('../middlewares/catchasyncerror');
const { verifyToken, isadmin } = require('../middlewares/verifyauth');
const Deposit = require('../model/Deposits.js');
const Withdrawal = require('../model/Withdrawals');
const User = require('../model/user');
const ErrorHandler = require('../middlewares/errorhandler');
const Reward = require('../model/Reward');
const mongoose = require('mongoose');

// Withdrawal
router.get('/withdraw', verifyToken, asyncerror(async (req, res, next) => {
    const data = await Withdrawal.find({ user: req._id }).sort({ createdAt: -1 });
    res.status(200).send({ success: true, data });
}));

router.get('/withdraws', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const pending = await Withdrawal.find({ status: "pending" })
        .populate('user', 'name email')
        .sort({ createdAt: -1 });
    
    const approved = await Withdrawal.find({ status: "approve" })
        .populate('user', 'name email')
        .sort({ createdAt: -1 });
    
    const rejected = await Withdrawal.find({ status: "reject" })
        .populate('user', 'name email')
        .sort({ createdAt: -1 });
    
    res.status(200).send({ success: true, pending, approved, rejected });
}));

router.post('/withdraw', verifyToken, asyncerror(async (req, res, next) => {
    const { amount, password } = req.body;
    
    if (!amount || !password) {
        return next(new ErrorHandler('Amount and password are required', 400));
    }

    if (amount < 10) {
        return next(new ErrorHandler('Minimum withdrawal amount is $10', 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findById(req._id).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('User not found', 404));
        }

        // Verify funding password
        const isFundingPasswordValid = await user.compareFundingPassword(password);
        if (!isFundingPasswordValid) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('Wrong funding password!', 401));
        }

        if (user.balance < amount) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('Insufficient balance!', 400));
        }

        // Check for today's withdrawals
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayWithdrawals = await Withdrawal.findOne({
            user: user._id,
            createdAt: { $gte: today, $lt: tomorrow },
            status: { $in: ['pending', 'approve'] }
        }).session(session);

        if (todayWithdrawals) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('You can only request one withdrawal per day!', 400));
        }

        // Create withdrawal request
        const withdrawalData = await Withdrawal.create([{
            user: req._id,
            amount: amount,
            status: 'pending',
            wallet_address: user.wallet_address
        }], { session });

        // Deduct balance
        user.balance -= amount;
        await user.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).send({ success: true, data: withdrawalData[0] });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
}));

router.post('/withdraw/approve', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const { id } = req.body;
    
    if (!id) {
        return next(new ErrorHandler('Withdrawal ID is required', 400));
    }

    const data = await Withdrawal.findByIdAndUpdate(
        id, 
        { status: "approve" },
        { new: true }
    );
    
    res.status(200).send({ success: true, data });
}));

router.post('/withdraw/reject', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const { id } = req.body;
    
    if (!id) {
        return next(new ErrorHandler('Withdrawal ID is required', 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const withdrawal = await Withdrawal.findById(id).session(session);
        if (!withdrawal) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('Withdrawal not found', 404));
        }

        // Refund balance to user
        const user = await User.findById(withdrawal.user).session(session);
        if (user) {
            user.balance += withdrawal.amount;
            await user.save({ session });
        }

        const data = await Withdrawal.findByIdAndUpdate(
            id,
            { status: "reject" },
            { new: true, session }
        );

        await session.commitTransaction();
        session.endSession();

        res.status(200).send({ success: true, data });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
}));

// Deposit
router.get('/deposit', verifyToken, asyncerror(async (req, res, next) => {
    const data = await Deposit.find({ user: req._id }).sort({ createdAt: -1 });
    res.status(200).send({ success: true, data });
}));

// Admin deposits view
router.get('/deposits', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const pending = await Deposit.find({ status: "pending" })
        .populate('user', 'name email')
        .sort({ createdAt: -1 });
    
    const approved = await Deposit.find({ status: "approve" })
        .populate('user', 'name email')
        .sort({ createdAt: -1 });
    
    const rejected = await Deposit.find({ status: "reject" })
        .populate('user', 'name email')
        .sort({ createdAt: -1 });
    
    res.status(200).send({ success: true, pending, approved, rejected });
}));

router.post('/deposit', verifyToken, asyncerror(async (req, res, next) => {
    const { amount } = req.body;
    
    if (!amount || amount < 50) {
        return next(new ErrorHandler("Minimum deposit is $50", 400));
    }

    req.body.user = req._id;
    const data = await Deposit.create(req.body);
    
    res.status(200).send({ success: true, data });
}));

router.post('/deposit/approve', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const { id } = req.body;
    
    if (!id) {
        return next(new ErrorHandler('Deposit ID is required', 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const deposit = await Deposit.findByIdAndUpdate(
            id,
            { status: "approve" },
            { new: true, session }
        );

        if (!deposit) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler("Deposit not found", 404));
        }

        const user = await User.findById(deposit.user).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler("User not found", 404));
        }

        // Add to locked amount
        user.locked_amount += deposit.amount;
        
        // First deposit bonus (5%)
        const userDeposits = await Deposit.find({ 
            user: user._id, 
            status: "approve" 
        }).session(session);

        if (userDeposits.length === 1) {
            const bonus = deposit.amount * 0.05;
            user.balance += bonus;
            await Reward.create([{
                amount: bonus,
                user: user._id,
                type: "Deposit Bonus"
            }], { session });
        }

        // Process referral profits
        await ProfitReferralsTree(user, 3, 0, deposit.amount, session);

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.status(200).send({ success: true, data: deposit });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
}));

async function ProfitReferralsTree(user, maxDepth, currentDepth, amount, session = null) {
    if (currentDepth >= maxDepth || !user.referredBy) {
        return;
    }

    const referredBy = await User.findById(user.referredBy);
    if (!referredBy) {
        return;
    }

    let profitPercentage;
    switch (currentDepth) {
        case 0:
            profitPercentage = 10; // 10% for level 1
            break;
        case 1:
            profitPercentage = 5;  // 5% for level 2
            break;
        case 2:
            profitPercentage = 2.5; // 2.5% for level 3
            break;
        default:
            return;
    }

    const profitAmount = (amount * profitPercentage) / 100;
    referredBy.balance += profitAmount;
    
    await Reward.create([{
        amount: profitAmount,
        user: referredBy._id,
        type: `Referral Level ${currentDepth + 1} Profit`
    }], { session });

    await referredBy.save({ session });

    // Continue to next level
    await ProfitReferralsTree(referredBy, maxDepth, currentDepth + 1, amount, session);
}

router.post('/deposit/reject', verifyToken, isadmin, asyncerror(async (req, res, next) => {
    const { id } = req.body;
    
    if (!id) {
        return next(new ErrorHandler('Deposit ID is required', 400));
    }

    const data = await Deposit.findByIdAndUpdate(
        id,
        { status: "reject" },
        { new: true }
    );
    
    res.status(200).send({ success: true, data });
}));

// Rewards
router.get('/reward', verifyToken, asyncerror(async (req, res, next) => {
    const data = await Reward.find({ user: req._id }).sort({ createdAt: -1 });
    res.status(200).send({ success: true, data });
}));

module.exports = router;