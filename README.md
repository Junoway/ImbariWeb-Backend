# Imbari Coffee Backend

Serverless backend for Imbari Coffee e-commerce site. Handles Stripe Checkout session creation.

## Features

- Stripe Checkout session creation
- Discount code support (UBUNTU88 for 25% off)
- Tip calculation
- Shipping calculation
- CORS configuration for GitHub Pages

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
FRONTEND_URL=https://junoway.github.io/imbaricoffee.github.io
ALLOWED_ORIGIN=https://junoway.github.io
```

### 3. Local Development

```bash
npm run dev
```

The API will be available at `http://localhost:3000/api/create-checkout-session`

## Deploy to Vercel

### Method 1: Using Vercel CLI

1. Install Vercel CLI globally:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. Set environment variables in Vercel dashboard:
   - Go to your project settings
   - Navigate to Environment Variables
   - Add:
     - `STRIPE_SECRET_KEY` (use your Stripe secret key)
     - `FRONTEND_URL` (your GitHub Pages URL)
     - `ALLOWED_ORIGIN` (your GitHub Pages domain)

5. Deploy to production:
```bash
vercel --prod
```

### Method 2: Using Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Import this Git repository
4. Configure environment variables:
   - `STRIPE_SECRET_KEY`
   - `FRONTEND_URL`
   - `ALLOWED_ORIGIN`
5. Click "Deploy"

## API Endpoint

### POST /api/create-checkout-session

Creates a Stripe Checkout session.

**Request Body:**
```json
{
  "items": [
    {
      "id": "1",
      "name": "Arabica Coffee Beans",
      "description": "Premium Mt. Elgon Arabica",
      "price": 25.00,
      "quantity": 2,
      "image": "https://your-site.com/image.jpg"
    }
  ],
  "discountCode": "UBUNTU88",
  "tipAmount": "5.00"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/c/pay/...",
  "sessionId": "cs_test_..."
}
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Your Stripe secret key | `sk_test_...` or `sk_live_...` |
| `FRONTEND_URL` | Your frontend URL for redirects | `https://junoway.github.io/imbaricoffee.github.io` |
| `ALLOWED_ORIGIN` | CORS allowed origin | `https://junoway.github.io` |

## Security Notes

- Never commit `.env` or expose `STRIPE_SECRET_KEY`
- Use environment variables in Vercel dashboard
- Configure `ALLOWED_ORIGIN` to restrict API access
- Use Stripe test keys for development
- Switch to live keys only in production

## Troubleshooting

### CORS Errors
- Ensure `ALLOWED_ORIGIN` matches your frontend domain
- Check browser console for specific CORS messages

### Stripe Errors
- Verify `STRIPE_SECRET_KEY` is set correctly
- Check Stripe dashboard for API version compatibility
- Ensure prices are in cents (multiply by 100)

### Deployment Issues
- Check Vercel deployment logs
- Verify all environment variables are set
- Ensure Node.js version compatibility (18+)
