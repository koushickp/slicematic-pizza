import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status } = await req.json();
    if (!status) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
    }

    const { data: order, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select("customer_name, phone")
      .single();

    if (error) throw error;

    // Send WhatsApp notification if delivered
    if (status === "Delivered" && order?.phone) {
      const msg = `🛵 Hi ${order.customer_name}! Your SliceMatic pizza order has been Delivered.\n\nEnjoy your meal! 🍕`;
      await sendWhatsAppMessage(order.phone, msg);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
