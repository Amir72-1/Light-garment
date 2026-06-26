import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import type {
  AttendanceRecord,
  AttendanceStats,
  DashboardMetrics,
  Employee,
  EmployeeAttendanceProfile,
  InventoryMovement,
  Paginated,
  Product,
  ProductionStage,
  RawMaterial,
  RoleName,
  Sale,
  SaleItem
} from "../shared/types.js";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: RoleName;
};

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

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const todayKey = () => new Date().toISOString().slice(0, 10);
const startTime = process.env.ATTENDANCE_START_TIME || "09:00";

function paginate<T>(items: T[], page = 1, pageSize = 10): Paginated<T> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));
  const start = (safePage - 1) * safePageSize;
  return { data: items.slice(start, start + safePageSize), page: safePage, pageSize: safePageSize, total: items.length };
}

function isLate(checkInTime: string) {
  const time = new Date(checkInTime).toTimeString().slice(0, 5);
  return time > startTime;
}

function totalHours(checkInTime?: string, checkOutTime?: string) {
  if (!checkInTime || !checkOutTime) return undefined;
  const hours = (new Date(checkOutTime).getTime() - new Date(checkInTime).getTime()) / 3_600_000;
  return Math.max(0, Math.round(hours * 100) / 100);
}

function workingDaysInMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const days = new Date(year, monthIndex, 0).getDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

export class DemoRepository {
  private users: UserRecord[] = [];
  private employees: Employee[] = [];
  private attendance: AttendanceRecord[] = [];
  private products: Product[] = [];
  private inventory: InventoryMovement[] = [];
  private rawMaterials: RawMaterial[] = [];
  private sales: Sale[] = [];
  private production: ProductionStage[] = [];
  private activities: DashboardMetrics["recentActivity"] = [];
  private company = {
    name: "Light Garment Manufacturing PLC",
    currency: "ETB",
    address: "Addis Ababa, Ethiopia",
    theme: "Light enterprise",
    backupSchedule: "Daily at 02:00"
  };

  static async create() {
    const repo = new DemoRepository();
    await repo.seed();
    return repo;
  }

  private async seed() {
    const passwordHash = await bcrypt.hash("Password123!", 12);
    this.users = [
      { id: "usr_owner", name: "Light Garment Owner", email: "owner@lightgarment.example", passwordHash, role: "Owner" },
      { id: "usr_manager", name: "Production Manager", email: "manager@lightgarment.example", passwordHash, role: "Manager" },
      { id: "usr_store", name: "Store Keeper", email: "store@lightgarment.example", passwordHash, role: "Storekeeper" },
      { id: "usr_sales", name: "Sales Cashier", email: "sales@lightgarment.example", passwordHash, role: "Salesperson" },
      { id: "usr_hr", name: "HR Administrator", email: "hr@lightgarment.example", passwordHash, role: "HR/Admin" }
    ];

    this.employees = [
      {
        id: "emp_1",
        employeeCode: "LGM-EMP-0001",
        fullName: "Miriam Bekele",
        phoneNumber: "+251911000101",
        email: "miriam@lightgarment.example",
        address: "Bole, Addis Ababa",
        gender: "Female",
        dateOfBirth: "1990-03-11",
        position: "Operations Manager",
        department: "Admin",
        salary: 35000,
        employmentType: "Full-time",
        hireDate: "2021-04-01",
        status: "Active",
        profileImageUrl: ""
      },
      {
        id: "emp_2",
        employeeCode: "LGM-EMP-0002",
        fullName: "Yonas Alemu",
        phoneNumber: "+251911000303",
        address: "Akaki Kality, Addis Ababa",
        gender: "Male",
        dateOfBirth: "1994-06-24",
        position: "Senior Tailor",
        department: "Production",
        salary: 18000,
        employmentType: "Full-time",
        hireDate: "2022-01-15",
        status: "Active",
        profileImageUrl: ""
      },
      {
        id: "emp_3",
        employeeCode: "LGM-EMP-0003",
        fullName: "Sara Hailu",
        phoneNumber: "+251911000404",
        email: "sara@lightgarment.example",
        address: "CMC, Addis Ababa",
        gender: "Female",
        dateOfBirth: "1997-09-08",
        position: "Sales Associate",
        department: "Sales",
        salary: 14000,
        employmentType: "Full-time",
        hireDate: "2023-05-20",
        status: "Active",
        profileImageUrl: ""
      }
    ];

    const qr = await QRCode.toDataURL("LGM-SH-0001");
    this.products = [
      {
        id: "prd_1",
        sku: "LGM-SH-0001",
        productName: "Classic Oxford Shirt",
        model: "Oxford 2026",
        color: "White",
        size: "M",
        quantity: 120,
        costPrice: 420,
        sellingPrice: 850,
        images: [],
        barcode: "890100000001",
        qrCode: qr
      },
      {
        id: "prd_2",
        sku: "LGM-SH-0002",
        productName: "Premium Cotton Shirt",
        model: "Cotton Executive",
        color: "Sky Blue",
        size: "L",
        quantity: 16,
        costPrice: 510,
        sellingPrice: 980,
        images: [],
        barcode: "890100000002",
        qrCode: await QRCode.toDataURL("LGM-SH-0002")
      }
    ];

    this.rawMaterials = [
      { id: "raw_1", name: "Cotton Fabric Roll", category: "Fabric", unit: "meter", quantity: 520, reorderLevel: 120, unitCost: 95 },
      { id: "raw_2", name: "White Thread", category: "Thread", unit: "spool", quantity: 240, reorderLevel: 60, unitCost: 18 },
      { id: "raw_3", name: "Pearl Buttons", category: "Buttons", unit: "piece", quantity: 3000, reorderLevel: 800, unitCost: 1.5 },
      { id: "raw_4", name: "Poly Mailer", category: "Packaging", unit: "piece", quantity: 450, reorderLevel: 500, unitCost: 2.2 }
    ];

    this.production = ["Fabric", "Cutting", "Sewing", "Printing", "Ironing", "Packaging", "Finished goods"].map((stage, index) => ({
      id: `stage_${index + 1}`,
      productId: "prd_1",
      productName: "Classic Oxford Shirt",
      stage: stage as ProductionStage["stage"],
      status: index < 3 ? "Completed" : index === 3 ? "In progress" : "Pending"
    }));

    this.inventory = [
      { id: "inv_1", productId: "prd_1", productName: "Classic Oxford Shirt", type: "Stock in", quantity: 120, toLocation: "Finished goods", reference: "Opening stock", createdAt: nowIso() },
      { id: "inv_2", productId: "prd_2", productName: "Premium Cotton Shirt", type: "Stock in", quantity: 16, toLocation: "Finished goods", reference: "Opening stock", createdAt: nowIso() }
    ];

    this.activities = [
      { id: "act_1", label: "Opening inventory loaded", at: nowIso() },
      { id: "act_2", label: "Employee seed records imported", at: nowIso() }
    ];
  }

  async authenticate(email: string, password: string) {
    const user = this.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return null;
    }
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async resetPassword(email: string) {
    const user = this.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return null;
    }
    const token = `reset-${Math.random().toString(36).slice(2, 12)}`;
    this.log(`Password reset token generated for ${user.email}`);
    return { token, expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString() };
  }

  async dashboard(): Promise<DashboardMetrics> {
    const totalInventory = this.products.reduce((sum, product) => sum + product.quantity, 0);
    const revenue = this.sales.reduce((sum, sale) => sum + sale.total, 0);
    return {
      totalEmployees: this.employees.length,
      totalInventory,
      totalSales: this.sales.length,
      revenue,
      lowStockAlerts: [
        ...this.products.filter((product) => product.quantity < 20).map((product) => ({ id: product.id, name: product.productName, quantity: product.quantity, threshold: 20 })),
        ...this.rawMaterials.filter((material) => material.quantity < material.reorderLevel).map((material) => ({ id: material.id, name: material.name, quantity: material.quantity, threshold: material.reorderLevel }))
      ],
      recentActivity: this.activities.slice(0, 8)
    };
  }

  async listEmployees(query: ListQuery) {
    let rows = [...this.employees];
    if (query.search) {
      const search = query.search.toLowerCase();
      rows = rows.filter((employee) => [employee.fullName, employee.employeeCode, employee.phoneNumber, employee.email ?? ""].some((value) => value.toLowerCase().includes(search)));
    }
    if (query.department) rows = rows.filter((employee) => employee.department === query.department);
    if (query.position) rows = rows.filter((employee) => employee.position.toLowerCase().includes(query.position!.toLowerCase()));
    const sortBy = query.sortBy ?? "employeeCode";
    rows.sort((left, right) => {
      const leftValue = String(left[sortBy as keyof Employee] ?? "");
      const rightValue = String(right[sortBy as keyof Employee] ?? "");
      return (query.sortOrder === "desc" ? -1 : 1) * leftValue.localeCompare(rightValue);
    });
    return paginate(rows, query.page, query.pageSize);
  }

  async getEmployee(employeeId: string) {
    return this.employees.find((employee) => employee.id === employeeId) ?? null;
  }

  async createEmployee(input: EmployeeInput) {
    const nextNumber = this.employees.length + 1;
    const employee: Employee = { ...input, id: id("emp"), employeeCode: input.employeeCode || `LGM-EMP-${String(nextNumber).padStart(4, "0")}` };
    this.employees.unshift(employee);
    this.log(`Employee ${employee.employeeCode} registered`);
    return employee;
  }

  async updateEmployee(employeeId: string, input: Partial<EmployeeInput>) {
    const index = this.employees.findIndex((employee) => employee.id === employeeId);
    if (index === -1) return null;
    this.employees[index] = { ...this.employees[index], ...input };
    this.log(`Employee ${this.employees[index].employeeCode} updated`);
    return this.employees[index];
  }

  async deleteEmployee(employeeId: string) {
    const employee = await this.getEmployee(employeeId);
    if (!employee) return false;
    this.employees = this.employees.filter((item) => item.id !== employeeId);
    this.attendance = this.attendance.filter((item) => item.employeeId !== employeeId);
    this.log(`Employee ${employee.employeeCode} deleted`);
    return true;
  }

  async listAttendance(date = todayKey()) {
    return this.attendanceForDate(date);
  }

  async attendanceToday(date = todayKey()) {
    return this.attendanceForDate(date);
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

  async employeeAttendanceMonth(employeeId: string, month = todayKey().slice(0, 7)): Promise<EmployeeAttendanceProfile | null> {
    const employee = await this.getEmployee(employeeId);
    if (!employee) return null;
    const records = this.attendance
      .filter((item) => item.employeeId === employeeId && item.date.startsWith(month))
      .sort((left, right) => left.date.localeCompare(right.date));
    const totalWorkingDays = workingDaysInMonth(month).length;
    const attendedDays = records.filter((item) => item.status === "Present" || item.status === "Late").length;
    return { employee, month, records, totalWorkingDays, attendancePercentage: Math.round((attendedDays / totalWorkingDays) * 100) };
  }

  async checkIn(employeeId: string, date = todayKey(), checkInTime = nowIso()) {
    const employee = await this.getEmployee(employeeId);
    if (!employee) return null;
    let record = this.attendance.find((item) => item.employeeId === employeeId && item.date === date);
    if (record?.checkInTime) {
      throw new Error("Employee already checked in today");
    }
    const status = isLate(checkInTime) ? "Late" : "Present";
    if (!record) {
      record = this.recordForEmployee(employee, date, { checkInTime, status });
      this.attendance.unshift(record);
    } else {
      record.checkInTime = checkInTime;
      record.status = status;
    }
    this.log(`${employee.fullName} checked in`);
    return record;
  }

  async checkOut(employeeId: string, date = todayKey(), checkOutTime = nowIso()) {
    const record = this.attendance.find((item) => item.employeeId === employeeId && item.date === date);
    if (!record) return null;
    record.checkOutTime = checkOutTime;
    record.totalHours = totalHours(record.checkInTime, record.checkOutTime);
    this.log(`${record.employeeName} checked out`);
    return record;
  }

  async manualAttendance(input: { employeeId: string; date?: string; status: AttendanceRecord["status"]; checkInTime?: string; checkOutTime?: string }) {
    const employee = await this.getEmployee(input.employeeId);
    if (!employee) return null;
    const date = input.date || todayKey();
    let record = this.attendance.find((item) => item.employeeId === input.employeeId && item.date === date);
    if (!record) {
      record = this.recordForEmployee(employee, date, input);
      this.attendance.unshift(record);
    } else {
      record.status = input.status;
      record.checkInTime = input.status === "Absent" ? undefined : input.checkInTime || record.checkInTime;
      record.checkOutTime = input.status === "Absent" ? undefined : input.checkOutTime || record.checkOutTime;
      record.totalHours = totalHours(record.checkInTime, record.checkOutTime);
    }
    this.log(`${employee.fullName} attendance marked ${record.status}`);
    return record;
  }

  private attendanceForDate(date: string) {
    return this.employees.map((employee) => {
      const existing = this.attendance.find((item) => item.employeeId === employee.id && item.date === date);
      return existing ?? this.recordForEmployee(employee, date, { status: "Absent" });
    }).sort((left, right) => left.employeeName.localeCompare(right.employeeName));
  }

  private recordForEmployee(employee: Employee, date: string, input: Partial<AttendanceRecord>): AttendanceRecord {
    return {
      id: id("att"),
      employeeId: employee.id,
      employeeName: employee.fullName,
      employeeCode: employee.employeeCode,
      department: employee.department,
      position: employee.position,
      date,
      checkInTime: input.checkInTime,
      checkOutTime: input.checkOutTime,
      status: input.status || "Absent",
      totalHours: totalHours(input.checkInTime, input.checkOutTime)
    };
  }

  async listProducts() {
    return this.products;
  }

  async createProduct(input: Omit<Product, "id" | "sku" | "qrCode"> & { sku?: string }) {
    const sku = input.sku || `LGM-SH-${String(this.products.length + 1).padStart(4, "0")}`;
    const product: Product = { ...input, id: id("prd"), sku, qrCode: await QRCode.toDataURL(sku) };
    this.products.unshift(product);
    this.inventory.unshift({ id: id("inv"), productId: product.id, productName: product.productName, type: "Stock in", quantity: product.quantity, toLocation: "Finished goods", reference: "Product registration", createdAt: nowIso() });
    this.log(`Product ${sku} created`);
    return product;
  }

  async moveStock(productId: string, quantity: number, type: InventoryMovement["type"], fromLocation?: string, toLocation?: string, reference?: string) {
    const product = this.products.find((item) => item.id === productId);
    if (!product) return null;
    const delta = type === "Stock in" ? quantity : type === "Transfer" ? 0 : -quantity;
    if (product.quantity + delta < 0) throw new Error("Insufficient stock");
    product.quantity += delta;
    const movement = { id: id("inv"), productId, productName: product.productName, type, quantity, fromLocation, toLocation, reference, createdAt: nowIso() };
    this.inventory.unshift(movement);
    this.log(`${type} recorded for ${product.productName}`);
    return movement;
  }

  async listInventory() {
    return this.inventory;
  }

  async listRawMaterials() {
    return this.rawMaterials;
  }

  async listProduction() {
    return this.production;
  }

  async updateProduction(stageId: string, input: Partial<ProductionStage>) {
    const stage = this.production.find((item) => item.id === stageId);
    if (!stage) return null;
    Object.assign(stage, input);
    this.log(`${stage.stage} stage updated for ${stage.productName}`);
    return stage;
  }

  async listSales() {
    return this.sales;
  }

  async createSale(input: { customerName?: string; items: Array<{ productId: string; quantity: number }>; amountPaid: number; paymentMethod: Sale["paymentMethod"]; discount?: number; tax?: number }) {
    const items: SaleItem[] = input.items.map((item) => {
      const product = this.products.find((candidate) => candidate.id === item.productId);
      if (!product) throw new Error("Product not found");
      if (product.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.productName}`);
      return { productId: product.id, productName: product.productName, quantity: item.quantity, unitPrice: product.sellingPrice, total: product.sellingPrice * item.quantity };
    });
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = input.tax ?? 0;
    const discount = input.discount ?? 0;
    const total = subtotal + tax - discount;
    for (const item of items) {
      await this.moveStock(item.productId, item.quantity, "Sale", "Finished goods", "Customer", "POS");
    }
    const sale: Sale = {
      id: id("sale"),
      invoiceNumber: `INV-${String(this.sales.length + 1).padStart(5, "0")}`,
      customerName: input.customerName,
      subtotal,
      tax,
      discount,
      total,
      amountPaid: input.amountPaid,
      paymentStatus: input.amountPaid >= total ? "Paid" : input.amountPaid > 0 ? "Partial" : "Pending",
      paymentMethod: input.paymentMethod,
      items,
      createdAt: nowIso()
    };
    this.sales.unshift(sale);
    this.log(`Invoice ${sale.invoiceNumber} created`);
    return sale;
  }

  async reports() {
    const inventoryValue = this.products.reduce((sum, product) => sum + product.quantity * product.costPrice, 0);
    const salesRevenue = this.sales.reduce((sum, sale) => sum + sale.total, 0);
    const cogs = this.sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => {
      const product = this.products.find((candidate) => candidate.id === item.productId);
      return itemSum + (product?.costPrice ?? 0) * item.quantity;
    }, 0), 0);
    return {
      employeeReport: { total: this.employees.length, active: this.employees.filter((employee) => employee.status === "Active").length },
      attendanceReport: { today: this.attendance.filter((item) => item.date === todayKey()).length, records: this.attendance },
      inventoryReport: { totalUnits: this.products.reduce((sum, product) => sum + product.quantity, 0), inventoryValue },
      salesReport: { invoices: this.sales.length, revenue: salesRevenue },
      profitReport: { revenue: salesRevenue, cogs, grossProfit: salesRevenue - cogs }
    };
  }

  async settings() {
    return this.company;
  }

  private log(label: string) {
    this.activities.unshift({ id: id("act"), label, at: nowIso() });
  }
}
