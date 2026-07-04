"use client";
import { useState } from "react";
import { paymentMessage } from "@/lib/pricing";

export default function ChatOrder() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<{role:string, content:string}[]>([]);
  const [responseHtml, setResponseHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<any>(null);

  const submit = async () => {
    setLoading(true); setError(null);
    
    const newMsgs = [...messages, { role: "user", content: message }];
    setMessages(newMsgs);
    setMessage("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      
      setMessages([...newMsgs, { role: "assistant", content: data.reply }]);
      
      if (data.type === "question") {
        setResponseHtml(`<p class="text-gray-800 font-medium">🤖 ${data.reply}</p>`);
        setPreviewOrder(null);
      } else if (data.type === "preview") {
        setPreviewOrder(data.order);
        setResponseHtml(`<p class="text-gray-800 font-medium mb-3">🤖 ${data.reply.replace(/\n/g, "<br/>")}</p>`);
      } else {
        setResponseHtml(`<p class="text-red-600 font-medium">🤖 ${data.reply}</p>`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewOrder)
      });
      const data = await res.json();
      if (data.success) {
        const payMsg = paymentMessage(previewOrder.payment, previewOrder.bill.finalTotal);
        setResponseHtml(`<p class="text-green-600 font-bold">✅ Order confirmed! Order ID: ${data.orderId.split("-")[0]}</p><p class="text-gray-700 mt-2 font-medium">${payMsg}</p>`);
        setPreviewOrder(null);
        setMessages([]);
      } else {
        throw new Error(data.error);
      }
    } catch(e:any) { setError(e.message); } 
    finally { setLoading(false); }
  }

  return (
    <div className="border rounded-xl p-6 mt-6 bg-white shadow-sm">
      <h2 className="text-lg font-semibold mb-3">Chat to Order</h2>
      {responseHtml && (
        <div className="mb-4 p-4 border rounded-lg bg-indigo-50/50">
          <div dangerouslySetInnerHTML={{ __html: responseHtml }} />
          {previewOrder && (
            <button onClick={confirm} disabled={loading} className="mt-3 px-4 py-2 bg-green-500 text-white font-bold rounded hover:bg-green-600">
              Confirm & Place Order
            </button>
          )}
        </div>
      )}
      <textarea
        rows={3}
        className="w-full p-3 border rounded-lg mb-3 text-gray-800"
        placeholder={messages.length ? 'Reply here...' : 'e.g. "I want 2 spicy Margherita with extra cheese"'}
        value={message}
        onChange={e => setMessage(e.target.value)}
        onKeyDown={e => e.key === "Enter" && !e.shiftKey && submit()}
        disabled={loading}
      />
      <button
        onClick={submit}
        disabled={loading || !message.trim()}
        className="px-5 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-bold"
      >
        {loading ? "Processing..." : (messages.length ? "Reply" : "Place Order")}
      </button>
      {error && <p className="mt-3 text-red-600">{error}</p>}
    </div>
  );
}
