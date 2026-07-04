import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { PIZZAS } from "@/lib/menu";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const KEY = process.env.OPENROUTER_API_KEY ?? "";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "update_inventory",
      description: "Updates the stock count of an inventory item in the database.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "The ID of the inventory item (e.g. t_olives)" },
          diff: { type: "number", description: "Amount to add (positive) or subtract (negative)" }
        },
        required: ["item_id", "diff"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_supplier_restock",
      description: "Sends an automated restock notification email/message to the supplier for low stock items.",
      parameters: {
        type: "object",
        properties: {
          items: { type: "array", items: { type: "string" }, description: "List of item names to restock" }
        },
        required: ["items"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_promo_blast",
      description: "Sends a promotional WhatsApp message to all unique customers in the database.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The promotional message to send to all customers" }
        },
        required: ["message"]
      }
    }
  }
];

export async function POST(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "AI not configured" }, { status: 500 });

  try {
    const { mode, payload } = await req.json();

    let systemPrompt = "";
    let userPrompt = "";

    // Common data fetch for modes that need order context
    const { data: recentOrders } = await supabase
      .from("orders")
      .select("*, items:order_items(*)")
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: inventoryData } = await supabase.from("inventory").select("*");

    // Compress orders for LLM context to save tokens
    const contextData = (recentOrders ?? []).map(o => ({
      date: new Date(o.created_at).toLocaleString(),
      amt: o.total_amount,
      pay: o.payment_method,
      status: o.status,
      items: o.items?.map((i: any) => `${i.quantity}x ${i.pizza_name}`).join(", ")
    }));
    
    if (mode === "chat") {
      systemPrompt = `You are the SliceMatic Admin Copilot, a friendly and highly capable AI assistant for the restaurant manager. You have access to real-time store data and action tools. Answer ANY question the admin asks naturally, politely, and helpfully. If they ask about orders or inventory, use the JSON context provided below. If they ask general questions, chat with them normally!
Orders Context: ${JSON.stringify(contextData)}
Inventory Context: ${JSON.stringify(inventoryData)}`;
      userPrompt = payload;
    } 
    else if (mode === "forecast") {
      systemPrompt = `You are a pizza restaurant demand forecasting AI. Based on the current time and recent orders, provide a very short, 1-3 sentence actionable recommendation for the kitchen staff. Do not use markdown headers, just return the text.`;
      const time = new Date().toLocaleString("en-IN", { weekday: 'long', hour: '2-digit', minute: '2-digit' });
      userPrompt = `Current Time: ${time}\nRecent Orders Context: ${JSON.stringify(contextData)}\nWhat should the kitchen prepare for the next hour?`;
    }
    else if (mode === "marketing") {
      systemPrompt = `You are an expert restaurant marketer. Generate a fun, emoji-filled promotional WhatsApp message (under 300 characters) offering a 10% discount on a random pizza from our menu to drive sales.`;
      const menuList = PIZZAS.map(p => p.name).join(", ");
      userPrompt = `Our Menu: ${menuList}\nDraft a WhatsApp promo message using code SLICEMATIC10.`;
    }
    else if (mode === "customer") {
      const { data: custOrders } = await supabase
        .from("orders")
        .select("created_at, total_amount, payment_method, items:order_items(pizza_name)")
        .eq("phone", payload)
        .order("created_at", { ascending: false });

      systemPrompt = `You are a customer insight AI. Summarize the customer's buying habits in 1-2 sentences and suggest a single, actionable loyalty reward or up-sell. Keep it very brief.`;
      userPrompt = `Customer Phone: ${payload}\nOrder History: ${JSON.stringify(custOrders)}`;
    }
    else if (mode === "insights") {
      systemPrompt = `You are a highly intelligent Business Analyst for SliceMatic pizza store.`;
      userPrompt = `Based on the following recent sales data, briefly summarize the total revenue, identify the most popular pizza, and give me a 2-sentence strategic insight on how to improve sales tonight. Keep it concise and use emojis. Data: ${JSON.stringify(contextData)}`;
    }
    else {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    const reqBody: any = {
      model: "openai/gpt-3.5-turbo",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };

    if (mode === "chat") {
      reqBody.tools = TOOLS;
      reqBody.tool_choice = "auto";
    }

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(reqBody)
    });

    if (!res.ok) throw new Error(`OpenRouter error ${res.status}`);
    const json = await res.json();
    const message = json.choices?.[0]?.message;

    // Handle Tool Calls
    if (message?.tool_calls && message.tool_calls.length > 0) {
      let actionResult = "";
      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        if (name === "update_inventory") {
          const { item_id, diff } = args;
          const item = inventoryData?.find(i => i.item_id === item_id);
          if (item) {
            const newStock = Math.max(0, item.stock_count + diff);
            await supabase.from("inventory").update({ stock_count: newStock }).eq("item_id", item_id);
            actionResult += `✅ Executed: Updated ${item.name} stock to ${newStock}.\n`;
          } else {
            actionResult += `❌ Failed: Item ${item_id} not found.\n`;
          }
        }
        else if (name === "send_supplier_restock") {
          const { items } = args;
          // Simulate supplier integration
          console.log(`[SUPPLIER] Automated restock request sent for: ${items.join(", ")}`);
          actionResult += `📦 Executed: Sent automated supplier restock request for ${items.join(", ")}.\n`;
        }
        else if (name === "send_promo_blast") {
          const { message } = args;
          const uniquePhones = Array.from(new Set((recentOrders ?? []).filter(o => o.phone).map(o => o.phone)));
          let count = 0;
          for (const phone of uniquePhones) {
            if (phone) {
              await sendWhatsAppMessage(phone as string, message);
              count++;
            }
          }
          actionResult += `🎯 Executed: Promo blast successfully sent to ${count} unique customers!\n`;
        }
      }
      return NextResponse.json({ success: true, reply: actionResult });
    }

    // Normal Text Response
    const reply = message?.content?.trim() ?? "No response";
    return NextResponse.json({ success: true, reply });

  } catch (e: any) {
    console.error("[copilot]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
