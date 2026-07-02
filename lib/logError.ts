const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

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

export async function logError(
  request: Request,
  opts: {
    endpoint: string;
    error: unknown;
    context?: Record<string, unknown>;
  }
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  const user_id = getUserIdFromRequest(request);

  const err = opts.error;
  const error_code =
    err instanceof Error ? err.name : typeof err === "string" ? err : "UnknownError";
  const stack_summary =
    err instanceof Error
      ? (err.stack ?? err.message).slice(0, 500)
      : String(err).slice(0, 500);

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/error_logs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id,
        endpoint: opts.endpoint,
        error_code,
        stack_summary,
        context_json: opts.context ?? null,
      }),
    });
  } catch {
    // logging errors must never break the main request
  }
}
