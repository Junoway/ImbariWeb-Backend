require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://www.imbaricoffee.com';

app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

app.options('*', cors()); // Preflight for all routes

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { items, location, shipping, tax, discountCode, discountAmount, tipAmount, subtotal, total } = req.body;
    // Build line items for Stripe
    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));
    // Add tip as a line item if present
    if (tipAmount && tipAmount > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Tip' },
          unit_amount: Math.round(tipAmount * 100),
        },
        quantity: 1,
      });
    }
    // Add shipping as a line item if present
    if (shipping && shipping > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Shipping' },
          unit_amount: Math.round(shipping * 100),
        },
        quantity: 1,
      });
    }
    // Add discount as a negative line item if present
    if (discountAmount && discountAmount > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: `Discount (${discountCode})` },
          unit_amount: -Math.round(discountAmount * 100),
        },
        quantity: 1,
      });
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: process.env.FRONTEND_URL + '/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.FRONTEND_URL + '/checkout/canceled',
      metadata: {
        location,
        subtotal,
        tax,
        total,
      },
    });
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
