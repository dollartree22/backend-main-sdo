const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  profile_url: {
    type: String,
    validate: {
      validator: function(v) {
        return v === null || /^https?:\/\/.+\..+/.test(v);
      },
      message: 'Invalid URL format'
    }
  },
  profile_public_id: {
    type: String,
  },
  wallet_address: {
    type: String,
    trim: true
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  funding_password: {
    type: String,
    minlength: [6, 'Funding password must be at least 6 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  balance: {
    type: Number,
    default: 0,
    min: [0, 'Balance cannot be negative']
  },
  locked_amount: {
    type: Number,
    default: 0,
    min: [0, 'Locked amount cannot be negative']
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  referralcode: {
    type: String,
    unique: true,
    sparse: true
  },
  miningstartdata: {
    type: Date,
    validate: {
      validator: function(v) {
        return v === null || v instanceof Date;
      },
      message: 'Invalid date format'
    }
  },
  membership: {
    id: {
      type: String
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan' // Changed from 'plan' to 'Plan' for consistency
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, 'Membership balance cannot be negative']
    },
    locked_amount: {
      type: Number,
      default: 0,
      min: [0, 'Membership locked amount cannot be negative']
    },
    end_date: {
      type: Date,
      validate: {
        validator: function(v) {
          return v === null || v instanceof Date;
        },
        message: 'Invalid date format'
      }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ referralcode: 1 });
userSchema.index({ referredBy: 1 });
userSchema.index({ createdAt: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Hash funding password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('funding_password') || !this.funding_password) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.funding_password = await bcrypt.hash(this.funding_password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Compare funding password method
userSchema.methods.compareFundingPassword = async function(candidatePassword) {
  if (!this.funding_password) return false;
  return bcrypt.compare(candidatePassword, this.funding_password);
};

// Virtual for total balance
userSchema.virtual('totalBalance').get(function() {
  return (this.balance || 0) + (this.locked_amount || 0);
});

// Transform output to remove sensitive data
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.funding_password;
  delete user.__v;
  return user;
};

const User = mongoose.model("User", userSchema);

module.exports = User;