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
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://junoway.github.io';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { 
      items, 
      location, 
      shipping, 
      tax,
      discountCode, 
      discountAmount,
      tipAmount, 
      subtotal,
      total 
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    // Validate Stripe key
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('REPLACE')) {
      console.error('Stripe secret key not configured');
      return res.status(500).json({ 
        error: 'Payment system not configured. Please contact support.',
        details: 'STRIPE_SECRET_KEY environment variable is missing or invalid'
      });
    }

    // Build line items for Stripe
    const lineItems = items.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: item.description || item.size || '',
          images: item.image ? [item.image.startsWith('http') ? item.image : `${process.env.FRONTEND_URL}${item.image}`] : [],
        },
        unit_amount: Math.round(item.price * 100), // Convert to cents
      },
      quantity: item.quantity,
    }));

    // Add discount as a line item if applicable
    if (discountAmount && discountAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Discount${discountCode ? ` (${discountCode})` : ''}`,
            description: 'Promotional discount applied',
          },
          unit_amount: -Math.round(discountAmount * 100), // Negative amount for discount
        },
        quantity: 1,
      });
    }

    // Add tip as a line item if > 0
    const tip = parseFloat(tipAmount) || 0;
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

    // Add shipping as a line item if > 0
    const shippingCost = parseFloat(shipping) || 0;
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping',
            description: location === 'kampala' ? 'Kampala delivery' : 'Outside Kampala delivery',
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
    }

    // Add tax as a line item
    const taxAmount = parseFloat(tax) || 0;
    if (taxAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Tax (10%)',
            description: 'Sales tax',
          },
          unit_amount: Math.round(taxAmount * 100),
        },
        quantity: 1,
      });
    }

    console.log('Creating Stripe session with line items:', lineItems);

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      payment_method_types: ['card'],
      success_url: `${process.env.FRONTEND_URL}/checkout/success?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/checkout/canceled?canceled=true`,
      metadata: {
        location: location || 'unknown',
        discountCode: discountCode || 'none',
        discountAmount: (discountAmount || 0).toFixed(2),
        tipAmount: tip.toFixed(2),
        subtotal: (subtotal || 0).toFixed(2),
        total: (total || 0).toFixed(2),
      },
      shipping_address_collection: {
        allowed_countries: ['UG', 'US', 'GB', 'CA', 'AU'], // Uganda and major markets
      },
      billing_address_collection: 'required',
    });

    console.log('Stripe session created successfully:', session.id);

    return res.status(200).json({ 
      url: session.url,
      sessionId: session.id 
    });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ 
      error: 'Server error creating checkout session',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Please try again or contact support'
    });
  }
}
