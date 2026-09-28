import type { Employee, YearlyBreak, YearlyBreakEligibility } from "./types.js";

export const defaultLeaveSettings = {
  yearlyBreakEntitlementDays: 14,
  yearlyBreakMinMonthsEmployed: 12
};

export function monthsEmployedBy(hireDate: string, asOf = new Date()) {
  const hire = new Date(hireDate);
  return Math.max(0, (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth()));
}

export function datesBetween(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export function inclusiveDayCount(startDate: string, endDate: string) {
  return datesBetween(startDate, endDate).length;
}

export function yearlyBreakDays(startDate: string, endDate: string, entitlementDays: number) {
  if (endDate < startDate) throw new Error("End date must be on or after the start date.");
  const days = inclusiveDayCount(startDate, endDate);
  if (days > entitlementDays) throw new Error(`Yearly break cannot exceed ${entitlementDays} days (selected ${days}).`);
  return days;
}

export function yearlyBreakEligibility(params: {
  employee: Employee;
  year: number;
  existingBreak?: YearlyBreak | null;
  settings?: { yearlyBreakMinMonthsEmployed: number; yearlyBreakEntitlementDays: number };
}): YearlyBreakEligibility {
  const settings = params.settings ?? defaultLeaveSettings;
  const asOf = new Date(params.year, 11, 31);
  const monthsEmployed = monthsEmployedBy(params.employee.hireDate, asOf);

  if (params.employee.archivedAt || params.employee.status !== "Active") {
    return {
      employee: params.employee,
      year: params.year,
      eligible: false,
      reason: "Employee is not active",
      monthsEmployed,
      entitlementDays: settings.yearlyBreakEntitlementDays
    };
  }

  if (params.existingBreak && params.existingBreak.status !== "Cancelled") {
    return {
      employee: params.employee,
      year: params.year,
      eligible: false,
      reason: `Yearly break already ${params.existingBreak.status.toLowerCase()} for ${params.year}`,
      monthsEmployed,
      entitlementDays: settings.yearlyBreakEntitlementDays,
      yearlyBreak: params.existingBreak
    };
  }

  if (monthsEmployed < settings.yearlyBreakMinMonthsEmployed) {
    return {
      employee: params.employee,
      year: params.year,
      eligible: false,
      reason: `Needs at least ${settings.yearlyBreakMinMonthsEmployed} months of employment`,
      monthsEmployed,
      entitlementDays: settings.yearlyBreakEntitlementDays
    };
  }

  return {
    employee: params.employee,
    year: params.year,
    eligible: true,
    monthsEmployed,
    entitlementDays: settings.yearlyBreakEntitlementDays
  };
}
