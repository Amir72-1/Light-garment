import type { AttendanceRecord, Employee, PayrollRecord, PayrollSettings } from "../shared/types.js";

export const defaultPayrollSettings: PayrollSettings = {
  standardHoursPerDay: 8,
  workingDaysPerMonth: 26,
  gracePeriodMinutes: 15,
  overtimeRatePerHour: 120,
  latePenaltyEnabled: true,
  latePenaltyAmount: 50,
  absenceDeductionEnabled: true,
  taxPercentage: 0,
  defaultAllowance: 0,
  defaultBonus: 0
};

export function monthKey(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculatePayrollRecord(params: {
  id: string;
  employee: Employee;
  payrollMonth: number;
  payrollYear: number;
  attendance: AttendanceRecord[];
  settings: PayrollSettings;
  bonus?: number;
  allowance?: number;
  extraDeductions?: number;
  paymentStatus?: PayrollRecord["paymentStatus"];
  paymentDate?: string;
  paymentMethod?: PayrollRecord["paymentMethod"];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}): PayrollRecord {
  const attended = params.attendance.filter((record) => record.status === "Present" || record.status === "Late");
  const presentDays = params.attendance.filter((record) => record.status === "Present").length;
  const lateDays = params.attendance.filter((record) => record.status === "Late").length;
  const absentDays = Math.max(0, params.settings.workingDaysPerMonth - attended.length);
  const overtimeHours = roundMoney(params.attendance.reduce((sum, record) => sum + (record.overtimeHours || 0), 0));
  const overtimePay = roundMoney(overtimeHours * params.settings.overtimeRatePerHour);
  const dailyRate = params.employee.salary / Math.max(1, params.settings.workingDaysPerMonth);
  const absenceDeduction = params.settings.absenceDeductionEnabled ? absentDays * dailyRate : 0;
  const lateDeduction = params.settings.latePenaltyEnabled ? lateDays * params.settings.latePenaltyAmount : 0;
  const bonus = params.bonus ?? params.settings.defaultBonus;
  const allowance = params.allowance ?? params.settings.defaultAllowance;
  const deductions = roundMoney((params.extraDeductions ?? 0) + absenceDeduction + lateDeduction);
  const taxableGross = params.employee.salary + overtimePay + bonus + allowance;
  const tax = roundMoney(taxableGross * ((params.settings.taxPercentage || 0) / 100));
  const payableSalary = roundMoney(taxableGross - deductions - tax);
  const now = new Date().toISOString();

  return {
    id: params.id,
    employeeId: params.employee.id,
    employee: params.employee,
    payrollMonth: params.payrollMonth,
    payrollYear: params.payrollYear,
    basicSalary: params.employee.salary,
    overtimeHours,
    overtimePay,
    bonus,
    allowance,
    deductions,
    tax,
    absentDays,
    lateDays,
    presentDays,
    workingDays: params.settings.workingDaysPerMonth,
    payableSalary,
    paymentStatus: params.paymentStatus ?? "Pending",
    paymentDate: params.paymentDate,
    paymentMethod: params.paymentMethod,
    notes: params.notes,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now
  };
}
