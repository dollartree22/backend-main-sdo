const express = require('express');
const app = express();
const connecttomongo = require('./db');
const cors = require('cors');
const asyncerror = require('./middlewares/catchasyncerror');
const bodyParser = require('body-parser');
require('dotenv').config();
const errorMiddleware = require('./middlewares/error.js');
const User = require('./model/user');
const Reward = require('./model/Reward');
const cloudinary = require('cloudinary').v2;

// ✅ Proper CORS setup for your frontend domain
const allowedOrigins = [
  'https://onedollartree.online',
  'https://www.onedollartree.online'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
}));

// ✅ Handle preflight requests
app.options('*', cors());

connecttomongo();

cloudinary.config({
  cloud_name: 'dsjwppbw0',
  api_key: '868295654279613',
  api_secret: 'a1vX90dnUvhF6oOJVutj4-Z3Apc'
});

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// ✅ Debug headers (keep for testing)
app.use((req, res, next) => {
  if (req.path.includes('/register') || req.path.includes('/sendregotp')) {
    console.log('--- DEBUG HEADERS ---', req.path, req.method);
    console.log(req.headers);
  }
  next();
});

// ✅ Routes
app.use('/api/admin', require('./routes/admin.js'));
app.use('/api/user', require('./routes/user.js'));
app.use('/api/transaction', require('./routes/transaction.js'));
app.use('/api/plan', require('./routes/plans.js'));

// ✅ Error handling
app.use(errorMiddleware);

// ✅ Optional test function (disabled)
const test = asyncerror(async () => {
  setTimeout(async () => {
    const allusers = await User.find().populate('membership.plan');
    const today = new Date();
    for (const elem of allusers) {
      if (elem.membership?.plan) {
        let totalbalance = elem.membership.locked_amount + elem.membership.balance;
        const profit = (totalbalance * elem.membership.plan.profit) / 100;
        let newtotalbalance = elem.membership.balance + profit;
        elem.membership.balance = newtotalbalance;
        if (elem.membership.end_date < today) {
          elem.balance += elem.membership.balance;
          elem.membership = null;
        }
        await Reward.create({ amount: profit, user: elem._id, id: elem.membership.id });
      } else {
        let totalbalance = elem.locked_amount + elem.balance;
        const profit = (totalbalance * 3) / 100;
        let newtotalbalance = elem.balance + profit;
        await Reward.create({ amount: profit, user: elem._id });
        elem.balance = newtotalbalance;
      }
      elem.save();
    }
  }, 1000);
});

// module.exports
module.exports = app;
