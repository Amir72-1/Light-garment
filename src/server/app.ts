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
import { imageFileToDataUrl } from "./imageStorage.js";
import { PrismaRepository } from "./prismaRepository.js";
import type { RoleName } from "../shared/types.js";

dotenv.config();

const roles = ["Owner", "Manager", "Storekeeper", "Salesperson", "HR/Admin"] as const;
const jwtSecret = process.env.JWT_SECRET || "development-only-secret-change-me";
const uploadDir = path.resolve(process.cwd(), "uploads");
const clientDir = path.resolve(process.cwd(), "dist-client");

fs.mkdirSync(uploadDir, { recursive: true });

const profileUpload = multer({
  storage: multer.memoryStorage(),
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

function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return trimmed;
}

const dateField = z.preprocess((value) => typeof value === "string" ? normalizeDateInput(value) : value, z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const employeeSchema = z.object({
  fullName: z.string().min(2),
  faydaNumber: z.string().min(4).optional().or(z.literal("")),
  phoneNumber: z.string().min(7),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().min(3),
  gender: z.enum(["Male", "Female", "Other"]),
  dateOfBirth: dateField,
  position: z.string().min(2),
  department: z.enum(["Production", "Sales", "Admin", "Store"]),
  salary: z.coerce.number().nonnegative(),
  employmentType: z.enum(["Full-time", "Part-time", "Contract"]),
  hireDate: dateField,
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

const rawMaterialUseSchema = z.object({
  quantity: z.coerce.number().positive(),
  reference: z.string().optional(),
  note: z.string().optional()
});

const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["Owner", "Manager", "Storekeeper", "Salesperson", "HR/Admin"])
});

const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["Owner", "Manager", "Storekeeper", "Salesperson", "HR/Admin"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional().or(z.literal(""))
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

const attendanceTimeEditSchema = z.object({
  employeeId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkInTime: z.string().datetime().optional().or(z.literal("")),
  checkOutTime: z.string().datetime().optional().or(z.literal(""))
});

const attendanceSettingsSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/)
});

const payrollPeriodSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
});

const payrollSettingsSchema = z.object({
  standardHoursPerDay: z.coerce.number().positive(),
  workingDaysPerMonth: z.coerce.number().int().positive(),
  gracePeriodMinutes: z.coerce.number().int().nonnegative(),
  overtimeRatePerHour: z.coerce.number().nonnegative(),
  latePenaltyEnabled: z.boolean(),
  latePenaltyAmount: z.coerce.number().nonnegative(),
  absenceDeductionEnabled: z.boolean(),
  taxPercentage: z.coerce.number().nonnegative().optional(),
  defaultAllowance: z.coerce.number().nonnegative(),
  defaultBonus: z.coerce.number().nonnegative()
});

const payrollAdjustmentSchema = z.object({
  bonus: z.coerce.number().nonnegative().optional(),
  allowance: z.coerce.number().nonnegative().optional(),
  deductions: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional()
});

const payrollPaymentSchema = z.object({
  paymentMethod: z.enum(["Cash", "Bank transfer", "Mobile money"]).optional(),
  paymentDate: z.string().datetime().optional()
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

  app.get("/api/employees/archived", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (_request, response) => {
    response.json(await repository.listArchivedEmployees());
  }));

  app.post("/api/employees/reset-codes", auth, allow("Owner"), asyncRoute(async (_request, response) => {
    response.json(await repository.resetEmployeeCodes());
  }));

  app.get("/api/employees/check-fayda/:number", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const number = decodeURIComponent(String(request.params.number)).trim();
    const available = number ? !(await repository.faydaNumberExists(number)) : true;
    response.json({ available, faydaNumber: number });
  }));

  function employeeUploadFiles(request: AuthedRequest) {
    const files = request.files as Record<string, Express.Multer.File[]> | undefined;
    return {
      profilePicture: files?.profilePicture?.[0],
      idDocumentFront: files?.idDocumentFront?.[0] ?? files?.idDocument?.[0],
      idDocumentBack: files?.idDocumentBack?.[0]
    };
  }

  app.post("/api/employees", auth, allow("Owner", "Manager", "HR/Admin"), profileUpload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "idDocumentFront", maxCount: 1 },
    { name: "idDocumentBack", maxCount: 1 },
    { name: "idDocument", maxCount: 1 }
  ]), asyncRoute(async (request, response) => {
    const parsed = employeeSchema.parse(request.body);
    const files = employeeUploadFiles(request);
    if (parsed.faydaNumber && await repository.faydaNumberExists(parsed.faydaNumber)) {
      response.status(409).json({ message: "This Fayda ID number is already registered." });
      return;
    }
    const employee = await repository.createEmployee({
      ...parsed,
      faydaNumber: parsed.faydaNumber || undefined,
      email: parsed.email || undefined,
      profileImageUrl: files.profilePicture ? imageFileToDataUrl(files.profilePicture) : undefined,
      idImageUrl: files.idDocumentFront ? imageFileToDataUrl(files.idDocumentFront) : undefined,
      idImageBackUrl: files.idDocumentBack ? imageFileToDataUrl(files.idDocumentBack) : undefined
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

  app.put("/api/employees/:id", auth, allow("Owner", "Manager", "HR/Admin"), profileUpload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "idDocumentFront", maxCount: 1 },
    { name: "idDocumentBack", maxCount: 1 },
    { name: "idDocument", maxCount: 1 }
  ]), asyncRoute(async (request, response) => {
    const parsed = employeeSchema.partial().parse(request.body);
    const files = employeeUploadFiles(request);
    if (parsed.faydaNumber && await repository.faydaNumberExists(parsed.faydaNumber)) {
      const existing = await repository.getEmployee(String(request.params.id));
      if (!existing || existing.faydaNumber?.toLowerCase() !== parsed.faydaNumber.toLowerCase()) {
        response.status(409).json({ message: "This Fayda ID number is already registered." });
        return;
      }
    }
    const employee = await repository.updateEmployee(String(request.params.id), {
      ...parsed,
      faydaNumber: parsed.faydaNumber || undefined,
      email: parsed.email || undefined,
      profileImageUrl: files.profilePicture ? imageFileToDataUrl(files.profilePicture) : undefined,
      idImageUrl: files.idDocumentFront ? imageFileToDataUrl(files.idDocumentFront) : undefined,
      idImageBackUrl: files.idDocumentBack ? imageFileToDataUrl(files.idDocumentBack) : undefined
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

  app.delete("/api/employees/:id/permanent", auth, allow("Owner"), asyncRoute(async (request, response) => {
    const deleted = await repository.permanentlyDeleteEmployee(String(request.params.id));
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

  app.patch("/api/attendance/times", auth, allow("Owner"), asyncRoute(async (request, response) => {
    const parsed = attendanceTimeEditSchema.parse(request.body);
    const record = await repository.updateAttendanceTimes({
      ...parsed,
      checkInTime: parsed.checkInTime || undefined,
      checkOutTime: parsed.checkOutTime || undefined
    });
    response.status(record ? 200 : 404).json(record ?? { message: "Employee not found" });
  }));

  app.get("/api/attendance/settings", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (_request, response) => {
    response.json(await repository.attendanceSettings());
  }));

  app.patch("/api/attendance/settings", auth, allow("Owner"), asyncRoute(async (request, response) => {
    response.json(await repository.updateAttendanceSettings(attendanceSettingsSchema.parse(request.body)));
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

  app.get("/api/raw-materials/history", auth, allow("Owner", "Manager", "Storekeeper"), asyncRoute(async (_request, response) => {
    response.json(await repository.listRawMaterialMovements());
  }));

  app.post("/api/raw-materials/:id/use", auth, allow("Owner", "Manager", "Storekeeper"), asyncRoute(async (request, response) => {
    const movement = await repository.useRawMaterial(String(request.params.id), rawMaterialUseSchema.parse(request.body));
    response.status(movement ? 201 : 404).json(movement ?? { message: "Raw material not found" });
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

  app.get("/api/payroll/settings", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (_request, response) => {
    response.json(await repository.payrollSettings());
  }));

  app.patch("/api/payroll/settings", auth, allow("Owner"), asyncRoute(async (request, response) => {
    response.json(await repository.updatePayrollSettings(payrollSettingsSchema.parse(request.body)));
  }));

  app.post("/api/payroll/generate", auth, allow("Owner", "HR/Admin"), asyncRoute(async (request, response) => {
    const parsed = payrollPeriodSchema.parse(request.body);
    response.status(201).json(await repository.generatePayroll(parsed.month, parsed.year));
  }));

  app.get("/api/payroll/dashboard", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const parsed = payrollPeriodSchema.parse(request.query);
    response.json(await repository.payrollDashboard(parsed.month, parsed.year));
  }));

  app.get("/api/payroll/reports", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const parsed = payrollPeriodSchema.parse(request.query);
    response.json(await repository.payrollReports(parsed.month, parsed.year));
  }));

  app.get("/api/payroll", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const month = request.query.month ? Number(request.query.month) : undefined;
    const year = request.query.year ? Number(request.query.year) : undefined;
    response.json(await repository.listPayrolls(month, year));
  }));

  app.get("/api/payroll/:id/payslip", auth, allow("Owner", "Manager", "HR/Admin"), asyncRoute(async (request, response) => {
    const payslip = await repository.payrollPayslip(String(request.params.id));
    response.status(payslip ? 200 : 404).json(payslip ?? { message: "Payroll not found" });
  }));

  app.patch("/api/payroll/:id", auth, allow("Owner", "HR/Admin"), asyncRoute(async (request, response) => {
    const payroll = await repository.updatePayroll(String(request.params.id), payrollAdjustmentSchema.parse(request.body));
    response.status(payroll ? 200 : 404).json(payroll ?? { message: "Payroll not found" });
  }));

  app.patch("/api/payroll/:id/pay", auth, allow("Owner", "HR/Admin"), asyncRoute(async (request, response) => {
    const payroll = await repository.markPayrollPaid(String(request.params.id), payrollPaymentSchema.parse(request.body));
    response.status(payroll ? 200 : 404).json(payroll ?? { message: "Payroll not found" });
  }));

  app.get("/api/settings", auth, allow(...roles), asyncRoute(async (_request, response) => {
    response.json(await repository.settings());
  }));

  app.get("/api/users", auth, allow("Owner"), asyncRoute(async (_request, response) => {
    response.json(await repository.listUsers());
  }));

  app.post("/api/users", auth, allow("Owner"), asyncRoute(async (request, response) => {
    response.status(201).json(await repository.createUser(userCreateSchema.parse(request.body)));
  }));

  app.patch("/api/users/:id", auth, allow("Owner"), asyncRoute(async (request, response) => {
    const parsed = userUpdateSchema.parse(request.body);
    const user = await repository.updateUser(String(request.params.id), { ...parsed, password: parsed.password || undefined });
    response.status(user ? 200 : 404).json(user ?? { message: "User not found" });
  }));

  app.delete("/api/users/:id", auth, allow("Owner"), asyncRoute(async (request, response) => {
    const deleted = await repository.deleteUser(String(request.params.id));
    response.status(deleted ? 204 : 404).end();
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
      response.status(error.message.includes("Insufficient") || error.message.includes("already checked in") || error.message.includes("already exists") || error.message.includes("Unique constraint") ? 409 : 500).json({ message: error.message });
      return;
    }
    response.status(500).json({ message: "Unexpected server error" });
  });

  return app;
}
