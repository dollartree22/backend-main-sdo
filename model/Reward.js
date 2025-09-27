const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
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
    type: {
        type: String
    }
}, {
    timestamps: true
});

// ✅ yahan dono jagah rewardSchema hi use hoga
const Reward = mongoose.model("Reward", rewardSchema);

module.exports = Reward;
