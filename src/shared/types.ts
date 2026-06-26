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

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  profileImageUrl?: string;
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
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  checkInAt?: string;
  checkOutAt?: string;
  status: "Present" | "Partial" | "Absent";
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
