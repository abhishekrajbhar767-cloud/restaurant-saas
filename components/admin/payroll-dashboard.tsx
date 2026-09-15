'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { loadPayrollData, saveStaffPayroll, type PayrollData } from '@/app/admin/payroll/actions';
import { buildPayrollCsv, downloadCsv } from '@/lib/manager/payroll-csv';
import { StatCard } from '@/components/shared/stat-card';
import type { AttendanceStatus, PayrollSummaryRow, RestaurantStaffRow } from '@/types/database';

const STATUS_TONE: Record<AttendanceStatus, string> = {
  Present: 'bg-success/15 text-success',
  Late: 'bg-amber/15 text-amber',
  'Half-day': 'bg-info/15 text-info',
};

type Preset = { label: string; resolve: (today: string) => { start: string; end: string } };

// All arithmetic here is on the YYYY-MM-DD string in the restaurant's own
// timezone, so a manager in IST never sees the range slide by a day because
// the browser happens to be somewhere else.
function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/**
 * Every active member gets a row, not just the ones who clocked in during
 * the range — otherwise a new hire has nowhere to have their wage set, and
 * somebody who took the month off silently vanishes from payroll.
 */
function mergeRoster(payroll: PayrollSummaryRow[], staff: RestaurantStaffRow[]): PayrollSummaryRow[] {
  const worked = new Set(payroll.map((row) => row.staff_id));
  const idle = staff
    .filter((member) => member.is_active && !worked.has(member.member_id))
    .map<PayrollSummaryRow>((member) => ({
      staff_id: member.member_id,
      display_name: member.display_name,
      email: member.email,
      role: member.role,
      present_days: 0,
      late_days: 0,
      half_days: 0,
      days_worked: 0,
      total_hours: 0,
      orders_handled: 0,
      daily_wage: member.daily_wage,
      monthly_salary: member.monthly_salary,
      effective_daily_rate: member.daily_wage ?? (member.monthly_salary != null ? member.monthly_salary / 30 : 0),
      payable_amount: 0,
    }));

  return [...payroll, ...idle];
}

const PRESETS: Preset[] = [
  { label: 'Today', resolve: (today) => ({ start: today, end: today }) },
  { label: 'Last 7 days', resolve: (today) => ({ start: shiftDay(today, -6), end: today }) },
  { label: 'This month', resolve: (today) => ({ start: monthStart(today), end: today }) },
  {
    label: 'Last month',
    resolve: (today) => {
      const lastMonthEnd = shiftDay(monthStart(today), -1);
      return { start: monthStart(lastMonthEnd), end: lastMonthEnd };
    },
  },
];

export function PayrollDashboard({
  restaurantName,
  currency,
  timeZone,
  today,
  staff,
}: {
  restaurantName: string;
  currency: string;
  timeZone: string;
  today: string;
  staff: RestaurantStaffRow[];
}) {
  const [startDate, setStartDate] = useState(() => monthStart(today));
  const [endDate, setEndDate] = useState(today);
  const [applied, setApplied] = useState(() => ({ start: monthStart(today), end: today }));
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback((start: string, end: string) => {
    startTransition(async () => {
      const result = await loadPayrollData(start, end);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setData(result.data);
      setApplied({ start, end });
    });
  }, []);

  useEffect(() => {
    load(monthStart(today), today);
  }, [load, today]);

  function applyPreset(preset: Preset) {
    const range = preset.resolve(today);
    setStartDate(range.start);
    setEndDate(range.end);
    load(range.start, range.end);
  }

  function handleExport() {
    if (!data) return;
    const csv = buildPayrollCsv({
      restaurantName,
      currency,
      timeZone,
      startDate: applied.start,
      endDate: applied.end,
      attendance: data.attendance,
      payroll: data.payroll,
    });
    downloadCsv(`payroll-${applied.start}-to-${applied.end}.csv`, csv);
  }

  const payroll = data?.payroll ?? [];
  const attendance = data?.attendance ?? [];
  // Totals stay on the real payroll rows — the merged roster only adds
  // zero-value rows so idle staff remain editable.
  const totalPayable = payroll.reduce((sum, row) => sum + Number(row.payable_amount), 0);
  const totalHours = payroll.reduce((sum, row) => sum + Number(row.total_hours), 0);
  const totalDays = payroll.reduce((sum, row) => sum + row.days_worked, 0);
  const money = (value: number) => `${currency} ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="startDate" className="field-label">
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="endDate" className="field-label">
                End date
              </label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={(e) => setEndDate(e.target.value)}
                className="field-input"
              />
            </div>
            <button
              type="button"
              onClick={() => load(startDate, endDate)}
              disabled={isPending}
              className="btn-primary text-sm"
            >
              {isPending ? 'Loading…' : 'Apply'}
            </button>
          </div>

          <button type="button" onClick={handleExport} disabled={!data || isPending} className="btn-secondary text-sm">
            Download CSV
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              disabled={isPending}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-text-muted transition-colors hover:text-text disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <p className="mt-3 text-xs text-text-muted">
          Showing <span className="text-text">{applied.start}</span> to <span className="text-text">{applied.end}</span>{' '}
          · times in {timeZone}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Staff on the clock" value={payroll.length} />
        <StatCard label="Days worked" value={totalDays} />
        <StatCard label="Hours worked" value={totalHours.toFixed(2)} />
        <StatCard label="Total payable" value={money(totalPayable)} accent />
      </div>

      <PayrollTable
        rows={data ? mergeRoster(payroll, staff) : []}
        staff={staff}
        currency={currency}
        busy={isPending}
        onSaved={() => load(applied.start, applied.end)}
      />

      <AttendanceTable rows={attendance} timeZone={timeZone} busy={isPending} />
    </div>
  );
}

function PayrollTable({
  rows,
  staff,
  currency,
  busy,
  onSaved,
}: {
  rows: PayrollData['payroll'];
  staff: RestaurantStaffRow[];
  currency: string;
  busy: boolean;
  onSaved: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="card p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Payroll</h2>
        <p className="text-xs text-text-muted">
          A Late day pays in full — it flags arrival, not effort. A Half-day pays half. Set a daily wage, or a monthly
          salary which is divided by 30 to get the day rate.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">{busy ? 'Loading…' : 'No active staff yet.'}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="pb-2 pr-3 font-medium">Staff</th>
                <th className="pb-2 px-3 font-medium text-right">Present</th>
                <th className="pb-2 px-3 font-medium text-right">Late</th>
                <th className="pb-2 px-3 font-medium text-right">Half</th>
                <th className="pb-2 px-3 font-medium text-right">Hours</th>
                <th className="pb-2 px-3 font-medium text-right">Orders</th>
                <th className="pb-2 px-3 font-medium text-right">Day rate</th>
                <th className="pb-2 px-3 font-medium text-right">Payable</th>
                <th className="pb-2 pl-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const member = staff.find((s) => s.member_id === row.staff_id);
                const editing = editingId === row.staff_id;

                return (
                  <tr key={row.staff_id} className="align-top">
                    <td className="py-3 pr-3">
                      <div className="font-medium">{row.display_name ?? row.email}</div>
                      <div className="text-xs text-text-muted">{row.role}</div>
                      {editing && member && (
                        <TermsEditor
                          member={member}
                          currency={currency}
                          onCancel={() => setEditingId(null)}
                          onSaved={() => {
                            setEditingId(null);
                            onSaved();
                          }}
                        />
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-success">{row.present_days}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-amber">{row.late_days}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-info">{row.half_days}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{Number(row.total_hours).toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{row.orders_handled}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-text-muted">
                      {Number(row.effective_daily_rate) > 0 ? Number(row.effective_daily_rate).toFixed(2) : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold tabular-nums">
                      {Number(row.payable_amount).toFixed(2)}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {!editing && (
                        <button
                          type="button"
                          onClick={() => setEditingId(row.staff_id)}
                          className="text-xs text-amber underline underline-offset-2"
                        >
                          {Number(row.effective_daily_rate) > 0 ? 'Edit terms' : 'Set pay'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TermsEditor({
  member,
  currency,
  onCancel,
  onSaved,
}: {
  member: RestaurantStaffRow;
  currency: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [shiftStartTime, setShiftStartTime] = useState(member.shift_start_time?.slice(0, 5) ?? '');
  const [dailyWage, setDailyWage] = useState(member.daily_wage != null ? String(member.daily_wage) : '');
  const [monthlySalary, setMonthlySalary] = useState(
    member.monthly_salary != null ? String(member.monthly_salary) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveStaffPayroll({
        memberId: member.member_id,
        shiftStartTime,
        dailyWage,
        monthlySalary,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="mt-3 w-64 space-y-2 rounded border border-line bg-ink-950/40 p-3">
      <div>
        <label className="field-label" htmlFor={`shift-${member.member_id}`}>
          Shift starts
        </label>
        <input
          id={`shift-${member.member_id}`}
          type="time"
          value={shiftStartTime}
          onChange={(e) => setShiftStartTime(e.target.value)}
          className="field-input py-1.5 text-xs"
        />
        <p className="mt-1 text-[10px] text-text-muted">Blank means this member is never marked Late.</p>
      </div>
      <div>
        <label className="field-label" htmlFor={`wage-${member.member_id}`}>
          Daily wage ({currency})
        </label>
        <input
          id={`wage-${member.member_id}`}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={dailyWage}
          onChange={(e) => setDailyWage(e.target.value)}
          placeholder="e.g. 700"
          className="field-input py-1.5 text-xs font-mono"
        />
      </div>
      <div>
        <label className="field-label" htmlFor={`salary-${member.member_id}`}>
          Monthly salary ({currency})
        </label>
        <input
          id={`salary-${member.member_id}`}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={monthlySalary}
          onChange={(e) => setMonthlySalary(e.target.value)}
          placeholder="used when no daily wage"
          className="field-input py-1.5 text-xs font-mono"
        />
      </div>

      {error && <p className="text-[11px] text-danger">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleSave} disabled={isPending} className="btn-primary flex-1 py-1.5 text-xs">
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className="btn-secondary py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AttendanceTable({
  rows,
  timeZone,
  busy,
}: {
  rows: PayrollData['attendance'];
  timeZone: string;
  busy: boolean;
}) {
  const time = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
          new Date(value)
        )
      : '—';

  return (
    <section className="card p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Attendance</h2>
        <p className="text-xs text-text-muted">
          One row per person per day. Split shifts are merged: hours add up, the first clock-in decides lateness.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">{busy ? 'Loading…' : 'No attendance in this range.'}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="pb-2 pr-3 font-medium">Staff</th>
                <th className="pb-2 px-3 font-medium">Date</th>
                <th className="pb-2 px-3 font-medium">In</th>
                <th className="pb-2 px-3 font-medium">Out</th>
                <th className="pb-2 px-3 font-medium text-right">Hours</th>
                <th className="pb-2 px-3 font-medium text-right">Orders</th>
                <th className="pb-2 pl-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={`${row.staff_id}-${row.work_date}`}>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{row.display_name ?? row.email}</span>
                    {row.flagged_mock && (
                      <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger">
                        Mock GPS
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs tabular-nums text-text-muted">{row.work_date}</td>
                  <td className="py-2.5 px-3 font-mono text-xs tabular-nums">{time(row.first_clock_in)}</td>
                  <td className="py-2.5 px-3 font-mono text-xs tabular-nums">
                    {row.is_open ? <span className="text-success">on shift</span> : time(row.last_clock_out)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{Number(row.total_hours).toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.orders_handled}</td>
                  <td className="py-2.5 pl-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        STATUS_TONE[row.status]
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
