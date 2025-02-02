const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
      type: String,
      default: "pending"
    },
    image:{
        url:{
            type:String
        },
        public_id:{
            type:String
        }
    }
}, {
    timestamps: true
});

const Deposit = mongoose.model("deposit", userSchema);

module.exports = Deposit;
