// Serverless function for Vercel - Creates Stripe Checkout session
// Environment variables required:
// - STRIPE_SECRET_KEY: Your Stripe secret key
// - FRONTEND_URL: Your frontend URL (e.g., https://junoway.github.io/imbaricoffee.github.io)
// - ALLOWED_ORIGIN: Allowed CORS origin (usually same as FRONTEND_URL)

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { items, discountCode, tipAmount } = req.body;

    // CORS headers
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    // Calculate subtotal
    let subtotal = 0;
    const lineItems = items.map((item) => {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: item.description || '',
            images: item.image ? [item.image] : [],
          },
          unit_amount: Math.round(item.price * 100), // Convert to cents
        },
        quantity: item.quantity,
      };
    });

    // Apply discount (25% off for UBUNTU88)
    let discount = 0;
    if (discountCode && discountCode.toUpperCase() === 'UBUNTU88') {
      discount = subtotal * 0.25;
    }

    // Add tip if provided
    const tip = parseFloat(tipAmount) || 0;

    // Add shipping
    const shipping = 10.0;

    // Add tip as a line item if > 0
    if (tip > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Tip',
            description: 'Thank you for your support!',
          },
          unit_amount: Math.round(tip * 100),
        },
        quantity: 1,
      });
    }

    // Add shipping as a line item
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Shipping',
          description: 'Standard shipping',
        },
        unit_amount: Math.round(shipping * 100),
      },
      quantity: 1,
    });

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      payment_method_types: ['card'],
      success_url: `${process.env.FRONTEND_URL}/checkout?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/checkout?canceled=true`,
      metadata: {
        discountCode: discountCode || 'none',
        discountAmount: discount.toFixed(2),
        tipAmount: tip.toFixed(2),
      },
    });

    return res.status(200).json({ 
      url: session.url,
      sessionId: session.id 
    });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ 
      error: 'Server error creating checkout session',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}
