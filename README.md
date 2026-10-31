# TrustCart

An e-commerce app built around **clarity**: customers can see exactly what happened to their order, refund and support request, and when. Full-stack portfolio project.

| Part | Stack |
|---|---|
| Frontend (`/`) | React, TypeScript, Vite |
| API (`/server`) | Node.js, Express 5, TypeScript, Mongoose |
| Database | MongoDB **replica set** (transactions are required) |
| AI service (`/ai-service`) | Python, FastAPI, scikit-learn (optional) |

## Features

**Shopping:** product catalogue, server-side cart, checkout with shipping address, stock reserved atomically inside a transaction.

**Order transparency**
- Status flow `Placed → Confirmed → Shipped → Delivered`, or `Cancelled` before shipping.
- Every status change is stored as a timestamped event, with *who* recorded it (automatic, you, or the seller).
- Delivery dates are shown as an **estimate** and labelled as such. The window comes from the store's own recent delivery times (the 50th to 90th percentile), or a default 3–7 days when there is not enough history yet. Each order says which of the two it used.
- Carrier and tracking number, if any, are typed in by the seller and labelled that way. TrustCart has **no live carrier integration** and never invents carrier scans.
- Customers can cancel their own order until it ships; stock is restored exactly once.

**Delivery promise accountability**
- The *original* promised window is stored and never overwritten. Every later revision is added to a history with a timestamp and a **mandatory reason** (admin: *Revise delivery date*), and the customer sees the whole history.
- A public **promise record** (Overview and cart) shows the share of recent orders delivered by the *originally* promised date, how many were revised, and the average delay when late. A revised date cannot hide a missed promise.
- This is store-level (TrustCart has one seller), not per-seller.
- The record includes a *simulated* share (see `npm run seed-history`) and says so.

**Refunds:** request within 7 days of delivery → `Requested → Under review → Approved → Refunded` (or `Rejected` with a mandatory reason). Each stage is timestamped.

**Support tickets:** customers open tickets (optionally linked to an order) and reply in a thread. Admins reply and change status.

**Admin dashboard** (role `admin`): stats, order status updates, refund review, ticket handling with AI insights, product price/stock/visibility management.

**AI ticket analysis (optional, assistive only):** category, sentiment, urgency with the signals that triggered it, and a suggested reply for the *agent* to review. Customers never see AI output and nothing is sent automatically. If the service is down, tickets still work.

## Quick start (local)

Requirements: Node.js 22+, Python 3.11+ (only for the AI service), MongoDB 8 running as a replica set.

### 1. MongoDB replica set
Transactions fail on a standalone MongoDB (`Transaction numbers are only allowed on a replica set member or mongos`). If you have not done this yet:

1. Add to `mongod.cfg` (Windows: `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg`):
   ```yaml
   replication:
     replSetName: rs0
   ```
2. Restart the MongoDB service, open `mongosh`, and run `rs.initiate()` **once**.
3. Check `rs.status()` shows a `PRIMARY`.

Or skip all this with Docker (see below).

### 2. API
```bash
cd server
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
# edit .env: set JWT_SECRET to a long random value
npm install
npm run seed                # adds sample products (safe to re-run)
npm run dev                 # http://localhost:5000
```
Create an admin (or promote an existing user):
```bash
npm run create-admin -- you@example.com "StrongPassword123" "Your Name"
```
Log in with that account and an **Admin** tab appears.

### 3. Frontend
```bash
# from the repo root
npm install
npm run dev                 # http://localhost:5173
```
Set `VITE_API_URL` (see `.env.example`) if the API is not on `http://localhost:5000/api`.

### 4. AI service (optional)
```bash
cd ai-service
python -m venv .venv && . .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python training/generate_dataset.py
python training/train.py
uvicorn app.main:app --port 8000
```
Then make sure `AI_SERVICE_URL=http://localhost:8000` is in `server/.env`. Without it, ticket analysis is simply skipped.

Optional LLM-drafted replies: set `ANTHROPIC_API_KEY` (and optionally `LLM_MODEL`) for the AI service. Any failure falls back to templates. *This path is written but has not been run against the live API.*

### Docker (everything at once)
```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
# web: http://localhost:8080   api: http://localhost:5000/api/health

# one-time setup, using the compiled scripts inside the server container
docker compose exec server node dist/scripts/seedProducts.js
docker compose exec server node dist/scripts/createAdmin.js you@example.com "StrongPassword123" "Your Name"
```
On Windows PowerShell set the secret first: `$env:JWT_SECRET="<long random string>"; docker compose up --build`.

## Scripts

| Where | Command | What it does |
|---|---|---|
| root | `npm run dev` / `build` / `typecheck` | Vite dev server / production build / type-check |
| `server` | `npm run dev` / `build` / `start` | API with reload / compile / run compiled |
| `server` | `npm test` | Unit tests (status rules, refund window, estimates) |
| `server` | `npm run typecheck` | `tsc --noEmit` |
| `server` | `npm run seed` | Upserts sample products without resetting stock |
| `server` | `npm run seed-history [-- 100 \| --clear]` | Adds / removes SIMULATED delivered orders (flagged `simulated`) so the estimate and promise record have data in a demo |
| `server` | `npm run create-admin -- <email> <password> [name]` | Create or promote an admin |
| `ai-service` | `python -m pytest -q` | API and rule tests |

## Configuration

`server/.env`

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `MONGODB_URI` | Must point at a replica set, e.g. `mongodb://127.0.0.1:27017/trustcart?replicaSet=rs0` |
| `JWT_SECRET` | Required. Long random string |
| `CORS_ORIGIN` | Comma-separated allowed origins. If unset, any `localhost` port is allowed (dev only). **Set this in production** |
| `AI_SERVICE_URL` | Optional. Enables ticket analysis |

**Never commit `.env`.** It is in `.gitignore`. If a `.env` with a real secret was ever pushed or shared, change `JWT_SECRET` (this signs out all users) and the MongoDB credentials.

## API overview

All routes are under `/api`. Everything except `products`, `auth/register`, `auth/login` and `health` needs `Authorization: Bearer <token>`. Admin routes check the role in the database on every request.

| Method & path | Who | Purpose |
|---|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | public / user | Accounts (login and register limited to 50 requests / 15 min / IP) |
| `GET /products` | public | Search, category, pagination |
| `GET/POST /cart`, `PATCH/DELETE /cart/items/:productId` | user | Cart |
| `POST /orders/checkout` | user | Create order from cart (transaction). Address fields at top level or under `shippingAddress` |
| `GET /orders`, `GET /orders/:id` | user | Own orders only |
| `POST /orders/:id/cancel` | user | Cancel while `Placed`/`Confirmed` |
| `PATCH /orders/:id/status` | admin | Move status; optional `message`, `carrier`, `trackingNumber` |
| `PATCH /orders/:id/estimate` | admin | Revise the promised window: `from`, `to`, mandatory `reason`; kept in `estimateHistory` |
| `GET /stats/delivery-promise` | public | Promise record and the window new orders get |
| `GET /refunds`, `POST /refunds` | user | Own refunds / request one |
| `GET /refunds/admin/all`, `PATCH /refunds/:id/status` | admin | Review and pay out |
| `GET/POST /tickets`, `GET /tickets/:id`, `POST /tickets/:id/messages` | user | Own tickets (AI fields are stripped) |
| `GET /tickets/admin/all`, `POST /tickets/:id/reply`, `PATCH /tickets/:id/status` | admin | Handle tickets (urgent first) |
| `GET /admin/stats`, `GET /admin/orders`, `GET/POST /admin/products`, `PATCH /admin/products/:id` | admin | Dashboard |

AI service: `GET /health`, `POST /analyze {subject, message}`.

## About the AI model (read this before quoting numbers)

Category classification is TF-IDF + logistic regression over 7 categories. Sentiment and urgency are **transparent keyword rules**, not trained models, and urgency always lists its signals.

There is no real support data in this repo, so the training set is **synthetic**: hand-written complaints recombined with different openers and closers (`training/generate_dataset.py`). To avoid inflated scores, evaluation holds out *whole complaints* (grouped split and 5-fold grouped cross-validation) rather than random rows.

Last run: **macro-F1 ≈ 0.80 ± 0.07** (grouped CV). In the single held-out split `Delivery` was the weakest class (F1 ≈ 0.43, precision 0.32: it over-claims tickets that belong to other categories). These numbers show the pipeline works and is evaluated honestly; they do **not** predict accuracy on real customers. To get meaningful metrics, replace `training/tickets.csv` with real labelled tickets (`text,label,core_id`) and run `python training/train.py --data your.csv`. Metrics are written to `ai-service/models/metrics.json`.

## Delivery promise research (reproducible)

`research/delivery-promise/` tests the method behind the history-based estimate on the public **Olist Brazilian e-commerce dataset**, which contains both the promised and the actual delivery date for about 99,000 orders.

It compares, on the newest 20% of orders (chronological split, so no leakage): the platform's own promised date, one fixed window for all orders, and a quantile-regression model, **at equal average promise length**, because a longer promise is trivially "safer". It reports the late rate, the promise length needed to match the platform's late rate, and bootstrap confidence intervals.

```bash
cd research/delivery-promise
pip install -r requirements.txt
# download the CSVs from https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce (free login), unzip them, then:
python run_experiment.py --data-dir path/to/olist_csvs --out results
```
Outputs: `results/summary.md`, `results/results.json`, `results/tradeoff.png`. Quote only those numbers.

Quantile-regression delivery promises are an established technique (for example Salari, Liu & Shen, *Manufacturing & Service Operations Management*, 2022, on JD.com data; Zhang et al., IEEE, 2023, on Alibaba data), so this is a reproduction and evaluation, not a new algorithm. Commercial merchant tools for data-driven promise dates also exist, so the project does not claim a new idea; what it adds is the buyer-facing layer (original date, revision history with reasons, public promise record). Olist is Brazilian data from 2016 to 2018. The TrustCart app applies the same idea to its own delivery history (percentiles), not to the Olist-trained model.

## What is tested, and what is not

- **Server:** type-checked and compiled; 20 unit tests cover status transitions, the cancellation rule, refund window and workflow, regex escaping, the history-based estimate window (quantiles, fallback, caps) and the promise statistics (kept vs original date, revisions, simulated share).
- **Research code:** 6 tests (chronological split has no leakage, interpolation helpers, non-crossing quantiles, full run) on synthetic data in the Olist file format.
- **AI service:** 11 tests (API shape, category on unseen wording, urgency and sentiment rules, validation).
- **Frontend:** type-checked and production-built.
- **Not tested here:** route handlers against a real MongoDB (no database was available when this was written), browser click-through, and the Docker and CI files. Run the manual checklist below on your machine.

### Manual regression checklist
1. Register, log in, add products to the cart, check the subtotal.
2. Checkout; the order appears in **My orders**, the cart is empty, stock dropped.
3. Cancel a `Placed` order; stock is restored once; it cannot be cancelled again.
4. As admin: `Placed → Confirmed → Shipped` (add carrier/tracking) `→ Delivered`; customer sees each event with a timestamp and who recorded it.
5. Skipping a step (e.g. `Placed → Shipped`) is rejected.
6. As the customer, request a refund on the delivered order; as admin take it through review → approved → refunded; the order's payment becomes `Refunded`.
7. Reject a refund without a note: blocked. With a note: the customer sees it.
8. Open a ticket with and without the AI service running; as admin check urgency ordering and the suggested reply.
9. A second user cannot open the first user's order, refund or ticket by ID (404).

## Design decisions

- **Honesty over polish:** estimates are labelled, seller-entered shipping info is labelled, payment is labelled simulated. Nothing pretends to be live carrier data.
- **Simulated payments:** `paymentStatus` starts `Pending`, becomes `Paid` when the order is marked delivered (as if cash on delivery) and `Refunded` when a refund is issued. No real money moves.
- **Transactions** wrap checkout, cancellation, status changes and refund payout so stock and order state cannot drift apart.
- **Refund eligibility** is enforced on the server (delivered, within 7 days, one open request per order); the UI only mirrors it.
- **Customers never see AI output**; agents see it as a suggestion.

## Known limitations / next steps

- No real payment gateway, carrier integration, email/SMS notifications or password reset.
- JWTs last 1 hour and are stored in `localStorage` (simple, but vulnerable if the site has an XSS bug; consider httpOnly cookies for production).
- No pagination on admin lists (orders are capped at 100) or customer lists.
- Product images are URLs only; there is no upload.
- Add integration tests (e.g. `mongodb-memory-server` with a replica set) and a browser E2E suite.
