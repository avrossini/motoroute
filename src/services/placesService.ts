export interface StopSuggestion {
  place_id: string;
  name: string;
  rating: number | null;
  total_ratings: number | null;
  is_24h: boolean | null;
  latitude: number;
  longitude: number;
}

export interface StopSuggestionsResult {
  results: StopSuggestion[];
  low_rating: boolean;
  radius_km: number;
}

export async function fetchStopSuggestions(
  lat: number,
  lng: number
): Promise<StopSuggestionsResult> {
  try {
    const res = await fetch("/api/places-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!res.ok) return { results: [], low_rating: false, radius_km: 5 };
    const json = await res.json();
    return {
      results: json.results ?? [],
      low_rating: json.low_rating ?? false,
      radius_km: json.radius_km ?? 5,
    };
  } catch {
    return { results: [], low_rating: false, radius_km: 5 };
  }
}
