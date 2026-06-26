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
  Sale,
  UserSession
} from "../shared/types";

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
  createEmployee: (token: string, body: FormData) => request<Employee>("/api/employees", { method: "POST", body }, token),
  updateEmployee: (token: string, id: string, body: FormData) => request<Employee>(`/api/employees/${id}`, { method: "PUT", body }, token),
  deleteEmployee: (token: string, id: string) => request<void>(`/api/employees/${id}`, { method: "DELETE" }, token),
  attendance: (token: string, date?: string) => request<AttendanceRecord[]>(`/api/attendance${date ? `?date=${date}` : ""}`, {}, token),
  attendanceToday: (token: string, date?: string) => request<AttendanceRecord[]>(`/api/attendance/today${date ? `?date=${date}` : ""}`, {}, token),
  attendanceStats: (token: string, date?: string) => request<AttendanceStats>(`/api/attendance/stats${date ? `?date=${date}` : ""}`, {}, token),
  attendanceMonth: (token: string, employeeId: string, month?: string) => request<EmployeeAttendanceProfile>(`/api/attendance/month/${employeeId}${month ? `?month=${month}` : ""}`, {}, token),
  checkIn: (token: string, id: string, date?: string) => request<AttendanceRecord>("/api/attendance/check-in", { method: "POST", body: JSON.stringify({ employeeId: id, date }) }, token),
  checkOut: (token: string, id: string, date?: string) => request<AttendanceRecord>("/api/attendance/check-out", { method: "POST", body: JSON.stringify({ employeeId: id, date }) }, token),
  manualAttendance: (token: string, body: Record<string, unknown>) => request<AttendanceRecord>("/api/attendance/manual", { method: "POST", body: JSON.stringify(body) }, token),
  products: (token: string) => request<Product[]>("/api/products", {}, token),
  createProduct: (token: string, body: Partial<Product>) => request<Product>("/api/products", { method: "POST", body: JSON.stringify(body) }, token),
  inventory: (token: string) => request<InventoryMovement[]>("/api/inventory", {}, token),
  moveStock: (token: string, body: Record<string, unknown>) => request<InventoryMovement>("/api/inventory/movements", { method: "POST", body: JSON.stringify(body) }, token),
  rawMaterials: (token: string) => request<RawMaterial[]>("/api/raw-materials", {}, token),
  createRawMaterial: (token: string, body: Omit<RawMaterial, "id">) => request<RawMaterial>("/api/raw-materials", { method: "POST", body: JSON.stringify(body) }, token),
  sales: (token: string) => request<Sale[]>("/api/sales", {}, token),
  createSale: (token: string, body: Record<string, unknown>) => request<Sale>("/api/sales", { method: "POST", body: JSON.stringify(body) }, token),
  production: (token: string) => request<ProductionStage[]>("/api/production", {}, token),
  updateProduction: (token: string, id: string, body: Partial<ProductionStage>) => request<ProductionStage>(`/api/production/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
  reports: (token: string) => request<Record<string, unknown>>("/api/reports", {}, token),
  settings: (token: string) => request<Record<string, string>>("/api/settings", {}, token)
};
