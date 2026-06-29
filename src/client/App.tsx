import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  Boxes,
  CalendarCheck,
  Factory,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PackagePlus,
  Settings,
  Shirt,
  Sun,
  Users,
  X
} from "lucide-react";
import { api } from "./api";
import { Badge, Button, Card, Field, Input, Select, Textarea, cn } from "./components/ui";
import type { AttendanceRecord, AttendanceSettings, Employee, ManagedUser, Paginated, PayrollRecord, PayrollSettings, Product, RawMaterial, RawMaterialMovement, RoleName, Sale, UserSession } from "../shared/types";

type ModuleKey = "dashboard" | "employees" | "attendance" | "payroll" | "inventory" | "sales" | "production" | "reports" | "settings";
type ThemeMode = "light" | "dark" | "system";

const navItems: Array<{ key: ModuleKey; label: string; icon: typeof LayoutDashboard; roles: RoleName[] }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["Owner", "Manager", "Storekeeper", "Salesperson", "HR/Admin"] },
  { key: "employees", label: "Employees", icon: Users, roles: ["Owner", "Manager", "HR/Admin"] },
  { key: "attendance", label: "Attendance", icon: CalendarCheck, roles: ["Owner", "Manager", "HR/Admin"] },
  { key: "payroll", label: "Payroll", icon: BadgeDollarSign, roles: ["Owner", "Manager", "HR/Admin"] },
  { key: "inventory", label: "Shirts & Inventory", icon: Shirt, roles: ["Owner", "Manager", "Storekeeper", "Salesperson"] },
  { key: "sales", label: "POS Sales", icon: BadgeDollarSign, roles: ["Owner", "Manager", "Salesperson"] },
  { key: "production", label: "Production", icon: Factory, roles: ["Owner", "Manager"] },
  { key: "reports", label: "Reports", icon: FileBarChart, roles: ["Owner", "Manager", "HR/Admin"] },
  { key: "settings", label: "Settings", icon: Settings, roles: ["Owner", "Manager", "Storekeeper", "Salesperson", "HR/Admin"] }
];

function currency(value: number) {
  return new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", maximumFractionDigits: 0 }).format(value);
}

function exportCsv(filename: string, rows: Array<Array<string | number | undefined>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function applyTheme(theme: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && prefersDark));
  document.documentElement.style.colorScheme = theme === "dark" || (theme === "system" && prefersDark) ? "dark" : "light";
}

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem("lgm-session");
    return saved ? JSON.parse(saved) as UserSession : null;
  });
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("lgm-theme") as ThemeMode | null) || "system");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("lgm-theme", theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => theme === "system" && applyTheme(theme);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  if (!session) {
    return <Login onLogin={(next) => { localStorage.setItem("lgm-session", JSON.stringify(next)); setSession(next); }} />;
  }

  const visibleNav = navItems.filter((item) => item.roles.includes(session.user.role));

  return (
    <div className="min-h-screen min-w-[360px] bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      {menuOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-20 bg-slate-950/50 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-30 flex max-h-dvh w-[min(18rem,calc(100vw-2rem))] flex-col overflow-y-auto overscroll-contain border-r border-slate-200 bg-white p-4 transition lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900", menuOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-8 rounded-2xl bg-emerald-950 p-4 text-white">
          <div className="flex items-center gap-3">
            <LightGarmentLogo />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Light Garment</p>
              <h1 className="text-xl font-black leading-tight">ERP Center</h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-emerald-100">Signed in as {session.user.role}</p>
        </div>
        <nav className="grid min-h-0 gap-2 pb-6">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold", active === item.key ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")} onClick={() => { setActive(item.key); setMenuOpen(false); }}>
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-[360px] lg:pl-72">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur sm:px-4 lg:px-8 dark:border-slate-800 dark:bg-slate-950/90">
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="lg:hidden" onClick={() => setMenuOpen((value) => !value)}><Menu className="h-4 w-4" /></Button>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Production-ready garment ERP</p>
              <h2 className="truncate font-bold">Light Garment Manufacturing PLC</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle theme={theme} onThemeChange={setTheme} />
            <Button variant="ghost" className="h-9 w-9 px-0 sm:w-auto sm:px-4" aria-label="Logout" onClick={() => { localStorage.removeItem("lgm-session"); setSession(null); }}>
              <LogOut className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>
        <section className="min-w-[360px] overflow-x-auto p-3 sm:p-4 lg:p-8">
          {active === "dashboard" && <Dashboard token={session.token} role={session.user.role} />}
          {active === "employees" && <Employees token={session.token} />}
          {active === "attendance" && <Attendance token={session.token} role={session.user.role} />}
          {active === "payroll" && <Payroll token={session.token} role={session.user.role} />}
          {active === "inventory" && <Inventory token={session.token} />}
          {active === "sales" && <Sales token={session.token} />}
          {active === "production" && <Production token={session.token} />}
          {active === "reports" && <Reports token={session.token} />}
          {active === "settings" && <SettingsPage token={session.token} role={session.user.role} theme={theme} onThemeChange={setTheme} />}
        </section>
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (session: UserSession) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const login = useMutation({ mutationFn: () => api.login(email, password), onSuccess: onLogin });
  const reset = useMutation({ mutationFn: () => api.passwordReset(resetEmail || email) });

  return (
    <main className="grid min-h-screen bg-[radial-gradient(circle_at_top_left,_#bbf7d0,_transparent_32rem),linear-gradient(135deg,_#052e16,_#0f172a)] p-4 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
      <section className="flex items-center">
        <div className="max-w-3xl text-white">
          <Badge className="bg-white/10 text-emerald-100">Garment manufacturing ERP</Badge>
          <h1 className="mt-6 text-4xl font-black tracking-tight md:text-6xl">Run HR, inventory, production, and POS from one secure workspace.</h1>
          <p className="mt-6 max-w-2xl text-lg text-emerald-50">Role-based dashboards, employee registration with photos, attendance logs, stock control, invoices, reports, and Docker-ready deployment.</p>
        </div>
      </section>
      <Card className="m-auto w-full max-w-md">
        <h2 className="text-2xl font-black">Login</h2>
        <p className="mt-1 text-sm text-slate-500">Use the owner account configured for your deployment.</p>
        <form className="mt-6 grid gap-4" onSubmit={(event) => { event.preventDefault(); login.mutate(); }}>
          <Field label="Email"><Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></Field>
          <Field label="Password"><Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></Field>
          {login.error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{login.error.message}</p>}
          <Button disabled={login.isPending}>{login.isPending ? "Signing in..." : "Login"}</Button>
        </form>
        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold">Password reset</p>
          <div className="mt-2 flex gap-2">
            <Input placeholder="email@example.com" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} />
            <Button variant="secondary" onClick={() => reset.mutate()} disabled={reset.isPending}>Reset</Button>
          </div>
          {reset.isSuccess && <p className="mt-2 text-sm text-emerald-700">Reset instructions prepared.</p>}
        </div>
      </Card>
    </main>
  );
}

function ThemeToggle({ theme, onThemeChange }: { theme: ThemeMode; onThemeChange: (theme: ThemeMode) => void }) {
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const nextTheme: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" className="h-9 w-9 px-0 sm:hidden" aria-label={`Theme: ${theme}`} onClick={() => onThemeChange(nextTheme[theme])}>
        <Icon className="h-4 w-4" />
      </Button>
      <Icon className="hidden h-4 w-4 text-slate-500 sm:block" />
      <Select aria-label="Theme mode" className="hidden h-9 w-[136px] sm:block" value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeMode)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </div>
  );
}

function LightGarmentLogo() {
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-300 shadow-lg shadow-amber-500/20" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="h-11 w-11">
        <path d="M32 5c-11 0-20 8.9-20 19.8 0 6.8 3.4 12.3 8.5 16.1 2.5 1.9 3.7 4 3.7 6.6h15.6c0-2.7 1.2-4.8 3.7-6.6C48.6 37 52 31.5 52 24.8 52 13.9 43 5 32 5Z" fill="#fef3c7" stroke="#064e3b" strokeWidth="3" />
        <path d="M24.5 49.5h15M26.5 55h11" stroke="#064e3b" strokeWidth="3" strokeLinecap="round" />
        <path d="M23 22.5 29 18l3 3 3-3 6 4.5-3.2 5.1-2.8-1.7V38h-6V25.9l-2.8 1.7L23 22.5Z" fill="#10b981" stroke="#064e3b" strokeWidth="2" strokeLinejoin="round" />
        <path d="M28.7 18.2c1.9 1.5 4.7 1.5 6.6 0" stroke="#ecfdf5" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Dashboard({ token, role }: { token: string; role: RoleName }) {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.dashboard(token) });
  const canViewAttendance = ["Owner", "Manager", "HR/Admin"].includes(role);
  const attendanceStats = useQuery({ queryKey: ["attendance-stats-dashboard"], queryFn: () => api.attendanceStats(token), enabled: canViewAttendance });
  if (isLoading || !data) return <Loading />;
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Employees" value={data.totalEmployees} icon={<Users />} />
        <Metric title="Inventory units" value={data.totalInventory} icon={<Boxes />} />
        <Metric title="Sales invoices" value={data.totalSales} icon={<BadgeDollarSign />} />
        <Metric title="Revenue" value={currency(data.revenue)} icon={<FileBarChart />} />
      </div>
      {attendanceStats.data && (
        <div className="grid gap-4 md:grid-cols-3">
          <Metric title="Present today" value={attendanceStats.data.present} icon={<CalendarCheck />} />
          <Metric title="Absent today" value={attendanceStats.data.absent} icon={<Users />} />
          <Metric title="Late today" value={attendanceStats.data.late} icon={<FileBarChart />} />
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="text-lg font-bold">Low stock alerts</h3>
          <div className="mt-4 grid gap-3">
            {data.lowStockAlerts.length ? data.lowStockAlerts.map((alert) => <div key={alert.id} className="flex items-center justify-between rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:border dark:border-amber-500/30 dark:bg-black dark:text-amber-100"><span>{alert.name}</span><Badge className="bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100">{alert.quantity} / {alert.threshold}</Badge></div>) : <p className="text-sm text-slate-500">No low stock alerts.</p>}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-bold">Recent activity</h3>
          <div className="mt-4 grid gap-3">
            {data.recentActivity.map((activity) => <div key={activity.id} className="rounded-xl border border-slate-100 p-3 text-sm"><p className="font-semibold">{activity.label}</p><p className="text-slate-500">{new Date(activity.at).toLocaleString()}</p></div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return <Card><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-3xl font-black">{value}</p></div><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">{icon}</div></div></Card>;
}

function Employees({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const params = new URLSearchParams({ search, pageSize: "50" });
  if (department) params.set("department", department);
  const employees = useQuery({ queryKey: ["employees", search, department], queryFn: () => api.employees(token, params) });
  const archivedEmployees = useQuery({ queryKey: ["archived-employees"], queryFn: () => api.archivedEmployees(token) });
  const attendance = useQuery({ queryKey: ["attendance"], queryFn: () => api.attendance(token) });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); queryClient.invalidateQueries({ queryKey: ["archived-employees"] }); queryClient.invalidateQueries({ queryKey: ["attendance"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); };
  const createEmployee = useMutation({
    mutationFn: (form: FormData) => api.createEmployee(token, form),
    onSuccess: invalidate
  });
  const deleteEmployee = useMutation({
    mutationFn: async (employee: Employee) => {
      await api.deleteEmployee(token, employee.id);
      return employee;
    },
    onSuccess: (employee) => {
      queryClient.setQueryData<Employee[]>(["archived-employees"], (current = []) => [{ ...employee, status: "Inactive", archivedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== employee.id)]);
      queryClient.setQueryData<Paginated<Employee>>(["employees", search, department], (current) => current ? { ...current, data: current.data.filter((item) => item.id !== employee.id), total: Math.max(0, current.total - 1) } : current);
      invalidate();
    }
  });
  const checkIn = useMutation({ mutationFn: (id: string) => api.checkIn(token, id), onSuccess: invalidate });
  const checkOut = useMutation({ mutationFn: (id: string) => api.checkOut(token, id), onSuccess: invalidate });

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="grid gap-6">
          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div><h2 className="text-2xl font-black">Employee Management</h2><p className="text-sm text-slate-500">Register, search, filter, profile, and attendance.</p></div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input placeholder="Search employees" value={search} onChange={(event) => setSearch(event.target.value)} />
                <Select value={department} onChange={(event) => setDepartment(event.target.value)}>
                  <option value="">All departments</option><option>Production</option><option>Sales</option><option>Admin</option><option>Store</option>
                </Select>
              </div>
            </div>
          </Card>
          <div className="grid gap-4">
            {employees.data?.data.map((employee) => (
              <Card key={employee.id} className="grid gap-4 md:grid-cols-[1fr_auto]">
                <button className="flex items-center gap-4 rounded-2xl text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" onClick={() => setSelected(employee)}>
                  <Avatar employee={employee} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{employee.fullName}</h3><Badge>{employee.employeeCode}</Badge></div>
                    <p className="text-sm text-slate-500">{employee.position} · {employee.department} · {currency(employee.salary)}</p>
                    <p className="text-sm text-slate-500">{employee.phoneNumber}</p>
                  </div>
                </button>
                <div className="action-row md:justify-end">
                  <Button variant="secondary" onClick={() => checkIn.mutate(employee.id)}>Check-in</Button>
                  <Button variant="secondary" onClick={() => checkOut.mutate(employee.id)}>Check-out</Button>
                  <Button variant="danger" onClick={() => deleteEmployee.mutate(employee)}>{deleteEmployee.isPending ? "Archiving..." : "Archive"}</Button>
                </div>
              </Card>
            ))}
          </div>
          <Card>
            <h3 className="text-lg font-bold">Daily attendance log</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[2200px] text-left text-sm">
                <thead className="text-slate-500"><tr><th className="py-2">Employee</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
                <tbody>{attendance.data?.map((record) => <tr key={record.id} className="border-t"><td className="py-3 font-semibold">{record.employeeName}</td><td>{record.date}</td><td>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : "-"}</td><td>{record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "-"}</td><td><Badge>{record.status}</Badge></td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        </div>
        <div className="grid gap-6 self-start">
          <EmployeeForm pending={createEmployee.isPending} error={createEmployee.error?.message} onSubmit={(form, formElement) => createEmployee.mutate(form, { onSuccess: () => formElement.reset() })} />
          <Card>
            <h3 className="text-lg font-bold">Archived employees</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Archived records stay available for HR history.</p>
            <div className="mt-4 grid gap-2">
              {archivedEmployees.data?.length ? archivedEmployees.data.map((employee) => (
                <div key={employee.id} className="rounded-xl border border-slate-100 p-3 text-sm dark:border-slate-800">
                  <p className="font-semibold">{employee.fullName}</p>
                  <p className="text-slate-500 dark:text-slate-400">{employee.employeeCode} · Archived {employee.archivedAt ? new Date(employee.archivedAt).toLocaleString() : ""}</p>
                </div>
              )) : <p className="text-sm text-slate-500 dark:text-slate-400">No archived employees.</p>}
            </div>
          </Card>
        </div>
      </div>
      {selected && (
        <EmployeeProfileDialog employee={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function EmployeeProfileDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="employee-profile-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="employee-profile-title" className="text-xl font-black">Employee profile</h3>
            <p className="text-sm text-slate-500">Full HR record for {employee.fullName}.</p>
          </div>
          <Button variant="ghost" className="h-9 w-9 px-0" aria-label="Close employee profile" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-4"><Avatar employee={employee} large /><div><p className="font-black">{employee.fullName}</p><p className="text-sm text-slate-500">{employee.employeeCode}</p></div></div>
        <dl className="mt-4 grid gap-2 text-sm">
          {Object.entries({ "Fayda number": employee.faydaNumber || "Not provided", Phone: employee.phoneNumber, Email: employee.email || "Not provided", Address: employee.address, Gender: employee.gender, Department: employee.department, Position: employee.position, Salary: currency(employee.salary), "Employment type": employee.employmentType, "Hire date": employee.hireDate, Status: employee.status }).map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-t py-2"><dt className="text-slate-500">{key}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
        </dl>
      </Card>
    </div>
  );
}

function EmployeeForm({ onSubmit, pending, error }: { onSubmit: (form: FormData, formElement: HTMLFormElement) => void; pending: boolean; error?: string }) {
  return (
    <Card>
      <h3 className="text-lg font-bold">Add employee</h3>
      <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget), event.currentTarget); }}>
        <Field label="Full name"><Input name="fullName" required /></Field>
        <Field label="Fayda number"><Input name="faydaNumber" placeholder="FIN / Fayda ID number" /></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Phone"><Input name="phoneNumber" required /></Field>
          <Field label="Email (optional)"><Input name="email" type="email" placeholder="Leave blank if none" /></Field>
        </div>
        <p className="-mt-2 text-xs text-slate-500">Employees can be registered without an email address.</p>
        <Field label="Address"><Textarea name="address" rows={2} required /></Field>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Gender"><Select name="gender" required><option>Female</option><option>Male</option><option>Other</option></Select></Field><Field label="Date of birth"><Input name="dateOfBirth" placeholder="YYYY-MM-DD" required /></Field></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Position"><Input name="position" required placeholder="Tailor" /></Field><Field label="Department"><Select name="department" required><option>Production</option><option>Sales</option><option>Admin</option><option>Store</option></Select></Field></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Salary"><Input name="salary" type="number" required /></Field><Field label="Employment type"><Select name="employmentType" required><option>Full-time</option><option>Part-time</option><option>Contract</option></Select></Field></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Hire date"><Input name="hireDate" placeholder="YYYY-MM-DD" required /></Field><Field label="Status"><Select name="status"><option>Active</option><option>Inactive</option></Select></Field></div>
        <Field label="Profile picture"><Input name="profilePicture" type="file" accept="image/*" /></Field>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
        <Button disabled={pending}>{pending ? "Saving..." : "Register employee"}</Button>
      </form>
    </Card>
  );
}

function Avatar({ employee, large = false }: { employee: Employee; large?: boolean }) {
  return employee.profileImageUrl ? <img src={employee.profileImageUrl} alt={employee.fullName} className={cn("rounded-2xl object-cover", large ? "h-20 w-20" : "h-14 w-14")} /> : <div className={cn("grid place-items-center rounded-2xl bg-emerald-100 font-black text-emerald-700", large ? "h-20 w-20 text-2xl" : "h-14 w-14")}>{employee.fullName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>;
}

function Attendance({ token, role }: { token: string; role: RoleName }) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const isOwner = role === "Owner";
  const canManualEdit = role === "Owner" || role === "HR/Admin";
  const attendance = useQuery({ queryKey: ["attendance-today", date], queryFn: () => api.attendanceToday(token, date) });
  const stats = useQuery({ queryKey: ["attendance-stats", date], queryFn: () => api.attendanceStats(token, date) });
  const settings = useQuery({ queryKey: ["attendance-settings"], queryFn: () => api.attendanceSettings(token) });
  const selectedId = selectedEmployeeId;
  const monthReport = useQuery({ queryKey: ["attendance-month", selectedId, month], queryFn: () => api.attendanceMonth(token, selectedId, month), enabled: Boolean(selectedId) });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["attendance-today"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-month"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-stats-dashboard"] });
  };
  const checkIn = useMutation({ mutationFn: (employeeId: string) => api.checkIn(token, employeeId, date), onSuccess: invalidate });
  const checkOut = useMutation({ mutationFn: (employeeId: string) => api.checkOut(token, employeeId, date), onSuccess: invalidate });
  const manual = useMutation({ mutationFn: (body: Record<string, unknown>) => api.manualAttendance(token, body), onSuccess: invalidate });
  const editTimes = useMutation({ mutationFn: (body: Record<string, unknown>) => api.updateAttendanceTimes(token, body), onSuccess: invalidate });
  const updateSettings = useMutation({
    mutationFn: (body: AttendanceSettings) => api.updateAttendanceSettings(token, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-settings"] });
      invalidate();
    }
  });
  const rows = (attendance.data || []).filter((record) => record.employeeName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Present" value={stats.data?.present ?? 0} icon={<CalendarCheck />} />
        <Metric title="Absent" value={stats.data?.absent ?? 0} icon={<Users />} />
        <Metric title="Late" value={stats.data?.late ?? 0} icon={<FileBarChart />} />
      </div>
      {isOwner && settings.data && (
        <Card>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-bold">Attendance time settings</h3>
              <p className="text-sm text-slate-500">Start time controls Late status. End time defines the expected workday finish.</p>
            </div>
            <form className="grid gap-2 sm:grid-cols-[140px_140px_auto]" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); updateSettings.mutate({ startTime: String(form.startTime), endTime: String(form.endTime) }); }}>
              <Field label="Start time"><Input name="startTime" placeholder="HH:MM" defaultValue={settings.data.startTime} required /></Field>
              <Field label="End time"><Input name="endTime" placeholder="HH:MM" defaultValue={settings.data.endTime} required /></Field>
              <Button className="self-end" disabled={updateSettings.isPending}>{updateSettings.isPending ? "Saving..." : "Save times"}</Button>
            </form>
          </div>
        </Card>
      )}
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black">Daily Attendance</h2>
            <p className="text-sm text-slate-500">Start: {settings.data?.startTime || "09:00"} · End: {settings.data?.endTime || "17:00"} · Owner can edit times.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[2400px] text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2">Employee</th><th>Department</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Total hours</th><th>Overtime</th><th>Actions</th>{isOwner && <th>Owner time edit</th>}{canManualEdit && <th>HR edit</th>}</tr>
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr key={`${record.employeeId}-${record.date}`} className={cn("border-t", selectedEmployeeId === record.employeeId && "bg-emerald-50/70")}>
                  <td className="py-3">
                    <button className="font-semibold text-emerald-700 hover:underline" onClick={() => setSelectedEmployeeId(record.employeeId)}>{record.employeeName}</button>
                    <p className="text-xs text-slate-500">{record.employeeCode}</p>
                  </td>
                  <td>{record.department}</td>
                  <td><AttendanceBadge status={record.status} /></td>
                  <td>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : "-"}</td>
                  <td>{record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "-"}</td>
                  <td><HoursWithOvertime record={record} /></td>
                  <td>{formatOvertime(record.overtimeHours)}</td>
                  <td>
                    <div className="action-row">
                      <Button variant="secondary" disabled={Boolean(record.checkInTime) || checkIn.isPending} onClick={() => checkIn.mutate(record.employeeId)}>Check-in</Button>
                      <Button variant="secondary" disabled={!record.checkInTime || Boolean(record.checkOutTime) || checkOut.isPending} onClick={() => checkOut.mutate(record.employeeId)}>Check-out</Button>
                    </div>
                  </td>
                  {isOwner && (
                    <td>
                      <form className="grid min-w-[220px] gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); editTimes.mutate({ employeeId: record.employeeId, date, checkInTime: toAttendanceIso(date, String(form.checkInTime)), checkOutTime: toAttendanceIso(date, String(form.checkOutTime)) }); }}>
                        <Input name="checkInTime" placeholder="HH:MM" aria-label={`${record.employeeName} check-in time`} defaultValue={timeInputValue(record.checkInTime)} />
                        <Input name="checkOutTime" placeholder="HH:MM" aria-label={`${record.employeeName} check-out time`} defaultValue={timeInputValue(record.checkOutTime)} />
                        <Button variant="secondary" disabled={editTimes.isPending}>Save</Button>
                      </form>
                    </td>
                  )}
                  {canManualEdit && (
                    <td>
                      <Select value={record.status} onChange={(event) => manual.mutate({ employeeId: record.employeeId, date, status: event.target.value })}>
                        <option>Present</option>
                        <option>Absent</option>
                        <option>Late</option>
                      </Select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-black">Employee Attendance Profile</h3>
            <p className="text-sm text-slate-500">Monthly attendance percentage and working-day summary.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Select value={selectedId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
              <option value="">Select employee</option>
              {attendance.data?.map((record) => <option key={record.employeeId} value={record.employeeId}>{record.employeeName}</option>)}
            </Select>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </div>
        </div>
        {!selectedId && <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Select an employee from the daily table or dropdown to view the monthly attendance profile.</p>}
        {selectedId && monthReport.data && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">{monthReport.data.employee.employeeCode}</p>
              <h4 className="text-xl font-black">{monthReport.data.employee.fullName}</h4>
              <p className="mt-2 text-sm text-slate-600">{monthReport.data.employee.position} · {monthReport.data.employee.department}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500">Attendance</p><p className="text-2xl font-black">{monthReport.data.attendancePercentage}%</p></div>
                <div><p className="text-slate-500">Working days</p><p className="text-2xl font-black">{monthReport.data.totalWorkingDays}</p></div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2400px] text-left text-sm">
                <thead className="text-slate-500"><tr><th className="py-2">Date</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Total hours</th><th>Overtime</th></tr></thead>
                <tbody>
                  {monthReport.data.records.length ? monthReport.data.records.map((record) => (
                    <tr key={record.id} className="border-t"><td className="py-3">{record.date}</td><td><AttendanceBadge status={record.status} /></td><td>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : "-"}</td><td>{record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "-"}</td><td><HoursWithOvertime record={record} /></td><td>{formatOvertime(record.overtimeHours)}</td></tr>
                  )) : <tr><td className="py-4 text-slate-500" colSpan={6}>No attendance records for this month.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function AttendanceBadge({ status }: { status: AttendanceRecord["status"] }) {
  return <Badge className={cn(status === "Present" && "bg-emerald-100 text-emerald-800", status === "Absent" && "bg-rose-100 text-rose-800", status === "Late" && "bg-amber-100 text-amber-800")}>{status}</Badge>;
}

function HoursWithOvertime({ record }: { record: AttendanceRecord }) {
  return (
    <div>
      <p className="font-semibold">{record.totalHours ?? "-"}</p>
      {Boolean(record.overtimeHours) && <p className="text-xs font-semibold text-amber-700">Overtime: {formatOvertime(record.overtimeHours)}</p>}
    </div>
  );
}

function formatOvertime(value?: number) {
  return value ? `${value}h` : "-";
}

function timeInputValue(value?: string) {
  return value ? new Date(value).toTimeString().slice(0, 5) : "";
}

function toAttendanceIso(date: string, time: string) {
  return time ? new Date(`${date}T${time}:00`).toISOString() : undefined;
}

function HorizontalScrollControls({ targetId }: { targetId: string }) {
  const scroll = (direction: "left" | "right") => {
    const target = document.getElementById(targetId);
    const marker = document.getElementById(`${targetId}-${direction}`);
    if (!target) return;
    if (marker) {
      target.scrollLeft = direction === "left" ? 0 : marker.offsetLeft;
      return;
    }
    target.scrollLeft = direction === "left" ? 0 : target.scrollWidth - target.clientWidth;
  };
  return (
    <div className="action-row mt-3 print:hidden">
      <Button variant="secondary" type="button" onClick={() => scroll("left")}>← Scroll left</Button>
      <Button variant="secondary" type="button" onClick={() => scroll("right")}>Scroll right →</Button>
    </div>
  );
}

function Payroll({ token, role }: { token: string; role: RoleName }) {
  const queryClient = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRecord | null>(null);
  const canManage = role === "Owner" || role === "HR/Admin";
  const settings = useQuery({ queryKey: ["payroll-settings"], queryFn: () => api.payrollSettings(token) });
  const dashboard = useQuery({ queryKey: ["payroll-dashboard", month, year], queryFn: () => api.payrollDashboard(token, month, year) });
  const payrolls = useQuery({ queryKey: ["payrolls", month, year], queryFn: () => api.payrolls(token, month, year) });
  const reports = useQuery({ queryKey: ["payroll-reports", month, year], queryFn: () => api.payrollReports(token, month, year) });
  useEffect(() => {
    document.getElementById("payroll-history-scroll")?.scrollTo({ left: 0 });
  }, [month, year, payrolls.data?.length]);
  const invalidatePayroll = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["payrolls"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-reports"] });
  };
  const generate = useMutation({ mutationFn: () => api.generatePayroll(token, { month, year }), onSuccess: invalidatePayroll });
  const saveSettings = useMutation({ mutationFn: (body: PayrollSettings) => api.updatePayrollSettings(token, body), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payroll-settings"] }) });
  const updatePayroll = useMutation({ mutationFn: ({ payroll, body }: { payroll: PayrollRecord; body: Record<string, unknown> }) => api.updatePayroll(token, payroll.id, body), onSuccess: invalidatePayroll });
  const markPaid = useMutation({
    mutationFn: (payroll: PayrollRecord) => api.markPayrollPaid(token, payroll.id, { paymentMethod: "Bank transfer" }),
    onSuccess: (paidPayroll) => {
      queryClient.setQueryData<PayrollRecord[]>(["payrolls", month, year], (current = []) => current.map((payroll) => payroll.id === paidPayroll.id ? paidPayroll : payroll));
      queryClient.setQueryData(["payroll-dashboard", month, year], (current: any) => {
        if (!current) return current;
        const history = current.history.map((payroll: PayrollRecord) => payroll.id === paidPayroll.id ? paidPayroll : payroll);
        return {
          ...current,
          awaitingPayment: history.filter((payroll: PayrollRecord) => payroll.paymentStatus !== "Paid").length,
          totalPaid: history.filter((payroll: PayrollRecord) => payroll.paymentStatus === "Paid").reduce((sum: number, payroll: PayrollRecord) => sum + payroll.payableSalary, 0),
          totalUnpaid: history.filter((payroll: PayrollRecord) => payroll.paymentStatus !== "Paid").reduce((sum: number, payroll: PayrollRecord) => sum + payroll.payableSalary, 0),
          history
        };
      });
      invalidatePayroll();
    }
  });

  const exportCsv = () => {
    const rows = payrolls.data || [];
    const header = ["Employee", "Department", "Month", "Basic", "Overtime", "Bonus", "Allowance", "Deductions", "Tax", "Net", "Status"];
    const csv = [header, ...rows.map((payroll) => [payroll.employee.fullName, payroll.employee.department, `${payroll.payrollMonth}/${payroll.payrollYear}`, payroll.basicSalary, payroll.overtimePay, payroll.bonus, payroll.allowance, payroll.deductions, payroll.tax, payroll.payableSalary, payroll.paymentStatus])].map((row) => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-${year}-${String(month).padStart(2, "0")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Awaiting payment" value={dashboard.data?.awaitingPayment ?? 0} icon={<Users />} />
        <Metric title="Total payroll" value={currency(dashboard.data?.totalPayroll ?? 0)} icon={<BadgeDollarSign />} />
        <Metric title="Total paid" value={currency(dashboard.data?.totalPaid ?? 0)} icon={<FileBarChart />} />
        <Metric title="Total unpaid" value={currency(dashboard.data?.totalUnpaid ?? 0)} icon={<FileBarChart />} />
      </div>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-black">Payroll & Salary Automation</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Calculates salary from attendance, overtime, absence, late penalties, tax, bonus, and allowances.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[120px_120px_auto_auto]">
            <Field label="Month"><Input type="number" min={1} max={12} value={month} onChange={(event) => setMonth(Number(event.target.value))} /></Field>
            <Field label="Year"><Input type="number" min={2000} value={year} onChange={(event) => setYear(Number(event.target.value))} /></Field>
            {canManage && <Button className="self-end" disabled={generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? "Generating..." : "Generate payroll"}</Button>}
            <Button variant="secondary" className="self-end" onClick={exportCsv}>Export Excel CSV</Button>
          </div>
        </div>
      </Card>

      {role === "Owner" && settings.data && (
        <Card>
          <h3 className="text-lg font-bold">Payroll settings</h3>
          <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); saveSettings.mutate({ standardHoursPerDay: Number(form.standardHoursPerDay), workingDaysPerMonth: Number(form.workingDaysPerMonth), gracePeriodMinutes: Number(form.gracePeriodMinutes), overtimeRatePerHour: Number(form.overtimeRatePerHour), latePenaltyEnabled: form.latePenaltyEnabled === "on", latePenaltyAmount: Number(form.latePenaltyAmount), absenceDeductionEnabled: form.absenceDeductionEnabled === "on", taxPercentage: Number(form.taxPercentage), defaultAllowance: Number(form.defaultAllowance), defaultBonus: Number(form.defaultBonus) }); }}>
            <Field label="Standard hours/day"><Input name="standardHoursPerDay" type="number" step="0.01" defaultValue={settings.data.standardHoursPerDay} /></Field>
            <Field label="Working days/month"><Input name="workingDaysPerMonth" type="number" defaultValue={settings.data.workingDaysPerMonth} /></Field>
            <Field label="Grace minutes"><Input name="gracePeriodMinutes" type="number" defaultValue={settings.data.gracePeriodMinutes} /></Field>
            <Field label="Overtime rate/hour"><Input name="overtimeRatePerHour" type="number" step="0.01" defaultValue={settings.data.overtimeRatePerHour} /></Field>
            <Field label="Late penalty amount"><Input name="latePenaltyAmount" type="number" step="0.01" defaultValue={settings.data.latePenaltyAmount} /></Field>
            <Field label="Tax %"><Input name="taxPercentage" type="number" step="0.01" defaultValue={settings.data.taxPercentage || 0} /></Field>
            <Field label="Default allowance"><Input name="defaultAllowance" type="number" step="0.01" defaultValue={settings.data.defaultAllowance} /></Field>
            <Field label="Default bonus"><Input name="defaultBonus" type="number" step="0.01" defaultValue={settings.data.defaultBonus} /></Field>
            <div className="grid gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-2"><input name="latePenaltyEnabled" type="checkbox" defaultChecked={settings.data.latePenaltyEnabled} /> Late penalty enabled</label>
              <label className="flex items-center gap-2"><input name="absenceDeductionEnabled" type="checkbox" defaultChecked={settings.data.absenceDeductionEnabled} /> Absence deduction enabled</label>
              <Button disabled={saveSettings.isPending}>{saveSettings.isPending ? "Saving..." : "Save settings"}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><h3 className="text-xl font-black">Payroll history</h3><p className="text-sm text-slate-500 dark:text-slate-400">HR/Admin can adjust bonuses and deductions; Owner/HR can mark salaries paid.</p></div>
          <Button variant="secondary" onClick={() => window.print()}>Print selected payslip / PDF</Button>
        </div>
        <HorizontalScrollControls targetId="payroll-history-scroll" />
        <div id="payroll-history-scroll" className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[2400px] text-left text-sm">
            <thead className="text-slate-500"><tr><th id="payroll-history-scroll-left" className="py-2">Employee</th><th>Attendance</th><th>Overtime</th><th>Adjustments</th><th>Deductions/Tax</th><th>Net salary</th><th>Status</th><th id="payroll-history-scroll-right">Actions</th></tr></thead>
            <tbody>
              {payrolls.data?.map((payroll) => (
                <tr key={payroll.id} className="border-t">
                  <td className="py-3"><p className="font-semibold">{payroll.employee.fullName}</p><p className="text-xs text-slate-500">{payroll.employee.employeeCode} · {payroll.employee.department}</p></td>
                  <td>{payroll.presentDays} present · {payroll.absentDays} absent · {payroll.lateDays} late</td>
                  <td>{payroll.overtimeHours}h · {currency(payroll.overtimePay)}</td>
                  <td>{currency(payroll.bonus)} bonus · {currency(payroll.allowance)} allowance</td>
                  <td>{currency(payroll.deductions)} deductions · {currency(payroll.tax)} tax</td>
                  <td className="font-black">{currency(payroll.payableSalary)}</td>
                  <td><Badge className={payroll.paymentStatus === "Paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{payroll.paymentStatus}</Badge></td>
                  <td className="min-w-[380px]"><div className="action-row">{canManage && <Button variant="secondary" onClick={() => updatePayroll.mutate({ payroll, body: { bonus: payroll.bonus, allowance: payroll.allowance, deductions: payroll.deductions, notes: payroll.notes } })}>Recalculate</Button>}{canManage && !isPaidStatus(payroll.paymentStatus) && <Button onClick={() => markPaid.mutate(payroll)}>Mark paid</Button>}<Button variant="secondary" onClick={() => setSelectedPayslip(payroll)}>Payslip</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="text-xl font-black">Payroll reports</h3>
        <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-emerald-100">{JSON.stringify(reports.data, null, 2)}</pre>
      </Card>

      {selectedPayslip && <Payslip payroll={selectedPayslip} onClose={() => setSelectedPayslip(null)} />}
    </div>
  );
}

function Payslip({ payroll, onClose }: { payroll: PayrollRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm print:static print:block print:bg-white print:p-0">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto print:max-h-none print:border-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4 print:hidden"><h3 className="text-xl font-black">Employee payslip</h3><Button variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button></div>
        <div className="mt-4 flex items-center gap-4 border-b pb-4">
          <LightGarmentLogo />
          <div><h1 className="text-2xl font-black">Light Garment Manufacturing PLC</h1><p className="text-sm text-slate-500">Payroll payslip · {payroll.payrollMonth}/{payroll.payrollYear}</p></div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[120px_1fr]">
          <Avatar employee={payroll.employee} large />
          <div className="grid gap-2 text-sm md:grid-cols-2">
            {Object.entries({ "Employee ID": payroll.employee.employeeCode, Name: payroll.employee.fullName, Department: payroll.employee.department, Position: payroll.employee.position, "Basic salary": currency(payroll.basicSalary), "Present days": payroll.presentDays, "Absent days": payroll.absentDays, "Late days": payroll.lateDays, "Overtime hours": payroll.overtimeHours, "Overtime pay": currency(payroll.overtimePay), Bonus: currency(payroll.bonus), Allowance: currency(payroll.allowance), Deductions: currency(payroll.deductions), Tax: currency(payroll.tax), "Net salary": currency(payroll.payableSalary), Status: payroll.paymentStatus }).map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-b py-2"><span className="text-slate-500">{key}</span><strong>{value}</strong></div>)}
          </div>
        </div>
        <div className="action-row mt-5 justify-end print:hidden"><Button variant="secondary" onClick={() => window.print()}>Print / Save PDF</Button><Button onClick={onClose}>Close</Button></div>
      </Card>
    </div>
  );
}

function isPaidStatus(status: string) {
  return status.toLowerCase() === "paid";
}

function Inventory({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => api.products(token) });
  const inventory = useQuery({ queryKey: ["inventory"], queryFn: () => api.inventory(token) });
  const rawMaterials = useQuery({ queryKey: ["raw"], queryFn: () => api.rawMaterials(token) });
  const rawHistory = useQuery({ queryKey: ["raw-history"], queryFn: () => api.rawMaterialHistory(token) });
  const sales = useQuery({ queryKey: ["sales"], queryFn: () => api.sales(token) });
  const productCreate = useMutation({ mutationFn: (body: Partial<Product>) => api.createProduct(token, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["inventory"] }); } });
  const stockMove = useMutation({ mutationFn: (body: Record<string, unknown>) => api.moveStock(token, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["inventory"] }); } });
  const rawCreate = useMutation({ mutationFn: (body: Omit<RawMaterial, "id">) => api.createRawMaterial(token, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["raw"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); } });
  const rawUse = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.useRawMaterial(token, id, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["raw"] }); queryClient.invalidateQueries({ queryKey: ["raw-history"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); } });
  const firstProduct = products.data?.[0];
  const firstRaw = rawMaterials.data?.[0];

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <h2 className="text-xl font-black">Add shirt SKU</h2>
          <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); productCreate.mutate(Object.fromEntries(form) as Partial<Product>); event.currentTarget.reset(); }}>
            <Field label="Product name"><Input name="productName" required /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Model"><Input name="model" required /></Field><Field label="Color"><Input name="color" required /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Size"><Input name="size" required /></Field><Field label="Quantity"><Input name="quantity" type="number" required /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Cost price"><Input name="costPrice" type="number" required /></Field><Field label="Selling price"><Input name="sellingPrice" type="number" required /></Field></div>
            <Field label="Barcode"><Input name="barcode" /></Field>
            <Button><PackagePlus className="mr-2 h-4 w-4" />Create product</Button>
          </form>
        </Card>
        <Card>
          <h2 className="text-xl font-black">Products</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {products.data?.map((product) => <div key={product.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{product.productName}</p><p className="text-sm text-slate-500">{product.sku} · {product.model} · {product.color}/{product.size}</p></div><Badge className={product.quantity < 20 ? "bg-amber-100 text-amber-800" : ""}>{product.quantity} pcs</Badge></div><p className="mt-3 text-sm">{currency(product.costPrice)} cost · {currency(product.sellingPrice)} sell</p>{product.qrCode && <img src={product.qrCode} alt={`${product.sku} QR`} className="mt-3 h-20 w-20" />}</div>)}
          </div>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="text-lg font-bold">Stock movement</h3>
          <form className="mt-4 grid gap-3 md:grid-cols-5" onSubmit={(event) => { event.preventDefault(); stockMove.mutate(Object.fromEntries(new FormData(event.currentTarget))); event.currentTarget.reset(); }}>
            <Select name="productId" defaultValue={firstProduct?.id}>{products.data?.map((product) => <option value={product.id} key={product.id}>{product.productName}</option>)}</Select>
            <Select name="type"><option>Stock in</option><option>Stock out</option><option>Transfer</option><option>Adjustment</option></Select>
            <Input name="quantity" type="number" placeholder="Qty" required />
            <Input name="reference" placeholder="Reference" />
            <Button>Record</Button>
          </form>
          <div className="mt-4 grid gap-2">{inventory.data?.slice(0, 8).map((move) => <div key={move.id} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{move.type} · {move.productName}</span><b>{move.quantity}</b></div>)}</div>
        </Card>
        <Card>
          <h3 className="text-lg font-bold">Raw materials</h3>
          <form className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); rawCreate.mutate({ name: String(form.name), category: form.category as RawMaterial["category"], unit: String(form.unit), quantity: Number(form.quantity), reorderLevel: Number(form.reorderLevel), unitCost: Number(form.unitCost) }); event.currentTarget.reset(); }}>
            <div className="grid gap-3 md:grid-cols-2"><Field label="Material name"><Input name="name" placeholder="Denim fabric" required /></Field><Field label="Category"><Select name="category" required><option>Fabric</option><option>Thread</option><option>Buttons</option><option>Labels</option><option>Packaging</option></Select></Field></div>
            <div className="grid gap-3 md:grid-cols-3"><Field label="Unit"><Input name="unit" placeholder="meter" required /></Field><Field label="Quantity"><Input name="quantity" type="number" step="0.01" required /></Field><Field label="Reorder level"><Input name="reorderLevel" type="number" step="0.01" required /></Field></div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]"><Field label="Unit cost"><Input name="unitCost" type="number" step="0.01" required /></Field><Button disabled={rawCreate.isPending} className="self-end">{rawCreate.isPending ? "Saving..." : "Add raw material"}</Button></div>
          </form>
          <div className="mt-4 grid gap-2">{rawMaterials.data?.map((material) => <div key={material.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm"><span>{material.name} <span className="text-slate-500">({material.category}) · {currency(material.unitCost)} / {material.unit}</span></span><Badge className={material.quantity < material.reorderLevel ? "bg-amber-100 text-amber-800" : ""}>{material.quantity} {material.unit}</Badge></div>)}</div>
        </Card>
      </div>
      <Card className="print:shadow-none">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between print:hidden">
          <div><h3 className="text-lg font-bold">Inventory usage records</h3><p className="text-sm text-slate-500">Permanent product, raw material, and POS movement history.</p></div>
          <div className="action-row">
            <Button variant="secondary" onClick={() => window.print()}>Print / Save PDF</Button>
            <Button onClick={() => exportCsv("inventory-history.csv", [["Type", "Item", "Quantity", "Unit", "Reference", "Date"], ...(inventory.data || []).map((m) => [m.type, m.productName, m.quantity, "pcs", m.reference, m.createdAt]), ...(rawHistory.data || []).map((m) => [m.type, m.rawMaterialName, m.quantity, m.unit, m.reference, m.createdAt]), ...(sales.data || []).flatMap((sale) => sale.items.map((item) => ["POS Sale", item.productName, item.quantity, "pcs", sale.invoiceNumber, sale.createdAt]))])}>Export Excel CSV</Button>
          </div>
        </div>
        <form className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 print:hidden" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); rawUse.mutate({ id: String(form.rawMaterialId), body: { quantity: Number(form.quantity), reference: form.reference, note: form.note } }); event.currentTarget.reset(); }}>
          <h4 className="font-bold">Record raw material used</h4>
          <div className="grid gap-3 md:grid-cols-5">
            <Select name="rawMaterialId" defaultValue={firstRaw?.id}>{rawMaterials.data?.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</Select>
            <Input name="quantity" type="number" step="0.01" placeholder="Quantity used" required />
            <Input name="reference" placeholder="Production ref" />
            <Input name="note" placeholder="Note" />
            <Button disabled={rawUse.isPending}>{rawUse.isPending ? "Saving..." : "Record usage"}</Button>
          </div>
        </form>
        <HorizontalScrollControls targetId="inventory-history-scroll" />
        <div id="inventory-history-scroll" className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[2400px] text-left text-sm">
            <thead className="text-slate-500"><tr><th id="inventory-history-scroll-left" className="py-2">Type</th><th>Item</th><th>Quantity</th><th>Unit</th><th>Reference</th><th id="inventory-history-scroll-right">Date</th></tr></thead>
            <tbody>
              {inventory.data?.map((m) => <tr key={`inv-${m.id}`} className="border-t"><td className="py-2">{m.type}</td><td>{m.productName}</td><td>{m.quantity}</td><td>pcs</td><td>{m.reference || "-"}</td><td>{new Date(m.createdAt).toLocaleString()}</td></tr>)}
              {rawHistory.data?.map((m) => <tr key={`raw-${m.id}`} className="border-t"><td className="py-2">{m.type}</td><td>{m.rawMaterialName}</td><td>{m.quantity}</td><td>{m.unit}</td><td>{m.reference || "-"}</td><td>{new Date(m.createdAt).toLocaleString()}</td></tr>)}
              {sales.data?.flatMap((sale) => sale.items.map((item) => <tr key={`sale-${sale.id}-${item.productId}`} className="border-t"><td className="py-2">POS Sale</td><td>{item.productName}</td><td>{item.quantity}</td><td>pcs</td><td>{sale.invoiceNumber}</td><td>{new Date(sale.createdAt).toLocaleString()}</td></tr>))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Sales({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => api.products(token) });
  const sales = useQuery({ queryKey: ["sales"], queryFn: () => api.sales(token) });
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<Sale["paymentMethod"]>("Cash");
  const selected = products.data?.find((product) => product.id === productId) || products.data?.[0];
  const total = (selected?.sellingPrice || 0) * quantity;
  const invalidateSales = () => {
    queryClient.invalidateQueries({ queryKey: ["sales"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const createSale = useMutation({
    mutationFn: (paid: boolean) => api.createSale(token, { customerName: "Walk-in customer", items: [{ productId: selected?.id, quantity }], amountPaid: paid ? total : 0, paymentMethod }),
    onSuccess: invalidateSales
  });
  const markPaid = useMutation({
    mutationFn: (sale: Sale) => api.markSalePaid(token, sale.id, { amountPaid: sale.total, paymentMethod: sale.paymentMethod || paymentMethod }),
    onSuccess: invalidateSales
  });
  const unpaidSales = sales.data?.filter((sale) => sale.paymentStatus !== "Paid") ?? [];
  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card>
        <h2 className="text-xl font-black">POS checkout</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Product"><Select value={selected?.id || ""} onChange={(event) => setProductId(event.target.value)}>{products.data?.map((product) => <option key={product.id} value={product.id}>{product.productName} - {currency(product.sellingPrice)}</option>)}</Select></Field>
          <Field label="Quantity"><Input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></Field>
          <Field label="Payment method"><Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as Sale["paymentMethod"])}><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Mobile money</option></Select></Field>
          <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-sm text-emerald-700">Invoice total</p><p className="text-3xl font-black">{currency(total)}</p></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button disabled={!selected || createSale.isPending} onClick={() => createSale.mutate(true)}>Generate paid invoice</Button>
            <Button variant="secondary" disabled={!selected || createSale.isPending} onClick={() => createSale.mutate(false)}>Save unpaid sale</Button>
          </div>
          {createSale.error && <p className="text-sm text-rose-700">{createSale.error.message}</p>}
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">Recent invoices</h2>
            <p className="text-sm text-slate-500">{unpaidSales.length} unpaid invoice{unpaidSales.length === 1 ? "" : "s"} awaiting payment.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">{sales.data?.map((sale) => <div key={sale.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b>{sale.invoiceNumber}</b><SaleStatusBadge status={sale.paymentStatus} /></div><p className="mt-2 text-sm text-slate-500">{sale.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ")}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div><p className="font-black">{currency(sale.total)}</p><p className="text-xs text-slate-500">Paid {currency(sale.amountPaid)} · {sale.paymentMethod}</p></div>{sale.paymentStatus !== "Paid" && <Button disabled={markPaid.isPending} onClick={() => markPaid.mutate(sale)}>Mark paid</Button>}</div></div>)}</div>
      </Card>
    </div>
  );
}

function SaleStatusBadge({ status }: { status: Sale["paymentStatus"] }) {
  return <Badge className={cn(status === "Paid" && "bg-emerald-100 text-emerald-800", status === "Pending" && "bg-amber-100 text-amber-800", status === "Partial" && "bg-sky-100 text-sky-800")}>{status === "Pending" ? "Unpaid" : status}</Badge>;
}

function Production({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const production = useQuery({ queryKey: ["production"], queryFn: () => api.production(token) });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.updateProduction(token, id, body), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["production"] }) });
  return (
    <Card>
      <h2 className="text-xl font-black">Production workflow</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{production.data?.map((stage) => (
        <div key={stage.id} className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-2"><Badge>{stage.stage}</Badge><Badge className={stage.status === "Completed" ? "bg-emerald-100 text-emerald-800" : stage.status === "Blocked" ? "bg-rose-100 text-rose-800" : ""}>{stage.status}</Badge></div>
          <h3 className="mt-3 font-bold">{stage.productName}</h3>
          <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); update.mutate({ id: stage.id, body: { status: form.status, assignedTo: form.assignedTo, notes: form.notes, startedAt: form.status === "In progress" ? new Date().toISOString() : stage.startedAt, completedAt: form.status === "Completed" ? new Date().toISOString() : undefined } }); }}>
            <Select name="status" defaultValue={stage.status}><option>Pending</option><option>In progress</option><option>Completed</option><option>Blocked</option></Select>
            <Input name="assignedTo" defaultValue={stage.assignedTo || ""} placeholder="Assigned to" />
            <Textarea name="notes" defaultValue={stage.notes || ""} rows={2} placeholder="Production notes" />
            <div className="action-row">
              <Button variant="secondary" type="button" onClick={() => update.mutate({ id: stage.id, body: { status: "In progress", assignedTo: stage.assignedTo, startedAt: new Date().toISOString(), notes: stage.notes } })}>Start</Button>
              <Button variant="danger" type="button" onClick={() => update.mutate({ id: stage.id, body: { status: "Blocked", assignedTo: stage.assignedTo, notes: stage.notes } })}>Block</Button>
              <Button type="button" onClick={() => update.mutate({ id: stage.id, body: { status: "Completed", assignedTo: stage.assignedTo, completedAt: new Date().toISOString(), notes: stage.notes } })}>Complete</Button>
              <Button variant="secondary" disabled={update.isPending}>Save</Button>
            </div>
          </form>
        </div>
      ))}</div>
    </Card>
  );
}

function Reports({ token }: { token: string }) {
  const reports = useQuery({ queryKey: ["reports"], queryFn: () => api.reports(token) });
  const data = reports.data as any;
  const exportReport = () => exportCsv("light-garment-reports.csv", [
    ["Report", "Metric", "Value"],
    ["Employees", "Total", data?.employeeReport?.total],
    ["Employees", "Active", data?.employeeReport?.active],
    ["Inventory", "Total units", data?.inventoryReport?.totalUnits],
    ["Inventory", "Value", data?.inventoryReport?.inventoryValue],
    ["Sales", "Invoices", data?.salesReport?.invoices],
    ["Sales", "Revenue", data?.salesReport?.revenue],
    ["Profit", "Gross profit", data?.profitReport?.grossProfit]
  ]);
  return (
    <Card className="print:shadow-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div><h2 className="text-xl font-black">Reports</h2><p className="text-sm text-slate-500 dark:text-slate-400">Employee, attendance, inventory, sales, and profit reports.</p></div>
        <div className="action-row">
          <Button variant="secondary" onClick={() => window.print()}>Print / Save PDF</Button>
          <Button onClick={exportReport}>Export Excel CSV</Button>
        </div>
      </div>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 print:border-0 print:p-0 dark:border-slate-800 dark:bg-slate-950">
        <div className="hidden print:block">
          <h1 className="text-2xl font-black">Light Garment Manufacturing PLC Reports</h1>
          <p className="mt-1 text-sm">Generated {new Date().toLocaleString()}</p>
        </div>
        <div className="mt-4 grid gap-5">
          <ReportTable title="Employee report" rows={[["Total employees", data?.employeeReport?.total], ["Active employees", data?.employeeReport?.active]]} />
          <ReportTable title="Inventory report" rows={[["Total units", data?.inventoryReport?.totalUnits], ["Inventory value", currency(data?.inventoryReport?.inventoryValue || 0)]]} />
          <ReportTable title="Sales report" rows={[["Invoices", data?.salesReport?.invoices], ["Revenue", currency(data?.salesReport?.revenue || 0)]]} />
          <ReportTable title="Profit report" rows={[["Revenue", currency(data?.profitReport?.revenue || 0)], ["COGS", currency(data?.profitReport?.cogs || 0)], ["Gross profit", currency(data?.profitReport?.grossProfit || 0)]]} />
          <div className="overflow-x-auto">
            <h3 className="font-bold">Attendance report</h3>
            <table className="mt-2 w-full min-w-[2200px] text-left text-sm"><thead><tr className="text-slate-500"><th className="py-2">Employee</th><th>Date</th><th>Status</th><th>Hours</th><th>Overtime</th></tr></thead><tbody>{data?.attendanceReport?.records?.map((record: AttendanceRecord) => <tr key={record.id} className="border-t"><td className="py-2">{record.employeeName}</td><td>{record.date}</td><td>{record.status}</td><td>{record.totalHours ?? "-"}</td><td>{record.overtimeHours ?? "-"}</td></tr>)}</tbody></table>
          </div>
        </div>
      </section>
    </Card>
  );
}

function ReportTable({ title, rows }: { title: string; rows: Array<[string, string | number | undefined]> }) {
  return <div className="overflow-x-auto"><h3 className="font-bold">{title}</h3><table className="mt-2 w-full text-left text-sm"><tbody>{rows.map(([label, value]) => <tr key={label} className="border-t"><td className="py-2 text-slate-500">{label}</td><td className="font-semibold">{value ?? "-"}</td></tr>)}</tbody></table></div>;
}

function SettingsPage({ token, role, theme, onThemeChange }: { token: string; role: RoleName; theme: ThemeMode; onThemeChange: (theme: ThemeMode) => void }) {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.settings(token) });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.users(token), enabled: role === "Owner" });
  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const createUser = useMutation({ mutationFn: (body: Record<string, unknown>) => api.createUser(token, body), onSuccess: refreshUsers });
  const updateUser = useMutation({ mutationFn: ({ user, body }: { user: ManagedUser; body: Record<string, unknown> }) => api.updateUser(token, user.id, body), onSuccess: refreshUsers });
  const deleteUser = useMutation({ mutationFn: (id: string) => api.deleteUser(token, id), onSuccess: refreshUsers });
  return (
    <div className="grid gap-6">
      <Card>
        <h2 className="text-xl font-black">Company settings</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{Object.entries(settings.data || {}).map(([key, value]) => <div key={key} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"><p className="text-sm capitalize text-slate-500 dark:text-slate-400">{key.replace(/([A-Z])/g, " $1")}</p><p className="font-bold">{String(value)}</p></div>)}</div>
      </Card>
      <Card>
        <h2 className="text-xl font-black">Appearance</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use Light, Dark, or follow your system setting.</p>
        <div className="mt-4 max-w-xs"><ThemeToggle theme={theme} onThemeChange={onThemeChange} /></div>
      </Card>
      {role === "Owner" && (
        <Card>
          <h2 className="text-xl font-black">User management</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Owner can add, suspend, delete users, change passwords, and see recent online status.</p>
          <form className="mt-4 grid gap-3 md:grid-cols-5" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); createUser.mutate({ name: form.name, email: form.email, password: form.password, role: form.role }); event.currentTarget.reset(); }}>
            <Input name="name" placeholder="Name" required />
            <Input name="email" type="email" placeholder="Email" required />
            <Input name="password" type="password" placeholder="Password" required />
            <Select name="role"><option>Owner</option><option>Manager</option><option>Storekeeper</option><option>Salesperson</option><option>HR/Admin</option></Select>
            <Button disabled={createUser.isPending}>{createUser.isPending ? "Adding..." : "Add user"}</Button>
          </form>
          {createUser.error && <p className="mt-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{createUser.error.message}</p>}
          <HorizontalScrollControls targetId="settings-users-scroll" />
          <div id="settings-users-scroll" className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[2400px] text-left text-sm">
              <thead className="text-slate-500"><tr><th id="settings-users-scroll-left" className="py-2">User</th><th>Role</th><th>Status</th><th>Online</th><th>Change password</th><th id="settings-users-scroll-right">Actions</th></tr></thead>
              <tbody>{users.data?.map((user) => <tr key={user.id} className="border-t"><td className="py-3"><p className="font-semibold">{user.name}</p><p className="text-xs text-slate-500">{user.email}</p></td><td>{user.role}</td><td>{user.isActive ? "Active" : "Suspended"}</td><td>{user.isOnline ? "Online" : `Last seen ${user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : "never"}`}</td><td><form className="action-row" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); updateUser.mutate({ user, body: { password: form.password } }); event.currentTarget.reset(); }}><Input name="password" type="password" placeholder="New password" /><Button variant="secondary">Save</Button></form></td><td><div className="action-row"><Button variant="secondary" onClick={() => updateUser.mutate({ user, body: { isActive: !user.isActive } })}>{user.isActive ? "Suspend" : "Activate"}</Button><Button variant="danger" onClick={() => deleteUser.mutate(user.id)}>Delete</Button></div></td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Loading() {
  return <Card><p className="animate-pulse text-sm text-slate-500">Loading ERP data...</p></Card>;
}
