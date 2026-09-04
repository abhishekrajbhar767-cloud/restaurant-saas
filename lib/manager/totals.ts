// lib/manager/totals.ts
//
// Mirrors public.order_net_total() from 0020_manager_financials.sql. The
// database stays the source of truth for what gets written; this exists so
// the manager UI can show a running total without a round trip per keystroke.
// Voided lines contribute nothing, and a bill can never go below zero.

import type { Order, OrderItem } from '@/types/database';

export const VOID_REASONS = [
  'Customer changed mind',
  'Kitchen error',
  'Spilt order',
  'Wrong item served',
  'Long wait / comped',
] as const;

export function lineGross(item: OrderItem): number {
  return Number(item.unit_price) * item.quantity;
}

export function lineNet(item: OrderItem): number {
  if (item.status === 'voided') return 0;
  return Math.max(lineGross(item) - Number(item.discount_amount), 0);
}

export function itemsNet(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + lineNet(item), 0);
}

export function itemsDiscount(items: OrderItem[]): number {
  return items.reduce((sum, item) => (item.status === 'voided' ? sum : sum + Number(item.discount_amount)), 0);
}

export function orderNetTotal(order: Order, items: OrderItem[]): number {
  return Math.max(itemsNet(items) - Number(order.discount_amount), 0);
}

export function formatMoney(value: number): string {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Shared by both discount inputs so the client rejects the same things the
// RPC does, and the manager sees why before a round trip.
export function validateDiscount(raw: string, max: number): { amount: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { amount: 0 };

  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return { error: 'Enter a number.' };
  if (amount < 0) return { error: 'Discount cannot be negative.' };
  if (Math.round(amount * 100) / 100 > Math.round(max * 100) / 100) {
    return { error: `Cannot exceed ${formatMoney(max)}.` };
  }
  return { amount: Math.round(amount * 100) / 100 };
}
