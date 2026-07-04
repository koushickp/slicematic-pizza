// app/page.tsx
"use client";
import { useState, useEffect } from "react";
import RecommendationBanner from '@/components/RecommendationBanner';
import ChatOrder from '@/components/ChatOrder';
import ManualOrder from '@/components/ManualOrder';

export default function Home() {
  const [activeTab, setActiveTab] = useState<"ai"|"manual">("ai");
  const [storeStatus, setStoreStatus] = useState<"loading"|"online"|"offline">("loading");

  useEffect(() => {
    fetch("/api/inventory").then(r => r.json()).then(data => {
       const statusItem = (data.inventory || []).find((i:any) => i.item_id === "store_status");
       if (statusItem && statusItem.stock_count === 0) setStoreStatus("offline");
       else setStoreStatus("online");
    }).catch(() => setStoreStatus("online"));
  }, []);

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 bg-white min-h-screen text-gray-900 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b pb-4">
        <h1 className="text-3xl font-black text-gray-900 tracking-tighter flex items-center gap-2">
          <span className="text-4xl drop-shadow-sm">🍕</span> SliceMatic
        </h1>
        
        <div className="flex bg-gray-100 p-1.5 rounded-xl self-stretch md:self-auto shadow-inner">
          <button 
            onClick={() => setActiveTab("ai")}
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "ai" ? "bg-white text-orange-600 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700"}`}
          >
            🤖 Order via AI Chat
          </button>
          <button 
            onClick={() => setActiveTab("manual")}
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "manual" ? "bg-white text-orange-600 shadow-sm ring-1 ring-black/5" : "text-gray-500 hover:text-gray-700"}`}
          >
            🛒 Order Manually
          </button>
        </div>
      </div>

      <RecommendationBanner />

      <div className="mt-8 transition-opacity duration-300">
        {activeTab === "ai" ? (
          <div className="animate-fade-in-up">
            <ChatOrder />
          </div>
        ) : (
          <div className="animate-fade-in-up">
            <ManualOrder />
          </div>
        )}
      </div>

      {storeStatus === "offline" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-lg border-t-8 border-red-500 animate-fade-in-up">
             <span className="text-6xl mb-4 block">🛑</span>
             <h2 className="text-4xl font-black text-gray-900 mb-4 tracking-tighter">Store Offline</h2>
             <p className="text-gray-600 font-medium text-lg">We are currently not accepting orders. Please check back later for the best pizza in town!</p>
          </div>
        </div>
      )}
    </main>
  );
}
