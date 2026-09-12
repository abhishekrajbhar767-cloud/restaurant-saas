'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, History, Package, Plus } from 'lucide-react';
import { formatStock } from '@/lib/inventory/validation';
import { AddStockModal } from './add-stock-modal';
import { CreateItemModal } from './create-item-modal';
import { InventoryHistoryModal } from './inventory-history-modal';
import type { InventoryItem } from '@/types/database';

export function InventoryTable({ items: initialItems, timeZone }: { items: InventoryItem[]; timeZone: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [creating, setCreating] = useState(false);
  const [restocking, setRestocking] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<InventoryItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setItems(initialItems); }, [initialItems]);

  function saved(item: InventoryItem, feedback: string) {
    setItems((previous) => [...previous.filter((row) => row.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)));
    setMessage(feedback);
    setCreating(false);
    setRestocking(null);
    router.refresh();
  }

  const lowCount = items.filter((item) => item.current_stock <= item.min_alert_limit).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{items.length} ingredient{items.length === 1 ? '' : 's'} · {lowCount} low stock</p>
        <button type="button" onClick={() => { setMessage(null); setCreating(true); }} className="btn-primary gap-2">
          <Plus size={18} aria-hidden="true" />New Ingredient
        </button>
      </div>
      {message && <p role="status" className="flex items-start gap-2 rounded border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
        <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />{message}
      </p>}
      <div className="card overflow-hidden">
        {items.length === 0 ? <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Package size={32} className="text-text-muted" aria-hidden="true" />
          <h2 className="font-display font-bold">Start your ingredient list</h2>
          <p className="max-w-sm text-sm text-text-muted">Create a raw ingredient, choose its unit, then add stock as deliveries arrive.</p>
          <button type="button" onClick={() => setCreating(true)} className="btn-secondary">Create your first ingredient</button>
        </div> : <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Raw ingredient stock levels and restock actions</caption>
            <thead className="border-b border-line bg-ink-800 text-xs uppercase tracking-wide text-text-muted">
              <tr>{['Name', 'Unit', 'Current Stock', 'Min Alert Limit', 'Status', 'Actions'].map((label) =>
                <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => {
                const low = item.current_stock <= item.min_alert_limit;
                return <tr key={item.id} className="hover:bg-ink-800/40">
                  <th scope="row" className="min-w-[10rem] break-words px-4 py-4 font-medium">{item.name}</th>
                  <td className="px-4 py-4 text-text-muted">{item.unit}</td>
                  <td className="px-4 py-4 font-mono tabular-nums">{formatStock(item.current_stock)}</td>
                  <td className="px-4 py-4 font-mono tabular-nums text-text-muted">{formatStock(item.min_alert_limit)}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${low ? 'border-amber/30 bg-amber/10 text-amber' : 'border-success/30 bg-success/10 text-success'}`}>
                      {low && <AlertTriangle size={13} aria-hidden="true" />}{low ? 'Low Stock' : 'In Stock'}
                    </span>
                  </td>
                  <td className="px-4 py-4"><div className="flex items-center gap-2 whitespace-nowrap">
                    <button type="button" onClick={() => { setMessage(null); setRestocking(item); }} aria-label={`Add stock for ${item.name}`} className="btn-secondary gap-1.5 px-3 py-2 text-xs">
                      <Plus size={14} aria-hidden="true" />Add Stock
                    </button>
                    <button type="button" onClick={() => setHistory(item)} aria-label={`View stock history for ${item.name}`} title="Stock history" className="rounded p-2 text-text-muted hover:bg-ink-800 hover:text-text">
                      <History size={18} aria-hidden="true" />
                    </button>
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
      </div>
      {creating && <CreateItemModal onClose={() => setCreating(false)} onSaved={saved} />}
      {restocking && <AddStockModal key={restocking.id} item={restocking} onClose={() => setRestocking(null)} onSaved={saved} />}
      {history && <InventoryHistoryModal key={history.id} item={history} timeZone={timeZone} onClose={() => setHistory(null)} />}
    </div>
  );
}
