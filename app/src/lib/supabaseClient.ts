/**
 * supabaseClient.ts — Supabase client.
 * Import ONLY in server-side API routes (src/app/api/**).
 * Never import in page.tsx or client components.
 */
import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);
