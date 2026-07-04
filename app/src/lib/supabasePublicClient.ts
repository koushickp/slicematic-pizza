/**
 * supabasePublicClient.ts
 * Client-side Supabase instance using NEXT_PUBLIC keys.
 * Used ONLY for Realtime subscriptions (e.g., admin live feed).
 * For data mutations, use server-side API routes instead.
 */
import { createClient } from "@supabase/supabase-js";

export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
