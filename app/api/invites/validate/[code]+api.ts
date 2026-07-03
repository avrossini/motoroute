const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(
  /localhost:54321|127\.0\.0\.1:54321/,
  "kong:8000"
);
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY ?? "";

export async function GET(
  _request: Request,
  { code: rawCode }: { code: string }
): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: "Server config missing" }, { status: 500 });
  }

  const code = rawCode.trim().toUpperCase();

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invite_codes?code=eq.${encodeURIComponent(code)}&limit=1`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );

  if (!res.ok) {
    return Response.json({ error: "Erro ao consultar banco" }, { status: 500 });
  }

  const rows = await res.json();
  const invite = rows[0];

  if (!invite) {
    return Response.json({ error: "Código inválido" }, { status: 404 });
  }

  if (invite.status === "usado") {
    return Response.json({ error: "Código já foi utilizado" }, { status: 409 });
  }

  if (invite.status === "cancelado") {
    return Response.json({ error: "Código foi cancelado" }, { status: 403 });
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return Response.json({ error: "Código expirado" }, { status: 410 });
  }

  // Marca como "aberto" (sendo usado)
  await fetch(`${SUPABASE_URL}/rest/v1/invite_codes?id=eq.${invite.id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status: "aberto" }),
  });

  return Response.json({
    valid: true,
    inviteId: invite.id,
    cohort: invite.cohort,
    email: invite.email ?? null,
  });
}
