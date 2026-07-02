// In Docker the expo container can't reach localhost:54321 — use internal service name instead
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(
  /localhost:54321|127\.0\.0\.1:54321/,
  "kong:8000"
);
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY ?? "";

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

export async function POST(request: Request): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: "Server config missing" }, { status: 500 });
  }

  const user_id = getUserIdFromRequest(request);
  if (!user_id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { feedback_type, severity, title, body: feedbackBody, trip_id, tags } = body;

  if (!feedbackBody || !feedback_type) {
    return Response.json({ error: "feedback_type e body sao obrigatorios" }, { status: 400 });
  }

  const validTypes = ["bug", "sugestao", "duvida", "elogio", "dor_planejamento"];
  if (!validTypes.includes(feedback_type)) {
    return Response.json({ error: "feedback_type invalido" }, { status: 400 });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_feedback`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id,
      trip_id: trip_id ?? null,
      feedback_type,
      severity: severity ?? "media",
      title: title ?? null,
      body: feedbackBody,
      tags: tags ?? [],
      status: "novo",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return Response.json({ error: err.message ?? "Erro ao salvar feedback" }, { status: 500 });
  }

  const data = await res.json();
  return Response.json(data[0] ?? { ok: true }, { status: 201 });
}

