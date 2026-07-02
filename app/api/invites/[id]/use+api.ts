const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(
  /localhost:54321|127\.0\.0\.1:54321/,
  "kong:8000"
);
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY ?? "";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: "Server config missing" }, { status: 500 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // user_id is optional
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invite_codes?id=eq.${params.id}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "usado",
        used_at: new Date().toISOString(),
        used_by_user_id: body.user_id ?? null,
      }),
    }
  );

  if (!res.ok) {
    return Response.json({ error: "Erro ao marcar convite como usado" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
