export interface StopSuggestion {
  place_id: string;
  name: string;
  rating: number | null;
  total_ratings: number | null;
  is_24h: boolean | null;
  latitude: number;
  longitude: number;
}

export async function fetchStopSuggestions(
  lat: number,
  lng: number
): Promise<StopSuggestion[]> {
  try {
    const res = await fetch("/api/places-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!res.ok) return [];
    const { results } = await res.json();
    return results ?? [];
  } catch {
    return [];
  }
}
