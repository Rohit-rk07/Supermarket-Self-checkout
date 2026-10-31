# Smart Checkout: Supermarket Self-Checkout (Node.js + React)

A phone-based self-checkout for a supermarket. A shopper scans items with their phone camera (or types the barcode), pays through Razorpay, and gets a QR receipt. Staff scan that QR at the exit to confirm the order was paid, and each receipt works only once.

- **Frontend:** React 18, Vite, Material UI, `html5-qrcode` for scanning, `qrcode.react` for receipts
- **Backend:** Node.js, Express, MongoDB (Mongoose), JWT auth, Twilio SMS, Razorpay
- **Principle:** the browser is never trusted. Prices, tax, payment status and permissions are all decided by the server.

---

## Features

**Shoppers**
- Sign in with a phone number and a six-digit SMS code (or try the demo)
- Scan a barcode with the camera, or type the number if the camera is unavailable
- Basket with quantity controls, then pay with Razorpay (cards, netbanking, wallets, and UPI if enabled on your account)
- Paper-style receipt with a QR code, kept in your account and printable

**Staff and admins**
- *Verify a receipt* at the exit: PAID, NOT PAID, ALREADY USED, CANCELLED or NOT FOUND; confirming exit works once per receipt
- *All orders*: sales totals, payment status and exit status
- *Manage products* (admin): add, edit, delete, import from CSV, and look up a barcode in Open Food Facts to prefill the name
- *Manage staff* (admin): give people the staff or admin role

---

## Screenshots

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/f70ac18c-d2c1-4ac5-9b7d-7b5b2b244852" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/5a390bd4-0ffd-4d37-8164-7ee15af52c88" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/dc30a9f4-dd17-4090-857a-125ed0126dd5" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/2dc8d7a1-24ec-4343-881a-e59667dde6d5" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/2ff8ea0e-84a0-451d-bdb5-dd537e8ccaff" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/97ee36ae-6e11-4301-b9ed-9b93b759a6d1" />

---

## Project structure

```
root/
|-- backend-nodejs/
|   |-- app/
|   |   |-- controllers/   auth, products, orders, payments, users
|   |   |-- routes/        one file per area
|   |   |-- middleware/    JWT auth, roles, validation
|   |   |-- models/        User, Product, Order
|   |   `-- utils/         pricing, logger, seed data
|   |-- .env               your settings (never committed)
|   `-- .env.example       the full list of settings
`-- frontend/
    |-- src/
    |   |-- pages/         home, basket, login, staff and admin screens
    |   |-- components/    checkout, account, scanner, and ui/ (shared pieces)
    |   |-- context/       auth, cart, orders
    |   `-- theme/         the design tokens: colours, type, controls
    |-- .env
    `-- .env.example
```

---

## Quick start

You need Node 18 or newer and a MongoDB database (local, or a free Atlas cluster).

```bash
# 1. Backend
cd backend-nodejs
cp .env.example .env        # then fill it in (see the table below)
npm install
npm run seed                # optional: sample products
npm start                   # http://localhost:3000

# 2. Frontend (a second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

> **Installing packages with `NODE_ENV=production` set in your shell?** npm will then skip dev tools such as Vite. Use `npm install --include=dev`.

### Backend settings (`backend-nodejs/.env`)

| Setting | Needed | What it does |
|---|---|---|
| `PORT` | no | Server port (default 3000) |
| `NODE_ENV` | yes | `development` turns on the demo and prints OTPs in the console when Twilio is not configured |
| `MONGODB_URI` | yes | Database connection string |
| `JWT_SECRET` | yes | At least 32 random characters |
| `JWT_EXPIRES_IN` | no | Token lifetime (default `7d`) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | yes | From the Razorpay dashboard. Use **test** keys while developing |
| `RAZORPAY_WEBHOOK_SECRET` | for the webhook | See *Payments* below |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | for real SMS | Without them, development prints the code in the server console |
| `ADMIN_PHONE_NUMBERS` | first run | Comma-separated numbers that become admin on first login (see below) |
| `ENABLE_PUBLIC_DEMO` | no | `true` shows a Try the demo button on a deployed site (test keys only) |
| `CORS_ORIGINS` | deployed | Your frontend address, for example `https://your-app.vercel.app` |
| `DNS_SERVERS` | if needed | For example `8.8.8.8,1.1.1.1`; fixes `querySrv ECONNREFUSED` with Atlas |
| `LOG_LEVEL` | no | `INFO` by default |

### Frontend settings (`frontend/.env`)

| Setting | What it does |
|---|---|
| `VITE_SERVER_URL` | Where the backend is, for example `http://localhost:3000` |

---

## Becoming the first admin

There is no admin until you create one, and you never edit the database by hand.

1. Put your own number in `backend-nodejs/.env`, with the country code: `ADMIN_PHONE_NUMBERS=+919876543210`
2. Restart the backend and sign in with that number. In development the code is printed in the backend console.
3. You are now admin, and **Store tools** appear on your home screen.

This only works while no admin exists, so leaving the setting in place later is harmless.

**Adding staff:** ask them to sign in once with their own number. Then open **Manage staff**, find them, and set their role to Staff. Admins cannot change their own role, so the shop is never left without an admin.

| Role | Can do |
|---|---|
| Customer | Scan, pay, see their own receipts |
| Staff | Also verify receipts at the exit and see all orders |
| Admin | Also manage products and staff |

---

## Products and barcodes

A barcode only identifies a product. The name and price come from your database, so they are the shop's own.

- **Sample data:** `npm run seed` in `backend-nodejs/` (this **clears** the products collection first).
- **Admin page:** *Manage products* lets you add, edit and delete one at a time. In the Add form, **Look up** asks Open Food Facts for a name and category. It never fills the price, and it works best for packaged food.
- **CSV import:** *Import CSV* accepts up to 500 rows with the columns `barcode,name,price` and optionally `category,stock,trackStock,gstRate,taxInclusive` (`trackStock` and `taxInclusive` accept yes or no). Bad rows are skipped and reported by row number; existing barcodes are updated.
- **Trying the scanner:** make barcode images for the seeded products with any online generator (see `app/utils/seedDatabase.js` for the numbers), or just type a number.

  Example barcode for Apple:

  ![barcode (4)](https://github.com/user-attachments/assets/71e68629-55c8-40e4-9b37-24ecb5c937a2)

---

## Payments (Razorpay)

The flow: the basket is saved as a pending order priced by the server, a Razorpay order is created for it, the shopper pays, and the server verifies the signature before marking the order paid.

### Testing with test keys

Use **domestic Indian** test cards. The generic `4111 1111 1111 1111` can be rejected as an international card on some accounts.

| Card | Number |
|---|---|
| Mastercard (try this first) | `5267 3181 8797 5449` |
| Visa | `4386 2894 0766 0153` |

Use any future expiry and any CVV. Razorpay may ask for an email and may offer to save the card (choose *Maybe later*). A sample bank page then appears: click **Success**. If your account has UPI enabled, `success@razorpay` also works.

### The webhook (so a closed browser never loses a payment)

If the shopper pays and closes the tab before the app confirms, the webhook still marks the order paid.

1. In the Razorpay dashboard, add a webhook pointing to `https://YOUR-BACKEND/api/v1/payments/webhook`
2. Select the events `payment.captured`, `order.paid` and `payment.failed`
3. Copy the secret into `RAZORPAY_WEBHOOK_SECRET` and restart

For local testing you need a public tunnel (such as ngrok) because Razorpay cannot reach `localhost`. Without the secret the endpoint answers 503 and normal checkout still works.

### Tax

Right now every price has 18% GST **added on top**. Packaged goods in India are usually priced at MRP, which already includes tax, so a per-product GST rate and tax-inclusive pricing are the next planned change.

---

## Public demo for a deployed site

Because SMS trials only reach verified numbers, a visitor to your live link may not be able to sign in. To give them a way in, set `ENABLE_PUBLIC_DEMO=true`. Visitors then see **Try the demo**, which gives each of them their own throwaway shopper.

The demo is **always refused unless `RAZORPAY_KEY_ID` is a test key** (`rzp_test_...`), so it can never run with real money.

---

## Deploying (Vercel or similar)

The Express app is exported for serverless use. Set the same settings as above in your host's dashboard, especially `MONGODB_URI`, `JWT_SECRET`, the Razorpay keys, the Twilio settings, `CORS_ORIGINS`, and `ADMIN_PHONE_NUMBERS` for the first admin. Set `VITE_SERVER_URL` for the frontend build.

---

## API summary

| Area | Endpoints | Access |
|---|---|---|
| Auth | `POST /api/auth/phone/send-otp`, `POST /api/auth/phone/verify-otp`, `GET /api/auth/config`, `POST /api/auth/demo-login` | Public |
| Profile | `POST /api/auth/complete-registration`, `GET` and `PUT /api/auth/profile` | Signed in |
| Scan | `GET /api/v1/scan/:barcode` | Signed in |
| Products | `GET /api/v1/products` | Staff, admin |
| Products | `POST`, `PUT /:barcode`, `DELETE /:barcode`, `POST /import`, `GET /lookup/:barcode` under `/api/v1/products` | Admin |
| Orders | `POST /api/v1/orders`, `GET /my-orders`, `GET /:orderId`, `PUT /:orderId/cancel` | Signed in |
| Orders | `GET /all`, `GET /stats`, `PUT /:orderId/status`, `GET /verify/:orderNumber`, `POST /verify/:orderNumber/exit` | Staff, admin |
| Payments | `POST /api/v1/payments/create-order`, `POST /verify-payment` | Signed in |
| Payments | `POST /api/v1/payments/webhook` | Razorpay signature |
| Users | `GET /api/v1/users`, `PUT /api/v1/users/:id/role` | Admin |
| Health | `GET /health/ready` | Public |

---

## Troubleshooting

- **`querySrv ECONNREFUSED` when connecting to Atlas:** your machine's DNS refuses the lookup. Add `DNS_SERVERS=8.8.8.8,1.1.1.1` to `backend-nodejs/.env`.
- **"Too many OTP requests":** sends are limited per phone and per IP (5 per 15 minutes), and wrong codes are limited per phone (5 per 10 minutes). Wait, or restart the backend in development.
- **No SMS arrives:** a Twilio trial only texts verified numbers. In development the code is printed in the backend console.
- **Razorpay says "international card":** use one of the domestic test cards above.
- **Your admin setting did nothing:** `ADMIN_PHONE_NUMBERS` only applies while no admin exists. Check *Manage staff* from an existing admin account.

---

## Known limits

- Nothing checks that the bag matches what was scanned. The exit QR proves payment only, so a staff spot-check is part of the process.
- Items sold by weight, discounts and returns are not supported.
- Refunds are not built; paid orders cannot be cancelled.
- Stock tracking is per product. New products from the Add form track stock by default; products created before tracking existed are not tracked until an admin ticks *Track stock*. Tracked stock falls once, when an order first becomes paid. Two shoppers paying for the last unit at the same moment can both succeed; stock is then held at zero rather than going negative.
- Payment status is never edited by hand. It changes only through Razorpay (verify, webhook, or staff *Check payment*).
- Unpaid orders are marked Expired after 30 minutes. This runs whenever orders are listed, so an order can show as Unpaid for a short while after its time is up.
