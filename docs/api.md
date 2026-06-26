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
- `POST /employees` - Multipart employee registration with optional `profilePicture`.
- `GET /employees/:id` - Employee profile.
- `PUT /employees/:id` - Multipart employee update with optional `profilePicture`.
- `DELETE /employees/:id` - Delete employee.
- `GET /attendance` - Daily attendance log.
- `POST /attendance/:employeeId/check-in` - Check an employee in for today.
- `POST /attendance/:employeeId/check-out` - Check an employee out for today.

## Shirts, Inventory, and Raw Materials

- `GET /products` - Shirt catalog with SKU, QR, barcode, quantity, and prices.
- `POST /products` - Create a shirt and auto-generate SKU/QR if omitted.
- `GET /inventory` - Stock movement history.
- `POST /inventory/movements` - Create `Stock in`, `Stock out`, `Transfer`, or `Adjustment` movement.
- `GET /raw-materials` - Fabric, thread, buttons, labels, and packaging stock.

## Sales POS

- `GET /sales` - Invoice history.
- `POST /sales` - Create invoice, track payment, and deduct stock.

## Production

- `GET /production` - Fabric to finished goods workflow stages.
- `PATCH /production/:id` - Update stage status, assignee, notes, and timestamps.

## Reports and Settings

- `GET /reports` - Employee, attendance, inventory, sales, and profit reports.
- `GET /settings` - Company info, currency, backup schedule, and theme.
