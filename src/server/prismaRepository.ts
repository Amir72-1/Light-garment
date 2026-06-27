import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type {
  AttendanceRecord,
  AttendanceSettings,
  AttendanceStats,
  DashboardMetrics,
  Department,
  Employee,
  EmployeeAttendanceProfile,
  EmploymentType,
  Gender,
  InventoryMovement,
  Product,
  ProductionStage,
  RawMaterial,
  RoleName,
  Sale
} from "../shared/types.js";

type ListQuery = {
  search?: string;
  department?: string;
  position?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

type EmployeeInput = Omit<Employee, "id" | "employeeCode"> & { employeeCode?: string };

const roleToDb: Record<RoleName, string> = { Owner: "OWNER", Manager: "MANAGER", Storekeeper: "STOREKEEPER", Salesperson: "SALESPERSON", "HR/Admin": "HR_ADMIN" };
const roleFromDb: Record<string, RoleName> = { OWNER: "Owner", MANAGER: "Manager", STOREKEEPER: "Storekeeper", SALESPERSON: "Salesperson", HR_ADMIN: "HR/Admin" };
const departmentToDb: Record<Department, string> = { Production: "PRODUCTION", Sales: "SALES", Admin: "ADMIN", Store: "STORE" };
const departmentFromDb: Record<string, Department> = { PRODUCTION: "Production", SALES: "Sales", ADMIN: "Admin", STORE: "Store" };
const genderToDb: Record<Gender, string> = { Male: "MALE", Female: "FEMALE", Other: "OTHER" };
const genderFromDb: Record<string, Gender> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
const employmentToDb: Record<EmploymentType, string> = { "Full-time": "FULL_TIME", "Part-time": "PART_TIME", Contract: "CONTRACT" };
const employmentFromDb: Record<string, EmploymentType> = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract" };
const statusToDb = { Active: "ACTIVE", Inactive: "INACTIVE" } as const;
const statusFromDb = { ACTIVE: "Active", INACTIVE: "Inactive" } as const;
const movementFromDb: Record<string, InventoryMovement["type"]> = { STOCK_IN: "Stock in", STOCK_OUT: "Stock out", TRANSFER: "Transfer", SALE: "Sale", ADJUSTMENT: "Adjustment" };
const movementToDb: Record<InventoryMovement["type"], string> = { "Stock in": "STOCK_IN", "Stock out": "STOCK_OUT", Transfer: "TRANSFER", Sale: "SALE", Adjustment: "ADJUSTMENT" };
const paymentFromDb: Record<string, Sale["paymentStatus"]> = { PENDING: "Pending", PARTIAL: "Partial", PAID: "Paid" };
const paymentToDb: Record<Sale["paymentStatus"], string> = { Pending: "PENDING", Partial: "PARTIAL", Paid: "PAID" };
const methodToDb: Record<Sale["paymentMethod"], string> = { Cash: "CASH", Card: "CARD", "Bank transfer": "BANK_TRANSFER", "Mobile money": "MOBILE_MONEY" };
const methodFromDb: Record<string, Sale["paymentMethod"]> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank transfer", MOBILE_MONEY: "Mobile money" };
const stageFromDb: Record<string, ProductionStage["stage"]> = { FABRIC: "Fabric", CUTTING: "Cutting", SEWING: "Sewing", PRINTING: "Printing", IRONING: "Ironing", PACKAGING: "Packaging", FINISHED_GOODS: "Finished goods" };
const stageStatusFromDb: Record<string, ProductionStage["status"]> = { PENDING: "Pending", IN_PROGRESS: "In progress", COMPLETED: "Completed", BLOCKED: "Blocked" };
const stageStatusToDb: Record<ProductionStage["status"], string> = { Pending: "PENDING", "In progress": "IN_PROGRESS", Completed: "COMPLETED", Blocked: "BLOCKED" };
const rawCategoryFromDb: Record<string, RawMaterial["category"]> = { FABRIC: "Fabric", THREAD: "Thread", BUTTONS: "Buttons", LABELS: "Labels", PACKAGING: "Packaging" };
const rawCategoryToDb: Record<RawMaterial["category"], string> = { Fabric: "FABRIC", Thread: "THREAD", Buttons: "BUTTONS", Labels: "LABELS", Packaging: "PACKAGING" };
const attendanceFromDb: Record<string, AttendanceRecord["status"]> = { PRESENT: "Present", ABSENT: "Absent", LATE: "Late" };
const attendanceToDb: Record<AttendanceRecord["status"], string> = { Present: "PRESENT", Absent: "ABSENT", Late: "LATE" };
const defaultAttendanceSettings: AttendanceSettings = {
  startTime: process.env.ATTENDANCE_START_TIME || "09:00",
  endTime: process.env.ATTENDANCE_END_TIME || "17:00"
};

function isoDate(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function employeeFromDb(row: any): Employee {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    profileImageUrl: row.profileImageUrl ?? "",
    faydaNumber: row.faydaNumber ?? undefined,
    phoneNumber: row.phoneNumber,
    email: row.email ?? undefined,
    address: row.address,
    gender: genderFromDb[row.gender],
    dateOfBirth: isoDate(row.dateOfBirth),
    position: row.position,
    department: departmentFromDb[row.department],
    salary: Number(row.salary),
    employmentType: employmentFromDb[row.employmentType],
    hireDate: isoDate(row.hireDate),
    status: statusFromDb[row.status as "ACTIVE" | "INACTIVE"]
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isLate(checkInTime: string, startTime: string) {
  const time = new Date(checkInTime).toTimeString().slice(0, 5);
  return time > startTime;
}

function totalHours(checkInTime?: string | null, checkOutTime?: string | null) {
  if (!checkInTime || !checkOutTime) return undefined;
  const hours = (new Date(checkOutTime).getTime() - new Date(checkInTime).getTime()) / 3_600_000;
  return Math.max(0, Math.round(hours * 100) / 100);
}

function dateTimeFor(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function shouldDefaultCheckout(date: string, endTime: string) {
  return new Date() >= dateTimeFor(date, endTime);
}

function effectiveCheckOutTime(row: { date: string; checkInTime?: string | null; checkOutTime?: string | null }, settings: AttendanceSettings) {
  if (row.checkOutTime || !row.checkInTime || !shouldDefaultCheckout(row.date, settings.endTime)) {
    return row.checkOutTime ?? undefined;
  }
  return dateTimeFor(row.date, settings.endTime).toISOString();
}

function overtimeHours(checkOutTime: string | undefined, date: string, settings: AttendanceSettings) {
  if (!checkOutTime) return undefined;
  const overtime = (new Date(checkOutTime).getTime() - dateTimeFor(date, settings.endTime).getTime()) / 3_600_000;
  return Math.max(0, Math.round(overtime * 100) / 100);
}

function workingDaysInMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const days = new Date(year, monthIndex, 0).getDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

function attendanceFromRow(row: any, settings: AttendanceSettings = defaultAttendanceSettings): AttendanceRecord {
  const checkOutTime = effectiveCheckOutTime(row, settings);
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.fullName,
    employeeCode: row.employee.employeeCode,
    department: departmentFromDb[row.employee.department],
    position: row.employee.position,
    date: row.date,
    checkInTime: row.checkInTime ?? undefined,
    checkOutTime,
    status: attendanceFromDb[row.status],
    totalHours: totalHours(row.checkInTime, checkOutTime) ?? row.totalHours ?? undefined,
    overtimeHours: overtimeHours(checkOutTime, row.date, settings) ?? row.overtimeHours ?? undefined
  };
}

function absentRecord(employee: any, date: string): AttendanceRecord {
  return {
    id: `absent-${employee.id}-${date}`,
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    department: departmentFromDb[employee.department],
    position: employee.position,
    date,
    status: "Absent"
  };
}

function productFromDb(row: any): Product {
  return {
    id: row.id,
    sku: row.sku,
    productName: row.productName,
    model: row.model,
    color: row.color,
    size: row.size,
    quantity: row.quantity,
    costPrice: Number(row.costPrice),
    sellingPrice: Number(row.sellingPrice),
    images: row.images,
    barcode: row.barcode ?? undefined,
    qrCode: row.qrCode ?? undefined
  };
}

export class PrismaRepository {
  private attendanceConfig: AttendanceSettings = { ...defaultAttendanceSettings };

  constructor(private prisma: PrismaClient) {}

  static create() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required for PrismaRepository");
    const adapter = new PrismaPg({ connectionString });
    return new PrismaRepository(new PrismaClient({ adapter }));
  }

  async authenticate(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { role: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return { id: user.id, name: user.name, email: user.email, role: roleFromDb[user.role.name] };
  }

  async resetPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const token = crypto.randomBytes(24).toString("hex");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(token, 12),
        expiresAt: new Date(Date.now() + 1000 * 60 * 30)
      }
    });
    return { token, expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString() };
  }

  async dashboard(): Promise<DashboardMetrics> {
    const [totalEmployees, products, rawMaterials, totalSales, sales] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.product.findMany(),
      this.prisma.rawMaterial.findMany(),
      this.prisma.sale.count(),
      this.prisma.sale.findMany({ orderBy: { createdAt: "desc" } })
    ]);
    const revenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    return {
      totalEmployees,
      totalInventory: products.reduce((sum, product) => sum + product.quantity, 0),
      totalSales,
      revenue,
      lowStockAlerts: [
        ...products.filter((product) => product.quantity < 20).map((product) => ({ id: product.id, name: product.productName, quantity: product.quantity, threshold: 20 })),
        ...rawMaterials.filter((material) => Number(material.quantity) < Number(material.reorderLevel)).map((material) => ({ id: material.id, name: material.name, quantity: Number(material.quantity), threshold: Number(material.reorderLevel) }))
      ],
      recentActivity: sales.slice(0, 8).map((sale) => ({ id: sale.id, label: `Invoice ${sale.invoiceNumber} created`, at: sale.createdAt.toISOString() }))
    };
  }

  async listEmployees(query: ListQuery) {
    const where: any = {};
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: "insensitive" } },
        { employeeCode: { contains: query.search, mode: "insensitive" } },
        { faydaNumber: { contains: query.search, mode: "insensitive" } },
        { phoneNumber: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } }
      ];
    }
    if (query.department) where.department = departmentToDb[query.department as Department];
    if (query.position) where.position = { contains: query.position, mode: "insensitive" };
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const [total, rows] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({ where, orderBy: { [query.sortBy || "employeeCode"]: query.sortOrder || "asc" }, skip: (page - 1) * pageSize, take: pageSize })
    ]);
    return { data: rows.map(employeeFromDb), page, pageSize, total };
  }

  async getEmployee(employeeId: string) {
    const row = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    return row ? employeeFromDb(row) : null;
  }

  async createEmployee(input: EmployeeInput) {
    const count = await this.prisma.employee.count();
    const row = await this.prisma.employee.create({
      data: {
        employeeCode: input.employeeCode || `LGM-EMP-${String(count + 1).padStart(4, "0")}`,
        fullName: input.fullName,
        faydaNumber: input.faydaNumber || null,
        profileImageUrl: input.profileImageUrl || null,
        phoneNumber: input.phoneNumber,
        email: input.email || null,
        address: input.address,
        gender: genderToDb[input.gender] as any,
        dateOfBirth: new Date(input.dateOfBirth),
        position: input.position,
        department: departmentToDb[input.department] as any,
        salary: input.salary,
        employmentType: employmentToDb[input.employmentType] as any,
        hireDate: new Date(input.hireDate),
        status: statusToDb[input.status] as any
      }
    });
    return employeeFromDb(row);
  }

  async updateEmployee(employeeId: string, input: Partial<EmployeeInput>) {
    const row = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        fullName: input.fullName,
        faydaNumber: input.faydaNumber,
        profileImageUrl: input.profileImageUrl,
        phoneNumber: input.phoneNumber,
        email: input.email,
        address: input.address,
        gender: input.gender ? genderToDb[input.gender] as any : undefined,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        position: input.position,
        department: input.department ? departmentToDb[input.department] as any : undefined,
        salary: input.salary,
        employmentType: input.employmentType ? employmentToDb[input.employmentType] as any : undefined,
        hireDate: input.hireDate ? new Date(input.hireDate) : undefined,
        status: input.status ? statusToDb[input.status] as any : undefined
      }
    }).catch(() => null);
    return row ? employeeFromDb(row) : null;
  }

  async deleteEmployee(employeeId: string) {
    await this.prisma.employee.delete({ where: { id: employeeId } }).catch(() => null);
    return true;
  }

  async listAttendance(date = todayKey()) {
    return this.attendanceToday(date);
  }

  async attendanceToday(date = todayKey()) {
    const [employees, rows] = await Promise.all([
      this.prisma.employee.findMany({ orderBy: { fullName: "asc" } }),
      this.prisma.attendance.findMany({ where: { date }, include: { employee: true } })
    ]);
    return employees.map((employee) => {
      const existing = rows.find((row) => row.employeeId === employee.id);
      return existing ? attendanceFromRow(existing, this.attendanceConfig) : absentRecord(employee, date);
    });
  }

  async attendanceStats(date = todayKey()): Promise<AttendanceStats> {
    const rows = await this.attendanceToday(date);
    return {
      date,
      present: rows.filter((item) => item.status === "Present").length,
      absent: rows.filter((item) => item.status === "Absent").length,
      late: rows.filter((item) => item.status === "Late").length
    };
  }

  async attendanceSettings() {
    return this.attendanceConfig;
  }

  async updateAttendanceSettings(settings: AttendanceSettings) {
    this.attendanceConfig = settings;
    return this.attendanceConfig;
  }

  async employeeAttendanceMonth(employeeId: string, month = todayKey().slice(0, 7)): Promise<EmployeeAttendanceProfile | null> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return null;
    const rows = await this.prisma.attendance.findMany({
      where: { employeeId, date: { startsWith: month } },
      include: { employee: true },
      orderBy: { date: "asc" }
    });
    const records = rows.map((row) => attendanceFromRow(row, this.attendanceConfig));
    const totalWorkingDays = workingDaysInMonth(month).length;
    const attendedDays = records.filter((item) => item.status === "Present" || item.status === "Late").length;
    return { employee: employeeFromDb(employee), month, records, totalWorkingDays, attendancePercentage: Math.round((attendedDays / totalWorkingDays) * 100) };
  }

  async checkIn(employeeId: string, date = todayKey(), checkInTime = new Date().toISOString()) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return null;
    const existing = await this.prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
    if (existing?.checkInTime) throw new Error("Employee already checked in today");
    const row = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      update: { checkInTime, status: (isLate(checkInTime, this.attendanceConfig.startTime) ? "LATE" : "PRESENT") as any },
      create: { employeeId, date, checkInTime, status: (isLate(checkInTime, this.attendanceConfig.startTime) ? "LATE" : "PRESENT") as any },
      include: { employee: true }
    });
    return attendanceFromRow(row, this.attendanceConfig);
  }

  async checkOut(employeeId: string, date = todayKey(), checkOutTime = new Date().toISOString()) {
    const existing = await this.prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
    const row = await this.prisma.attendance.update({
      where: { employeeId_date: { employeeId, date } },
      data: { checkOutTime, totalHours: totalHours(existing?.checkInTime, checkOutTime), overtimeHours: overtimeHours(checkOutTime, date, this.attendanceConfig) },
      include: { employee: true }
    }).catch(() => null);
    return row ? attendanceFromRow(row, this.attendanceConfig) : null;
  }

  async manualAttendance(input: { employeeId: string; date?: string; status: AttendanceRecord["status"]; checkInTime?: string; checkOutTime?: string }) {
    const employee = await this.prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) return null;
    const date = input.date || todayKey();
    const row = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date } },
      update: {
        status: attendanceToDb[input.status] as any,
        checkInTime: input.status === "Absent" ? null : input.checkInTime,
        checkOutTime: input.status === "Absent" ? null : input.checkOutTime,
        totalHours: input.status === "Absent" ? null : totalHours(input.checkInTime, input.checkOutTime),
        overtimeHours: input.status === "Absent" ? null : overtimeHours(input.checkOutTime, date, this.attendanceConfig)
      },
      create: {
        employeeId: input.employeeId,
        date,
        status: attendanceToDb[input.status] as any,
        checkInTime: input.checkInTime,
        checkOutTime: input.checkOutTime,
        totalHours: totalHours(input.checkInTime, input.checkOutTime),
        overtimeHours: overtimeHours(input.checkOutTime, date, this.attendanceConfig)
      },
      include: { employee: true }
    });
    return attendanceFromRow(row, this.attendanceConfig);
  }

  async updateAttendanceTimes(input: { employeeId: string; date: string; checkInTime?: string; checkOutTime?: string }) {
    const employee = await this.prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) return null;
    const status = input.checkInTime ? (isLate(input.checkInTime, this.attendanceConfig.startTime) ? "LATE" : "PRESENT") : "ABSENT";
    const row = await this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date: input.date } },
      update: {
        checkInTime: input.checkInTime ?? null,
        checkOutTime: input.checkOutTime ?? null,
        status: status as any,
        totalHours: totalHours(input.checkInTime, input.checkOutTime) ?? null,
        overtimeHours: overtimeHours(input.checkOutTime, input.date, this.attendanceConfig) ?? null
      },
      create: {
        employeeId: input.employeeId,
        date: input.date,
        checkInTime: input.checkInTime,
        checkOutTime: input.checkOutTime,
        status: status as any,
        totalHours: totalHours(input.checkInTime, input.checkOutTime),
        overtimeHours: overtimeHours(input.checkOutTime, input.date, this.attendanceConfig)
      },
      include: { employee: true }
    });
    return attendanceFromRow(row, this.attendanceConfig);
  }

  async listProducts() {
    return (await this.prisma.product.findMany({ orderBy: { sku: "asc" } })).map(productFromDb);
  }

  async createProduct(input: Omit<Product, "id" | "sku" | "qrCode"> & { sku?: string }) {
    const sku = input.sku || `LGM-SH-${String(await this.prisma.product.count() + 1).padStart(4, "0")}`;
    const row = await this.prisma.product.create({ data: { ...input, sku, qrCode: await QRCode.toDataURL(sku), images: input.images || [] } as any });
    await this.moveStock(row.id, row.quantity, "Stock in", undefined, "Finished goods", "Product registration");
    return productFromDb(row);
  }

  async moveStock(productId: string, quantity: number, type: InventoryMovement["type"], fromLocation?: string, toLocation?: string, reference?: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) return null;
      const delta = type === "Stock in" ? quantity : type === "Transfer" ? 0 : -quantity;
      if (product.quantity + delta < 0) throw new Error("Insufficient stock");
      const updated = await tx.product.update({ where: { id: productId }, data: { quantity: product.quantity + delta } });
      const move = await tx.inventory.create({ data: { productId, quantity, type: movementToDb[type] as any, fromLocation, toLocation, reference } });
      return { id: move.id, productId, productName: updated.productName, type, quantity, fromLocation, toLocation, reference, createdAt: move.createdAt.toISOString() };
    });
  }

  async listInventory() {
    const rows = await this.prisma.inventory.findMany({ include: { product: true }, orderBy: { createdAt: "desc" } });
    return rows.map((row): InventoryMovement => ({ id: row.id, productId: row.productId, productName: row.product.productName, type: movementFromDb[row.type], quantity: row.quantity, fromLocation: row.fromLocation ?? undefined, toLocation: row.toLocation ?? undefined, reference: row.reference ?? undefined, createdAt: row.createdAt.toISOString() }));
  }

  async listRawMaterials() {
    const rows = await this.prisma.rawMaterial.findMany({ orderBy: { name: "asc" } });
    return rows.map((row): RawMaterial => ({ id: row.id, name: row.name, category: rawCategoryFromDb[row.category], unit: row.unit, quantity: Number(row.quantity), reorderLevel: Number(row.reorderLevel), unitCost: Number(row.unitCost) }));
  }

  async createRawMaterial(input: Omit<RawMaterial, "id">) {
    const row = await this.prisma.rawMaterial.create({
      data: {
        name: input.name,
        category: rawCategoryToDb[input.category] as any,
        unit: input.unit,
        quantity: input.quantity,
        reorderLevel: input.reorderLevel,
        unitCost: input.unitCost
      }
    });
    return { id: row.id, name: row.name, category: rawCategoryFromDb[row.category], unit: row.unit, quantity: Number(row.quantity), reorderLevel: Number(row.reorderLevel), unitCost: Number(row.unitCost) };
  }

  async listProduction() {
    const rows = await this.prisma.productionStage.findMany({ include: { product: true }, orderBy: { createdAt: "asc" } });
    return rows.map((row): ProductionStage => ({ id: row.id, productId: row.productId, productName: row.product.productName, stage: stageFromDb[row.stage], status: stageStatusFromDb[row.status], assignedTo: row.assignedTo ?? undefined, startedAt: row.startedAt?.toISOString(), completedAt: row.completedAt?.toISOString(), notes: row.notes ?? undefined }));
  }

  async updateProduction(stageId: string, input: Partial<ProductionStage>) {
    const row = await this.prisma.productionStage.update({ where: { id: stageId }, data: { status: input.status ? stageStatusToDb[input.status] as any : undefined, assignedTo: input.assignedTo, startedAt: input.startedAt ? new Date(input.startedAt) : undefined, completedAt: input.completedAt ? new Date(input.completedAt) : undefined, notes: input.notes }, include: { product: true } }).catch(() => null);
    return row ? { id: row.id, productId: row.productId, productName: row.product.productName, stage: stageFromDb[row.stage], status: stageStatusFromDb[row.status], assignedTo: row.assignedTo ?? undefined, startedAt: row.startedAt?.toISOString(), completedAt: row.completedAt?.toISOString(), notes: row.notes ?? undefined } : null;
  }

  async listSales() {
    const rows = await this.prisma.sale.findMany({ include: { items: { include: { product: true } } }, orderBy: { createdAt: "desc" } });
    return rows.map((row): Sale => ({ id: row.id, invoiceNumber: row.invoiceNumber, customerName: row.customerName ?? undefined, subtotal: Number(row.subtotal), tax: Number(row.tax), discount: Number(row.discount), total: Number(row.total), amountPaid: Number(row.amountPaid), paymentStatus: paymentFromDb[row.paymentStatus], paymentMethod: methodFromDb[row.paymentMethod], createdAt: row.createdAt.toISOString(), items: row.items.map((item) => ({ productId: item.productId, productName: item.product.productName, quantity: item.quantity, unitPrice: Number(item.unitPrice), total: Number(item.total) })) }));
  }

  async createSale(input: { customerName?: string; items: Array<{ productId: string; quantity: number }>; amountPaid: number; paymentMethod: Sale["paymentMethod"]; discount?: number; tax?: number }) {
    return this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: input.items.map((item) => item.productId) } } });
      const saleItems = input.items.map((item) => {
        const product = products.find((candidate) => candidate.id === item.productId);
        if (!product) throw new Error("Product not found");
        if (product.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.productName}`);
        return { product, quantity: item.quantity, unitPrice: Number(product.sellingPrice), total: Number(product.sellingPrice) * item.quantity };
      });
      const subtotal = saleItems.reduce((sum, item) => sum + item.total, 0);
      const total = subtotal + (input.tax ?? 0) - (input.discount ?? 0);
      const cashier = await tx.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
      const sale = await tx.sale.create({
        data: {
          invoiceNumber: `INV-${String(await tx.sale.count() + 1).padStart(5, "0")}`,
          cashierId: cashier.id,
          customerName: input.customerName,
          subtotal,
          tax: input.tax ?? 0,
          discount: input.discount ?? 0,
          total,
          amountPaid: input.amountPaid,
          paymentStatus: paymentToDb[input.amountPaid >= total ? "Paid" : input.amountPaid > 0 ? "Partial" : "Pending"] as any,
          paymentMethod: methodToDb[input.paymentMethod] as any,
          items: { create: saleItems.map((item) => ({ productId: item.product.id, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total })) }
        },
        include: { items: { include: { product: true } } }
      });
      for (const item of saleItems) {
        await tx.product.update({ where: { id: item.product.id }, data: { quantity: item.product.quantity - item.quantity } });
        await tx.inventory.create({ data: { productId: item.product.id, type: "SALE", quantity: item.quantity, fromLocation: "Finished goods", toLocation: "Customer", reference: sale.invoiceNumber } });
      }
      return (await this.listSales()).find((item) => item.id === sale.id)!;
    });
  }

  async markSalePaid(saleId: string, amountPaid?: number, paymentMethod?: Sale["paymentMethod"]) {
    const existing = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!existing) return null;
    const nextAmountPaid = amountPaid ?? Number(existing.total);
    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        amountPaid: nextAmountPaid,
        paymentMethod: paymentMethod ? methodToDb[paymentMethod] as any : undefined,
        paymentStatus: paymentToDb[nextAmountPaid >= Number(existing.total) ? "Paid" : nextAmountPaid > 0 ? "Partial" : "Pending"] as any
      }
    });
    return (await this.listSales()).find((item) => item.id === saleId) ?? null;
  }

  async reports() {
    const [employees, attendance, products, sales] = await Promise.all([this.prisma.employee.findMany(), this.listAttendance(), this.prisma.product.findMany(), this.listSales()]);
    const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    const cogs = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return itemSum + Number(product?.costPrice ?? 0) * item.quantity;
    }, 0), 0);
    return {
      employeeReport: { total: employees.length, active: employees.filter((employee) => employee.status === "ACTIVE").length },
      attendanceReport: { today: attendance.length, records: attendance },
      inventoryReport: { totalUnits: products.reduce((sum, product) => sum + product.quantity, 0), inventoryValue: products.reduce((sum, product) => sum + product.quantity * Number(product.costPrice), 0) },
      salesReport: { invoices: sales.length, revenue },
      profitReport: { revenue, cogs, grossProfit: revenue - cogs }
    };
  }

  async settings() {
    return { name: "Light Garment Manufacturing PLC", currency: "ETB", address: "Addis Ababa, Ethiopia", theme: "Light enterprise", backupSchedule: "Daily at 02:00" };
  }
}
