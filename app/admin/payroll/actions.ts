'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { AttendanceReportRow, PayrollSummaryRow } from '@/types/database';

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.');

const RangeSchema = z
  .object({ startDate: DAY, endDate: DAY })
  .refine((range) => range.endDate >= range.startDate, {
    message: 'The end date cannot be before the start date.',
  });

async function requireTenant() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) throw new Error('No restaurant membership found.');
  return restaurantId;
}

export type PayrollData = {
  attendance: AttendanceReportRow[];
  payroll: PayrollSummaryRow[];
};

/**
 * Both halves of the report for one date range. They are fetched together so
 * the totals on screen can never be drawn from a different window than the
 * rows beneath them.
 */
export async function loadPayrollData(
  startDate: string,
  endDate: string
): Promise<{ data: PayrollData | null; error: string | null }> {
  const restaurantId = await requireTenant();

  const parsed = RangeSchema.safeParse({ startDate, endDate });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? 'That date range is not valid.' };
  }

  const supabase = createClient();
  const args = {
    p_restaurant_id: restaurantId,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
  };

  const [attendance, payroll] = await Promise.all([
    supabase.rpc('get_attendance_report', args),
    supabase.rpc('get_payroll_summary', args),
  ]);

  if (attendance.error) return { data: null, error: attendance.error.message || 'Could not load attendance.' };
  if (payroll.error) return { data: null, error: payroll.error.message || 'Could not load payroll.' };

  return {
    data: { attendance: attendance.data ?? [], payroll: payroll.data ?? [] },
    error: null,
  };
}

const TERMS = z.object({
  memberId: z.string().uuid(),
  // '' clears the term rather than meaning zero — an unpaid role and a
  // ₹0/day role are different things.
  shiftStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 09:30.')
    .or(z.literal('')),
  dailyWage: z.coerce.number().min(0, 'A wage cannot be negative.').or(z.literal('')),
  monthlySalary: z.coerce.number().min(0, 'A salary cannot be negative.').or(z.literal('')),
});

export type StaffPayrollTerms = {
  memberId: string;
  shiftStartTime: string;
  dailyWage: string;
  monthlySalary: string;
};

export async function saveStaffPayroll(terms: StaffPayrollTerms): Promise<{ error: string | null }> {
  await requireTenant();

  const parsed = TERMS.safeParse(terms);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Those payroll terms are not valid.' };

  const supabase = createClient();
  // set_staff_payroll re-derives the restaurant from the member row and
  // re-checks owner/manager there, so a tampered memberId cannot reach
  // another tenant's staff.
  const { error } = await supabase.rpc('set_staff_payroll', {
    p_member_id: parsed.data.memberId,
    p_shift_start_time: parsed.data.shiftStartTime === '' ? null : parsed.data.shiftStartTime,
    p_daily_wage: parsed.data.dailyWage === '' ? null : Number(parsed.data.dailyWage),
    p_monthly_salary: parsed.data.monthlySalary === '' ? null : Number(parsed.data.monthlySalary),
  });

  if (error) return { error: error.message || 'Could not save those payroll terms.' };

  revalidatePath('/admin/payroll');
  return { error: null };
}
