const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true
    },
}, {
    timestamps: true
});

const Adminmodel = mongoose.model("admin", userSchema);

module.exports = Adminmodel;
