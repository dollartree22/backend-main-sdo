const express = require('express');
const router = express.Router();
const asyncerror = require('../middlewares/catchasyncerror');
const { verifyToken, isadmin } = require('../middlewares/verifyauth');
const User = require('../model/user');
const ErrorHandler = require('../middlewares/errorhandler');
const Plan = require('../model/Plans');
const Reward = require('../model/Reward');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');
const mongoose = require('mongoose');

function getDateAfterXDays(x) {
    if (typeof x !== 'number' || x <= 0) {
        throw new Error('Invalid number of days');
    }
    const currentDate = new Date();
    const futureDate = new Date(currentDate.getTime() + x * 24 * 60 * 60 * 1000);
    return futureDate;
}

// Get all plans
router.get('/', verifyToken, asyncerror(async (req, res, next) => {
    const data = await Plan.find().sort({ duration: 1 });
    res.status(200).send({ success: true, data });
}));

// Join plan
router.post('/', verifyToken, asyncerror(async (req, res, next) => {
    const { id, amount } = req.body;
    
    if (!id || !amount) {
        return next(new ErrorHandler('Plan ID and amount are required', 400));
    }

    if (amount < 50) {
        return next(new ErrorHandler('Minimum investment is $50', 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findById(req._id).session(session);
        const plan = await Plan.findById(id).session(session);
        
        if (!plan) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('Plan not found', 404));
        }

        const totalBalance = (user.balance || 0) + (user.locked_amount || 0);
        if (totalBalance < amount) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('Insufficient balance', 400));
        }

        // Handle existing membership
        if (user.membership && user.membership.plan) {
            // Return existing membership balance to user
            user.balance += (user.membership.balance || 0);
        }

        // Deduct amount from balances
        let remainingAmount = amount;
        if (user.locked_amount > 0) {
            const deductFromLocked = Math.min(user.locked_amount, remainingAmount);
            user.locked_amount -= deductFromLocked;
            remainingAmount -= deductFromLocked;
        }
        
        if (remainingAmount > 0) {
            user.balance -= remainingAmount;
        }

        // Create new membership
        user.membership = {
            plan: plan._id,
            locked_amount: amount,
            balance: 0,
            id: uuidv4(),
            end_date: getDateAfterXDays(plan.duration)
        };

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.status(200).send({ success: true, message: 'Plan joined successfully' });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
}));

// Upgrade plan
router.put('/', verifyToken, asyncerror(async (req, res, next) => {
    const { id, amount } = req.body;
    
    if (!id || !amount) {
        return next(new ErrorHandler('Plan ID and amount are required', 400));
    }

    if (amount < 50) {
        return next(new ErrorHandler('Minimum investment is $50', 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findById(req._id).session(session);
        const plan = await Plan.findById(id).session(session);
        
        if (!plan) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('Plan not found', 404));
        }

        if (!user.membership || !user.membership.plan) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('No existing membership to upgrade', 400));
        }

        // Check if new plan has longer duration
        const currentPlan = await Plan.findById(user.membership.plan).session(session);
        if (plan.duration <= currentPlan.duration) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('New plan must have longer duration', 400));
        }

        const totalBalance = (user.balance || 0) + (user.locked_amount || 0) + (user.membership.balance || 0);
        if (totalBalance < amount) {
            await session.abortTransaction();
            session.endSession();
            return next(new ErrorHandler('Insufficient balance', 400));
        }

        // Return current membership balance
        user.balance += (user.membership.balance || 0);

        // Deduct new amount
        let remainingAmount = amount;
        if (user.locked_amount > 0) {
            const deductFromLocked = Math.min(user.locked_amount, remainingAmount);
            user.locked_amount -= deductFromLocked;
            remainingAmount -= deductFromLocked;
        }
        
        if (remainingAmount > 0) {
            user.balance -= remainingAmount;
        }

        // Update membership
        user.membership = {
            plan: plan._id,
            locked_amount: amount,
            balance: 0,
            id: uuidv4(),
            end_date: getDateAfterXDays(plan.duration)
        };

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.status(200).send({ success: true, message: 'Plan upgraded successfully' });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
}));

// Mining system with persistent scheduling
router.post('/startmining', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id).populate('membership.plan');
    
    if (!user) {
        return next(new ErrorHandler('User not found', 404));
    }

    const nowET = moment().tz("America/New_York");
    
    if (user.miningstartdata) {
        const miningStartET = moment(user.miningstartdata).tz("America/New_York");
        if (nowET.isSame(miningStartET, 'day')) {
            return res.status(400).send({
                success: false,
                message: "You've already started mining today. Wait until tomorrow."
            });
        }
    }

    // Update mining start date
    user.miningstartdata = new Date();
    await user.save();

    // Calculate immediate profit for today
    await calculateUserProfit(user);

    res.status(200).send({ 
        success: true, 
        message: "Mining started successfully. Today's profit has been calculated." 
    });
}));

// Calculate profit for a single user
async function calculateUserProfit(user) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let profit = 0;

        if (user.membership?.plan) {
            // Membership plan profit - FIXED CALCULATION
            profit = (user.membership.locked_amount * user.membership.plan.profit) / 100;
            
            // Add profit to membership balance
            user.membership.balance = (user.membership.balance || 0) + profit;
            
            // Check if membership expired
            const today = new Date();
            if (user.membership.end_date < today) {
                // Transfer balance to main account if expired
                user.balance = (user.balance || 0) + (user.membership.balance || 0);
                user.membership = null;
            } else {
                // Create reward record
                await Reward.create([{
                    amount: profit,
                    user: user._id,
                    type: "Investment Plan Daily Profit"
                }], { session });
            }
        } else {
            // Basic profit for non-members
            const totalBalance = (user.locked_amount || 0) + (user.balance || 0);
            profit = (totalBalance * 2) / 100; // 2% daily profit
            
            user.balance = (user.balance || 0) + profit;
            await Reward.create([{
                amount: profit,
                user: user._id,
                type: "Basic Daily Profit"
            }], { session });
        }

        // Process referral profits if profit was generated
        if (profit > 0) {
            await ProfitReferralsTree(user, 3, 0, profit, session);
        }

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();
        
        console.log(`Profit calculated for user ${user._id}: $${profit}`);
        return profit;
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error calculating user profit:', error);
        throw error;
    }
}

// Daily profit calculation (run via cron job)
async function calculateDailyProfits() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const allUsers = await User.find().populate('membership.plan').session(session);
        const today = new Date();

        for (const user of allUsers) {
            try {
                let profit = 0;

                if (user.membership?.plan) {
                    // Membership plan profit - FIXED CALCULATION
                    profit = (user.membership.locked_amount * user.membership.plan.profit) / 100;
                    
                    // Add profit to membership balance
                    user.membership.balance = (user.membership.balance || 0) + profit;
                    
                    // Check if membership expired
                    if (user.membership.end_date < today) {
                        user.balance = (user.balance || 0) + (user.membership.balance || 0);
                        user.membership = null;
                    } else {
                        await Reward.create([{
                            amount: profit,
                            user: user._id,
                            type: "Investment Plan Daily Profit"
                        }], { session });
                    }
                } else {
                    // Basic profit for non-members
                    const totalBalance = (user.locked_amount || 0) + (user.balance || 0);
                    profit = (totalBalance * 2) / 100; // 2% daily profit
                    
                    user.balance = (user.balance || 0) + profit;
                    await Reward.create([{
                        amount: profit,
                        user: user._id,
                        type: "Basic Daily Profit"
                    }], { session });
                }

                // Process referral profits
                if (profit > 0) {
                    await ProfitReferralsTree(user, 3, 0, profit, session);
                }

                await user.save({ session });
            } catch (userError) {
                console.error(`Error processing user ${user._id}:`, userError);
                continue;
            }
        }

        await session.commitTransaction();
        session.endSession();
        console.log('Daily profit calculation completed successfully');
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error in daily profit calculation:', error);
    }
}

async function ProfitReferralsTree(user, maxDepth, currentDepth, amount, session = null) {
    if (currentDepth >= maxDepth || !user.referredBy) {
        return;
    }

    const referredBy = await User.findById(user.referredBy).session(session);
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
    referredBy.balance = (referredBy.balance || 0) + profitAmount;
    
    await Reward.create([{
        amount: profitAmount,
        user: referredBy._id,
        type: `Referral Level ${currentDepth + 1} Daily Profit`
    }], { session });

    await referredBy.save({ session });

    // Continue to next level
    await ProfitReferralsTree(referredBy, maxDepth, currentDepth + 1, amount, session);
}

// Manual profit test endpoint
router.post('/test-profit', verifyToken, asyncerror(async (req, res, next) => {
    const user = await User.findById(req._id).populate('membership.plan');
    
    if (!user.membership?.plan) {
        return next(new ErrorHandler('No active plan found', 400));
    }

    const profit = (user.membership.locked_amount * user.membership.plan.profit) / 100;
    user.membership.balance = (user.membership.balance || 0) + profit;
    await user.save();

    res.status(200).send({ 
        success: true, 
        message: `Profit calculated: $${profit.toFixed(2)}`,
        profit: profit,
        new_membership_balance: user.membership.balance,
        plan_details: {
            locked_amount: user.membership.locked_amount,
            profit_percentage: user.membership.plan.profit,
            plan_name: user.membership.plan.title
        }
    });
}));

// Uncomment and set up proper cron job in your server initialization
// cron.schedule('0 0 * * *', () => calculateDailyProfits()); // Run daily at midnight

module.exports = router;
 