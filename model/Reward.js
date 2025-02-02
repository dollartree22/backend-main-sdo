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
    id: {
        type: String
    },
    type:{
        type: String
    }
}, {
    timestamps: true
});

const Reward = mongoose.model("reward", userSchema);

module.exports = Reward;
