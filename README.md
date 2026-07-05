# Light Garment ERP

Production-ready garment ERP web application for Light Garment Manufacturing PLC.

## Stack

- React + TypeScript + Vite
- Tailwind CSS with shadcn/ui-style reusable components
- Node.js + Express + TypeScript
- PostgreSQL schema with Prisma ORM
- JWT role-based authentication
- Docker and Docker Compose support

## Build order implemented

1. Prisma database schema and seed data
2. Express API
3. JWT authentication and role access
4. Employee HR module with image upload and attendance
5. Shirt, inventory, and raw material modules
6. POS sales and invoice module
7. Production workflow module
8. Reports module
9. Responsive React UI
10. Frontend/API integration
11. Sample seed data
12. Automated and manual testing workflow

## Local development

```bash
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

Open `http://localhost:5173`.

Demo users:

- `owner@lightgarment.example`
- `manager@lightgarment.example`
- `store@lightgarment.example`
- `sales@lightgarment.example`
- `hr@lightgarment.example`

All demo users use password `Password123!`.

## Database

The Prisma schema is normalized around users, roles, employees, attendance, products, inventory movements, raw materials, sales, sale items, production stages, and suppliers.

```bash
npm run db:migrate
npm run db:seed
```

## Docker

```bash
docker compose up --build
```

The app container serves the Express API and compiled React frontend on port `4000`.

## Free cloud deployment

See `docs/free-deploy.md`.

Production command:

```bash
npm run start:deploy
```

## API documentation

See `docs/api.md`.

## Testing

```bash
npm test
npm run build
```