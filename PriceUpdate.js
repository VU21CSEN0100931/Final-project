const mongoose = require("mongoose");

const PriceUpdateSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bazaarName: { type: String, required: true },
  item: {
    name: { type: String, required: true },
    image: { type: String },
    price: { type: Number, required: true },
    history: [
      {
        price: { type: Number, required: true },
        date: { type: Date, default: Date.now },
      },
    ],
  },
  seasonalHighlights: { type: Boolean, required: true },
  availableQuantity: { type: Number, required: true },
  itemType: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PriceUpdate", PriceUpdateSchema);
