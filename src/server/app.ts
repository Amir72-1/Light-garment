import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import multer from "multer";
import { z } from "zod";
import { DemoRepository } from "./data.js";
import { PrismaRepository } from "./prismaRepository.js";
import type { RoleName } from "../shared/types.js";

dotenv.config();

const roles = ["Owner", "Manager", "Storekeeper", "Salesperson", "HR/Admin"] as const;
const jwtSecret = process.env.JWT_SECRET || "development-only-secret-change-me";
const uploadDir = path.resolve(process.cwd(), "uploads");
const clientDir = path.resolve(process.cwd(), "dist-client");

fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, uploadDir),
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  fileFilter: (_request, file, callback) => {
    callback(null, /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype));
  },
  limits: { fileSize: 3 * 1024 * 1024 }
});

type AuthUser = { id: string; name: string; email: string; role: RoleName };
type AuthedRequest = Request & { user?: AuthUser };

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const employeeSchema = z.object({
  fullName: z.string().min(2),
  faydaNumber: z.string().min(4).optional().or(z.literal("")),
  phoneNumber: z.string().min(7),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().min(3),
  gender: z.enum(["Male", "Female", "Other"]),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  position: z.string().min(2),
  department: z.enum(["Production", "Sales", "Admin", "Store"]),
  salary: z.coerce.number().nonnegative(),
  employmentType: z.enum(["Full-time", "Part-time", "Contract"]),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["Active", "Inactive"]).default("Active")
});

const productSchema = z.object({
  productName: z.string().min(2),
  model: z.string().min(1),
  color: z.string().min(1),
  size: z.string().min(1),
  quantity: z.coerce.number().int().nonnegative(),
  costPrice: z.coerce.number().nonnegative(),
  sellingPrice: z.coerce.number().nonnegative(),
  images: z.array(z.string()).default([]),
  barcode: z.string().optional().or(z.literal(""))
});

const saleSchema = z.object({
  customerName: z.string().optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().int().positive() })).min(1),
  amountPaid: z.coerce.number().nonnegative(),
  paymentMethod: z.enum(["Cash", "Card", "Bank transfer", "Mobile money"]),
  discount: z.coerce.number().nonnegative().optional(),
  tax: z.coerce.number().nonnegative().optional()
});

const salePaymentSchema = z.object({
  amountPaid: z.coerce.number().positive().optional(),
  paymentMethod: z.enum(["Cash", "Card", "Bank transfer", "Mobile money"]).optional()
});

const stockSchema = z.object({
  productId: z.string(),
  quantity: z.coerce.number().int().positive(),
  type: z.enum(["Stock in", "Stock out", "Transfer", "Adjustment"]),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  reference: z.string().optional()
});

const rawMaterialSchema = z.object({
  name: z.string().min(2),
  category: z.enum(["Fabric", "Thread", "Buttons", "Labels", "Packaging"]),
  unit: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
  reorderLevel: z.coerce.number().nonnegative(),
  unitCost: z.coerce.number().nonnegative()
});

const productionSchema = z.object({
  status: z.enum(["Pending", "In progress", "Completed", "Blocked"]).optional(),
  assignedTo: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  notes: z.string().optional()
});

const attendanceActionSchema = z.object({
  employeeId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().datetime().optional()
});

const manualAttendanceSchema = z.object({
  employeeId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["Present", "Absent", "Late"]),
  checkInTime: z.string().datetime().optional().or(z.literal("")),
  checkOutTime: z.string().datetime().optional().or(z.literal(""))
});

function sign(user: AuthUser) {
  return jwt.sign(user, jwtSecret, { expiresIn: "8h" });
}

function auth(request: AuthedRequest, response: Response, next: NextFunction) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }
  try {
    request.user = jwt.verify(token, jwtSecret) as AuthUser;
    next();
  } catch {
    response.status(401).json({ message: "Invalid or expired token" });
  }
}

function allow(...allowedRoles: RoleName[]) {
  return (request: AuthedRequest, response: Response, next: NextFunction) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      response.status(403).json({ message: "You do not have permission for this action" });
      return;
    }
    next();
  };
}

function asyncRoute(handler: (request: AuthedRequest, response: Response) => Promise<void>) {
  return (request: AuthedRequest, response: Response, next: NextFunction) => {
    handler(request, response).catch(next);
  };
}

export async function createApp() {
  const repository = process.env.DATABASE_URL && process.env.DEMO_MODE !== "true"
    ? PrismaRepository.create()
    : await DemoRepository.create();
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(uploadDir));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "light-garment-erp" });
  });

  app.post("/api/auth/login", asyncRoute(async (request, response) => {
    const credentials = loginSchema.parse(request.body);
    const user = await repository.authenticate(credentials.email, credentials.password);
    if (!user) {
      response.status(401).json({ message: "Invalid email or password" });
      return;
    }
    response.json({ token: sign(user), user });
  }));

  app.post("/api/auth/password-reset", asyncRoute(async (request, response) => {
    const parsed = z.object({ email: z.string().email() }).parse(request.body);
    const reset = await repository.resetPassword(parsed.email);
    response.json({ message: "If the account exists, reset instructions have been prepared.", reset });
  }));

  app.get("/api/dashboard", auth, asyncRoute(async (_request, response) => {
    response.json(await repository.dashboard());
  }));

  app.get("/api/employees", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    response.json(await repository.listEmployees({
      search: String(request.query.search || ""),
      department: request.query.department ? String(request.query.department) : undefined,
      position: request.query.position ? String(request.query.position) : undefined,
      page: Number(request.query.page || 1),
      pageSize: Number(request.query.pageSize || 10),
      sortBy: String(request.query.sortBy || "employeeCode"),
      sortOrder: request.query.sortOrder === "desc" ? "desc" : "asc"
    }));
  }));

  app.post("/api/employees", auth, allow("Owner", "Manager", "HR/Admin"), upload.single("profilePicture"), asyncRoute(async (request, response) => {
    const parsed = employeeSchema.parse(request.body);
    const employee = await repository.createEmployee({
      ...parsed,
      faydaNumber: parsed.faydaNumber || undefined,
      email: parsed.email || undefined,
      profileImageUrl: request.file ? `/uploads/${request.file.filename}` : undefined
    });
    response.status(201).json(employee);
  }));

  app.get("/api/employees/:id", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const employee = await repository.getEmployee(String(request.params.id));
    if (!employee) {
      response.status(404).json({ message: "Employee not found" });
      return;
    }
    response.json(employee);
  }));

  app.put("/api/employees/:id", auth, allow("Owner", "Manager", "HR/Admin"), upload.single("profilePicture"), asyncRoute(async (request, response) => {
    const parsed = employeeSchema.partial().parse(request.body);
    const employee = await repository.updateEmployee(String(request.params.id), {
      ...parsed,
      faydaNumber: parsed.faydaNumber || undefined,
      email: parsed.email || undefined,
      profileImageUrl: request.file ? `/uploads/${request.file.filename}` : undefined
    });
    if (!employee) {
      response.status(404).json({ message: "Employee not found" });
      return;
    }
    response.json(employee);
  }));

  app.delete("/api/employees/:id", auth, allow("Owner", "HR/Admin"), asyncRoute(async (request, response) => {
    const deleted = await repository.deleteEmployee(String(request.params.id));
    response.status(deleted ? 204 : 404).end();
  }));

  app.get("/api/attendance", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    response.json(await repository.listAttendance(request.query.date ? String(request.query.date) : undefined));
  }));

  app.post("/api/attendance/:employeeId/check-in", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const record = await repository.checkIn(String(request.params.employeeId));
    response.status(record ? 201 : 404).json(record ?? { message: "Employee not found" });
  }));

  app.post("/api/attendance/:employeeId/check-out", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const record = await repository.checkOut(String(request.params.employeeId));
    response.status(record ? 200 : 404).json(record ?? { message: "Open attendance record not found" });
  }));

  app.post("/api/attendance/check-in", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const parsed = attendanceActionSchema.parse(request.body);
    const record = await repository.checkIn(parsed.employeeId, parsed.date, parsed.time);
    response.status(record ? 201 : 404).json(record ?? { message: "Employee not found" });
  }));

  app.post("/api/attendance/check-out", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const parsed = attendanceActionSchema.parse(request.body);
    const record = await repository.checkOut(parsed.employeeId, parsed.date, parsed.time);
    response.status(record ? 200 : 404).json(record ?? { message: "Open attendance record not found" });
  }));

  app.post("/api/attendance/manual", auth, allow("Owner", "HR/Admin"), asyncRoute(async (request, response) => {
    const parsed = manualAttendanceSchema.parse(request.body);
    const record = await repository.manualAttendance({
      ...parsed,
      checkInTime: parsed.checkInTime || undefined,
      checkOutTime: parsed.checkOutTime || undefined
    });
    response.status(record ? 200 : 404).json(record ?? { message: "Employee not found" });
  }));

  app.get("/api/attendance/today", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    response.json(await repository.attendanceToday(request.query.date ? String(request.query.date) : undefined));
  }));

  app.get("/api/attendance/month/:employeeId", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const report = await repository.employeeAttendanceMonth(String(request.params.employeeId), request.query.month ? String(request.query.month) : undefined);
    response.status(report ? 200 : 404).json(report ?? { message: "Employee not found" });
  }));

  app.get("/api/attendance/stats", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    response.json(await repository.attendanceStats(request.query.date ? String(request.query.date) : undefined));
  }));

  app.get("/api/products", auth, allow("Owner", "Manager", "Storekeeper", "Salesperson"), asyncRoute(async (_request, response) => {
    response.json(await repository.listProducts());
  }));

  app.post("/api/products", auth, allow("Owner", "Manager", "Storekeeper"), asyncRoute(async (request, response) => {
    response.status(201).json(await repository.createProduct(productSchema.parse(request.body)));
  }));

  app.get("/api/inventory", auth, allow("Owner", "Manager", "Storekeeper"), asyncRoute(async (_request, response) => {
    response.json(await repository.listInventory());
  }));

  app.post("/api/inventory/movements", auth, allow("Owner", "Manager", "Storekeeper"), asyncRoute(async (request, response) => {
    const parsed = stockSchema.parse(request.body);
    const movement = await repository.moveStock(parsed.productId, parsed.quantity, parsed.type, parsed.fromLocation, parsed.toLocation, parsed.reference);
    response.status(movement ? 201 : 404).json(movement ?? { message: "Product not found" });
  }));

  app.get("/api/raw-materials", auth, allow("Owner", "Manager", "Storekeeper"), asyncRoute(async (_request, response) => {
    response.json(await repository.listRawMaterials());
  }));

  app.post("/api/raw-materials", auth, allow("Owner", "Manager", "Storekeeper"), asyncRoute(async (request, response) => {
    response.status(201).json(await repository.createRawMaterial(rawMaterialSchema.parse(request.body)));
  }));

  app.get("/api/sales", auth, allow("Owner", "Manager", "Salesperson"), asyncRoute(async (_request, response) => {
    response.json(await repository.listSales());
  }));

  app.post("/api/sales", auth, allow("Owner", "Manager", "Salesperson"), asyncRoute(async (request, response) => {
    response.status(201).json(await repository.createSale(saleSchema.parse(request.body)));
  }));

  app.patch("/api/sales/:id/pay", auth, allow("Owner", "Manager", "Salesperson"), asyncRoute(async (request, response) => {
    const parsed = salePaymentSchema.parse(request.body);
    const sale = await repository.markSalePaid(String(request.params.id), parsed.amountPaid, parsed.paymentMethod);
    response.status(sale ? 200 : 404).json(sale ?? { message: "Sale not found" });
  }));

  app.get("/api/production", auth, allow("Owner", "Manager"), asyncRoute(async (_request, response) => {
    response.json(await repository.listProduction());
  }));

  app.patch("/api/production/:id", auth, allow("Owner", "Manager"), asyncRoute(async (request, response) => {
    const stage = await repository.updateProduction(String(request.params.id), productionSchema.parse(request.body));
    response.status(stage ? 200 : 404).json(stage ?? { message: "Production stage not found" });
  }));

  app.get("/api/reports", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (_request, response) => {
    response.json(await repository.reports());
  }));

  app.get("/api/settings", auth, allow(...roles), asyncRoute(async (_request, response) => {
    response.json(await repository.settings());
  }));

  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get(/^(?!\/api).*/, (_request, response) => {
      response.sendFile(path.join(clientDir, "index.html"));
    });
  }

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      response.status(422).json({ message: "Validation failed", issues: error.issues });
      return;
    }
    if (error instanceof Error) {
      response.status(error.message.includes("Insufficient") || error.message.includes("already checked in") ? 409 : 500).json({ message: error.message });
      return;
    }
    response.status(500).json({ message: "Unexpected server error" });
  });

  return app;
}
