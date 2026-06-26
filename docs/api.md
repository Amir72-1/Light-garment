# Light Garment ERP REST API

Base URL: `/api`

All routes except health, login, and password reset require `Authorization: Bearer <jwt>`.

## Auth

- `POST /auth/login` - Login with `{ "email": "...", "password": "..." }`.
- `POST /auth/password-reset` - Prepare password reset instructions with `{ "email": "..." }`.
- Demo accounts use `Password123!`: `owner@lightgarment.example`, `manager@lightgarment.example`, `store@lightgarment.example`, `sales@lightgarment.example`, `hr@lightgarment.example`.

## Dashboard

- `GET /dashboard` - Totals for employees, inventory, sales, revenue, low stock alerts, and recent activity.

## Employees and Attendance

- `GET /employees?search=&department=&position=&page=&pageSize=&sortBy=&sortOrder=` - Paginated employee list.
- `POST /employees` - Multipart employee registration with optional `profilePicture`, optional `email`, and optional `faydaNumber`.
- `GET /employees/:id` - Employee profile.
- `PUT /employees/:id` - Multipart employee update with optional `profilePicture`.
- `DELETE /employees/:id` - Delete employee.

## Attendance

Owner and HR/Admin have full attendance access. Manager can view and check employees in/out. Storekeeper and Salesperson cannot access attendance APIs.

- `POST /attendance/check-in` - Mark employee check-in with `{ employeeId, date?, time? }`; late status is applied after the configured start time.
- `POST /attendance/check-out` - Mark employee check-out with `{ employeeId, date?, time? }` and calculate `totalHours`.
- `POST /attendance/manual` - Owner/HR manual edit with `{ employeeId, date, status, checkInTime?, checkOutTime? }`.
- `GET /attendance/today?date=YYYY-MM-DD` - List all employees and attendance status for a day.
- `GET /attendance/month/:employeeId?month=YYYY-MM` - Employee monthly attendance profile.
- `GET /attendance/stats?date=YYYY-MM-DD` - Present, absent, and late summary counts.

## Shirts, Inventory, and Raw Materials

- `GET /products` - Shirt catalog with SKU, QR, barcode, quantity, and prices.
- `POST /products` - Create a shirt and auto-generate SKU/QR if omitted.
- `GET /inventory` - Stock movement history.
- `POST /inventory/movements` - Create `Stock in`, `Stock out`, `Transfer`, or `Adjustment` movement.
- `GET /raw-materials` - Fabric, thread, buttons, labels, and packaging stock.
- `POST /raw-materials` - Register a raw material with `{ name, category, unit, quantity, reorderLevel, unitCost }`.

## Sales POS

- `GET /sales` - Invoice history.
- `POST /sales` - Create invoice, track payment, and deduct stock.

## Production

- `GET /production` - Fabric to finished goods workflow stages.
- `PATCH /production/:id` - Update stage status, assignee, notes, and timestamps.

## Reports and Settings

- `GET /reports` - Employee, attendance, inventory, sales, and profit reports.
- `GET /settings` - Company info, currency, backup schedule, and theme.
