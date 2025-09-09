const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' },  // Can be 'admin' or 'customer'
  bazaarName: { type: String, unique: true, sparse: true }  // Each Bazaar assigned to one admin only
});

module.exports = mongoose.model('User', userSchema);
