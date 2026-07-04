"use client";
import { useState, useEffect } from "react";
import { PIZZAS, BASES, TOPPINGS } from "@/lib/menu";
import { buildBill, validateName, validatePhone, validatePayment, paymentMessage } from "@/lib/pricing";
import type { CartRow, ToppingEntry } from "@/lib/pricing";
import { supabasePublic } from "@/lib/supabasePublicClient";

interface InventoryMap { [item_id: string]: number }

export default function ManualOrder() {
  const [inventory, setInventory] = useState<InventoryMap>({});
  const [cart, setCart] = useState<CartRow[]>([]);
  
  const getImagePath = (name: string, type: 'pizza' | 'crust' | 'topping') => {
    const l = name.toLowerCase();
    if (type === 'pizza') {
      if (l.includes("margherita")) return "/images/pizza_margherita.png";
      if (l.includes("deep dish")) return "/images/pizza_deepdish.png";
      if (l.includes("greek")) return "/images/pizza_greek.png";
      if (l.includes("veggie")) return "/images/pizza_veggie.png";
      if (l.includes("farm")) return "/images/pizza_farmhouse.png";
      if (l.includes("pepperoni")) return "/images/pizza_pepperoni.png";
      if (l.includes("bbq")) return "/images/pizza_bbqchicken.png";
      if (l.includes("paneer") || l.includes("tikka")) return "/images/pizza_paneer.png";
      return "/images/pizza_margherita.png"; // fallback
    } else if (type === 'crust') {
      if (l.includes("thin")) return "/images/crust_thin.png";
      if (l.includes("thick")) return "/images/crust_thick.png";
      if (l.includes("cheese")) return "/images/crust_cheese.png";
      if (l.includes("wheat")) return "/images/crust_wheat.png";
      if (l.includes("multigrain")) return "/images/crust_multigrain.png";
      return "/images/crust.png";
    } else {
      if (l.includes("olive")) return "/images/topping_olives.png";
      if (l.includes("cheese")) return "/images/topping_cheese.png";
      return "/images/topping.png";
    }
  };

  // Checkout Form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState("Cash");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);

  // Modal State
  const [editingPizza, setEditingPizza] = useState<any>(null);
  const [selBase, setSelBase] = useState<any>(BASES[0]);
  const [selToppings, setSelToppings] = useState<ToppingEntry[]>([]);
  const [selQty, setSelQty] = useState(1);

  useEffect(() => {
    const fetchInventory = () => {
      fetch("/api/inventory").then(r => r.json()).then(data => {
        const map: InventoryMap = {};
        (data.inventory || []).forEach((i: any) => { map[i.item_id] = i.stock_count; });
        setInventory(map);
      }).catch(console.error);
    };

    fetchInventory();

    const invChan = supabasePublic.channel('public:inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, fetchInventory)
      .subscribe();

    return () => { supabasePublic.removeChannel(invChan); };
  }, []);

  const storeSettings = {
    gstRate: (inventory["setting_gst"] ?? 18) / 100,
    discountThreshold: inventory["setting_discount_threshold"] ?? 5,
    discountRate: (inventory["setting_discount_percent"] ?? 10) / 100,
    maxQty: inventory["setting_max_qty"] ?? 10
  };

  const openPizzaModal = (pizza: any) => {
    setEditingPizza(pizza);
    setSelBase(BASES.find(b => (inventory[b.id] ?? 50) >= 5) || BASES[0]);
    setSelToppings([]);
    setSelQty(1);
  };

  const toggleTopping = (topping: any) => {
    const exists = selToppings.find(t => t.topping.id === topping.id);
    if (exists) {
      setSelToppings(selToppings.filter(t => t.topping.id !== topping.id));
    } else {
      setSelToppings([...selToppings, { topping, qty: 1 }]);
    }
  };

  const addToCart = () => {
    if (!editingPizza) return;
    setCart([...cart, { pizza: editingPizza, base: selBase, quantity: selQty, toppings: selToppings }]);
    setEditingPizza(null);
  };

  const submitOrder = async () => {
    setLoading(true); setMsg("");
    const nameErr = validateName(name);
    const phoneErr = validatePhone(phone);
    const payErr = validatePayment(payment);
    if (nameErr || phoneErr || payErr || !address.trim()) {
      setMsg(nameErr || phoneErr || payErr || (!address.trim() ? "Delivery Address is required" : "Validation error"));
      setLoading(false); return;
    }
    const bill = buildBill(cart, storeSettings);
    if (bill.lines.length === 0) {
      setMsg("Cart is empty"); setLoading(false); return;
    }

    try {
      const res = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, address, payment, bill })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        const payMsg = paymentMessage(payment, bill.finalTotal);
        setMsg(`Order ID: ${data.orderId.split("-")[0]}\n${payMsg}`);
      } else {
        setMsg(data.error);
      }
    } catch(e:any) { setMsg(e.message); }
    finally { setLoading(false); }
  };

  const bill = buildBill(cart, storeSettings);

  const renderTerminalBill = (isSuccess: boolean = false) => (
    <div className="bg-gray-50 text-gray-800 font-mono p-6 rounded-lg shadow-sm w-full text-sm leading-relaxed tracking-wide border border-gray-200 mb-6">
      <div className="text-center text-orange-600 font-black uppercase tracking-widest mb-4">
        SliceMatic &middot; {isSuccess ? "Order Receipt" : "Sample Bill"}
      </div>
      <div className="border-b border-dashed border-gray-300 mb-4"></div>
      
      {bill.lines.map((l, i) => (
        <div key={i} className="mb-6">
          <div className="flex justify-between">
            <span>Base: {l.base.name}</span>
            <span className="font-medium">Rs.{l.base.price}</span>
          </div>
          <div className="flex justify-between">
            <span>Pizza: {l.pizza.name}</span>
            <span className="font-medium">Rs.{l.pizza.price}</span>
          </div>
          {l.toppings.map((t, idx) => (
            <div key={idx} className="flex justify-between">
              <span>Topping: {t.topping.name} {t.qty > 1 ? `(x${t.qty})` : ''}</span>
              <span className="font-medium">Rs.{t.topping.price * t.qty}</span>
            </div>
          ))}
          <div className="flex justify-between mt-2 pt-2 border-t border-gray-200 border-dotted">
            <span className="text-gray-500">Unit Subtotal</span>
            <span className="font-bold">Rs.{l.unitPrice}</span>
          </div>
          <div className="flex justify-between mt-2 items-center text-gray-600 font-bold">
            <span>
              Qty: {l.quantity} &times; Rs.{l.unitPrice}
              {!isSuccess && <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="ml-3 text-red-500 hover:text-red-700 text-xs hover:underline font-normal">[Remove]</button>}
            </span>
            <span className="text-gray-900">Rs.{l.lineSubtotal}</span>
          </div>
        </div>
      ))}

      {bill.discountApplied && (
        <div className="flex justify-between text-green-600 font-bold mt-4">
          <span>Discount {storeSettings.discountRate * 100}% (qty&ge;{storeSettings.discountThreshold})</span>
          <span>-Rs.{bill.discount.toFixed(2)}</span>
        </div>
      )}
      
      <div className="flex justify-between mt-2 text-gray-600">
        <span>{bill.discountApplied ? "Post-discount Subtotal" : "Subtotal"}</span>
        <span className="font-bold text-gray-800">Rs.{bill.discountApplied ? bill.postDiscount.toFixed(2) : bill.subtotal.toFixed(2)}</span>
      </div>

      <div className="flex justify-between text-gray-500 mt-2">
        <span>GST @ {storeSettings.gstRate * 100}%</span>
        <span>Rs.{bill.gst.toFixed(2)}</span>
      </div>

      <div className="border-b border-dashed border-gray-300 my-4"></div>

      <div className="flex justify-between text-gray-900 font-black text-lg bg-orange-100 p-2 rounded-md">
        <span>TOTAL PAYABLE</span>
        <span>Rs.{bill.finalTotal.toFixed(2)}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-8 bg-gray-50 min-h-screen">
      {/* Left Menu Area */}
      <div className="flex-[2] space-y-6">
        <div>
          <h2 className="text-xl font-black mb-4 uppercase tracking-widest text-orange-600">Select Pizza</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PIZZAS.map(p => {
              const stock = inventory[p.id] ?? 0;
              const isOut = stock < 5;
              return (
                <button key={p.id} disabled={isOut} onClick={() => openPizzaModal(p)}
                  className={`border rounded-2xl text-left shadow-sm transition-all overflow-hidden flex flex-col ${isOut ? "opacity-50 bg-gray-100 cursor-not-allowed" : "bg-white hover:border-orange-400 hover:shadow-md"}`}>
                  <div className="w-full aspect-[4/3] bg-gray-100 relative">
                    <img src={getImagePath(p.name, 'pizza')} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                  <div className="p-4 w-full">
                    <h3 className="font-bold text-gray-800 text-lg">{p.name}</h3>
                    <div className="flex justify-between items-center mt-2">
                      <span className="font-black text-orange-600">₹{p.price}</span>
                      {isOut && <span className="text-red-500 font-bold text-xs uppercase">Sold Out</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right Cart Area */}
      <div className="flex-1">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sticky top-24">
          <h2 className="text-2xl font-black mb-4">Your Cart</h2>
          {success ? (
            <div className="text-center py-4 animate-fade-in-up">
              <h3 className="text-2xl font-black text-green-600 mb-4">🎉 Order Confirmed!</h3>
              <p className="text-gray-800 font-bold mb-6 whitespace-pre-line bg-green-50 p-4 rounded-xl border border-green-100">{msg}</p>
              
              <div className="text-left">
                {renderTerminalBill(true)}
              </div>

              <button onClick={() => { setSuccess(false); setMsg(""); setCart([]); setName(""); setPhone(""); setAddress(""); setPayment("Cash"); }} className="w-full py-3 bg-orange-500 text-white font-black rounded-xl hover:bg-orange-600 shadow-md">
                Start New Order
              </button>
            </div>
          ) : cart.length === 0 ? (
            <p className="text-gray-500 text-sm">Cart is empty. Select a pizza to start!</p>
          ) : (
            <>
              {renderTerminalBill(false)}

              <div className="space-y-3 mb-6">
                <input type="text" placeholder="Your Name" value={name} onChange={e=>setName(e.target.value)} className="w-full border rounded-lg px-4 py-2 text-sm outline-none focus:border-orange-500" />
                <input type="text" placeholder="10-digit Phone" value={phone} onChange={e=>setPhone(e.target.value)} className="w-full border rounded-lg px-4 py-2 text-sm outline-none focus:border-orange-500" />
                <textarea rows={2} placeholder="Delivery Address" value={address} onChange={e=>setAddress(e.target.value)} className="w-full border rounded-lg px-4 py-2 text-sm outline-none focus:border-orange-500 resize-none"></textarea>
                <select value={payment} onChange={e=>setPayment(e.target.value)} className="w-full border rounded-lg px-4 py-2 text-sm outline-none focus:border-orange-500">
                  <option value="Cash">Cash</option><option value="Card">Card</option><option value="UPI">UPI</option>
                </select>
              </div>

              <button onClick={submitOrder} disabled={loading} className="w-full bg-orange-500 text-white font-black py-3 rounded-xl shadow-md hover:bg-orange-600 disabled:opacity-50">
                {loading ? "Processing..." : "Place Order"}
              </button>
              {msg && !success && <p className="mt-3 text-sm font-bold text-center text-red-500">{msg}</p>}
            </>
          )}
        </div>
      </div>

      {/* Customization Modal */}
      {editingPizza && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-black text-gray-800">Customize {editingPizza.name}</h2>
            </div>
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div>
                <h3 className="font-bold mb-3 uppercase text-xs text-gray-500 tracking-wider">Choose Crust</h3>
                <div className="space-y-2">
                  {BASES.map(b => {
                    const isOut = (inventory[b.id] ?? 0) < 5;
                    return (
                      <label key={b.id} className={`flex justify-between items-center p-3 border rounded-xl cursor-pointer transition-colors ${isOut ? 'opacity-50 bg-gray-50' : selBase.id === b.id ? 'border-orange-500 bg-orange-50' : 'hover:bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <input type="radio" disabled={isOut} checked={selBase.id === b.id} onChange={() => setSelBase(b)} className="w-4 h-4 text-orange-500" />
                          <div className="flex items-center gap-2">
                            <img src={getImagePath(b.name, 'crust')} alt={b.name} className="w-8 h-8 rounded-full object-cover border" />
                            <span className="font-medium text-gray-800">{b.name} {isOut && <span className="text-red-500 text-xs ml-1">(Sold Out)</span>}</span>
                          </div>
                        </div>
                        <span className="font-bold">₹{b.price}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
              
              <div>
                <h3 className="font-bold mb-3 uppercase text-xs text-gray-500 tracking-wider">Add Toppings (Optional)</h3>
                <div className="grid grid-cols-2 gap-2">
                  {TOPPINGS.map(t => {
                    const isOut = (inventory[t.id] ?? 0) < 5;
                    const isSel = selToppings.some(x => x.topping.id === t.id);
                    return (
                      <label key={t.id} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer ${isOut ? 'opacity-50' : isSel ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" disabled={isOut} checked={isSel} onChange={() => toggleTopping(t)} className="rounded text-orange-500" />
                        <img src={getImagePath(t.name, 'topping')} alt={t.name} className="w-6 h-6 rounded-full object-cover border" />
                        <span className="text-sm font-medium">{t.name} <span className="text-gray-400 text-xs">(₹{t.price})</span></span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-bold mb-3 uppercase text-xs text-gray-500 tracking-wider">Quantity</h3>
                <div className="flex items-center gap-4">
                  <button onClick={() => setSelQty(Math.max(1, selQty - 1))} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 font-black text-xl">-</button>
                  <span className="text-xl font-black w-8 text-center">{selQty}</span>
                  <button onClick={() => setSelQty(Math.min(storeSettings.maxQty, selQty + 1))} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 font-black text-xl">+</button>
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex gap-4">
              <button onClick={() => setEditingPizza(null)} className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200">Cancel</button>
              <button onClick={addToCart} className="flex-[2] py-3 bg-orange-500 text-white font-black rounded-xl hover:bg-orange-600 shadow-md">Add to Cart</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
