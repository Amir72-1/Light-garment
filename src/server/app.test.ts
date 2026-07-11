import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

async function login(email = "owner@lightgarment.example") {
  const app = await createApp();
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "Password123!" })
    .expect(200);
  return { app, token: response.body.token as string };
}

describe("Light Garment ERP API", () => {
  it("protects dashboard routes", async () => {
    const app = await createApp();
    await request(app).get("/api/dashboard").expect(401);
  });

  it("logs in and returns dashboard metrics", async () => {
    const { app, token } = await login();
    const response = await request(app).get("/api/dashboard").set("Authorization", `Bearer ${token}`).expect(200);
    expect(response.body.totalEmployees).toBeGreaterThanOrEqual(3);
    expect(response.body.totalInventory).toBeGreaterThan(0);
  });

  it("registers employees with auto-generated IDs and records attendance", async () => {
    const { app, token } = await login();
    const create = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "Test Tailor")
      .field("faydaNumber", "FIN-TEST-0001")
      .field("phoneNumber", "+251900000000")
      .field("address", "Factory floor")
      .field("gender", "Other")
      .field("dateOfBirth", "1999-01-01")
      .field("position", "Tailor")
      .field("department", "Production")
      .field("salary", "12000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .expect(201);

    expect(create.body.employeeCode).toMatch(/^LGM-EMP-/);
    expect(create.body.faydaNumber).toBe("FIN-TEST-0001");

    const checkIn = await request(app)
      .post(`/api/attendance/${create.body.id}/check-in`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(checkIn.body.employeeName).toBe("Test Tailor");
  });

  it("stores employee profile images as durable database data urls", async () => {
    const { app, token } = await login();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const create = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "Photo Employee")
      .field("faydaNumber", "FIN-PHOTO-0001")
      .field("phoneNumber", "+251900000001")
      .field("address", "Photo studio")
      .field("gender", "Other")
      .field("dateOfBirth", "1999-01-01")
      .field("position", "Tailor")
      .field("department", "Production")
      .field("salary", "12000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .attach("profilePicture", png, { filename: "photo.png", contentType: "image/png" })
      .expect(201);

    expect(create.body.profileImageUrl).toMatch(/^data:image\/png;base64,/);

    const fetched = await request(app)
      .get(`/api/employees/${create.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(fetched.body.profileImageUrl).toBe(create.body.profileImageUrl);
  });

  it("stores employee ID images and blocks duplicate Fayda numbers", async () => {
    const { app, token } = await login();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const create = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "ID Scan Employee")
      .field("faydaNumber", "FIN-SCAN-0001")
      .field("phoneNumber", "+251900000002")
      .field("address", "Scan office")
      .field("gender", "Female")
      .field("dateOfBirth", "1995-05-05")
      .field("position", "Clerk")
      .field("department", "Admin")
      .field("salary", "11000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .attach("idDocumentFront", png, { filename: "id-front.png", contentType: "image/png" })
      .attach("idDocumentBack", png, { filename: "id-back.png", contentType: "image/png" })
      .expect(201);

    expect(create.body.idImageUrl).toMatch(/^data:image\/png;base64,/);
    expect(create.body.idImageBackUrl).toMatch(/^data:image\/png;base64,/);

    const check = await request(app)
      .get("/api/employees/check-fayda/FIN-SCAN-0001")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(check.body.available).toBe(false);

    await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "Duplicate Fayda")
      .field("faydaNumber", "FIN-SCAN-0001")
      .field("phoneNumber", "+251900000003")
      .field("address", "Duplicate office")
      .field("gender", "Male")
      .field("dateOfBirth", "1990-01-01")
      .field("position", "Clerk")
      .field("department", "Admin")
      .field("salary", "9000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .expect(409);
  });

  it("lets owner update employee records including NIB bank account number", async () => {
    const { app, token } = await login();
    const create = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "Editable Employee")
      .field("faydaNumber", "FIN-EDIT-0001")
      .field("phoneNumber", "+251900000010")
      .field("address", "Edit office")
      .field("gender", "Female")
      .field("dateOfBirth", "1992-02-02")
      .field("position", "Clerk")
      .field("department", "Admin")
      .field("salary", "12000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .expect(201);

    const update = await request(app)
      .put(`/api/employees/${create.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "Editable Employee Updated")
      .field("bankAccountNumber", "NIB-1234567890")
      .field("phoneNumber", "+251900000010")
      .field("address", "Updated office")
      .field("gender", "Female")
      .field("dateOfBirth", "1992-02-02")
      .field("position", "Senior Clerk")
      .field("department", "Admin")
      .field("salary", "14000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .expect(200);

    expect(update.body.fullName).toBe("Editable Employee Updated");
    expect(update.body.bankAccountNumber).toBe("NIB-1234567890");
    expect(update.body.position).toBe("Senior Clerk");
  });

  it("lets owner add Fayda ID when editing an employee registered without one", async () => {
    const { app, token } = await login();
    const create = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "No Fayda Yet")
      .field("phoneNumber", "+251900000099")
      .field("address", "Late ID office")
      .field("gender", "Male")
      .field("dateOfBirth", "1991-08-08")
      .field("position", "Helper")
      .field("department", "Production")
      .field("salary", "10000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .expect(201);

    expect(create.body.faydaNumber).toBeUndefined();

    const update = await request(app)
      .put(`/api/employees/${create.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "No Fayda Yet")
      .field("faydaNumber", "FIN-LATE-0001")
      .field("phoneNumber", "+251900000099")
      .field("address", "Late ID office")
      .field("gender", "Male")
      .field("dateOfBirth", "1991-08-08")
      .field("position", "Helper")
      .field("department", "Production")
      .field("salary", "10000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .expect(200);

    expect(update.body.faydaNumber).toBe("FIN-LATE-0001");
  });

  it("archives employees instead of permanently deleting them", async () => {
    const { app, token } = await login();
    const create = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "Archive Candidate")
      .field("faydaNumber", "FIN-ARCH-0001")
      .field("phoneNumber", "+251900123123")
      .field("address", "Archive office")
      .field("gender", "Other")
      .field("dateOfBirth", "1998-01-01")
      .field("position", "Clerk")
      .field("department", "Admin")
      .field("salary", "10000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .expect(201);

    await request(app).delete(`/api/employees/${create.body.id}`).set("Authorization", `Bearer ${token}`).expect(204);

    const active = await request(app).get("/api/employees?pageSize=100").set("Authorization", `Bearer ${token}`).expect(200);
    expect(active.body.data.some((item: { id: string }) => item.id === create.body.id)).toBe(false);

    const archived = await request(app).get("/api/employees/archived").set("Authorization", `Bearer ${token}`).expect(200);
    expect(archived.body.some((item: { id: string; archivedAt?: string }) => item.id === create.body.id && item.archivedAt)).toBe(true);
  });

  it("lets owner permanently delete archived employees and reset employee codes", async () => {
    const { app, token } = await login();
    const create = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${token}`)
      .field("fullName", "Permanent Delete Candidate")
      .field("faydaNumber", "FIN-DEL-0001")
      .field("phoneNumber", "+251900222222")
      .field("address", "Delete office")
      .field("gender", "Other")
      .field("dateOfBirth", "1997-01-01")
      .field("position", "Clerk")
      .field("department", "Admin")
      .field("salary", "9000")
      .field("employmentType", "Full-time")
      .field("hireDate", "2026-01-01")
      .field("status", "Active")
      .expect(201);

    await request(app).delete(`/api/employees/${create.body.id}`).set("Authorization", `Bearer ${token}`).expect(204);
    await request(app).delete(`/api/employees/${create.body.id}/permanent`).set("Authorization", `Bearer ${token}`).expect(204);

    const archived = await request(app).get("/api/employees/archived").set("Authorization", `Bearer ${token}`).expect(200);
    expect(archived.body.some((item: { id: string }) => item.id === create.body.id)).toBe(false);

    const reset = await request(app).post("/api/employees/reset-codes").set("Authorization", `Bearer ${token}`).expect(200);
    expect(Array.isArray(reset.body)).toBe(true);
    expect(reset.body.every((item: { employeeCode: string }) => /^LGM-EMP-\d{4}$/.test(item.employeeCode))).toBe(true);
  });

  it("handles attendance check-in, duplicate prevention, checkout, manual status, stats, and monthly report", async () => {
    const { app, token } = await login();
    const employees = await request(app)
      .get("/api/employees?pageSize=10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const employee = employees.body.data.find((item: { fullName: string }) => item.fullName === "Yonas Alemu");
    const absentEmployee = employees.body.data.find((item: { fullName: string }) => item.fullName === "Sara Hailu");
    const date = "2026-06-26";

    const checkIn = await request(app)
      .post("/api/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: employee.id, date, time: "2026-06-26T10:30:00.000Z" })
      .expect(201);

    expect(checkIn.body.status).toBe("Late");

    await request(app)
      .post("/api/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: employee.id, date, time: "2026-06-26T10:45:00.000Z" })
      .expect(409);

    const checkOut = await request(app)
      .post("/api/attendance/check-out")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: employee.id, date, time: "2026-06-26T18:00:00.000Z" })
      .expect(200);

    expect(checkOut.body.totalHours).toBe(7.5);

    await request(app)
      .post("/api/attendance/manual")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: absentEmployee.id, date, status: "Absent" })
      .expect(200);

    const stats = await request(app)
      .get(`/api/attendance/stats?date=${date}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(stats.body.late).toBe(1);
    expect(stats.body.absent).toBeGreaterThanOrEqual(1);

    const month = await request(app)
      .get(`/api/attendance/month/${employee.id}?month=2026-06`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(month.body.records[0].status).toBe("Late");
    expect(month.body.attendancePercentage).toBeGreaterThan(0);
  });

  it("lets owner edit attendance start/end settings and check-in/check-out times", async () => {
    const { app, token } = await login();
    const employees = await request(app)
      .get("/api/employees?pageSize=10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const employee = employees.body.data.find((item: { fullName: string }) => item.fullName === "Miriam Bekele");
    const date = "2026-06-27";

    const settings = await request(app)
      .patch("/api/attendance/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ startTime: "08:00", endTime: "16:30" })
      .expect(200);

    expect(settings.body).toEqual({ startTime: "08:00", endTime: "16:30" });

    const savedSettings = await request(app)
      .get("/api/attendance/settings")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(savedSettings.body).toEqual({ startTime: "08:00", endTime: "16:30" });

    const defaultDate = "2026-01-01";
    await request(app)
      .post("/api/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: employee.id, date: defaultDate, time: "2026-01-01T07:30:00.000Z" })
      .expect(201);

    const defaulted = await request(app)
      .get(`/api/attendance/today?date=${defaultDate}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const defaultedRow = defaulted.body.find((item: { employeeId: string }) => item.employeeId === employee.id);
    expect(defaultedRow.checkOutTime).toBe("2026-01-01T16:30:00.000Z");
    expect(defaultedRow.totalHours).toBe(9);
    expect(defaultedRow.overtimeHours).toBe(0);

    const edited = await request(app)
      .patch("/api/attendance/times")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: employee.id, date, checkInTime: "2026-06-27T07:30:00.000Z", checkOutTime: "2026-06-27T16:30:00.000Z" })
      .expect(200);

    expect(edited.body.status).toBe("Present");
    expect(edited.body.totalHours).toBe(9);

    const today = await request(app)
      .get(`/api/attendance/today?date=${date}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const row = today.body.find((item: { employeeId: string }) => item.employeeId === employee.id);
    expect(row.checkInTime).toBe("2026-06-27T07:30:00.000Z");
    expect(row.checkOutTime).toBe("2026-06-27T16:30:00.000Z");

    const overtime = await request(app)
      .patch("/api/attendance/times")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: employee.id, date, checkInTime: "2026-06-27T07:30:00.000Z", checkOutTime: "2026-06-27T18:00:00.000Z" })
      .expect(200);

    expect(overtime.body.totalHours).toBe(10.5);
    expect(overtime.body.overtimeHours).toBe(1.5);
  });

  it("blocks storekeeper and sales roles from attendance module APIs", async () => {
    const { app, token } = await login("sales@lightgarment.example");
    await request(app).get("/api/attendance/today").set("Authorization", `Bearer ${token}`).expect(403);
  });

  it("generates payroll from attendance and marks salaries paid", async () => {
    const { app, token } = await login();
    const employees = await request(app).get("/api/employees?pageSize=10").set("Authorization", `Bearer ${token}`).expect(200);
    const employee = employees.body.data.find((item: { fullName: string }) => item.fullName === "Yonas Alemu");

    await request(app)
      .patch("/api/payroll/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ standardHoursPerDay: 8, workingDaysPerMonth: 26, gracePeriodMinutes: 10, overtimeRatePerHour: 100, latePenaltyEnabled: true, latePenaltyAmount: 25, absenceDeductionEnabled: true, taxPercentage: 0, defaultAllowance: 100, defaultBonus: 50, yearlyBreakEntitlementDays: 14, yearlyBreakMinMonthsEmployed: 12 })
      .expect(200);

    await request(app)
      .patch("/api/attendance/times")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: employee.id, date: "2026-06-10", checkInTime: "2026-06-10T07:30:00.000Z", checkOutTime: "2026-06-10T18:00:00.000Z" })
      .expect(200);

    const generated = await request(app)
      .post("/api/payroll/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({ month: 6, year: 2026 })
      .expect(201);

    const payroll = generated.body.find((item: { employeeId: string }) => item.employeeId === employee.id);
    expect(payroll.overtimeHours).toBeGreaterThan(0);
    expect(payroll.overtimePay).toBeGreaterThan(0);
    expect(payroll.paymentStatus).toBe("Pending");

    const paid = await request(app)
      .patch(`/api/payroll/${payroll.id}/pay`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentMethod: "Bank transfer" })
      .expect(200);

    expect(paid.body.paymentStatus).toBe("Paid");
    expect(paid.body.paymentMethod).toBe("Bank transfer");

    const dashboard = await request(app)
      .get("/api/payroll/dashboard?month=6&year=2026")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(dashboard.body.totalPayroll).toBeGreaterThan(0);
  });

  it("blocks salesperson from payroll APIs", async () => {
    const { app, token } = await login("sales@lightgarment.example");
    await request(app).get("/api/payroll/dashboard?month=6&year=2026").set("Authorization", `Bearer ${token}`).expect(403);
  });

  it("registers raw materials from the inventory module API", async () => {
    const { app, token } = await login();
    const create = await request(app)
      .post("/api/raw-materials")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Denim Fabric", category: "Fabric", unit: "meter", quantity: 75, reorderLevel: 20, unitCost: 145 })
      .expect(201);

    expect(create.body.name).toBe("Test Denim Fabric");
    expect(create.body.quantity).toBe(75);

    const rows = await request(app).get("/api/raw-materials").set("Authorization", `Bearer ${token}`).expect(200);
    expect(rows.body.some((item: { name: string }) => item.name === "Test Denim Fabric")).toBe(true);
  });

  it("records raw material usage history permanently", async () => {
    const { app, token } = await login();
    const rawRows = await request(app).get("/api/raw-materials").set("Authorization", `Bearer ${token}`).expect(200);
    const raw = rawRows.body[0];

    const used = await request(app)
      .post(`/api/raw-materials/${raw.id}/use`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 5, reference: "CUT-001", note: "Cutting room use" })
      .expect(201);

    expect(used.body.rawMaterialName).toBe(raw.name);
    expect(used.body.type).toBe("Used");

    const history = await request(app).get("/api/raw-materials/history").set("Authorization", `Bearer ${token}`).expect(200);
    expect(history.body.some((item: { id: string }) => item.id === used.body.id)).toBe(true);
  });

  it("lets owner manage users and blocks non-owner user management", async () => {
    const { app, token } = await login();
    const created = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test User", email: "test.user@example.com", password: "Password123!", role: "Salesperson" })
      .expect(201);

    expect(created.body.isActive).toBe(true);

    const suspended = await request(app)
      .patch(`/api/users/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false, password: "Password456!" })
      .expect(200);

    expect(suspended.body.isActive).toBe(false);
    await request(app).delete(`/api/users/${created.body.id}`).set("Authorization", `Bearer ${token}`).expect(204);

    const salesLogin = await login("sales@lightgarment.example");
    await request(salesLogin.app).get("/api/users").set("Authorization", `Bearer ${salesLogin.token}`).expect(403);
  });

  it("creates POS invoices and deducts shirt stock", async () => {
    const { app, token } = await login();
    const products = await request(app).get("/api/products").set("Authorization", `Bearer ${token}`).expect(200);
    const product = products.body[0];

    const sale = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerName: "Walk-in", items: [{ productId: product.id, quantity: 2 }], amountPaid: product.sellingPrice * 2, paymentMethod: "Cash" })
      .expect(201);

    expect(sale.body.invoiceNumber).toMatch(/^INV-/);

    const nextProducts = await request(app).get("/api/products").set("Authorization", `Bearer ${token}`).expect(200);
    const nextProduct = nextProducts.body.find((item: { id: string }) => item.id === product.id);
    expect(nextProduct.quantity).toBe(product.quantity - 2);
  });

  it("creates unpaid POS invoices and marks them paid later", async () => {
    const { app, token } = await login();
    const products = await request(app).get("/api/products").set("Authorization", `Bearer ${token}`).expect(200);
    const product = products.body[0];

    const unpaid = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({ customerName: "Credit customer", items: [{ productId: product.id, quantity: 1 }], amountPaid: 0, paymentMethod: "Cash" })
      .expect(201);

    expect(unpaid.body.paymentStatus).toBe("Pending");
    expect(unpaid.body.amountPaid).toBe(0);

    const paid = await request(app)
      .patch(`/api/sales/${unpaid.body.id}/pay`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amountPaid: unpaid.body.total, paymentMethod: "Mobile money" })
      .expect(200);

    expect(paid.body.paymentStatus).toBe("Paid");
    expect(paid.body.amountPaid).toBe(unpaid.body.total);
    expect(paid.body.paymentMethod).toBe("Mobile money");
  });

  it("lets the owner increase salary and keeps salary history", async () => {
    const { app, token } = await login();
    const employees = await request(app).get("/api/employees?pageSize=10").set("Authorization", `Bearer ${token}`).expect(200);
    const employee = employees.body.data[0];

    const increased = await request(app)
      .post(`/api/employees/${employee.id}/salary-increase`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newSalary: employee.salary + 1500, reason: "Annual raise" })
      .expect(200);

    expect(increased.body.employee.salary).toBe(employee.salary + 1500);
    expect(increased.body.history.previousSalary).toBe(employee.salary);
    expect(increased.body.history.newSalary).toBe(employee.salary + 1500);
    expect(increased.body.history.reason).toBe("Annual raise");

    const history = await request(app)
      .get(`/api/employees/${employee.id}/salary-history`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(history.body.some((entry: { newSalary: number; reason: string }) => entry.newSalary === employee.salary + 1500 && entry.reason === "Annual raise")).toBe(true);

    await request(app)
      .post(`/api/employees/${employee.id}/salary-increase`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newSalary: employee.salary })
      .expect(400);
  });

  it("lists yearly break eligibility and registers leave for eligible employees", async () => {
    const { app, token } = await login();
    const year = 2026;

    const eligibility = await request(app)
      .get(`/api/yearly-breaks/eligibility?year=${year}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(eligibility.body.length).toBeGreaterThan(0);
    const eligible = eligibility.body.find((row: { eligible: boolean }) => row.eligible);
    expect(eligible).toBeTruthy();

    const ineligible = eligibility.body.find((row: { employee: { hireDate: string }; eligible: boolean }) => row.employee.hireDate === "2023-05-20");
    expect(ineligible?.eligible).toBe(true);

    const registered = await request(app)
      .post(`/api/employees/${eligible.employee.id}/yearly-break`)
      .set("Authorization", `Bearer ${token}`)
      .send({ year, startDate: "2026-07-01", endDate: "2026-07-07", notes: "Annual leave" })
      .expect(201);

    expect(registered.body.status).toBe("Scheduled");
    expect(registered.body.days).toBe(7);

    const breaks = await request(app)
      .get(`/api/employees/${eligible.employee.id}/yearly-breaks`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(breaks.body.some((item: { year: number }) => item.year === year)).toBe(true);

    const attendance = await request(app)
      .get("/api/attendance?date=2026-07-03")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(attendance.body.some((record: { employeeId: string; status: string }) => record.employeeId === eligible.employee.id && record.status === "On leave")).toBe(true);
  });

  it("lets any user update language and calendar preferences", async () => {
    const { app, token } = await login("sales@lightgarment.example");

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: "sales@lightgarment.example", password: "Password123!" })
      .expect(200);

    expect(loginResponse.body.user.locale).toBe("en");
    expect(loginResponse.body.user.calendar).toBe("gregorian");

    const updated = await request(app)
      .patch("/api/users/me/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ locale: "am", calendar: "ethiopian" })
      .expect(200);

    expect(updated.body).toEqual({ locale: "am", calendar: "ethiopian" });

    const saved = await request(app)
      .get("/api/users/me/preferences")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(saved.body).toEqual({ locale: "am", calendar: "ethiopian" });
  });
});

describe("Bundle inventory API", () => {
  it("registers bundles with unique QR codes and supports scan, move, and split", async () => {
    const { app, token } = await login();
    const metadata = await request(app).get("/api/bundles/metadata").set("Authorization", `Bearer ${token}`).expect(200);
    const warehouseId = metadata.body.warehouses[0].id as string;

    const registered = await request(app)
      .post("/api/bundles/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Men's Polo Shirt",
        style: "Classic fit",
        fabric: "Cotton",
        color: "Blue",
        size: "L",
        bundleQuantity: 2,
        piecesPerBundle: 25,
        unitCost: 120,
        sellingPrice: 250,
        warehouseId
      })
      .expect(201);

    expect(registered.body).toHaveLength(2);
    expect(registered.body[0].qrCodeNumber).not.toBe(registered.body[1].qrCodeNumber);
    expect(registered.body[0].qrImageUrl).toMatch(/^data:image\/png;base64,/);
    expect(registered.body[0].remainingPieces).toBe(25);

    const scanned = await request(app)
      .post("/api/bundles/scan")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: registered.body[0].qrPayload })
      .expect(200);

    expect(scanned.body.bundleNumber).toBe(registered.body[0].bundleNumber);
    expect(scanned.body.productName).toBe("Men's Polo Shirt");

    const locations = await request(app)
      .get(`/api/bundles/locations?warehouseId=${warehouseId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const moveOk = await request(app)
      .post("/api/bundles/move")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bundleId: registered.body[0].id,
        quantity: 7,
        toWarehouseId: warehouseId,
        toLocationId: locations.body[0]?.id,
        type: "Transfer",
        reason: "Shelf transfer",
        expectedVersion: registered.body[0].version
      })
      .expect(201);

    expect(moveOk.body.source.remainingPieces).toBe(18);
    expect(moveOk.body.destination.remainingPieces).toBe(7);
    expect(JSON.parse(moveOk.body.source.qrPayload).quantity).toBe(18);

    const overMove = await request(app)
      .post("/api/bundles/move")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bundleId: registered.body[0].id,
        quantity: 999,
        toWarehouseId: warehouseId,
        type: "Transfer"
      })
      .expect(409);

    expect(overMove.body.message).toMatch(/Cannot move|Only/);

    const saleMove = await request(app)
      .post("/api/bundles/move")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bundleId: registered.body[1].id,
        quantity: 5,
        type: "Sale",
        reason: "Customer order",
        expectedVersion: registered.body[1].version
      })
      .expect(201);

    expect(saleMove.body.source.remainingPieces).toBe(registered.body[1].remainingPieces - 5);

    const search = await request(app)
      .get("/api/bundles/search?q=Polo")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(search.body.length).toBeGreaterThanOrEqual(2);

    const transactions = await request(app)
      .get("/api/bundles/transactions")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(transactions.body.length).toBeGreaterThan(0);

    const reprint = await request(app)
      .post(`/api/bundles/${registered.body[1].id}/reprint`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(reprint.body.id).toBe(registered.body[1].id);
  });

  it("syncs offline bundle operations", async () => {
    const { app, token } = await login();
    const metadata = await request(app).get("/api/bundles/metadata").set("Authorization", `Bearer ${token}`).expect(200);
    const warehouseId = metadata.body.warehouses[0].id as string;
    const clientId = `offline_test_${Date.now()}`;

    const synced = await request(app)
      .post("/api/bundles/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        operations: [
          {
            clientId,
            type: "register_bundle",
            clientTimestamp: new Date().toISOString(),
            payload: {
              productName: "Offline Shirt",
              style: "Slim",
              color: "Black",
              size: "M",
              bundleQuantity: 1,
              piecesPerBundle: 10,
              unitCost: 90,
              sellingPrice: 180,
              warehouseId
            }
          }
        ]
      })
      .expect(200);

    expect(synced.body[0].success).toBe(true);
    expect(synced.body[0].data).toHaveLength(1);
  });

  it("registers multiple color/size variants with color codes and deletes bundles", async () => {
    const { app, token } = await login();
    const metadata = await request(app).get("/api/bundles/metadata").set("Authorization", `Bearer ${token}`).expect(200);
    const warehouseId = metadata.body.warehouses[0].id as string;

    const registered = await request(app)
      .post("/api/bundles/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Mixed Bundle Shirt",
        style: "Relaxed",
        variants: [
          { color: "Blue", colorCode: "BLU", size: "L", bundleQuantity: 1, piecesPerBundle: 20 },
          { color: "Red", colorCode: "RED", size: "M", bundleQuantity: 1, piecesPerBundle: 15 }
        ],
        unitCost: 100,
        sellingPrice: 220,
        warehouseId
      })
      .expect(201);

    expect(registered.body).toHaveLength(2);
    expect(registered.body[0].colorCode).toBe("BLU");
    expect(registered.body[1].colorCode).toBe("RED");

    const createdColor = await request(app)
      .post("/api/bundles/colors")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Navy", code: "NVY" })
      .expect(201);

    expect(createdColor.body.code).toBe("NVY");

    await request(app)
      .delete(`/api/bundles/${registered.body[0].id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const remaining = await request(app)
      .get("/api/bundles")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(remaining.body.some((bundle: { id: string }) => bundle.id === registered.body[0].id)).toBe(false);
    expect(remaining.body.some((bundle: { id: string }) => bundle.id === registered.body[1].id)).toBe(true);
  });
});
