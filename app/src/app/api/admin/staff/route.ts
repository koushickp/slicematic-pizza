import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  try {
    const { data, error } = await supabase.from("staff_users").select("username, role");
    if (error) throw error;
    return NextResponse.json({ users: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, role } = await req.json();
    if (!username || !password || !role) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const { error } = await supabase.from("staff_users").insert({ username, password, role });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    if (!username) return NextResponse.json({ error: "Missing username" }, { status: 400 });

    const { error } = await supabase.from("staff_users").delete().eq("username", username);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
