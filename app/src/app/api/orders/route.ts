/**
 * POST /api/orders — Persist an order to Supabase.
 * Server-side only. Gracefully handles missing tables.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const { name, phone, address, payment, bill } = await req.json();

    if (!name || !phone || !address || !payment || !bill?.lines?.length) {
      return NextResponse.json({ error: "Invalid order payload (missing address?)" }, { status: 400 });
    }

    // Insert order header
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_name:    name,
        phone,
        delivery_address: address,
        payment_method:   payment,
        subtotal:         bill.subtotal,
        discount_applied: bill.discount,
        gst:              bill.gst,
        total_amount:     bill.finalTotal,
        status:           "Preparing",
      })
      .select("id")
      .single();

    if (orderErr) {
      console.error("[orders] insert error:", orderErr.message);
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }

    // Insert line items
    const items = bill.lines.map((l: any) => ({
      order_id:      order.id,
      pizza_name:    l.pizza.name,
      base_name:     l.base.name,
      toppings:      l.toppings.map((t: any) => ({ name: t.topping.name, qty: t.qty })),
      quantity:      l.quantity,
      unit_price:    l.unitPrice,
      line_subtotal: l.lineSubtotal,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(items);
    if (itemsErr) console.error("[orders] items insert error:", itemsErr.message);

    // Deduct inventory via RPC
    for (const l of bill.lines) {
      await supabase.rpc("decrement_inventory", { p_item_id: l.pizza.id, p_qty: l.quantity });
      await supabase.rpc("decrement_inventory", { p_item_id: l.base.id, p_qty: l.quantity });
      for (const t of l.toppings) {
        await supabase.rpc("decrement_inventory", { p_item_id: t.topping.id, p_qty: l.quantity * t.qty });
      }
    }

    // Send WhatsApp notification
    const msg = `🍕 Hi ${name}! Your SliceMatic order is received and is now Preparing.\n\n` +
                `Total: ₹${bill.finalTotal.toFixed(2)} (${payment})\n` +
                `Order ID: ${order.id.split("-")[0]}`;
    await sendWhatsAppMessage(phone, msg);

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (e: any) {
    console.error("[orders] unexpected error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
