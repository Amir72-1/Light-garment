export type RoleName = "Owner" | "Manager" | "Storekeeper" | "Salesperson" | "HR/Admin";

export type Department = "Production" | "Sales" | "Admin" | "Store";
export type Gender = "Male" | "Female" | "Other";
export type EmploymentType = "Full-time" | "Part-time" | "Contract";
export type EmployeeStatus = "Active" | "Inactive";

export interface UserSession {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: RoleName;
  };
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  isActive: boolean;
  lastSeenAt?: string;
  isOnline: boolean;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  profileImageUrl?: string;
  idImageUrl?: string;
  idImageBackUrl?: string;
  faydaNumber?: string;
  phoneNumber: string;
  email?: string;
  address: string;
  gender: Gender;
  dateOfBirth: string;
  position: string;
  department: Department;
  salary: number;
  employmentType: EmploymentType;
  hireDate: string;
  status: EmployeeStatus;
  archivedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: Department;
  position?: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: "Present" | "Absent" | "Late";
  totalHours?: number;
  overtimeHours?: number;
}

export interface AttendanceStats {
  present: number;
  absent: number;
  late: number;
  date: string;
}

export interface AttendanceSettings {
  startTime: string;
  endTime: string;
}

export interface EmployeeAttendanceProfile {
  employee: Employee;
  month: string;
  records: AttendanceRecord[];
  attendancePercentage: number;
  totalWorkingDays: number;
}

export interface Product {
  id: string;
  sku: string;
  productName: string;
  model: string;
  color: string;
  size: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  images: string[];
  barcode?: string;
  qrCode?: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: "Stock in" | "Stock out" | "Transfer" | "Sale" | "Adjustment";
  quantity: number;
  fromLocation?: string;
  toLocation?: string;
  reference?: string;
  createdAt: string;
}

export interface RawMaterialMovement {
  id: string;
  rawMaterialId: string;
  rawMaterialName: string;
  type: "Stock in" | "Used" | "Adjustment";
  quantity: number;
  unit: string;
  reference?: string;
  note?: string;
  createdAt: string;
}

export interface RawMaterial {
  id: string;
  name: string;
  category: "Fabric" | "Thread" | "Buttons" | "Labels" | "Packaging";
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerName?: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountPaid: number;
  paymentStatus: "Pending" | "Partial" | "Paid";
  paymentMethod: "Cash" | "Card" | "Bank transfer" | "Mobile money";
  items: SaleItem[];
  createdAt: string;
}

export type PayrollPaymentStatus = "Pending" | "Paid";
export type PayrollPaymentMethod = "Cash" | "Bank transfer" | "Mobile money";

export interface PayrollSettings {
  standardHoursPerDay: number;
  workingDaysPerMonth: number;
  gracePeriodMinutes: number;
  overtimeRatePerHour: number;
  latePenaltyEnabled: boolean;
  latePenaltyAmount: number;
  absenceDeductionEnabled: boolean;
  taxPercentage?: number;
  defaultAllowance: number;
  defaultBonus: number;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employee: Employee;
  payrollMonth: number;
  payrollYear: number;
  basicSalary: number;
  overtimeHours: number;
  overtimePay: number;
  bonus: number;
  allowance: number;
  deductions: number;
  tax: number;
  absentDays: number;
  lateDays: number;
  presentDays: number;
  workingDays: number;
  payableSalary: number;
  paymentStatus: PayrollPaymentStatus;
  paymentDate?: string;
  paymentMethod?: PayrollPaymentMethod;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollDashboard {
  awaitingPayment: number;
  totalPayroll: number;
  totalPaid: number;
  totalUnpaid: number;
  history: PayrollRecord[];
}

export interface PayrollReports {
  monthlyPayroll: PayrollRecord[];
  payrollByDepartment: Array<{ department: Department; total: number; employees: number }>;
  attendanceSummary: Array<{ employeeName: string; presentDays: number; absentDays: number; lateDays: number }>;
  overtimeReport: Array<{ employeeName: string; overtimeHours: number; overtimePay: number }>;
  salaryDeductions: Array<{ employeeName: string; deductions: number; tax: number }>;
  paymentHistory: PayrollRecord[];
}

export interface ProductionStage {
  id: string;
  productId: string;
  productName: string;
  stage: "Fabric" | "Cutting" | "Sewing" | "Printing" | "Ironing" | "Packaging" | "Finished goods";
  status: "Pending" | "In progress" | "Completed" | "Blocked";
  assignedTo?: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}

export interface DashboardMetrics {
  totalEmployees: number;
  totalInventory: number;
  totalSales: number;
  revenue: number;
  lowStockAlerts: Array<{ id: string; name: string; quantity: number; threshold: number }>;
  recentActivity: Array<{ id: string; label: string; at: string }>;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
