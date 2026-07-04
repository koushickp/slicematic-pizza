import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// PATCH /api/admin/inventory — Updates a specific item's stock count
export async function PATCH(req: NextRequest) {
  try {
    const { item_id, stock_count } = await req.json();
    if (!item_id || typeof stock_count !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    let error;
    if (item_id.startsWith("store_") || item_id.startsWith("setting_")) {
      const res = await supabase.from("inventory").upsert({ 
        item_id, name: item_id.replace(/_/g, " ").toUpperCase(), category: "System", stock_count 
      });
      error = res.error;
    } else {
      const res = await supabase.from("inventory").update({ stock_count }).eq("item_id", item_id);
      error = res.error;
    }

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
