import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  const { data, error } = await supabase
    .from("orders")
    .select(`id, customer_name, phone, created_at, total_amount, gst, discount_applied, payment_method, status,
             order_items(pizza_name, quantity)`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []).map((o: any) => ({
    ...o,
    items: o.order_items ?? [],
  }));

  return NextResponse.json({ orders });
}
