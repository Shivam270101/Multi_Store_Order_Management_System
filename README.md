# Multi-Store Order Management System

A full-stack order management dashboard built with **Next.js, React, Express.js, Socket.IO, and MySQL**. The application enables multi-store order management, real-time status updates, order archiving, and sales analytics through a user-friendly dashboard.

All monetary amounts are displayed in **Indian Rupees (INR)**.

## Features

- **Create Orders:** Browse a menu of dishes, add items, manage quantities, and create orders.
- **Multi-Store Management:** View and manage orders across multiple stores or filter by a specific store.
- **Order Listing:** Browse orders with pagination and status-based filtering.
- **Real-Time Status Updates:** Update order statuses and receive live notifications using Socket.IO.
- **Order Management:** Create, update, and archive orders.
- **Automatic Archival:** Archive orders older than 30 days.
- **Analytics Dashboard:** Analyze order trends, revenue, average order value, peak-order days, and top-selling dishes.
- **MySQL Database:** Persist orders, order items, archived records, and menu data.
- **Server-Side Price Calculation:** Calculate order totals using current dish prices stored in MySQL.
- **Responsive Frontend:** Navigate between order creation, order listing, status management, and analytics.

## Tech Stack

| Technology | Purpose |
| --- | --- |
| Next.js | Frontend framework |
| React | User interface |
| Node.js | JavaScript runtime |
| Express.js | Backend REST API |
| Socket.IO | Real-time communication |
| MySQL 8.0+ | Relational database |
| JavaScript / TypeScript | Application development |
| npm | Package management |

## Project Structure

```text
multi-store-order-management/
├── backend/
│   ├── sql/
│   │   └── schema.sql
│   ├── .env.example
│   ├── package.json
│   └── ...
├── frontend/
│   ├── .env.example
│   ├── package.json
│   └── ...
└── README.md
```

The backend contains the REST API, database initialization and seed scripts, order-management logic, analytics endpoints, and Socket.IO server. The frontend contains the Next.js application and its pages.

## Prerequisites

Ensure the following software is installed:

- [Node.js](https://nodejs.org/) 20 or newer
- [MySQL](https://dev.mysql.com/downloads/) 8.0 or newer
- npm, included with Node.js
- [Git](https://git-scm.com/) (recommended)

Verify your installations:

```powershell
node --version
npm --version
mysql --version
```

## Getting Started

Follow these steps to run the project locally on Windows using PowerShell.

### 1. Clone the Repository

If the project is hosted on GitHub:

```powershell
git clone <your-repository-url>
cd multi-store-order-management
```

If you already have the project locally, open its root directory in VS Code.

### 2. Configure MySQL

Start your MySQL server and create a database user with permission to create the project database.

For example, connect to MySQL as an administrator:

```sql
CREATE USER 'order_app'@'localhost'
IDENTIFIED BY 'your_secure_password';

GRANT ALL PRIVILEGES ON multi_store_orders.*
TO 'order_app'@'localhost';
```

The database initialization script is expected to create the `multi_store_orders` database. If your MySQL setup requires the database to exist beforehand, create it manually:

```sql
CREATE DATABASE multi_store_orders;
```

Use credentials appropriate for your local environment. Do not commit database passwords to Git.

### 3. Configure the Backend

Open a terminal in the project root and run:

```powershell
Copy-Item backend\.env.example backend\.env
Set-Location backend
```

Update `backend/.env` with your MySQL credentials and application settings.

Example configuration:

```dotenv
PORT=4000

DB_HOST=localhost
DB_PORT=3306
DB_NAME=multi_store_orders
DB_USER=order_app
DB_PASSWORD=your_secure_password
```

Ensure the environment variable names match those used by the backend code.

### 4. Install Backend Dependencies

From the `backend` directory, execute:

```powershell
npm install
```

### 5. Initialize the Database

Run the database initialization script:

```powershell
npm run db:init
```

This initializes the database schema using the project's SQL definitions.

### 6. Load Demo Data

To populate the application with sample data, run:

```powershell
npm run db:seed
```

The demo seed includes:

- 30 menu dishes
- 30 sample orders
- 3 demo stores
- 10 sample orders per demo store

The seed command is safe to rerun and does not duplicate the sample orders.

### 7. Start the Backend Server

Run:

```powershell
npm run dev
```

The backend API and Socket.IO server will start on the configured port, which defaults to `4000`.

Verify that the backend is running by opening:

```text
http://localhost:4000/health
```

### 8. Configure the Frontend

Open a second terminal in the project root:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
Set-Location frontend
```

Install the frontend dependencies:

```powershell
npm install
```

Ensure `frontend/.env.local` contains the correct backend URL:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000
```

If you configure the backend to use another port, update this URL accordingly.

### 9. Start the Frontend

From the `frontend` directory, execute:

```powershell
npm run dev
```

Open the application in your browser:

**http://localhost:3000**

The application opens the Create Order page by default.

## Application Pages

### Create Order — `/create-order`

- Browse the available dish catalog.
- View dish names, categories, and prices in INR.
- Add dishes to an order.
- Increase item quantities by adding the same dish again.
- View the estimated order total.
- Submit orders with the selected store and items.

The backend calculates the final order total using the current dish prices stored in MySQL rather than trusting the frontend's estimated total.

### Orders List — `/orders`

- Browse orders with pagination.
- View orders from all stores.
- Filter orders by store ID.
- Filter orders by status.
- View order information and associated items.

The default page size is 10 orders.

Available store filters:

- All stores
- `store-1`
- `store-2`
- `store-3`

### Update Status — `/update-status`

- View orders matching the selected filters.
- Update the status of individual orders.
- Receive real-time updates through Socket.IO.

Supported order statuses:

- `PLACED`
- `PREPARING`
- `COMPLETED`

### Analytics Dashboard — `/dashboard`

The dashboard provides insights into order activity and store performance, including:

- 14-day order demand trend
- Average order value
- Peak-order day
- Top-selling dishes
- Revenue comparison across stores

Analytics include both active and archived orders.

## REST API Documentation

All API endpoints are served from:

```text
http://localhost:4000
```

Replace `4000` with the configured backend port if necessary.

### Health Check

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Check API availability |

### Order Management

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/orders` | Create a new order |
| GET | `/orders` | Retrieve orders with optional filters and pagination |
| PUT | `/orders/:id` | Replace an order's store and items |
| PATCH | `/orders/:id/status` | Update an order's status |
| DELETE | `/orders/:id` | Archive an order and remove it from the active list |

### Dish Management

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/dishes` | Retrieve the available menu dishes |

### Archival

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/archive-old-orders` | Archive orders older than 30 days |

### Analytics

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/analytics/orders-per-day?days=30` | Retrieve daily order counts |
| GET | `/analytics/revenue-per-store` | Retrieve revenue and order counts by store |
| GET | `/analytics/top-items` | Retrieve the five most frequently sold items |

## API Usage Examples

### 1. Create an Order

**Request**

```http
POST /orders
Content-Type: application/json
```

**Request body**

```json
{
  "store_id": "store-1",
  "items": [
    {
      "item_id": "margherita-pizza",
      "qty": 2
    }
  ]
}
```

The API validates the request, retrieves the current dish prices from MySQL, calculates the total amount, and creates the order.

### 2. Retrieve Orders

Retrieve the first page of orders:

```http
GET /orders?page=1&limit=10
```

Filter by store:

```http
GET /orders?store_id=store-1&page=1&limit=10
```

Filter by status:

```http
GET /orders?status=PREPARING&page=1&limit=10
```

Combine filters:

```http
GET /orders?store_id=store-1&status=PREPARING&page=1&limit=20
```

Order-list responses include a `data` array and pagination metadata.

### 3. Update Order Status

**Request**

```http
PATCH /orders/<order-id>/status
Content-Type: application/json
```

**Request body**

```json
{
  "status": "PREPARING"
}
```

Replace `<order-id>` with a valid order ID.

### 4. Update an Existing Order

**Request**

```http
PUT /orders/<order-id>
Content-Type: application/json
```

**Request body**

```json
{
  "store_id": "store-2",
  "items": [
    {
      "item_id": "margherita-pizza",
      "qty": 3
    }
  ]
}
```

This replaces the order's store and items. The backend should recalculate the total using current database prices.

### 5. Archive an Order

**Request**

```http
DELETE /orders/<order-id>
```

The order is archived and removed from the active order list.

### 6. Archive Old Orders

**Request**

```http
POST /archive-old-orders
```

The endpoint moves orders older than 30 days into the archive.

### 7. Retrieve Analytics

```http
GET /analytics/orders-per-day?days=30
GET /analytics/revenue-per-store
GET /analytics/top-items
```

These endpoints provide data for analyzing demand, store revenue, and popular menu items.

## Real-Time Updates with Socket.IO

The application uses Socket.IO to communicate order changes to connected clients in real time.

### Events

| Event | Direction | Purpose |
| --- | --- | --- |
| `store:join` | Client → Server | Join a store-specific room |
| `store:leave` | Client → Server | Leave a store-specific room |
| `order:created` | Server → Client | Notify clients about a newly created order |
| `order:updated` | Server → Client | Notify clients about an updated order |
| `order:deleted` | Server → Client | Notify clients about an archived or deleted order |

Clients join rooms using their selected store ID. The server broadcasts relevant order events to the corresponding store room.

The frontend also supports automatic Socket.IO reconnection.

## Database Design

The database schema is defined in:

```text
backend/sql/schema.sql
```

The database includes tables for:

- Orders
- Order items
- Archived orders
- Archived order items
- Menu dishes, as defined by the project schema

Store and creation-time indexes support common order queries.

### Archival Strategy

When an order is archived, its parent record and associated line items are copied into the archive tables within a database transaction.

This helps maintain consistency between archived orders and their items.

The analytics endpoints include active and archived records so that historical order and revenue information remains available after archival.

## Troubleshooting

### MySQL Connection Failed

Check that:

- The MySQL server is running.
- `DB_HOST` and `DB_PORT` are correct.
- `DB_NAME`, `DB_USER`, and `DB_PASSWORD` match your configuration.
- The database user has the required permissions.

### Backend Health Check Fails

Ensure the backend is running:

```powershell
Set-Location backend
npm run dev
```

Then visit `http://localhost:4000/health`.

### Frontend Cannot Connect to the API

Verify that `frontend/.env.local` contains the correct URL:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Restart the Next.js development server after changing environment variables.

### Port Already in Use

Change the backend `PORT` or stop the application currently using that port. If the backend port changes, update `NEXT_PUBLIC_API_URL` accordingly.

### Missing Demo Data

Run the seed script from the backend directory:

```powershell
npm run db:seed
```

### Socket.IO Updates Not Appearing

Verify that:

- The backend Socket.IO server is running.
- The frontend connects to the correct backend URL.
- The client joins the correct store room.
- The server emits events to the intended room.

## Security Considerations

- Keep `.env` and `.env.local` out of version control.
- Never commit real database credentials or production secrets.
- Validate incoming API request bodies.
- Calculate prices and totals on the backend.
- Use appropriate database permissions.
- Protect archival and order-management endpoints with authentication and authorization before exposing the application publicly.

## Future Enhancements

Potential improvements include:

- User authentication and role-based access control
- Store-specific permissions
- Automated archival scheduling
- Advanced reporting and date-range filters
- Unit and integration tests
- Docker-based development setup
- Production deployment with environment-specific configuration
- API documentation using Swagger or OpenAPI

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes.
4. Push the branch to your fork.
5. Open a pull request.

## License

Specify the project's license before distributing or publishing this repository. If no license has been selected, the project remains subject to the applicable default copyright rules.

---

**Built with Next.js, React, Express.js, Socket.IO, and MySQL.**
