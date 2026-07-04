"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabasePublic } from "@/lib/supabasePublicClient";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface OrderItem { pizza_name: string; quantity: number }
interface OrderRow {
  id: string; customer_name: string; phone: string; delivery_address?: string; created_at: string;
  total_amount: number; gst: number; discount_applied: number; payment_method: string; status: string; items: OrderItem[];
}
interface InventoryRow {
  item_id: string; name: string; category: string; stock_count: number;
}

// ── Auth Screen ───────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (role: "admin" | "rider" | "kitchen") => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr]   = useState("");
  const [busy, setBusy] = useState(false);

  async function attempt() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (res.ok && data.success) onLogin(data.role);
      else setErr(data.error || "Login failed");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🍕</div>
          <h1 className="text-2xl font-black text-gray-800">Admin Login</h1>
          <p className="text-gray-400 text-sm mt-1">SliceMatic Dashboard</p>
        </div>
        <input type="text" value={user} onChange={e => setUser(e.target.value)}
          placeholder="Username"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400" />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === "Enter" && attempt()}
          placeholder="Password"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400" />
        {err && <p className="text-red-500 text-sm mb-3">{err}</p>}
        <button onClick={attempt} disabled={busy} className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-black transition-colors disabled:opacity-50">
          {busy ? "Authenticating..." : "Login"}
        </button>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ["Preparing", "Ready", "Delivered"];
const STATUS_COLORS: Record<string, string> = {
  "Preparing": "bg-orange-100 text-orange-700 border border-orange-200",
  "Ready": "bg-blue-100 text-blue-700 border border-blue-200",
  "Delivered": "bg-green-100 text-green-700 border border-green-200"
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authed,      setAuthed]      = useState(false);
  const [role,        setRole]        = useState<"admin"|"rider"|"kitchen">("admin");
  const [activeTab,   setActiveTab]   = useState<"orders"|"inventory"|"reports"|"settings"|"staff">("orders");
  const [orders,      setOrders]      = useState<OrderRow[]>([]);
  const [inventory,   setInventory]   = useState<InventoryRow[]>([]);
  const [staffUsers,  setStaffUsers]  = useState<{username:string, role:string}[]>([]);
  const [newStaffUser, setNewStaffUser] = useState({ username: "", password: "", role: "rider" });
  const [loading,     setLoading]     = useState(true);
  const [newCount,    setNewCount]    = useState(0);
  const [filterPay,   setFilterPay]   = useState("All");
  const [isLive,      setIsLive]      = useState(true);

  // Copilot State
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMsgs, setCopilotMsgs] = useState<{role:"user"|"ai", text:string}[]>([{role:"ai", text:"Hi! I'm your AI Copilot. Ask me about your data, or generate a forecast/promo!"}]);
  const [chatInput,   setChatInput]   = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const chatEndRef    = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [copilotMsgs]);

  useEffect(() => {
    const savedSession = localStorage.getItem("sm_session");
    if (savedSession) {
      try {
        const { role: savedRole, expiry } = JSON.parse(savedSession);
        if (Date.now() < expiry) {
          setRole(savedRole);
          setAuthed(true);
        } else {
          localStorage.removeItem("sm_session");
        }
      } catch (e) {}
    }
    setSessionChecked(true);
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders");
      const json = await res.json();
      if (res.ok) setOrders(json.orders ?? []);
    } catch (e) {}
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory");
      const json = await res.json();
      if (res.ok) setInventory(json.inventory ?? []);
    } catch (e) {}
  }, []);

  const fetchStaff = useCallback(async () => {
    if (role !== "admin") return;
    try {
      const res = await fetch("/api/admin/staff");
      const json = await res.json();
      if (res.ok) setStaffUsers(json.users ?? []);
    } catch (e) {}
  }, [role]);

  async function createStaffUser() {
    if (!newStaffUser.username || !newStaffUser.password) return;
    try {
      await fetch("/api/admin/staff", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStaffUser)
      });
      setNewStaffUser({ username: "", password: "", role: "rider" });
      fetchStaff();
    } catch (e) {}
  }

  async function deleteStaffUser(username: string) {
    if (username === "admin") return; // Prevent deleting default admin
    try {
      await fetch(`/api/admin/staff?username=${username}`, { method: "DELETE" });
      fetchStaff();
    } catch (e) {}
  }

  async function updateOrderStatus(id: string, newStatus: string) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    try {
      await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus })
      });
    } catch (e) { fetchOrders(); }
  }

  async function updateInventoryStock(item_id: string, diff: number) {
    const item = inventory.find(i => i.item_id === item_id);
    if (!item) return;
    const newStock = Math.max(0, item.stock_count + diff);
    setInventory(prev => prev.map(i => i.item_id === item_id ? { ...i, stock_count: newStock } : i));
    
    try {
      await fetch(`/api/admin/inventory`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id, stock_count: newStock })
      });
    } catch (e) { fetchInventory(); }
  }

  async function toggleStoreStatus() {
    const storeStatusItem = inventory.find(i => i.item_id === "store_status");
    const newStock = storeStatusItem && storeStatusItem.stock_count > 0 ? 0 : 1;
    
    if (storeStatusItem) {
       setInventory(prev => prev.map(i => i.item_id === "store_status" ? { ...i, stock_count: newStock } : i));
    } else {
       setInventory(prev => [...prev, { item_id: "store_status", name: "Store Status", category: "System", stock_count: newStock }]);
    }
    
    try {
      await fetch(`/api/admin/inventory`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: "store_status", stock_count: newStock })
      });
    } catch (e) { fetchInventory(); }
  }

  async function updateSetting(item_id: string, newStock: number) {
    if (isNaN(newStock) || newStock < 0) return;
    const existing = inventory.find(i => i.item_id === item_id);
    if (existing) {
       setInventory(prev => prev.map(i => i.item_id === item_id ? { ...i, stock_count: newStock } : i));
    } else {
       setInventory(prev => [...prev, { item_id, name: item_id, category: "System", stock_count: newStock }]);
    }
    try {
      await fetch(`/api/admin/inventory`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id, stock_count: newStock })
      });
    } catch (e) { fetchInventory(); }
  }

  async function runCopilot(mode: string, payload: string) {
    setCopilotOpen(true); setCopilotBusy(true);
    if (mode === "chat") setCopilotMsgs(p => [...p, { role: "user", text: payload }]);
    try {
      const res = await fetch("/api/admin/copilot", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, payload })
      });
      const data = await res.json();
      if (data.reply) setCopilotMsgs(p => [...p, { role: "ai", text: data.reply }]);
      else throw new Error(data.error || "Failed");
    } catch (e: any) { setCopilotMsgs(p => [...p, { role: "ai", text: `Error: ${e.message}` }]); }
    finally { setCopilotBusy(false); }
  }

  useEffect(() => {
    if (!authed) return;
    fetchOrders();
    fetchInventory();
    fetchStaff();
    setLoading(false);

    if (!isLive) return;
    const orderChan = supabasePublic.channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, async (payload) => {
        if (payload.eventType === "INSERT") {
          const newOrder = payload.new as Omit<OrderRow, "items">;
          const res = await fetch(`/api/admin/orders`);
          const json = await res.json();
          if (res.ok) {
            const full = (json.orders as OrderRow[]).find(o => o.id === newOrder.id);
            setOrders(prev => prev.some(o => o.id === newOrder.id) ? prev : [full || { ...newOrder, items: [] }, ...prev]);
            setNewCount(n => n + 1);
          }
        } else if (payload.eventType === "UPDATE") {
          setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, status: payload.new.status } : o));
        }
      }).subscribe();
      
    const invChan = supabasePublic.channel("inventory-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "inventory" }, (payload) => {
        setInventory(prev => prev.map(i => i.item_id === payload.new.item_id ? { ...i, stock_count: payload.new.stock_count } : i));
      }).subscribe();

    return () => { supabasePublic.removeChannel(orderChan); supabasePublic.removeChannel(invChan); };
  }, [authed, isLive, fetchOrders, fetchInventory]);

  function handleLogin(r: "admin" | "rider" | "kitchen") {
    const expiry = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
    localStorage.setItem("sm_session", JSON.stringify({ role: r, expiry }));
    setRole(r);
    setAuthed(true);
  }

  if (!sessionChecked) return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-black text-gray-400">Loading...</div>;
  if (!authed) return <LoginScreen onLogin={handleLogin} />;

  const filteredOrders = orders.filter(o => filterPay === "All" || o.payment_method === filterPay);
  const revenue = filteredOrders.reduce((s, o) => s + o.total_amount, 0);

  const storeStatusItem = inventory.find(i => i.item_id === "store_status");
  const isStoreOnline = storeStatusItem ? storeStatusItem.stock_count > 0 : true;

  // --- Analytics Data ---
  const lowStockItems = inventory.filter(i => i.stock_count < 10 && i.item_id !== "store_status").sort((a,b) => a.stock_count - b.stock_count);
  
  const dailyRevMap: Record<string, number> = {};
  const pizzaSalesMap: Record<string, number> = {};
  
  orders.forEach(o => {
    const date = new Date(o.created_at).toLocaleDateString("en-IN", { month: 'short', day: 'numeric' });
    dailyRevMap[date] = (dailyRevMap[date] || 0) + o.total_amount;
    o.items?.forEach(i => {
      pizzaSalesMap[i.pizza_name] = (pizzaSalesMap[i.pizza_name] || 0) + i.quantity;
    });
  });

  const dailyRevData = Object.entries(dailyRevMap).map(([date, revenue]) => ({ date, revenue }));
  const topPizzasData = Object.entries(pizzaSalesMap).map(([name, qty]) => ({ name, qty })).sort((a,b) => b.qty - a.qty).slice(0, 5);
  const PIE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];
  // ----------------------
  
  return (
    <div className="min-h-screen bg-slate-100 flex overflow-hidden">
      <div className={`flex-1 flex flex-col transition-all duration-300 ${copilotOpen ? "mr-96" : ""}`}>
        <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between shadow-md z-10 relative">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-black tracking-tight">🍕 SliceMatic Admin</h1>
            {role !== "kitchen" && (
              <nav className="flex gap-1 bg-gray-800 p-1 rounded-lg">
                <button onClick={() => setActiveTab("orders")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === "orders" ? "bg-white text-gray-900" : "text-gray-400 hover:text-white"}`}>Orders</button>
                {role === "admin" && (
                  <>
                    <button onClick={() => setActiveTab("inventory")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === "inventory" ? "bg-white text-gray-900" : "text-gray-400 hover:text-white"}`}>Inventory</button>
                    <button onClick={() => setActiveTab("reports")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center gap-1 ${activeTab === "reports" ? "bg-white text-gray-900" : "text-gray-400 hover:text-white"}`}>Reports 📈</button>
                    <button onClick={() => setActiveTab("settings")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center gap-1 ${activeTab === "settings" ? "bg-white text-gray-900" : "text-gray-400 hover:text-white"}`}>Settings ⚙️</button>
                    <button onClick={() => setActiveTab("staff")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center gap-1 ${activeTab === "staff" ? "bg-white text-gray-900" : "text-gray-400 hover:text-white"}`}>Staff 👥</button>
                  </>
                )}
              </nav>
            )}
            {role === "admin" && (
              <>
                <button onClick={() => setIsLive(l => !l)} className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${isLive ? "border-green-500 text-green-400 bg-green-500/10" : "border-gray-600 text-gray-500"}`}>
                  <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} /> {isLive ? "LIVE" : "PAUSED"}
                </button>
                <button onClick={toggleStoreStatus} className={`flex items-center gap-1.5 text-xs font-black px-4 py-1.5 rounded-lg shadow-md border transition-all ${isStoreOnline ? "bg-green-500 text-white border-green-600 hover:bg-green-600" : "bg-red-500 text-white border-red-600 hover:bg-red-600 animate-pulse"}`}>
                  {isStoreOnline ? "🟢 ONLINE" : "🔴 OFFLINE"}
                </button>
              </>
            )}
              <button onClick={() => { localStorage.removeItem("sm_session"); setAuthed(false); }} className="text-xs font-bold text-gray-400 hover:text-white transition-colors ml-4">
                Logout
              </button>
            {newCount > 0 && <span className="bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full">+{newCount} new</span>}
          </div>
          {role === "admin" && (
            <button onClick={() => setCopilotOpen(!copilotOpen)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-bold shadow-lg flex gap-2 items-center transition-all animate-pulse">
              ✨ AI Copilot
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {role === "kitchen" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {orders.filter(o => o.status === "Preparing").map(order => (
                <div key={order.id} className="bg-white rounded-xl shadow-lg border-l-8 border-orange-500 overflow-hidden flex flex-col animate-fade-in-up">
                  <div className="bg-gray-800 text-white p-3 flex justify-between items-center">
                    <span className="font-bold text-lg">#{order.id.split("-")[0]}</span>
                    <span className="text-xs text-orange-400 font-bold uppercase animate-pulse border border-orange-400/30 px-2 py-0.5 rounded bg-orange-400/10">Preparing</span>
                  </div>
                  <div className="p-5 flex-1">
                    <ul className="space-y-4">
                      {order.items?.map((item: any, i: number) => (
                        <li key={i} className="text-sm border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                          <div className="font-black text-lg text-gray-800 leading-tight">
                            <span className="text-orange-500 mr-1">{item.quantity}x</span> {item.pizza_name}
                          </div>
                          <div className="text-gray-500 text-sm font-bold ml-6 mt-1">Crust: {item.base_name}</div>
                          {item.toppings && item.toppings.length > 0 && (
                            <ul className="ml-6 mt-1 text-gray-600 text-sm font-semibold space-y-0.5">
                              {item.toppings.map((t: any, j: number) => (
                                <li key={j} className="flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span> {t.qty > 1 ? `${t.qty}x ` : ""}{t.name}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button onClick={() => updateOrderStatus(order.id, "Ready")} className="bg-green-500 hover:bg-green-600 text-white font-black py-4 w-full text-lg tracking-widest transition-colors flex items-center justify-center gap-2">
                    MARK AS BAKED <span className="text-2xl">👨‍🍳</span>
                  </button>
                </div>
              ))}
              {orders.filter(o => o.status === "Preparing").length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-32 text-gray-400 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                  <span className="text-6xl mb-4 opacity-50">🍽️</span>
                  <h2 className="text-2xl font-bold text-gray-500">No incoming orders</h2>
                  <p className="text-sm mt-2">Kitchen is all caught up!</p>
                </div>
              )}
            </div>
          ) : activeTab === "orders" ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {role === "admin" && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-orange-500">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Revenue</p>
                    <p className="text-2xl font-black mt-1">₹{revenue.toLocaleString()}</p>
                  </div>
                )}
                <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-blue-500">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">Total Orders</p>
                  <p className="text-2xl font-black mt-1">{filteredOrders.length}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h2 className="font-black text-gray-800">Recent Orders</h2>
                  <select value={filterPay} onChange={e => setFilterPay(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                    <option value="All">All Payments</option>
                    <option value="Cash">Cash</option><option value="Card">Card</option><option value="UPI">UPI</option>
                  </select>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500 font-semibold text-xs uppercase tracking-wider">
                      <th className="px-4 py-3">Customer (AI Insight)</th>
                      <th className="px-4 py-3">Pizzas</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredOrders.map(o => (
                      <tr key={o.id} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-4 py-3">
                          <button onClick={() => runCopilot("customer", o.phone)} className="text-left group-hover:text-indigo-600">
                            <p className="font-bold">{o.customer_name}</p>
                            <p className="text-xs text-gray-500">{o.phone} ✨</p>
                            {o.delivery_address && <p className="text-xs text-gray-400 mt-1 max-w-[150px] truncate">{o.delivery_address}</p>}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">{o.items?.map(i => `${i.quantity}x ${i.pizza_name}`).join(", ")}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{new Date(o.created_at).toLocaleTimeString("en-IN", {hour: '2-digit', minute:'2-digit'})}</td>
                        <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-1 rounded bg-gray-100">{o.payment_method}</span></td>
                        <td className="px-4 py-3">
                          <select value={o.status || "Preparing"} onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                            className={`font-bold text-xs px-3 py-1.5 rounded-full outline-none cursor-pointer ${STATUS_COLORS[o.status || "Preparing"] || "bg-gray-100"}`}>
                            {STATUS_OPTIONS.map(opt => <option key={opt} value={opt} className="bg-white text-gray-800">{opt}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right font-black">₹{o.total_amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === "inventory" ? (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-black text-gray-800">Inventory Management</h2>
                <p className="text-xs text-gray-500 mt-1">Items below 5 stock will automatically disappear from the Customer Menu & AI options.</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    <th className="px-6 py-3">Item ID</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3 text-right">Stock Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {inventory.map(inv => (
                    <tr key={inv.item_id} className={`transition-colors ${inv.stock_count < 5 ? "bg-red-50/50" : "hover:bg-gray-50"}`}>
                      <td className="px-6 py-4 text-xs font-mono text-gray-400">{inv.item_id}</td>
                      <td className="px-6 py-4"><span className="px-2 py-1 bg-gray-100 rounded text-xs font-bold text-gray-600">{inv.category}</span></td>
                      <td className="px-6 py-4 font-bold text-gray-800">{inv.name}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => updateInventoryStock(inv.item_id, -1)} className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 font-bold flex items-center justify-center">-</button>
                          <span className={`font-black w-8 text-center ${inv.stock_count < 5 ? "text-red-600 text-lg" : ""}`}>{inv.stock_count}</span>
                          <button onClick={() => updateInventoryStock(inv.item_id, 1)} className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 font-bold flex items-center justify-center">+</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeTab === "reports" ? (
            <div className="space-y-6">
              <div className="px-1">
                <h2 className="text-2xl font-black text-gray-800">Business Insights</h2>
                <p className="text-gray-500 text-sm">Live analytics generated securely from your realtime operational data.</p>
              </div>

              {/* Top KPI row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border-t-4 border-orange-500">
                  <p className="text-xs font-black uppercase text-gray-400 mb-1">Total Revenue</p>
                  <p className="text-3xl font-black text-gray-800">₹{revenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border-t-4 border-indigo-500">
                  <p className="text-xs font-black uppercase text-gray-400 mb-1">Total Pizzas Sold</p>
                  <p className="text-3xl font-black text-gray-800">{topPizzasData.reduce((s, p) => s + p.qty, 0)}</p>
                </div>
                <div className={`bg-white p-6 rounded-2xl shadow-sm border-t-4 ${lowStockItems.length ? 'border-red-500 bg-red-50' : 'border-green-500'}`}>
                  <p className="text-xs font-black uppercase text-gray-400 mb-1">Low Stock Alerts</p>
                  <p className="text-3xl font-black text-gray-800">{lowStockItems.length} <span className="text-sm font-medium text-gray-500">items &lt; 10 qty</span></p>
                </div>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="font-black text-gray-800 mb-6">Daily Revenue Trends</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyRevData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#888', fontSize: 12}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#888', fontSize: 12}} dx={-10} tickFormatter={(v) => `₹${v}`} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="font-black text-gray-800 mb-6">Top Selling Pizzas</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={topPizzasData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="qty">
                          {topPizzasData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Low Stock Warning Table */}
              {lowStockItems.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-red-100">
                  <div className="px-6 py-4 bg-red-50 border-b border-red-100">
                    <h3 className="font-black text-red-700 flex items-center gap-2">⚠️ Urgent: Low Stock Items</h3>
                  </div>
                  <table className="w-full text-sm text-left">
                    <tbody className="divide-y divide-gray-100">
                      {lowStockItems.map(item => (
                        <tr key={item.item_id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-800">{item.name}</td>
                          <td className="px-6 py-3 text-xs text-gray-500">{item.category}</td>
                          <td className="px-6 py-3 text-right">
                            <span className="font-black text-red-600 bg-red-100 px-3 py-1 rounded-full">{item.stock_count} left</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === "settings" ? (
            <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-2xl font-black text-gray-800 mb-2">Store Settings ⚙️</h2>
                <p className="text-gray-500 text-sm mb-6">Modify business rules. Changes take effect instantly for all customers.</p>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">GST Percentage (%)</label>
                    <input type="number" min="0" value={inventory.find(i => i.item_id === "setting_gst")?.stock_count ?? 18} onChange={e => updateSetting("setting_gst", parseInt(e.target.value))} className="w-full border-2 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Discount Threshold (Qty)</label>
                      <input type="number" min="1" value={inventory.find(i => i.item_id === "setting_discount_threshold")?.stock_count ?? 5} onChange={e => updateSetting("setting_discount_threshold", parseInt(e.target.value))} className="w-full border-2 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Discount Percentage (%)</label>
                      <input type="number" min="0" value={inventory.find(i => i.item_id === "setting_discount_percent")?.stock_count ?? 10} onChange={e => updateSetting("setting_discount_percent", parseInt(e.target.value))} className="w-full border-2 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Max Quantity (Per Pizza)</label>
                    <input type="number" min="1" value={inventory.find(i => i.item_id === "setting_max_qty")?.stock_count ?? 10} onChange={e => updateSetting("setting_max_qty", parseInt(e.target.value))} className="w-full border-2 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold" />
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "staff" && role === "admin" ? (
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-2xl font-black text-gray-800 mb-2">Staff Management 👥</h2>
                <p className="text-gray-500 text-sm mb-6">Create and manage access for your employees. Riders only see the Orders tab.</p>
                
                <div className="bg-indigo-50/50 p-6 rounded-xl border border-indigo-100 mb-8">
                  <h3 className="font-bold text-indigo-900 mb-4">Add New User</h3>
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">Username</label>
                      <input type="text" value={newStaffUser.username} onChange={e => setNewStaffUser(p => ({...p, username: e.target.value}))} placeholder="e.g. john_rider" className="w-full border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">Password</label>
                      <input type="password" value={newStaffUser.password} onChange={e => setNewStaffUser(p => ({...p, password: e.target.value}))} placeholder="Password" className="w-full border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">Role</label>
                      <select value={newStaffUser.role} onChange={e => setNewStaffUser(p => ({...p, role: e.target.value}))} className="w-full border border-indigo-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500">
                        <option value="rider">Rider (Restricted)</option>
                        <option value="kitchen">Kitchen (KDS View)</option>
                        <option value="admin">Admin (Full Access)</option>
                      </select>
                    </div>
                    <button onClick={createStaffUser} disabled={!newStaffUser.username || !newStaffUser.password} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-6 py-2 rounded-lg transition-colors w-full sm:w-auto h-[42px]">
                      Add Staff
                    </button>
                  </div>
                </div>

                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-500 font-bold text-xs uppercase tracking-wider">
                        <th className="px-6 py-3">Username</th>
                        <th className="px-6 py-3">Role</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {staffUsers.map(u => (
                        <tr key={u.username} className="hover:bg-gray-50/50">
                          <td className="px-6 py-4 font-bold text-gray-800">{u.username}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${u.role === "admin" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                              {u.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {u.username !== "admin" && (
                              <button onClick={() => deleteStaffUser(u.username)} className="text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors">
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* AI Copilot Sidebar */}
      {role === "admin" && (
        <aside className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl transition-transform duration-300 z-50 flex flex-col border-l border-gray-200 ${copilotOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="bg-indigo-600 text-white p-4 flex justify-between items-center shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span><h2 className="font-black">Admin Copilot</h2>
            </div>
            <button onClick={() => setCopilotOpen(false)} className="text-indigo-200 hover:text-white p-1">✕</button>
          </div>
          <div className="p-4 grid grid-cols-3 gap-2 bg-indigo-50 border-b border-indigo-100">
            <button onClick={() => runCopilot("forecast", "")} disabled={copilotBusy} className="bg-white border border-indigo-200 text-indigo-700 text-xs font-bold py-2 rounded-lg shadow-sm">🔮 Forecast</button>
            <button onClick={() => runCopilot("marketing", "")} disabled={copilotBusy} className="bg-white border border-indigo-200 text-indigo-700 text-xs font-bold py-2 rounded-lg shadow-sm">📱 Draft Promo</button>
            <button onClick={() => runCopilot("insights", "")} disabled={copilotBusy} className="bg-white border border-indigo-200 text-indigo-700 text-xs font-bold py-2 rounded-lg shadow-sm">📊 Insights</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {copilotMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${m.role === "user" ? "bg-indigo-600 text-white rounded-br-none" : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-none whitespace-pre-wrap"}`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 bg-white border-t border-gray-100">
            <div className="relative">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (!chatInput.trim() || copilotBusy ? null : runCopilot("chat", chatInput))}
                disabled={copilotBusy} placeholder="Ask about your orders..." className="w-full bg-gray-100 rounded-xl pl-4 pr-12 py-3 text-sm outline-none" />
              <button onClick={() => { setChatInput(""); runCopilot("chat", chatInput); }} disabled={!chatInput.trim() || copilotBusy} className="absolute right-2 top-1.5 bg-indigo-600 text-white p-1.5 rounded-lg">➤</button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
