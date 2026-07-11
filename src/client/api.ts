import type {
  AttendanceRecord,
  AttendanceSettings,
  AttendanceStats,
  DashboardMetrics,
  Employee,
  EmployeeAttendanceProfile,
  InventoryMovement,
  ManagedUser,
  Paginated,
  PayrollDashboard,
  PayrollRecord,
  PayrollReports,
  PayrollSettings,
  Product,
  ProductionStage,
  RawMaterial,
  RawMaterialMovement,
  SalaryHistoryEntry,
  Sale,
  UserSession,
  YearlyBreak,
  YearlyBreakEligibility
} from "../shared/types";
import type { UserPreferences } from "../shared/preferences.js";
import type {
  BundleScanResult,
  ColorOption,
  FabricType,
  InventoryBundle,
  MoveBundleInput,
  OfflineSyncOperation,
  OfflineSyncResult,
  ProductCatalog,
  RegisterBundleInput,
  SizeOption,
  SplitBundleInput,
  StockTransaction,
  StorageLocation,
  Warehouse
} from "../shared/bundleInventory.js";

const baseUrl = import.meta.env.VITE_API_URL || "";

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || "Request failed");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) => request<UserSession>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  passwordReset: (email: string) => request<{ message: string }>("/api/auth/password-reset", { method: "POST", body: JSON.stringify({ email }) }),
  dashboard: (token: string) => request<DashboardMetrics>("/api/dashboard", {}, token),
  employees: (token: string, params: URLSearchParams) => request<Paginated<Employee>>(`/api/employees?${params.toString()}`, {}, token),
  archivedEmployees: (token: string) => request<Employee[]>("/api/employees/archived", {}, token),
  createEmployee: (token: string, body: FormData) => request<Employee>("/api/employees", { method: "POST", body }, token),
  checkFaydaNumber: (token: string, faydaNumber: string) => request<{ available: boolean; faydaNumber: string }>(`/api/employees/check-fayda/${encodeURIComponent(faydaNumber)}`, {}, token),
  updateEmployee: (token: string, id: string, body: FormData) => request<Employee>(`/api/employees/${id}`, { method: "PUT", body }, token),
  employeeSalaryHistory: (token: string, id: string) => request<SalaryHistoryEntry[]>(`/api/employees/${id}/salary-history`, {}, token),
  increaseEmployeeSalary: (token: string, id: string, body: { newSalary: number; effectiveDate?: string; reason?: string }) => request<{ employee: Employee; history: SalaryHistoryEntry }>(`/api/employees/${id}/salary-increase`, { method: "POST", body: JSON.stringify(body) }, token),
  employeeYearlyBreaks: (token: string, id: string) => request<YearlyBreak[]>(`/api/employees/${id}/yearly-breaks`, {}, token),
  registerYearlyBreak: (token: string, id: string, body: { year: number; startDate: string; endDate: string; notes?: string }) => request<YearlyBreak>(`/api/employees/${id}/yearly-break`, { method: "POST", body: JSON.stringify(body) }, token),
  yearlyBreakEligibility: (token: string, year: number) => request<YearlyBreakEligibility[]>(`/api/yearly-breaks/eligibility?year=${year}`, {}, token),
  deleteEmployee: (token: string, id: string) => request<void>(`/api/employees/${id}`, { method: "DELETE" }, token),
  permanentlyDeleteEmployee: (token: string, id: string) => request<void>(`/api/employees/${id}/permanent`, { method: "DELETE" }, token),
  resetEmployeeCodes: (token: string) => request<Employee[]>("/api/employees/reset-codes", { method: "POST" }, token),
  attendance: (token: string, date?: string) => request<AttendanceRecord[]>(`/api/attendance${date ? `?date=${date}` : ""}`, {}, token),
  attendanceToday: (token: string, date?: string) => request<AttendanceRecord[]>(`/api/attendance/today${date ? `?date=${date}` : ""}`, {}, token),
  attendanceStats: (token: string, date?: string) => request<AttendanceStats>(`/api/attendance/stats${date ? `?date=${date}` : ""}`, {}, token),
  attendanceMonth: (token: string, employeeId: string, month?: string) => request<EmployeeAttendanceProfile>(`/api/attendance/month/${employeeId}${month ? `?month=${month}` : ""}`, {}, token),
  checkIn: (token: string, id: string, date?: string) => request<AttendanceRecord>("/api/attendance/check-in", { method: "POST", body: JSON.stringify({ employeeId: id, date }) }, token),
  checkOut: (token: string, id: string, date?: string) => request<AttendanceRecord>("/api/attendance/check-out", { method: "POST", body: JSON.stringify({ employeeId: id, date }) }, token),
  manualAttendance: (token: string, body: Record<string, unknown>) => request<AttendanceRecord>("/api/attendance/manual", { method: "POST", body: JSON.stringify(body) }, token),
  updateAttendanceTimes: (token: string, body: Record<string, unknown>) => request<AttendanceRecord>("/api/attendance/times", { method: "PATCH", body: JSON.stringify(body) }, token),
  attendanceSettings: (token: string) => request<AttendanceSettings>("/api/attendance/settings", {}, token),
  updateAttendanceSettings: (token: string, body: AttendanceSettings) => request<AttendanceSettings>("/api/attendance/settings", { method: "PATCH", body: JSON.stringify(body) }, token),
  products: (token: string) => request<Product[]>("/api/products", {}, token),
  createProduct: (token: string, body: Partial<Product>) => request<Product>("/api/products", { method: "POST", body: JSON.stringify(body) }, token),
  inventory: (token: string) => request<InventoryMovement[]>("/api/inventory", {}, token),
  moveStock: (token: string, body: Record<string, unknown>) => request<InventoryMovement>("/api/inventory/movements", { method: "POST", body: JSON.stringify(body) }, token),
  bundleMetadata: (token: string) =>
    request<{ fabrics: FabricType[]; colors: ColorOption[]; sizes: SizeOption[]; warehouses: Warehouse[]; catalog: ProductCatalog[] }>("/api/bundles/metadata", {}, token),
  bundleLocations: (token: string, warehouseId: string) =>
    request<StorageLocation[]>(`/api/bundles/locations?warehouseId=${encodeURIComponent(warehouseId)}`, {}, token),
  bundles: (token: string) => request<InventoryBundle[]>("/api/bundles", {}, token),
  searchBundles: (token: string, query: string) =>
    request<InventoryBundle[]>(`/api/bundles/search?q=${encodeURIComponent(query)}`, {}, token),
  registerBundles: (token: string, body: RegisterBundleInput) =>
    request<InventoryBundle[]>("/api/bundles/register", { method: "POST", body: JSON.stringify(body) }, token),
  scanBundle: (token: string, code: string) =>
    request<BundleScanResult>("/api/bundles/scan", { method: "POST", body: JSON.stringify({ code }) }, token),
  moveBundle: (token: string, body: MoveBundleInput) =>
    request<{ source: InventoryBundle; destination?: InventoryBundle; transaction: StockTransaction }>("/api/bundles/move", { method: "POST", body: JSON.stringify(body) }, token),
  splitBundle: (token: string, body: SplitBundleInput) =>
    request<{ source: InventoryBundle; destination?: InventoryBundle; transaction: StockTransaction }>("/api/bundles/split", { method: "POST", body: JSON.stringify(body) }, token),
  bundleTransactions: (token: string, bundleId?: string) =>
    request<StockTransaction[]>(`/api/bundles/transactions${bundleId ? `?bundleId=${encodeURIComponent(bundleId)}` : ""}`, {}, token),
  reprintBundleQr: (token: string, bundleId: string) =>
    request<InventoryBundle>(`/api/bundles/${encodeURIComponent(bundleId)}/reprint`, { method: "POST" }, token),
  syncBundles: (token: string, operations: OfflineSyncOperation[]) =>
    request<OfflineSyncResult[]>("/api/bundles/sync", { method: "POST", body: JSON.stringify({ operations }) }, token),
  rawMaterials: (token: string) => request<RawMaterial[]>("/api/raw-materials", {}, token),
  createRawMaterial: (token: string, body: Omit<RawMaterial, "id">) => request<RawMaterial>("/api/raw-materials", { method: "POST", body: JSON.stringify(body) }, token),
  useRawMaterial: (token: string, id: string, body: Record<string, unknown>) => request<RawMaterialMovement>(`/api/raw-materials/${id}/use`, { method: "POST", body: JSON.stringify(body) }, token),
  rawMaterialHistory: (token: string) => request<RawMaterialMovement[]>("/api/raw-materials/history", {}, token),
  sales: (token: string) => request<Sale[]>("/api/sales", {}, token),
  createSale: (token: string, body: Record<string, unknown>) => request<Sale>("/api/sales", { method: "POST", body: JSON.stringify(body) }, token),
  markSalePaid: (token: string, id: string, body: Record<string, unknown>) => request<Sale>(`/api/sales/${id}/pay`, { method: "PATCH", body: JSON.stringify(body) }, token),
  payrollSettings: (token: string) => request<PayrollSettings>("/api/payroll/settings", {}, token),
  updatePayrollSettings: (token: string, body: PayrollSettings) => request<PayrollSettings>("/api/payroll/settings", { method: "PATCH", body: JSON.stringify(body) }, token),
  generatePayroll: (token: string, body: { month: number; year: number }) => request<PayrollRecord[]>("/api/payroll/generate", { method: "POST", body: JSON.stringify(body) }, token),
  payrollDashboard: (token: string, month: number, year: number) => request<PayrollDashboard>(`/api/payroll/dashboard?month=${month}&year=${year}`, {}, token),
  payrolls: (token: string, month: number, year: number) => request<PayrollRecord[]>(`/api/payroll?month=${month}&year=${year}`, {}, token),
  payrollReports: (token: string, month: number, year: number) => request<PayrollReports>(`/api/payroll/reports?month=${month}&year=${year}`, {}, token),
  payrollPayslip: (token: string, id: string) => request<PayrollRecord>(`/api/payroll/${id}/payslip`, {}, token),
  updatePayroll: (token: string, id: string, body: Record<string, unknown>) => request<PayrollRecord>(`/api/payroll/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
  markPayrollPaid: (token: string, id: string, body: Record<string, unknown>) => request<PayrollRecord>(`/api/payroll/${id}/pay`, { method: "PATCH", body: JSON.stringify(body) }, token),
  production: (token: string) => request<ProductionStage[]>("/api/production", {}, token),
  updateProduction: (token: string, id: string, body: Partial<ProductionStage>) => request<ProductionStage>(`/api/production/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
  reports: (token: string) => request<Record<string, unknown>>("/api/reports", {}, token),
  settings: (token: string) => request<Record<string, string>>("/api/settings", {}, token),
  userPreferences: (token: string) => request<UserPreferences>("/api/users/me/preferences", {}, token),
  updateUserPreferences: (token: string, body: Partial<UserPreferences>) => request<UserPreferences>("/api/users/me/preferences", { method: "PATCH", body: JSON.stringify(body) }, token),
  users: (token: string) => request<ManagedUser[]>("/api/users", {}, token),
  createUser: (token: string, body: Record<string, unknown>) => request<ManagedUser>("/api/users", { method: "POST", body: JSON.stringify(body) }, token),
  updateUser: (token: string, id: string, body: Record<string, unknown>) => request<ManagedUser>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
  deleteUser: (token: string, id: string) => request<void>(`/api/users/${id}`, { method: "DELETE" }, token)
};
