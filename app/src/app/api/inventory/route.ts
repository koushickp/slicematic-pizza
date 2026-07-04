import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// GET /api/inventory — Fetches live stock counts for customer UI and AI
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("category")
      .order("name");

    if (error) throw error;
    return NextResponse.json({ inventory: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
