'use client';

import { useEffect, useRef, useState } from 'react';
import { applyOrderDiscount, applyOrderItemDiscount, voidOrder, voidOrderItem } from '@/lib/manager/actions';
import {
  VOID_REASONS,
  formatMoney,
  itemsDiscount,
  itemsNet,
  lineGross,
  orderNetTotal,
  validateDiscount,
} from '@/lib/manager/totals';
import type { Order, OrderItem } from '@/types/database';

export type AuditOrder = Order & { items: OrderItem[]; table_number: string };

export function OrderAuditModal({
  order,
  onClose,
  onChanged,
}: {
  order: AuditOrder;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ kind: 'order' } | { kind: 'item'; item: OrderItem } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const isClosed = order.status === 'voided' || order.status === 'cancelled';
  const activeItems = order.items.filter((i) => i.status !== 'voided');
  const netItems = itemsNet(order.items);
  const net = orderNetTotal(order, order.items);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function run(action: () => Promise<{ error: string | null }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: writeError } = await action();
    if (writeError) {
      setError(writeError);
      setBusy(false);
      return;
    }
    await onChanged();
    setBusy(false);
    setVoidTarget(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.order_number} financial actions`}
        className="card flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none sm:rounded-lg"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div>
            <h2 className="font-display text-lg font-bold">
              Order <span className="font-mono">#{order.order_number}</span>
            </h2>
            <p className="text-xs text-text-muted">
              Table {order.table_number} · {order.status}
              {order.void_reason && <span className="text-danger"> · {order.void_reason}</span>}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded px-2 py-1 text-sm text-text-muted hover:text-text disabled:opacity-50"
          >
            Close
          </button>
        </header>

        {error && (
          <p role="alert" className="mx-4 mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:mx-5">
            {error}
          </p>
        )}

        {isClosed && (
          <p className="mx-4 mt-3 rounded border border-line bg-ink-800/60 px-3 py-2 text-xs text-text-muted sm:mx-5">
            This order is {order.status}. Financial actions are locked.
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <ul className="divide-y divide-line">
            {order.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                disabled={busy || isClosed}
                onVoid={() => setVoidTarget({ kind: 'item', item })}
                onDiscount={(amount) => run(() => applyOrderItemDiscount(item.id, amount))}
              />
            ))}
          </ul>

          <div className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
            <Row label="Items" value={formatMoney(order.items.reduce((s, i) => (i.status === 'voided' ? s : s + lineGross(i)), 0))} />
            {itemsDiscount(order.items) > 0 && (
              <Row label="Item discounts" value={`− ${formatMoney(itemsDiscount(order.items))}`} tone="text-amber" />
            )}
            {Number(order.discount_amount) > 0 && (
              <Row label="Order discount" value={`− ${formatMoney(Number(order.discount_amount))}`} tone="text-amber" />
            )}
            <Row label="Net payable" value={formatMoney(net)} bold />
          </div>

          {!isClosed && (
            <div className="mt-5 border-t border-line pt-4">
              <OrderDiscountForm
                current={Number(order.discount_amount)}
                max={netItems}
                disabled={busy}
                onApply={(amount) => run(() => applyOrderDiscount(order.id, amount))}
              />
            </div>
          )}
        </div>

        {!isClosed && (
          <footer className="border-t border-line p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setVoidTarget({ kind: 'order' })}
              disabled={busy || activeItems.length === 0}
              className="w-full rounded border border-danger/50 bg-danger/10 px-4 py-2.5 font-display font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
            >
              Void entire order
            </button>
          </footer>
        )}

        {voidTarget && (
          <VoidReasonPrompt
            title={voidTarget.kind === 'order' ? `Void order #${order.order_number}` : `Void ${voidTarget.item.item_name}`}
            description={
              voidTarget.kind === 'order'
                ? `All ${activeItems.length} remaining ${activeItems.length === 1 ? 'item' : 'items'} will be voided. This cannot be undone.`
                : 'This line will be removed from the bill. This cannot be undone.'
            }
            busy={busy}
            onCancel={() => setVoidTarget(null)}
            onConfirm={(reason) =>
              run(() => (voidTarget.kind === 'order' ? voidOrder(order.id, reason) : voidOrderItem(voidTarget.item.id, reason)))
            }
          />
        )}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  disabled,
  onVoid,
  onDiscount,
}: {
  item: OrderItem;
  disabled: boolean;
  onVoid: () => void;
  onDiscount: (amount: number) => void;
}) {
  const gross = lineGross(item);
  const voided = item.status === 'voided';
  const [value, setValue] = useState(Number(item.discount_amount) > 0 ? String(item.discount_amount) : '');
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    setValue(Number(item.discount_amount) > 0 ? String(item.discount_amount) : '');
    setFieldError(null);
  }, [item.discount_amount]);

  function handleApply() {
    const result = validateDiscount(value, gross);
    if ('error' in result) {
      setFieldError(result.error);
      return;
    }
    setFieldError(null);
    onDiscount(result.amount);
  }

  const dirty = (Number(item.discount_amount) || 0) !== Number(value.trim() === '' ? 0 : value);

  return (
    <li className={`py-3 ${voided ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-medium ${voided ? 'line-through' : ''}`}>
            <span className="font-mono text-amber">{item.quantity}×</span> {item.item_name}
          </p>
          {item.special_instructions && <p className="text-xs italic text-text-muted">&ldquo;{item.special_instructions}&rdquo;</p>}
          {voided && item.void_reason && <p className="text-xs text-danger">Voided — {item.void_reason}</p>}
        </div>
        <div className="shrink-0 text-right">
          <span className={`font-mono text-sm ${voided ? 'line-through text-text-muted' : ''}`}>{formatMoney(gross)}</span>
        </div>
      </div>

      {!voided && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`discount-${item.id}`}>
            Discount for {item.item_name}
          </label>
          <span className="text-xs text-text-muted">Discount ₹</span>
          <input
            id={`discount-${item.id}`}
            type="number"
            min="0"
            max={gross}
            step="0.01"
            inputMode="decimal"
            value={value}
            disabled={disabled}
            onChange={(e) => {
              setValue(e.target.value);
              setFieldError(null);
            }}
            className="field-input w-24 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={disabled || !dirty}
            className="btn-secondary px-2.5 py-1.5 text-xs"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onVoid}
            disabled={disabled}
            className="ml-auto text-xs text-danger underline underline-offset-2 disabled:opacity-50"
          >
            Void item
          </button>
        </div>
      )}

      {fieldError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {fieldError}
        </p>
      )}
    </li>
  );
}

function OrderDiscountForm({
  current,
  max,
  disabled,
  onApply,
}: {
  current: number;
  max: number;
  disabled: boolean;
  onApply: (amount: number) => void;
}) {
  const [value, setValue] = useState(current > 0 ? String(current) : '');
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    setValue(current > 0 ? String(current) : '');
    setFieldError(null);
  }, [current]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateDiscount(value, max);
    if ('error' in result) {
      setFieldError(result.error);
      return;
    }
    setFieldError(null);
    onApply(result.amount);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="order-discount" className="field-label">
        Order-level discount
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-muted">₹</span>
        <input
          id="order-discount"
          type="number"
          min="0"
          max={max}
          step="0.01"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value);
            setFieldError(null);
          }}
          placeholder="0.00"
          className="field-input w-32"
        />
        <button type="submit" disabled={disabled} className="btn-secondary text-sm">
          Apply discount
        </button>
        {current > 0 && (
          <button
            type="button"
            onClick={() => onApply(0)}
            disabled={disabled}
            className="text-xs text-text-muted underline underline-offset-2 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-text-muted">Maximum {formatMoney(max)} — cannot exceed the remaining bill.</p>
      {fieldError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {fieldError}
        </p>
      )}
    </form>
  );
}

function VoidReasonPrompt({
  title,
  description,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [preset, setPreset] = useState<string>(VOID_REASONS[0]);
  const [custom, setCustom] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const usingCustom = preset === '__custom__';
  const reason = usingCustom ? custom.trim() : preset;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason === '') {
      setFieldError('Enter a reason for this void.');
      return;
    }
    setFieldError(null);
    onConfirm(reason);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink-950/80 p-4">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card w-full max-w-sm space-y-3 p-4"
      >
        <div>
          <h3 className="font-display font-bold text-danger">{title}</h3>
          <p className="mt-1 text-xs text-text-muted">{description}</p>
        </div>

        <div>
          <label htmlFor="void-reason" className="field-label">
            Reason
          </label>
          <select
            id="void-reason"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setFieldError(null);
            }}
            className="field-input"
            autoFocus
          >
            {VOID_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="__custom__">Other…</option>
          </select>
        </div>

        {usingCustom && (
          <div>
            <label htmlFor="void-reason-custom" className="sr-only">
              Custom void reason
            </label>
            <input
              id="void-reason-custom"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setFieldError(null);
              }}
              placeholder="Describe what happened"
              className="field-input"
              autoFocus
            />
          </div>
        )}

        {fieldError && (
          <p role="alert" className="text-xs text-danger">
            {fieldError}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded bg-danger px-4 py-2.5 font-display font-medium text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Voiding…' : 'Confirm void'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary disabled:opacity-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-display font-bold' : ''}`}>
      <span className={bold ? '' : 'text-text-muted'}>{label}</span>
      <span className={`font-mono ${tone ?? ''}`}>{value}</span>
    </div>
  );
}
