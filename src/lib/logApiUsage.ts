const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const COST: Record<string, number> = {
  directions: 1,    // 0.5¢ × 2 (each leg)
  geocoding: 1,     // 0.5¢
  places_text: 6,   // 3.2¢ ≈ 6 units of 0.5¢
  places_photo: 1,  // 0.7¢
  weather: 0,       // 0.1¢ ≈ 0 (free tier)
  generate_segments: 5, // multiple directions calls
};

function getUserIdFromRequest(request: Request): string | null {
  try {
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function logApiUsage(
  request: Request,
  opts: {
    provider: "google" | "weatherapi";
    api_type: string;
    status: "success" | "error";
    duration_ms: number;
    trip_id?: string | null;
    error_code?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  const user_id = getUserIdFromRequest(request);
  const estimated_cost_cents = COST[opts.api_type] ?? 1;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/api_usage_logs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id,
        trip_id: opts.trip_id ?? null,
        provider: opts.provider,
        api_type: opts.api_type,
        request_status: opts.status,
        duration_ms: opts.duration_ms,
        estimated_cost_cents,
        error_code: opts.error_code ?? null,
        metadata_json: opts.metadata ?? null,
      }),
    });
  } catch {
    // logging errors must never break the main request
  }
}
