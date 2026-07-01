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
      .send({ standardHoursPerDay: 8, workingDaysPerMonth: 26, gracePeriodMinutes: 10, overtimeRatePerHour: 100, latePenaltyEnabled: true, latePenaltyAmount: 25, absenceDeductionEnabled: true, taxPercentage: 0, defaultAllowance: 100, defaultBonus: 50 })
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
});
