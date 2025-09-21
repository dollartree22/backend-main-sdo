
const express = require('express');
const app = express();
const connecttomongo = require('./db');
const cors = require('cors')
const asyncerror = require('./middlewares/catchasyncerror');
const bodyParser = require('body-parser');
require('dotenv').config()
const errorMiddleware = require('./middlewares/error.js');
const User = require('./model/user');
const Reward = require('./model/Reward');

// Cloudinary configuration - USE ENVIRONMENT VARIABLES
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// CORS configuration
app.use(cors({
  origin : process.env.FRONTEND_DOMAIN ? process.env.FRONTEND_DOMAIN.split(',') : 'http://localhost:3000',
  credentials: true
}));

// Database connection
connecttomongo();

// Body parser middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/admin', require('./routes/admin.js'));
app.use('/api/user', require('./routes/user.js'));
app.use('/api/transaction', require('./routes/transaction.js'));
app.use('/api/plan', require('./routes/plans.js'));

// Error middleware
app.use(errorMiddleware);

// Daily profit calculation function (Fixed version)
const calculateDailyProfits = asyncerror(async () => {
  try {
    const allusers = await User.find().populate('membership.plan');
    const today = new Date();
    
    for (const user of allusers) {
      try {
        if (user.membership?.plan) {
          // User has a membership plan
          let totalbalance = user.membership.locked_amount + (user.membership.balance || 0);
          const profit = (totalbalance * user.membership.plan.profit) / 100;
          user.membership.balance = (user.membership.balance || 0) + profit;
          
          // Check if membership has expired
          if (user.membership.end_date < today) {
            user.balance = (user.balance || 0) + user.membership.balance;
            user.membership = null;
          }
          
          // Create reward record
          await Reward.create({ 
            amount: profit, 
            user: user._id, 
            type: 'membership_profit' 
          });
        } else {
          // User without membership - basic profit
          let totalbalance = (user.locked_amount || 0) + (user.balance || 0);
          const profit = (totalbalance * 0.03); // 3% basic profit
          user.balance = (user.balance || 0) + profit;
          
          await Reward.create({ 
            amount: profit, 
            user: user._id,
            type: 'basic_profit' 
          });
        }
        
        await user.save();
      } catch (userError) {
        console.error(`Error processing user ${user._id}:`, userError);
      }
    }
    
    console.log('Daily profit calculation completed');
  } catch (error) {
    console.error('Error in daily profit calculation:', error);
  }
});

// Schedule daily profit calculation (run once per day)
setInterval(calculateDailyProfits, 24 * 60 * 60 * 1000);
// For testing: run immediately
calculateDailyProfits();
module.exports = app;
