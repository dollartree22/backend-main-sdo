const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  profile_url: {
    type: String,
  },
  profile_public_id: {
    type: String,
  },
  wallet_address:{
    type:String,
  },
  email: {
    type: String,
    required: true
  },
  funding_password: {
    type: String,
  },
  password: {
    type: String,
  },
  balance: {
    type: Number,
    default: 0
  },
  locked_amount: {
    type: Number,
    default: 0
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  referralcode: {
    type: String,
  },
  miningstartdata:{
    type: Date,
  },
  membership: {
    id: {
      type: String
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'plan'
    },
    balance: {
      type: Number,
      default: 0
    },
    locked_amount: {
      type: Number,
      default: 0
    },
    end_date: {
      type: Date
    }
  }
}, {
  timestamps: true
});

const User = mongoose.model("User", userSchema);

module.exports = User;
