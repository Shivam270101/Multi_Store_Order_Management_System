# Multi-Store Order Management System

A full-stack order dashboard built with Next.js, React, Express, Socket.IO, and MySQL.
It supports store-filtered order management, live updates, archival, and analytics.
Dashboard amounts use Indian Rupees (INR).

## Prerequisites

- Node.js 20 or newer
- MySQL 8.0 or newer

## Start locally

1. Create a MySQL user with permission to create the `multi_store_orders` database.
2. Configure the backend:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

   Update `DB_USER` and `DB_PASSWORD` in `backend\.env` for your MySQL instance.
3. Install dependencies, initialize the schema, and load the optional demo data:

   ```powershell
   Set-Location backend
   npm install
   npm run db:init
   npm run db:seed
   npm run dev
   ```

   The API and Socket.IO server listen on the configured `PORT` (default `4000`).
4. In another terminal, install and run the frontend:

   ```powershell
   Set-Location frontend
   npm install
   Copy-Item .env.example .env.local
   npm run dev
   ```

   If the backend `PORT` is not `4000`, set `NEXT_PUBLIC_API_URL` in
   `frontend\.env.local` to `http://localhost:<PORT>` before starting Next.js.
   Open `http://localhost:3000`. The app opens the Create Order page. Use the
   navigation to switch between Create Order, Orders List, and Update Status.
   The order list and status page can be filtered by store ID.

## API

All endpoints are served from `http://localhost:<PORT>` (default `4000`).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check API availability |
| `POST` | `/orders` | Create an order |
| `GET` | `/orders?store_id=store-1&page=1&limit=20` | List orders, optionally filtered by store |
| `PUT` | `/orders/:id` | Replace an order's store and items |
| `PATCH` | `/orders/:id/status` | Update an order's status |
| `DELETE` | `/orders/:id` | Archive an order and remove it from the active list |
| `GET` | `/dishes` | List available menu dishes |
| `POST` | `/archive-old-orders` | Move orders older than 30 days to archive |
| `GET` | `/analytics/orders-per-day?days=30` | Daily order counts |
| `GET` | `/analytics/revenue-per-store` | Revenue and order counts by store |
| `GET` | `/analytics/top-items` | Five most frequently sold items |

Create-order request:

```json
{
  "store_id": "store-1",
  "items": [
    { "item_id": "margherita-pizza", "qty": 2 }
  ]
}
```

The API calculates `total_amount` using the current dish prices stored in MySQL.
Order-list responses include a `data` array and `pagination` metadata. Statuses
are `PLACED`, `PREPARING`, and `COMPLETED`.

The orders list defaults to 10 orders per page. Choose **All stores** to see
orders from every location, or choose `store-1`, `store-2`, or `store-3` to
filter by location. The Update Status page provides an order status control
for every matching order. The demo seed adds 30 menu dishes and 30 sample
orders (10 per demo store). The seed command is safe to rerun: it does not
duplicate the sample orders.

The analytics dashboard includes a 14-day demand trend, average order value,
peak-order day, top-selling dishes, and a revenue comparison across stores.

## Real-time events

Clients join a store room by emitting `store:join` with the store ID. The server
emits `order:created`, `order:updated`, and `order:deleted` to that store's room.
Emit `store:leave` to leave a room. Socket.IO reconnect is enabled by the frontend.

## Database

`backend/sql/schema.sql` creates the order, order-item, archive, and archive-item
tables. Store and creation-time indexes are included for order queries. Archiving
copies parent orders and their line items in a transaction; analytics include
both active and archived records.
