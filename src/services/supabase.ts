import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

// Singleton lazy — evita inicializar durante SSR/static bundle do Expo Web.
// O @supabase/realtime-js verifica WebSocket ao ser importado; em Node.js 20
// (ambiente de bundle) isso lança erro. Criamos o cliente só quando chamado
// pela primeira vez no browser/device, onde WebSocket está disponível.
let _client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (_client) return _client;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase não configurado. Preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no .env"
    );
  }

  _client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: Platform.OS !== "web" ? AsyncStorage : undefined,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
    },
  });

  return _client;
}

// Atalho para uso direto — equivalente ao antigo `supabase.from(...)`.
// Só chamar dentro de componentes ou hooks (nunca no nível de módulo).
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
