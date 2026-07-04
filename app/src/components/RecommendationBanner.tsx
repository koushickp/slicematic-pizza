"use client";
import { useEffect, useState } from "react";

interface Recommendation {
  pizza: string;
  base: string;
  topping: string;
}

export default function RecommendationBanner() {
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    fetch("/api/ai/recommend")
      .then(r => r.json())
      .then(d => { if (d.recommendation) setRec(d.recommendation); })
      .catch(() => { setRec({ pizza: "Margherita", base: "Thin Crust", topping: "Extra Cheese" }); })
      .finally(() => setLoading(false));
  }, []);

  if (!visible) return null;
  if (loading) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl mb-6 animate-pulse">
        <p className="text-blue-600">Loading AI recommendation...</p>
      </div>
    );
  }
  if (!rec) return null;
  return (
    <div className="p-4 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl mb-6 flex items-start justify-between gap-4">
      <p className="text-gray-800 font-medium">
        AI Pick: <strong>{rec.pizza}</strong> on <strong>{rec.base}</strong> with <strong>{rec.topping}</strong>
      </p>
      <button onClick={() => setVisible(false)} className="text-gray-400 hover:text-gray-600 text-sm">X Hide</button>
    </div>
  );
}
