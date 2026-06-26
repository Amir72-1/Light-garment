import { useMemo, useState } from "react";
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
  PackagePlus,
  Settings,
  Shirt,
  Users,
  X
} from "lucide-react";
import { api } from "./api";
import { Badge, Button, Card, Field, Input, Select, Textarea, cn } from "./components/ui";
import type { AttendanceRecord, Employee, Product, RawMaterial, RoleName, UserSession } from "../shared/types";

type ModuleKey = "dashboard" | "employees" | "attendance" | "inventory" | "sales" | "production" | "reports" | "settings";

const navItems: Array<{ key: ModuleKey; label: string; icon: typeof LayoutDashboard; roles: RoleName[] }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["Owner", "Manager", "Storekeeper", "Salesperson", "HR/Admin"] },
  { key: "employees", label: "Employees", icon: Users, roles: ["Owner", "Manager", "HR/Admin"] },
  { key: "attendance", label: "Attendance", icon: CalendarCheck, roles: ["Owner", "Manager", "HR/Admin"] },
  { key: "inventory", label: "Shirts & Inventory", icon: Shirt, roles: ["Owner", "Manager", "Storekeeper", "Salesperson"] },
  { key: "sales", label: "POS Sales", icon: BadgeDollarSign, roles: ["Owner", "Manager", "Salesperson"] },
  { key: "production", label: "Production", icon: Factory, roles: ["Owner", "Manager"] },
  { key: "reports", label: "Reports", icon: FileBarChart, roles: ["Owner", "Manager", "HR/Admin"] },
  { key: "settings", label: "Settings", icon: Settings, roles: ["Owner", "Manager", "Storekeeper", "Salesperson", "HR/Admin"] }
];

function currency(value: number) {
  return new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", maximumFractionDigits: 0 }).format(value);
}

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem("lgm-session");
    return saved ? JSON.parse(saved) as UserSession : null;
  });
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) {
    return <Login onLogin={(next) => { localStorage.setItem("lgm-session", JSON.stringify(next)); setSession(next); }} />;
  }

  const visibleNav = navItems.filter((item) => item.roles.includes(session.user.role));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className={cn("fixed inset-y-0 left-0 z-30 w-72 border-r border-slate-200 bg-white p-4 transition lg:translate-x-0", menuOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-8 rounded-2xl bg-emerald-950 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Light Garment</p>
          <h1 className="mt-2 text-2xl font-black leading-tight">ERP Control Center</h1>
          <p className="mt-2 text-sm text-emerald-100">Signed in as {session.user.role}</p>
        </div>
        <nav className="grid gap-2">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold", active === item.key ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100")} onClick={() => { setActive(item.key); setMenuOpen(false); }}>
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="lg:hidden" onClick={() => setMenuOpen((value) => !value)}><Menu className="h-4 w-4" /></Button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Production-ready garment ERP</p>
              <h2 className="font-bold">Light Garment Manufacturing PLC</h2>
            </div>
          </div>
          <Button variant="ghost" onClick={() => { localStorage.removeItem("lgm-session"); setSession(null); }}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </header>
        <section className="p-4 lg:p-8">
          {active === "dashboard" && <Dashboard token={session.token} role={session.user.role} />}
          {active === "employees" && <Employees token={session.token} />}
          {active === "attendance" && <Attendance token={session.token} role={session.user.role} />}
          {active === "inventory" && <Inventory token={session.token} />}
          {active === "sales" && <Sales token={session.token} />}
          {active === "production" && <Production token={session.token} />}
          {active === "reports" && <Reports token={session.token} />}
          {active === "settings" && <SettingsPage token={session.token} />}
        </section>
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (session: UserSession) => void }) {
  const [email, setEmail] = useState("owner@lightgarment.example");
  const [password, setPassword] = useState("Password123!");
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
        <p className="mt-1 text-sm text-slate-500">Demo owner: owner@lightgarment.example / Password123!</p>
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
            {data.lowStockAlerts.length ? data.lowStockAlerts.map((alert) => <div key={alert.id} className="flex items-center justify-between rounded-xl bg-amber-50 p-3 text-sm"><span>{alert.name}</span><Badge className="bg-amber-100 text-amber-800">{alert.quantity} / {alert.threshold}</Badge></div>) : <p className="text-sm text-slate-500">No low stock alerts.</p>}
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
  const attendance = useQuery({ queryKey: ["attendance"], queryFn: () => api.attendance(token) });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); queryClient.invalidateQueries({ queryKey: ["attendance"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); };
  const createEmployee = useMutation({ mutationFn: (form: FormData) => api.createEmployee(token, form), onSuccess: invalidate });
  const deleteEmployee = useMutation({ mutationFn: (id: string) => api.deleteEmployee(token, id), onSuccess: invalidate });
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
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button variant="secondary" onClick={() => checkIn.mutate(employee.id)}>Check-in</Button>
                  <Button variant="secondary" onClick={() => checkOut.mutate(employee.id)}>Check-out</Button>
                  <Button variant="danger" onClick={() => deleteEmployee.mutate(employee.id)}>Delete</Button>
                </div>
              </Card>
            ))}
          </div>
          <Card>
            <h3 className="text-lg font-bold">Daily attendance log</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-slate-500"><tr><th className="py-2">Employee</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
                <tbody>{attendance.data?.map((record) => <tr key={record.id} className="border-t"><td className="py-3 font-semibold">{record.employeeName}</td><td>{record.date}</td><td>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : "-"}</td><td>{record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "-"}</td><td><Badge>{record.status}</Badge></td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        </div>
        <div className="grid gap-6 self-start">
          <EmployeeForm pending={createEmployee.isPending} onSubmit={(form) => createEmployee.mutate(form)} />
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

function EmployeeForm({ onSubmit, pending }: { onSubmit: (form: FormData) => void; pending: boolean }) {
  return (
    <Card>
      <h3 className="text-lg font-bold">Add employee</h3>
      <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); event.currentTarget.reset(); }}>
        <Field label="Full name"><Input name="fullName" required /></Field>
        <Field label="Fayda number"><Input name="faydaNumber" placeholder="FIN / Fayda ID number" /></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Phone"><Input name="phoneNumber" required /></Field>
          <Field label="Email (optional)"><Input name="email" type="email" placeholder="Leave blank if none" /></Field>
        </div>
        <p className="-mt-2 text-xs text-slate-500">Employees can be registered without an email address.</p>
        <Field label="Address"><Textarea name="address" rows={2} required /></Field>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Gender"><Select name="gender" required><option>Female</option><option>Male</option><option>Other</option></Select></Field><Field label="Date of birth"><Input name="dateOfBirth" placeholder="YYYY-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}" required /></Field></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Position"><Input name="position" required placeholder="Tailor" /></Field><Field label="Department"><Select name="department" required><option>Production</option><option>Sales</option><option>Admin</option><option>Store</option></Select></Field></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Salary"><Input name="salary" type="number" required /></Field><Field label="Employment type"><Select name="employmentType" required><option>Full-time</option><option>Part-time</option><option>Contract</option></Select></Field></div>
        <div className="grid gap-3 md:grid-cols-2"><Field label="Hire date"><Input name="hireDate" placeholder="YYYY-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}" required /></Field><Field label="Status"><Select name="status"><option>Active</option><option>Inactive</option></Select></Field></div>
        <Field label="Profile picture"><Input name="profilePicture" type="file" accept="image/*" /></Field>
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
  const canManualEdit = role === "Owner" || role === "HR/Admin";
  const attendance = useQuery({ queryKey: ["attendance-today", date], queryFn: () => api.attendanceToday(token, date) });
  const stats = useQuery({ queryKey: ["attendance-stats", date], queryFn: () => api.attendanceStats(token, date) });
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
  const rows = (attendance.data || []).filter((record) => record.employeeName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Present" value={stats.data?.present ?? 0} icon={<CalendarCheck />} />
        <Metric title="Absent" value={stats.data?.absent ?? 0} icon={<Users />} />
        <Metric title="Late" value={stats.data?.late ?? 0} icon={<FileBarChart />} />
      </div>
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black">Daily Attendance</h2>
            <p className="text-sm text-slate-500">Start time: {import.meta.env.VITE_ATTENDANCE_START_TIME || "09:00"} · Manager can check in/out, HR/Admin can manually edit.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2">Employee</th><th>Department</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Total hours</th><th>Actions</th>{canManualEdit && <th>HR edit</th>}</tr>
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
                  <td>{record.totalHours ?? "-"}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" disabled={Boolean(record.checkInTime) || checkIn.isPending} onClick={() => checkIn.mutate(record.employeeId)}>Check-in</Button>
                      <Button variant="secondary" disabled={!record.checkInTime || Boolean(record.checkOutTime) || checkOut.isPending} onClick={() => checkOut.mutate(record.employeeId)}>Check-out</Button>
                    </div>
                  </td>
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
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-slate-500"><tr><th className="py-2">Date</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Total hours</th></tr></thead>
                <tbody>
                  {monthReport.data.records.length ? monthReport.data.records.map((record) => (
                    <tr key={record.id} className="border-t"><td className="py-3">{record.date}</td><td><AttendanceBadge status={record.status} /></td><td>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : "-"}</td><td>{record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "-"}</td><td>{record.totalHours ?? "-"}</td></tr>
                  )) : <tr><td className="py-4 text-slate-500" colSpan={5}>No attendance records for this month.</td></tr>}
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

function Inventory({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => api.products(token) });
  const inventory = useQuery({ queryKey: ["inventory"], queryFn: () => api.inventory(token) });
  const rawMaterials = useQuery({ queryKey: ["raw"], queryFn: () => api.rawMaterials(token) });
  const productCreate = useMutation({ mutationFn: (body: Partial<Product>) => api.createProduct(token, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["inventory"] }); } });
  const stockMove = useMutation({ mutationFn: (body: Record<string, unknown>) => api.moveStock(token, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["inventory"] }); } });
  const rawCreate = useMutation({ mutationFn: (body: Omit<RawMaterial, "id">) => api.createRawMaterial(token, body), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["raw"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); } });
  const firstProduct = products.data?.[0];

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
    </div>
  );
}

function Sales({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => api.products(token) });
  const sales = useQuery({ queryKey: ["sales"], queryFn: () => api.sales(token) });
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const selected = products.data?.find((product) => product.id === productId) || products.data?.[0];
  const createSale = useMutation({ mutationFn: () => api.createSale(token, { customerName: "Walk-in customer", items: [{ productId: selected?.id, quantity }], amountPaid: (selected?.sellingPrice || 0) * quantity, paymentMethod: "Cash" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sales"] }); queryClient.invalidateQueries({ queryKey: ["products"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); } });
  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card>
        <h2 className="text-xl font-black">POS checkout</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Product"><Select value={selected?.id || ""} onChange={(event) => setProductId(event.target.value)}>{products.data?.map((product) => <option key={product.id} value={product.id}>{product.productName} - {currency(product.sellingPrice)}</option>)}</Select></Field>
          <Field label="Quantity"><Input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></Field>
          <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-sm text-emerald-700">Invoice total</p><p className="text-3xl font-black">{currency((selected?.sellingPrice || 0) * quantity)}</p></div>
          <Button disabled={!selected || createSale.isPending} onClick={() => createSale.mutate()}>Generate invoice</Button>
          {createSale.error && <p className="text-sm text-rose-700">{createSale.error.message}</p>}
        </div>
      </Card>
      <Card>
        <h2 className="text-xl font-black">Recent invoices</h2>
        <div className="mt-4 grid gap-3">{sales.data?.map((sale) => <div key={sale.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex justify-between"><b>{sale.invoiceNumber}</b><Badge>{sale.paymentStatus}</Badge></div><p className="mt-2 text-sm text-slate-500">{sale.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ")}</p><p className="mt-2 font-black">{currency(sale.total)}</p></div>)}</div>
      </Card>
    </div>
  );
}

function Production({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const production = useQuery({ queryKey: ["production"], queryFn: () => api.production(token) });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: "Completed" | "In progress" | "Blocked" }) => api.updateProduction(token, id, { status, completedAt: status === "Completed" ? new Date().toISOString() : undefined }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["production"] }) });
  return (
    <Card>
      <h2 className="text-xl font-black">Production workflow</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{production.data?.map((stage) => <div key={stage.id} className="rounded-2xl border border-slate-100 p-4"><Badge>{stage.stage}</Badge><h3 className="mt-3 font-bold">{stage.productName}</h3><p className="mt-1 text-sm text-slate-500">{stage.status}</p><div className="mt-4 flex gap-2"><Button variant="secondary" onClick={() => update.mutate({ id: stage.id, status: "In progress" })}>Start</Button><Button onClick={() => update.mutate({ id: stage.id, status: "Completed" })}>Complete</Button></div></div>)}</div>
    </Card>
  );
}

function Reports({ token }: { token: string }) {
  const reports = useQuery({ queryKey: ["reports"], queryFn: () => api.reports(token) });
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(reports.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "light-garment-reports.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card>
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Reports</h2><p className="text-sm text-slate-500">Employee, attendance, inventory, sales, and profit reports.</p></div><Button onClick={exportJson}>Export JSON</Button></div>
      <pre className="mt-6 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-emerald-100">{JSON.stringify(reports.data, null, 2)}</pre>
    </Card>
  );
}

function SettingsPage({ token }: { token: string }) {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.settings(token) });
  return (
    <Card>
      <h2 className="text-xl font-black">Company settings</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{Object.entries(settings.data || {}).map(([key, value]) => <div key={key} className="rounded-2xl bg-slate-50 p-4"><p className="text-sm capitalize text-slate-500">{key.replace(/([A-Z])/g, " $1")}</p><p className="font-bold">{String(value)}</p></div>)}</div>
    </Card>
  );
}

function Loading() {
  return <Card><p className="animate-pulse text-sm text-slate-500">Loading ERP data...</p></Card>;
}
