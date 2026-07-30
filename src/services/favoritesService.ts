import { getSupabase } from "@/services/supabase";

// Serviço central de favoritos. Antes a lógica de add/remove estava duplicada e
// inline (tela de viagem + tela de favoritos), com place_type fixo em "fuel" e sem
// address. Aqui fica um ponto único, reusado pelos 3 lugares que favoritam:
// check-in (viagem ativa), card do posto na rota e a busca da tela de favoritos.

const VALID_TYPES = ["fuel", "food", "cafe", "lodging", "attraction", "other"] as const;

export type FavoritablePlace = {
  place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  rating?: number | null;
  address?: string | null;
  /** Um dos valores do CHECK da tabela; default "fuel" (postos). */
  place_type?: string;
};

/** Deriva o place_type (CHECK da tabela favorites) a partir dos `types` do Google Places. */
export function placeTypeFromGoogleTypes(types: string[] | null | undefined): string {
  const t = new Set(types ?? []);
  if (t.has("gas_station")) return "fuel";
  if (t.has("lodging")) return "lodging";
  if (t.has("cafe")) return "cafe";
  if (t.has("restaurant") || t.has("food") || t.has("meal_takeaway") || t.has("bakery")) return "food";
  if (t.has("tourist_attraction") || t.has("park") || t.has("natural_feature")) return "attraction";
  // point_of_interest/establishment vêm em quase todo resultado do Google → cair em "other".
  return "other";
}

/** place_ids favoritados do usuário atual (para refletir o estado ⭐/☆ na UI). */
export async function listFavoriteIds(): Promise<Set<string>> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase.from("favorites").select("place_id").eq("user_id", user.id);
  return new Set((data ?? []).map((f) => f.place_id));
}

/** Adiciona/atualiza um favorito (idempotente por user_id+place_id). true se ok. */
export async function addFavorite(p: FavoritablePlace): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const place_type =
    p.place_type && (VALID_TYPES as readonly string[]).includes(p.place_type) ? p.place_type : "fuel";
  const { error } = await supabase.from("favorites").upsert(
    {
      user_id: user.id,
      place_id: p.place_id,
      name: p.name,
      place_type,
      address: p.address ?? null,
      latitude: p.latitude,
      longitude: p.longitude,
      rating: p.rating ?? null,
    },
    { onConflict: "user_id,place_id" }
  );
  return !error;
}

/** Remove um favorito por place_id. true se ok. */
export async function removeFavorite(placeId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("place_id", placeId);
  return !error;
}
