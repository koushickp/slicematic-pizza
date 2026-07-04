import { NextResponse } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const KEY = process.env.OPENROUTER_API_KEY ?? "";

const FALLBACK = { pizza: "Margherita", base: "Thin Crust", topping: "Extra Cheese" };

export async function GET() {
  if (!KEY) return NextResponse.json({ recommendation: FALLBACK });
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: `You are a pizza recommendation bot. Return ONLY valid JSON with no markdown: {"pizza":"<name>","base":"<name>","topping":"<name>"}
Pizzas: Margherita, Chicago Deep Dish, Greek Mediterranean, California Veggie, Farm House, Pepperoni Classic, BBQ Chicken, Paneer Tikka
Bases: Thin Crust, Thick Crust, Cheese Burst, Whole Wheat, Multigrain
Toppings: Black Olives, Extra Cheese, Button Mushrooms, Green Peppers, Jalapenos, Sun-Dried Tomatoes, Caramelised Onions, Sweet Corn, Roasted Garlic, Peri-Peri Drizzle`,
          },
          { role: "user", content: "Recommend one pizza combo for today." },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json({ recommendation: FALLBACK });
    const json = await res.json();
    const rec = JSON.parse(json.choices[0].message.content);
    return NextResponse.json({ recommendation: rec });
  } catch {
    return NextResponse.json({ recommendation: FALLBACK });
  }
}
