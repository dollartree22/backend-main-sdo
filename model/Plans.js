const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    profit: {
        type: Number,
        required: true
    },
    duration: {
        type: Number,
        required:true
    }
});

const Plan = mongoose.model("plan", userSchema);

module.exports = Plan;
