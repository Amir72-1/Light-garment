import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

async function login() {
  const app = await createApp();
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "owner@lightgarment.example", password: "Password123!" })
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

    const checkIn = await request(app)
      .post(`/api/attendance/${create.body.id}/check-in`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(checkIn.body.employeeName).toBe("Test Tailor");
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
