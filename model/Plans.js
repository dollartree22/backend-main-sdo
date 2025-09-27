const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
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
        required: true
    }
});

const Plan = mongoose.model("Plan", planSchema);

console.log("✅ Plan model registered");

module.exports = Plan;
