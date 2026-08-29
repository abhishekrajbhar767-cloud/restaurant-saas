// lib/customer/cart.ts
// Cart lives client-side only (no backend cart table) and is persisted to
// sessionStorage keyed by table so a page refresh mid-order doesn't lose it,
// but it never leaks into a different table's session on the same device.

export interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions: string;
  imageUrl: string | null;
}

export function cartStorageKey(tableId: string): string {
  return `cart:${tableId}`;
}

export function loadCart(tableId: string): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(cartStorageKey(tableId));
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(tableId: string, cart: CartLine[]) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(cartStorageKey(tableId), JSON.stringify(cart));
  } catch {
    // sessionStorage unavailable (private browsing, quota) — cart still works
    // in-memory for the current page life, just won't survive a refresh.
  }
}

export function clearCart(tableId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(cartStorageKey(tableId));
  } catch {
    // see note above
  }
}

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.quantity, 0);
}
