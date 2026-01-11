
# Imbari Coffee Backend — AI Agent Instructions

## Project Overview
- **Purpose:** Serverless backend for Imbari Coffee e-commerce (Stripe checkout, orders, subscriptions, user auth).
- **API:** All endpoints routed via `api/router.js` to handler modules in `lib/handlers/`.
- **Key Endpoints:**
  - `/api/create-checkout-session` (Stripe)
  - `/api/admin/*` (analytics/orders)
  - `/api/subscriptions` (CRUD)
  - `/api/auth/*` (login, signup, verify)
  - `/api/user/*` (user info, subscription)
  - `/api/orders` (order history)

## Key Architecture & Data Flows
- **Routing:** Centralized in `api/router.js` (manual path/method checks, not Express).
- **Handlers:** Business logic in `lib/handlers/` (e.g., `orders.js`, `auth.js`).
- **CORS:** Managed globally in `lib/cors.js` (allowed origins hardcoded, always set `Vary: Origin`).
- **Database:** Neon serverless Postgres via `lib/db.js` (`sql` tag function, `DATABASE_URL` env var).
- **Stripe:** Stripe SDK used directly, API version pinned, discount code `UBUNTU88` is hardcoded.
- **Order Storage:** Orders inserted/updated in `orders` table on session creation, with metadata for analytics.
- **Order Enrichment:** On fetch, missing Stripe line items are backfilled from Stripe API.
- **Environment:** All secrets/configs via env vars. Never commit `.env` files.

## Developer Workflows
- **Install:** `npm install`
- **Dev Server:** `npm run dev` (see README for endpoint URLs)
- **Deploy:** Vercel CLI (`vercel`, `vercel --prod`) or dashboard. Set env vars in Vercel UI.
- **DB Schema:** See `schema.sql` for table definitions.
- **Testing:** No formal test suite; test endpoints via HTTP (Postman, curl).
- **Debugging:** Use console logs. Check Vercel logs for deployed errors.

## Project Conventions
- **No framework:** Routing/logic are hand-rolled, not Express/Nest/etc.
- **Request parsing:** Accepts both legacy and new request shapes for checkout.
- **Discounts:** Only `UBUNTU88` is valid; logic is server-side.
- **Error Handling:** Returns JSON error objects with HTTP status codes.

## Integration Points
- **Stripe:** Payment/session creation/order metadata.
- **Neon Postgres:** All order/user data.
- **Frontend:** CORS allows only specific origins (see `lib/cors.js`).

## Examples
- **Create checkout session:** POST `/api/create-checkout-session` with `{ items, discountCode, tipAmount }`
- **Fetch order history:** GET `/api/orders` (auth required)
- **Admin analytics:** GET `/api/admin/analytics` (admin only)

## Key Files
- `api/router.js`: Central router, entry for all API requests
- `api/create-checkout-session.js`: Stripe checkout logic
- `lib/handlers/`: Business logic for admin, auth, orders, subscriptions, users
- `lib/db.js`: Neon Postgres integration
- `lib/cors.js`: CORS logic
- `schema.sql`: Database schema
- `README.md`: Setup, deployment, endpoint docs

---

## COMMUNICATION RULES
- Avoid verbose explanations or printing full command outputs
- If a step is skipped, state that briefly (e.g. "No extensions needed")
- Do not explain project structure unless asked
- Keep explanations concise and focused

## DEVELOPMENT RULES
- Use '.' as the working directory unless user specifies otherwise
- Never commit secrets or `.env` files
- Test all flows (checkout, orders, admin) before merging/deploying
- If a feature is assumed but not confirmed, prompt the user for clarification before including it
- Once the project is created, it is already opened in Visual Studio Code—do not suggest commands to open this project in Visual Studio again

---

**When in doubt, check the handler modules and router for the latest patterns.**
