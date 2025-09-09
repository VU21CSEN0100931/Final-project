const express = require('express');
const router = express.Router();
const PriceUpdate = require('../models/PriceUpdate');

// Middleware to check authentication
function isAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login'); // Redirect if not logged in
  }
  next();
}

// Home page (landing)
router.get('/', (req, res) => {
  res.render('home', { user: req.session.user || null, locale: req.getLocale() });
});

// Login page
router.get('/login', (req, res) => {
  res.render('login', { user: req.session.user || null, locale: req.getLocale() });
});

// Signup page
router.get('/signup', (req, res) => {
  res.render('signup', { user: req.session.user || null, locale: req.getLocale() });
});

router.get('/admin', isAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;

    if (!user.bazaarName) {
      return res.status(403).send("You are not assigned to any Bazaar.");
    }

    const history = await PriceUpdate.find({ bazaarName: user.bazaarName }).sort({ date: -1 });

    res.render('admin', { user, history, locale: req.getLocale() });
  } catch (error) {
    res.status(500).send("Error loading admin dashboard");
  }
});


// Allow anyone to access the Customer Dashboard without login
router.get('/customer', async (req, res) => {
  try {
    const history = await PriceUpdate.find({}).sort({ date: -1 });
    res.render('customer', { user: req.session.user || null, history, locale: req.getLocale() });
  } catch (error) {
    res.status(500).send("Error loading customer dashboard");
  }
});


// Logout route: destroy session and redirect to login
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Fetch price history for an item by name
router.get('/priceHistory/:name', async (req, res) => {
  try {
    const itemName = req.params.name;

    const history = await PriceUpdate.find({ "item.name": itemName }).sort({ date: 1 });

    if (history.length === 0) {
      return res.json({ success: false, message: "No price history found" });
    }

    res.json({ success: true, history: history.map(entry => ({
      date: entry.date,
      price: entry.item.price
    })) });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

module.exports = router;
