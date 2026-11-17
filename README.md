# ELonCred

E-commerce site: static pages in `Frontend/`, served together with the REST API by the Express server in `Backend/` (MySQL database).

## Setup

1. Install dependencies:
   ```
   cd Backend
   npm install
   ```
2. Create the database and tables (MySQL 8):
   ```
   mysql -u root -p < Backend/database.sql
   ```
   Creating a dedicated least-privilege MySQL user for the app is recommended (see the end of `database.sql`).
3. Configure secrets: copy `Backend/.env.example` to `Backend/.env` and fill in `DB_USER`, `DB_PASSWORD` and `SESSION_SECRET`.
   `.env` is git-ignored and must never be committed.
4. Create an admin account:
   ```
   cd Backend
   npm run create-admin -- admin@example.com "<password>" "Admin Name"
   ```
5. Start the server and open http://localhost:3000:
   ```
   npm start        # or: npm run dev (auto-reload)
   ```
   The admin dashboard is at http://localhost:3000/Admin/adminlogin.html.

## M-Pesa payments (Daraja STK Push)

Checkout can take payment with M-Pesa Express: the customer enters their number, gets a PIN
prompt on their phone, and the order is confirmed only after Safaricom reports a successful payment.

1. Create the payments table on an existing database (new installs get it from `database.sql`):
   ```
   mysql -u root -p eloncred_db < Backend/migrations/2026-11-17-mpesa-payments.sql
   ```
2. Create an app with **M-Pesa Express** at https://developer.safaricom.co.ke and copy its
   Consumer Key and Consumer Secret into the `MPESA_*` settings in `Backend/.env`
   (see `.env.example`; the sandbox shortcode `174379` and its passkey are prefilled there).
3. Safaricom must be able to reach the callback URL over HTTPS. Locally, run `ngrok http 3000` and set
   `MPESA_CALLBACK_URL=https://<ngrok-host>/api/mpesa/callback/<MPESA_CALLBACK_SECRET>`.
   If the callback cannot arrive, the checkout page falls back to asking Daraja for the result.
4. For live payments set `MPESA_ENV=production` with your own Paybill/Till, passkey and keys.
   For a Till number use `MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` and `MPESA_PARTY_B=<till>`.

How it works:
- `POST /api/mpesa/stkpush` (signed-in user) sends the PIN prompt for one of the user's pending orders.
  The amount is taken from the order in the database, never from the browser.
- `POST /api/mpesa/callback/<secret>` receives Safaricom's result. The secret in the URL keeps others
  from faking payments; the paid amount must match the order, and a payment can only change once.
- `GET /api/mpesa/status/<checkoutRequestId>` is polled by the checkout page until the payment is paid or failed.
- On success the order moves to `confirmed` and the cart is emptied; on cancel/failure the cart is kept
  so the customer can try again.
