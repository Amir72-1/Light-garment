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

  it("blocks storekeeper and sales roles from attendance module APIs", async () => {
    const { app, token } = await login("sales@lightgarment.example");
    await request(app).get("/api/attendance/today").set("Authorization", `Bearer ${token}`).expect(403);
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
});
