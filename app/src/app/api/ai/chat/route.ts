/**
 * POST /api/ai/chat — Multi-turn conversational ordering agent.
 *
 * Request body:
 *   { messages: {role:"user"|"assistant", content:string}[] }
 *
 * Response (one of three shapes):
 *   { type:"question", reply: string }          — AI needs more info
 *   { type:"preview",  reply: string, order: ParsedOrder } — ready to confirm
 *   { type:"error",    reply: string }           — validation failed
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { PIZZAS, BASES, TOPPINGS } from "@/lib/menu";
import { buildBill, validateName, validatePhone, validateTotalQty, validatePayment } from "@/lib/pricing";
import type { CartRow } from "@/lib/pricing";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const KEY = process.env.OPENROUTER_API_KEY ?? "";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "lookup_past_order",
      description: "Lookup a customer's most recent order based on their phone number. Use this when a customer asks for their 'usual' or past order.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "The customer's 10-digit mobile number" }
        },
        required: ["phone"]
      }
    }
  }
];


function buildSystemPrompt(inStockIds: Set<string>) {
  const availPizzas   = PIZZAS.filter(p => inStockIds.has(p.id)).map(p => p.name);
  const availBases    = BASES.filter(b => inStockIds.has(b.id)).map(b => b.name);
  const availToppings = TOPPINGS.filter(t => inStockIds.has(t.id)).map(t => t.name);

  return `You are SliceMatic's friendly ordering assistant. Help the customer place a pizza order conversationally.

You MUST collect all of these before finalising:
- Customer name (letters only, 2-40 chars)
- 10-digit Indian mobile number (starts with 6/7/8/9)
- Delivery Address (a valid location/address)
- Payment method (Cash, Card, or UPI)
- At least one pizza with quantity (1-10 total pizzas max)

Available pizzas: ${availPizzas.join(", ") || "None currently available"}
Available bases: ${availBases.join(", ") || "None currently available"}  
Available toppings (optional, 0-5 each): ${availToppings.join(", ") || "None currently available"}

Rules:
- DO NOT offer or accept any item that is not listed in the "Available" lists above. If asked for something else, say it is out of stock.
- If the customer asks to order their "usual" or "past order", ask for their 10-digit phone number if they haven't provided it, and then use the lookup_past_order tool to find it.
- If ANY required field is missing, ask a short, friendly question for ONLY the missing info.
- Do NOT ask for info the customer already provided.
- Once you have everything, respond with ONLY this JSON (no markdown, no extra text):
{
  "COMPLETE": true,
  "name": "<name>",
  "phone": "<10 digits>",
  "address": "<delivery address>",
  "paymentMethod": "Cash|Card|UPI",
  "items": [{"pizza":"<exact name>","base":"<exact name>","toppings":[{"name":"<exact name>","qty":1}],"quantity":2}]
}
- If info is missing, respond with ONLY a short, friendly follow-up question as plain text (NOT JSON).
- Keep responses brief and warm. Use emojis sparingly.`;
}

type Message = any;

export async function POST(req: NextRequest) {
  const { messages }: { messages: Message[] } = await req.json();
  if (!messages?.length) return NextResponse.json({ type: "error", reply: "No messages provided" }, { status: 400 });
  if (!KEY) return NextResponse.json({ type: "error", reply: "AI not configured" }, { status: 500 });

  let aiContent = "";
  try {
    // Fetch live inventory to filter out-of-stock items (stock < 5)
    const { data: inv, error: invErr } = await supabase.from("inventory").select("item_id").gte("stock_count", 5);
    if (invErr) console.error("[AI Chat] Inventory error:", invErr.message);

    const inStockIds = new Set((inv ?? []).map((i: any) => i.item_id));
    
    let messagesPayload = [
      { role: "system", content: buildSystemPrompt(inStockIds) },
      ...messages,
    ];

    for (let i = 0; i < 3; i++) {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: "openai/gpt-3.5-turbo",
          temperature: 0.2,
          max_tokens: 400,
          messages: messagesPayload,
          tools: TOOLS
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      const json = await res.json();
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error("No response from AI");

      if (msg.tool_calls?.length > 0) {
        messagesPayload.push(msg); // Add AI tool call message to history
        for (const tc of msg.tool_calls) {
          if (tc.function.name === "lookup_past_order") {
            try {
              const args = JSON.parse(tc.function.arguments);
              // Fetch order from supabase
              const { data, error } = await supabase.from("orders")
                .select("id, delivery_address, items:order_items(pizza_name, base_name, toppings)")
                .eq("phone", args.phone)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();
              
              if (error || !data) {
                messagesPayload.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: JSON.stringify({ error: "No past orders found for this phone number." })
                });
              } else {
                messagesPayload.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: JSON.stringify({ success: true, last_order: data })
                });
              }
            } catch (e: any) {
              messagesPayload.push({
                role: "tool",
                tool_call_id: tc.id,
                name: tc.function.name,
                content: JSON.stringify({ error: e.message })
              });
            }
          }
        }
      } else {
        // Normal text response
        aiContent = msg.content?.trim() ?? "";
        break;
      }
    }
  } catch (e: any) {
    return NextResponse.json({ type: "error", reply: `Sorry, I had a technical issue. Please try again! (${e.message})` });
  }

  // Try to parse as completed order JSON
  if (aiContent.includes('"COMPLETE": true') || aiContent.includes('"COMPLETE":true')) {
    try {
      // Strip any accidental markdown fences
      const clean = aiContent.replace(/^```json\s*/i, "").replace(/```$/,"").trim();
      const parsed = JSON.parse(clean);

      // Validate all fields
      const nameErr = validateName(parsed.name ?? "");
      if (nameErr) return NextResponse.json({ type: "question", reply: `Hmm, there's an issue with the name: ${nameErr} Could you re-enter it?` });

      const phoneErr = validatePhone(parsed.phone ?? "");
      if (phoneErr) return NextResponse.json({ type: "question", reply: `There's an issue with the phone number: ${phoneErr} Could you share it again?` });

      if (!parsed.address || parsed.address.trim().length < 5) {
        return NextResponse.json({ type: "question", reply: "Please provide a complete delivery address so we know where to send your pizza!" });
      }

      const payErr = validatePayment(parsed.paymentMethod ?? "");
      if (payErr) return NextResponse.json({ type: "question", reply: "What payment method would you like — Cash, Card, or UPI?" });

      // Resolve menu items
      const rows: CartRow[] = (parsed.items ?? []).map((item: any) => {
        const pizza   = PIZZAS.find(p => p.name.toLowerCase().includes((item.pizza ?? "").toLowerCase())) ?? PIZZAS[0];
        const base    = BASES.find(b  => b.name.toLowerCase().includes((item.base ?? "").toLowerCase()))  ?? BASES[0];
        const toppings = (item.toppings ?? [])
          .map((t: any) => {
            const topping = TOPPINGS.find(x => x.name.toLowerCase().includes((t.name ?? "").toLowerCase()));
            return topping ? { topping, qty: Math.min(5, Math.max(1, Number(t.qty) || 1)) } : null;
          })
          .filter(Boolean) as CartRow["toppings"];
        return { pizza, base, quantity: Math.min(10, Math.max(1, Number(item.quantity) || 1)), toppings };
      });

      if (!rows.length) {
        return NextResponse.json({ type: "question", reply: "Which pizza(s) would you like to order?" });
      }

      const totalErr = validateTotalQty(rows.reduce((s, r) => s + r.quantity, 0));
      if (totalErr) return NextResponse.json({ type: "question", reply: totalErr });

      const bill = buildBill(rows);

      // Build a human-readable summary
      const linesSummary = rows.map(r =>
        `${r.quantity}× ${r.pizza.name} (${r.base.name}${r.toppings.length ? " + " + r.toppings.map(t => t.topping.name).join(", ") : ""})`
      ).join("\n");

      const reply =
        `Here's your order summary:\n\n${linesSummary}\n\n` +
        `Subtotal: ₹${bill.subtotal.toFixed(2)}\n` +
        (bill.discountApplied ? `Discount (10%): −₹${bill.discount.toFixed(2)}\n` : "") +
        `GST (18%): ₹${bill.gst.toFixed(2)}\n` +
        `**Total: ₹${bill.finalTotal.toFixed(2)}**\n\n` +
        `Deliver to: ${parsed.address}\n` +
        `Payment: ${parsed.paymentMethod}\n\n` +
        `Shall I confirm this order for ${parsed.name}?`;

      return NextResponse.json({
        type: "preview",
        reply,
        order: { name: parsed.name, phone: parsed.phone, address: parsed.address, payment: parsed.paymentMethod, bill },
      });
    } catch {
      // Fall through to treat as question
    }
  }

  // It's a follow-up question or conversational response
  return NextResponse.json({ type: "question", reply: aiContent });
}
