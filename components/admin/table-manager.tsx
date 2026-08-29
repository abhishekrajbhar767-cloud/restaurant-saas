'use client';

import { useRef, useState, useTransition } from 'react';
import { addTable, renameTable, setTableActive } from '@/app/admin/tables/actions';
import { TableQrPanel } from '@/components/admin/table-qr-panel';
import type { RestaurantTable } from '@/types/database';

export function TableManager({ tables, siteUrl, restaurantSlug }: { tables: RestaurantTable[]; siteUrl: string; restaurantSlug: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <AddTableForm onError={setError} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tables.map((table) => (
          <TableCard key={table.id} table={table} siteUrl={siteUrl} restaurantSlug={restaurantSlug} onError={setError} />
        ))}
        {tables.length === 0 && <p className="text-sm text-text-muted">No tables yet — add one above.</p>}
      </div>
    </div>
  );
}

function AddTableForm({ onError }: { onError: (e: string | null) => void }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await addTable(formData);
        formRef.current?.reset();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not add table.');
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2">
      <input name="tableNumber" required placeholder="Table number (e.g. 11)" className="field-input max-w-xs" />
      <button type="submit" disabled={isPending} className="btn-secondary">
        {isPending ? 'Adding…' : '+ Add table'}
      </button>
    </form>
  );
}

function TableCard({
  table,
  siteUrl,
  restaurantSlug,
  onError,
}: {
  table: RestaurantTable;
  siteUrl: string;
  restaurantSlug: string;
  onError: (e: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [numberInput, setNumberInput] = useState(table.table_number);

  function run(action: () => Promise<void>) {
    onError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    });
  }

  const qrUrl = `${siteUrl}/menu/${restaurantSlug}?table=${table.qr_token}`;

  return (
    <div className={`card p-4 ${!table.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await renameTable(table.id, numberInput);
                setRenaming(false);
              });
            }}
            className="flex items-center gap-2"
          >
            <input value={numberInput} onChange={(e) => setNumberInput(e.target.value)} className="field-input w-24" autoFocus />
            <button type="submit" disabled={isPending} className="text-xs underline underline-offset-2 text-amber">
              Save
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="text-xs underline underline-offset-2 text-text-muted">
              Cancel
            </button>
          </form>
        ) : (
          <div className="font-display font-bold text-lg font-mono">Table {table.table_number}</div>
        )}
        <span className={`text-xs uppercase tracking-wide ${table.is_active ? 'text-success' : 'text-text-muted'}`}>
          {table.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {!renaming && (
        <div className="mt-3 flex gap-3 text-xs">
          <button onClick={() => setRenaming(true)} className="underline underline-offset-2 text-text-muted hover:text-text">
            Edit
          </button>
          <button
            onClick={() => run(() => setTableActive(table.id, !table.is_active))}
            disabled={isPending}
            className={`underline underline-offset-2 ${table.is_active ? 'text-danger' : 'text-success'}`}
          >
            {table.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={() => setShowQr((s) => !s)} aria-expanded={showQr} className="underline underline-offset-2 text-amber">
            {showQr ? 'Hide QR' : 'Show QR'}
          </button>
        </div>
      )}

      {showQr && (
        <div className="mt-2 border-t border-line">
          <TableQrPanel tableNumber={table.table_number} url={qrUrl} />
        </div>
      )}
    </div>
  );
}
