/**
 * pricing.ts — Pure pricing functions, exact port of pizzaflow_core.py.
 * No imports. No side effects. Safe to use client or server side.
 */
import type { MenuItem } from "./menu";

// ── Constants (source: pizzaflow_core.py) ────────────────────────────────────
export const LINE_QTY_MIN      = 0;
export const TOTAL_QTY_MIN     = 1;
export const TOPPING_QTY_MAX   = 5;
export const NAME_MIN           = 2;
export const NAME_MAX           = 40;
export const PHONE_LEN          = 10;
export const PHONE_VALID_START  = ["6","7","8","9"];

export interface StoreSettings {
  gstRate: number;
  discountThreshold: number;
  discountRate: number;
  maxQty: number;
}

export const DEFAULT_SETTINGS: StoreSettings = {
  gstRate: 0.18,
  discountThreshold: 5,
  discountRate: 0.10,
  maxQty: 10
};

// ── Domain types ─────────────────────────────────────────────────────────────
export interface ToppingEntry { topping: MenuItem; qty: number }
export interface CartRow      { pizza: MenuItem; base: MenuItem; quantity: number; toppings: ToppingEntry[] }
export interface PricedLine extends CartRow { unitPrice: number; lineSubtotal: number }

export interface BillResult {
  lines:           PricedLine[];
  totalQty:        number;
  subtotal:        number;
  discountApplied: boolean;
  discount:        number;
  postDiscount:    number;
  gst:             number;
  finalTotal:      number;
}

// ── Validation ───────────────────────────────────────────────────────────────
export function validateName(raw: string): string | null {
  const v = raw?.trim() ?? "";
  if (!v)                            return "Name cannot be empty.";
  if (!/^[A-Za-z ]+$/.test(v))      return "Name must contain only letters and spaces.";
  if (v.length < NAME_MIN)           return `Name must be at least ${NAME_MIN} characters.`;
  if (v.length > NAME_MAX)           return `Name must be at most ${NAME_MAX} characters.`;
  return null;
}

export function validatePhone(raw: string): string | null {
  const v = raw?.trim() ?? "";
  if (!v)                            return "Phone cannot be empty.";
  if (!/^\d+$/.test(v))             return "Phone must contain only digits.";
  if (v.length !== PHONE_LEN)        return `Phone must be exactly ${PHONE_LEN} digits (got ${v.length}).`;
  if (!PHONE_VALID_START.includes(v[0])) return "Phone must start with 6, 7, 8 or 9.";
  return null;
}

export function validateTotalQty(qty: number, maxQty: number = DEFAULT_SETTINGS.maxQty): string | null {
  if (qty < TOTAL_QTY_MIN) return "Cart is empty — add at least 1 pizza.";
  if (qty > maxQty) return `Max ${maxQty} pizzas per order (you have ${qty}).`;
  return null;
}

export function validatePayment(method: string): string | null {
  if (!["Cash","Card","UPI"].includes(method)) return "Choose Cash, Card or UPI.";
  return null;
}

// ── Pricing helpers ──────────────────────────────────────────────────────────
function r2(n: number) { return Math.round(n * 100) / 100; }

export function priceLine(row: CartRow): PricedLine {
  const toppingCost = row.toppings.reduce((s, t) => s + t.topping.price * t.qty, 0);
  const unitPrice   = r2(row.pizza.price + row.base.price + toppingCost);
  const lineSubtotal = r2(unitPrice * row.quantity);
  return { ...row, unitPrice, lineSubtotal };
}

export function buildBill(rows: CartRow[], settings: StoreSettings = DEFAULT_SETTINGS): BillResult {
  const active   = rows.filter(r => r.quantity > 0).map(priceLine);
  const totalQty = active.reduce((s, l) => s + l.quantity, 0);
  const subtotal = r2(active.reduce((s, l) => s + l.lineSubtotal, 0));

  const discountApplied = totalQty >= settings.discountThreshold;
  const discount    = discountApplied ? r2(subtotal * settings.discountRate) : 0;
  const postDiscount = r2(subtotal - discount);
  const gst          = r2(postDiscount * settings.gstRate);
  const finalTotal   = r2(postDiscount + gst);

  return { lines: active, totalQty, subtotal, discountApplied, discount, postDiscount, gst, finalTotal };
}

export function paymentMessage(method: string, total: number): string {
  if (method === "Cash") return `Cash selected. Keep ₹${total.toFixed(2)} ready — rider will collect.`;
  if (method === "Card") return `Card selected. ₹${total.toFixed(2)} charged on delivery.`;
  return `UPI selected. Scan QR at delivery to pay ₹${total.toFixed(2)}.`;
}
