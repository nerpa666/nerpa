import { createClient } from "@supabase/supabase-js";

// Значення беруться зі змінних оточення (Vercel) або з фолбеку нижче (для локального тесту).
const url = import.meta.env.VITE_SUPABASE_URL || "https://zxfojunmxaiymwriiemy.supabase.co";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_kZK3xtEov44SkXz5Pkz2VQ_3Ak_SzaJ";

export const supabase = createClient(url, key);
