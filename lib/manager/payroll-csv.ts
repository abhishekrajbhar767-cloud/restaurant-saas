// lib/manager/payroll-csv.ts
//
// One file covering both halves of the report, because a manager filing a
// month needs the per-day evidence sitting next to the figure they paid on.
// Sections are separated by a blank line — the layout accounting teams
// already expect from a payroll export.

import type { AttendanceReportRow, PayrollSummaryRow } from '@/types/database';

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Quote anything that would otherwise break the row apart, and double up
  // embedded quotes per RFC 4180.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(values: (string | number | null | undefined)[]): string {
  return values.map(cell).join(',');
}

function localTime(value: string | null, timeZone: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function buildPayrollCsv({
  restaurantName,
  currency,
  timeZone,
  startDate,
  endDate,
  attendance,
  payroll,
}: {
  restaurantName: string;
  currency: string;
  timeZone: string;
  startDate: string;
  endDate: string;
  attendance: AttendanceReportRow[];
  payroll: PayrollSummaryRow[];
}): string {
  const lines: string[] = [];

  lines.push(row(['Payroll & Attendance Report']));
  lines.push(row(['Restaurant', restaurantName]));
  lines.push(row(['Period', `${startDate} to ${endDate}`]));
  lines.push(row(['Currency', currency]));
  lines.push(row(['Generated', new Date().toISOString()]));
  lines.push('');

  lines.push(row(['PAYROLL SUMMARY']));
  lines.push(
    row([
      'Staff',
      'Role',
      'Present Days',
      'Late Days',
      'Half Days',
      'Days Worked',
      'Total Hours',
      'Orders Handled',
      `Daily Rate (${currency})`,
      `Payable (${currency})`,
    ])
  );
  for (const line of payroll) {
    lines.push(
      row([
        line.display_name ?? line.email,
        line.role,
        line.present_days,
        line.late_days,
        line.half_days,
        line.days_worked,
        line.total_hours,
        line.orders_handled,
        Number(line.effective_daily_rate).toFixed(2),
        Number(line.payable_amount).toFixed(2),
      ])
    );
  }
  const totalPayable = payroll.reduce((sum, line) => sum + Number(line.payable_amount), 0);
  lines.push(row(['Total', '', '', '', '', '', '', '', '', totalPayable.toFixed(2)]));
  lines.push('');

  lines.push(row(['ATTENDANCE DETAIL']));
  lines.push(
    row(['Staff', 'Role', 'Date', 'Clock In', 'Clock Out', 'Hours', 'Status', 'Orders Handled', 'Flags'])
  );
  for (const entry of attendance) {
    const flags = [entry.is_open ? 'Still on shift' : '', entry.flagged_mock ? 'Mock location attempt' : '']
      .filter(Boolean)
      .join('; ');
    lines.push(
      row([
        entry.display_name ?? entry.email,
        entry.role,
        entry.work_date,
        localTime(entry.first_clock_in, timeZone),
        localTime(entry.last_clock_out, timeZone),
        entry.total_hours,
        entry.status,
        entry.orders_handled,
        flags,
      ])
    );
  }

  return lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM is what makes Excel read this as UTF-8 instead of mangling any
  // non-ASCII staff name.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
