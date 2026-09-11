'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { addStaff, setStaffActive, setStaffPermission } from '@/app/admin/staff/actions';
import { ROLE_LABEL } from '@/lib/auth/roles';
import type { RestaurantStaffRow, MemberRole, WaiterAvailability } from '@/types/database';

type StaffPermission = 'can_take_orders' | 'can_handle_billing';

const AVAILABILITY_STYLE: Record<WaiterAvailability, string> = {
  free: 'bg-success/10 text-success',
  busy: 'bg-danger/10 text-danger',
  offline: 'bg-text-muted/10 text-text-muted',
};

export function StaffManager({ staff, actingRole }: { staff: RestaurantStaffRow[]; actingRole: MemberRole }) {
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const canAddManagers = actingRole === 'owner';

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <AddStaffForm canAddManagers={canAddManagers} onError={setError} />

      <div className="card divide-y divide-line">
        {staff.map((member) => (
          <StaffRow
            key={member.member_id}
            member={member}
            actingRole={actingRole}
            onError={setError}
            onToast={setToast}
          />
        ))}
        {staff.length === 0 && <p className="p-4 text-sm text-text-muted">No staff yet.</p>}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-paper px-4 py-2 text-sm font-medium text-text-onPaper shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function AddStaffForm({ canAddManagers, onError }: { canAddManagers: boolean; onError: (e: string | null) => void }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await addStaff(formData);
        formRef.current?.reset();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not add staff member.');
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card p-4 grid sm:grid-cols-5 gap-3 items-end">
      <div className="sm:col-span-1">
        <label htmlFor="staff-name" className="field-label">
          Name
        </label>
        <input id="staff-name" name="name" required className="field-input" />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="staff-email" className="field-label">
          Email
        </label>
        <input id="staff-email" name="email" type="email" required className="field-input" />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="staff-phone" className="field-label">
          Phone (optional)
        </label>
        <input id="staff-phone" name="phone" type="tel" className="field-input" />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="staff-password" className="field-label">
          Password
        </label>
        <input
          id="staff-password"
          name="password"
          type="text"
          required
          minLength={6}
          autoComplete="new-password"
          className="field-input font-mono"
          placeholder="min 6 characters"
        />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="staff-role" className="field-label">
          Role
        </label>
        <select id="staff-role" name="role" defaultValue="waiter" className="field-input">
          {canAddManagers && <option value="manager">Manager</option>}
          <option value="kitchen">Kitchen</option>
          <option value="waiter">Waiter</option>
        </select>
      </div>
      <button type="submit" disabled={isPending} className="btn-primary sm:col-span-5 w-fit">
        {isPending ? 'Creating account…' : '+ Create staff member'}
      </button>
    </form>
  );
}

function StaffRow({
  member,
  actingRole,
  onError,
  onToast,
}: {
  member: RestaurantStaffRow;
  actingRole: MemberRole;
  onError: (e: string | null) => void;
  onToast: (m: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const canToggle = actingRole === 'owner' || (actingRole === 'manager' && (member.role === 'kitchen' || member.role === 'waiter'));

  function toggle() {
    onError(null);
    startTransition(async () => {
      try {
        await setStaffActive(member.member_id, !member.is_active);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not update staff member.');
      }
    });
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{member.display_name ?? member.email}</div>
          <div className="text-xs text-text-muted truncate">{member.email}</div>
        </div>

        <div className="text-xs uppercase tracking-wide text-amber shrink-0">{ROLE_LABEL[member.role]}</div>

        {member.role === 'waiter' && member.availability && (
          <span className={`text-xs rounded-sm px-2 py-0.5 shrink-0 ${AVAILABILITY_STYLE[member.availability]}`}>{member.availability}</span>
        )}

        <span className={`text-xs shrink-0 ${member.is_active ? 'text-success' : 'text-text-muted'}`}>{member.is_active ? 'Active' : 'Inactive'}</span>

        {canToggle && (
          <button
            onClick={toggle}
            disabled={isPending}
            className={`text-xs underline underline-offset-2 shrink-0 ${member.is_active ? 'text-danger' : 'text-success'}`}
          >
            {member.is_active ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <PermissionToggle
          memberId={member.member_id}
          permission="can_take_orders"
          label="Can Take Orders & Serve"
          initial={member.can_take_orders}
          disabled={!canToggle}
          onError={onError}
          onToast={onToast}
        />
        <PermissionToggle
          memberId={member.member_id}
          permission="can_handle_billing"
          label="Can Handle Billing & Counter"
          initial={member.can_handle_billing}
          disabled={!canToggle}
          onError={onError}
          onToast={onToast}
        />
      </div>
    </div>
  );
}

function PermissionToggle({
  memberId,
  permission,
  label,
  initial,
  disabled,
  onError,
  onToast,
}: {
  memberId: string;
  permission: StaffPermission;
  label: string;
  initial: boolean;
  disabled: boolean;
  onError: (e: string | null) => void;
  onToast: (m: string) => void;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function handleToggle() {
    if (busy || disabled) return;

    const next = !on;
    const previous = on;

    onError(null);
    setBusy(true);
    setOn(next);

    startTransition(async () => {
      const { error } = await setStaffPermission(memberId, permission, next);
      setBusy(false);
      if (error) {
        setOn(previous);
        onError(error);
      } else {
        onToast(`${label} ${next ? 'enabled' : 'disabled'}.`);
      }
    });
  }

  return (
    <div className={`flex items-center justify-between gap-3 rounded border border-line px-3 py-2 ${busy ? 'opacity-60' : ''}`}>
      <span className="text-xs font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={busy || disabled}
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:pointer-events-none disabled:opacity-50 ${
          on ? 'border-success/60 bg-success/70' : 'border-line bg-ink-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-paper transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`}
          aria-hidden
        />
      </button>
    </div>
  );
}
