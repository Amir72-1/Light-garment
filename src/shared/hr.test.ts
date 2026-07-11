import { describe, expect, it } from "vitest";
import type { Employee } from "./types.js";
import { datesBetween, inclusiveDayCount, monthsEmployedBy, yearlyBreakEligibility } from "./hr.js";

const baseEmployee: Employee = {
  id: "emp-1",
  employeeCode: "LGM-EMP-0001",
  fullName: "Test Worker",
  phoneNumber: "+251900000000",
  address: "Addis Ababa",
  gender: "Other",
  dateOfBirth: "1995-01-01",
  position: "Tailor",
  department: "Production",
  salary: 10000,
  employmentType: "Full-time",
  hireDate: "2021-04-01",
  status: "Active"
};

describe("HR helpers", () => {
  it("counts months employed as of a given year end", () => {
    expect(monthsEmployedBy("2021-04-01", new Date("2026-12-31"))).toBe(68);
  });

  it("lists inclusive dates between start and end", () => {
    expect(datesBetween("2026-07-01", "2026-07-03")).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(inclusiveDayCount("2026-07-01", "2026-07-03")).toBe(3);
  });

  it("marks long-serving active employees as eligible for yearly break", () => {
    const result = yearlyBreakEligibility({ employee: baseEmployee, year: 2026 });
    expect(result.eligible).toBe(true);
    expect(result.monthsEmployed).toBeGreaterThanOrEqual(12);
  });

  it("rejects employees who have not worked long enough", () => {
    const result = yearlyBreakEligibility({
      employee: { ...baseEmployee, hireDate: "2026-01-01" },
      year: 2026
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/12 months/);
  });

  it("rejects employees with an existing break for the year", () => {
    const result = yearlyBreakEligibility({
      employee: baseEmployee,
      year: 2026,
      existingBreak: {
        id: "brk-1",
        employeeId: baseEmployee.id,
        year: 2026,
        startDate: "2026-07-01",
        endDate: "2026-07-14",
        days: 14,
        status: "Scheduled",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z"
      }
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/already scheduled/i);
  });
});
