const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const User = require('../models/User');
const PriceUpdate = require('../models/PriceUpdate');

// Multer configuration for image uploads (stored in public/uploads)
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function(req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000 },
  fileFilter: function(req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Images Only!');
    }
  }
}).single('itemImage');

// POST /api/signup: Signup endpoint
router.post('/signup', async (req, res) => {
  const { username, password, bazaarName } = req.body;

  try {
    // Check if the bazaar is already assigned
    const existingBazaar = await User.findOne({ bazaarName });
    if (existingBazaar) {
      return res.json({ success: false, message: "This Bazaar is already assigned to another admin." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, role: 'admin', bazaarName });
    await newUser.save();
    
    req.session.user = newUser;
    res.json({ success: true, user: newUser });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});


// POST /api/login: Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = user;
      res.json({ success: true, user });
    } else {
      res.json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// POST /api/admin/update: Add or update items
router.post('/admin/update', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.json({ success: false, message: err });
    }

    const { bazaarName, itemName, itemPrice, availableQuantity, seasonalHighlights, itemType } = req.body;
    const adminId = req.session.user._id; // Get logged-in admin ID

    try {
      const normalizedItemName = itemName.trim().toLowerCase(); // Normalize item name

      let existingItem = await PriceUpdate.findOne({
        bazaarName,
        "item.name": { $regex: new RegExp(`^${normalizedItemName}$`, "i") } // Case-insensitive search
      });

      if (existingItem) {
        if (existingItem.adminId.toString() !== adminId) {
          return res.json({ success: false, message: "You do not have permission to modify this item." });
        }

        // ✅ Ensure history array exists
        if (!existingItem.item.history) {
          existingItem.item.history = [];
        }

        // ✅ Store previous price in history (if it's different from current price)
        if (existingItem.item.price !== Number(itemPrice)) {
          existingItem.item.history.push({
            price: existingItem.item.price,
            date: existingItem.date || new Date(),
          });
        }

        // ✅ Update existing item with new values
        existingItem.item.price = Number(itemPrice);
        existingItem.availableQuantity = availableQuantity;
        existingItem.seasonalHighlights = seasonalHighlights === 'true';
        existingItem.itemType = itemType;
        existingItem.date = new Date();
        
        if (req.file) {
          existingItem.item.image = `/uploads/${req.file.filename}`;
        }

        await existingItem.save();
      } else {
        // ✅ Create a new item and initialize history
        const newItem = new PriceUpdate({
          adminId,
          bazaarName,
          item: {
            name: normalizedItemName, // Save item name in lowercase
            image: req.file ? `/uploads/${req.file.filename}` : null,
            price: Number(itemPrice),
            history: [{ price: Number(itemPrice), date: new Date() }] // Initialize history
          },
          seasonalHighlights: seasonalHighlights === 'true',
          availableQuantity,
          itemType,
          date: new Date()
        });

        await newItem.save();
      }

      // Emit the update via Socket.IO
      const io = req.app.get('socketio');
      io.emit('priceUpdate', existingItem);
      res.json({ success: true, message: "Item updated successfully", item: existingItem });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });
});


// PUT /api/admin/update/:id: Modify an item (only price, availableQuantity, seasonalHighlights)
router.put('/admin/update/:id', async (req, res) => {
  try {
    const { itemPrice, availableQuantity, seasonalHighlights } = req.body;
    const updatedItem = await PriceUpdate.findByIdAndUpdate(
      req.params.id,
      {
        "item.price": itemPrice,
        availableQuantity,
        seasonalHighlights: seasonalHighlights === 'true'
      },
      { new: true }
    );
    if (!updatedItem) {
      return res.json({ success: false, message: "Item not found" });
    }
    res.json({ success: true, message: "Item updated successfully", item: updatedItem });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/delete/:id: Delete an item
router.delete('/admin/delete/:id', async (req, res) => {
  try {
    const adminId = req.session.user ? req.session.user._id : null;

    if (!adminId) {
      return res.json({ success: false, message: "Unauthorized: Admin ID missing" });
    }

    const item = await PriceUpdate.findById(req.params.id);

    if (!item) {
      return res.json({ success: false, message: "Item not found" });
    }

    // ✅ Allow deletion only if the logged-in admin created this item
    if (item.adminId.toString() !== adminId.toString()) {
      return res.json({ success: false, message: "You do not have permission to delete this item." });
    }

    await item.deleteOne();
    const io = req.app.get('socketio');
    io.emit('priceDelete', item);
    res.json({ success: true, message: "Item deleted successfully" });

  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

router.delete('/deleteAccount', async (req, res) => {
  try {
    const adminId = req.session.user._id;
    
    // Delete admin's account
    await User.findByIdAndDelete(adminId);

    // Delete all items added by the admin
    await PriceUpdate.deleteMany({ adminId });

    req.session.destroy(() => {
      res.json({ success: true, message: "Account deleted successfully!" });
    });
  } catch (error) {
    res.json({ success: false, message: "Error deleting account." });
  }
});


// GET /api/priceUpdates: Fetch items with filtering support (for customer dashboard)
router.get('/priceUpdates', async (req, res) => {
  try {
    let filter = {};
    if (req.query.bazaarName) filter.bazaarName = req.query.bazaarName;
    if (req.query.itemType) filter.itemType = req.query.itemType;
    if (req.query.seasonalHighlights) {
      filter.seasonalHighlights = req.query.seasonalHighlights === 'true';
    }
    let sort = { date: -1 };
    if (req.query.sortByPrice === 'low-to-high') {
      sort = { "item.price": 1 };
    } else if (req.query.sortByPrice === 'high-to-low') {
      sort = { "item.price": -1 };
    }
    const history = await PriceUpdate.find(filter).sort(sort);
    res.json({ success: true, history });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// API to Fetch Price History for the Same Item Across Different Bazaars
router.get('/comparePriceHistory/:itemName', async (req, res) => {
  try {
    const itemName = req.params.itemName;

    const history = await PriceUpdate.find({ "item.name": { $regex: `^${itemName}$`, $options: "i" } })
      .sort({ date: 1 });

    if (history.length === 0) {
      return res.json({ success: false, message: "No price history found" });
    }

    res.json({
      success: true,
      history: history.map(entry => ({
        date: entry.date,
        price: entry.item.price,
        bazaarName: entry.bazaarName
      }))
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// API to Fetch Single Bazaar Price History for an Item
router.get("/singlePriceHistory/:itemName/:bazaarName", async (req, res) => {
  try {
    const { itemName, bazaarName } = req.params;

    const item = await PriceUpdate.findOne({
      "item.name": { $regex: `^${itemName}$`, $options: "i" },
      bazaarName,
    });

    if (!item || !item.item.history.length) {
      return res.json({ success: false, message: "No price history found" });
    }

    res.json({
      success: true,
      history: item.item.history, // Return stored history
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});


module.exports = router;
