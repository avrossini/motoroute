-- ════════════════════════════════════════════════════════════
-- RPCs de analytics do painel admin
-- ════════════════════════════════════════════════════════════
-- Motivação: o admin agregava em JS sobre .select() sem paginação (teto de ~1000
-- linhas do PostgREST) e contava "usuários" como LINHAS de tabelas filhas, o que
-- inflava o funil e gerava taxas > 100%. Estas funções agregam no banco:
--   • usuários DISTINTOS por etapa do funil (coorte de signup);
--   • "convertido" = linked_user_id IS NOT NULL (definição única);
--   • timeout conta como erro no consumo de API.
-- Só o admin (service_role) executa — SECURITY DEFINER + REVOKE de anon/authenticated.
--
-- Notas de robustez p/ rodar também no SQL Editor do Supabase:
--   • TODAS as tabelas são schema-qualificadas (public.* / auth.users) — o editor
--     não honra o SET search_path na validação do corpo em CREATE.
--   • DROP antes de CREATE — idempotente e evita conflito de dono/retorno com uma
--     execução parcial anterior.

drop function if exists public.admin_user_stats();
drop function if exists public.admin_funnel(timestamptz);
drop function if exists public.admin_cohorts();
drop function if exists public.admin_api_usage_by_type(timestamptz);
drop function if exists public.admin_errors_by_endpoint(timestamptz);

-- ── Estatísticas de usuário (fonte única de "usuários cadastrados") ──────────
create function public.admin_user_stats()
returns table (total bigint, active_30d bigint, email_confirmed bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(*)::bigint,
    count(*) filter (where last_sign_in_at >= now() - interval '30 days')::bigint,
    count(*) filter (where email_confirmed_at is not null)::bigint
  from auth.users;
$$;

-- ── Funil de ativação (coorte: usuários criados desde p_since) ───────────────
create function public.admin_funnel(p_since timestamptz)
returns table (
  leads              bigint,
  leads_qualificados bigint,
  usuarios           bigint,
  com_moto           bigint,
  com_viagem         bigint,
  com_roteiro        bigint,
  com_checkin        bigint,
  com_feedback       bigint,
  viagens_ativas     bigint
)
language sql
security definer
set search_path = public
as $$
  with cohort as (
    select id from auth.users where created_at >= p_since
  )
  select
    (select count(*) from public.waitlist where created_at >= p_since)::bigint,
    (select count(*) from public.waitlist
       where created_at >= p_since
         and status in ('qualificado','convidado','aguardando_cadastro',
                        'cadastrado','testando','feedback_recebido'))::bigint,
    (select count(*) from cohort)::bigint,
    (select count(distinct m.user_id) from public.motorcycles m
       where m.user_id in (select id from cohort))::bigint,
    (select count(distinct t.user_id) from public.trips t
       where t.user_id in (select id from cohort))::bigint,
    (select count(distinct t.user_id) from public.trips t
       where t.user_id in (select id from cohort)
         and exists (select 1 from public.segments s where s.trip_id = t.id))::bigint,
    (select count(distinct ck.user_id) from public.checkins ck
       where ck.user_id in (select id from cohort)
         and coalesce(ck.skipped, false) = false)::bigint,
    (select count(distinct f.user_id) from public.user_feedback f
       where f.user_id in (select id from cohort))::bigint,
    (select count(distinct t.user_id) from public.trips t
       where t.user_id in (select id from cohort)
         and t.status = 'active')::bigint;
$$;

-- ── Cohorts por origem (source) do lead ─────────────────────────────────────
create function public.admin_cohorts()
returns table (
  source       text,
  total_leads  bigint,
  convertidos  bigint
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(source, 'desconhecido') as source,
    count(*)::bigint as total_leads,
    count(*) filter (where linked_user_id is not null)::bigint as convertidos
  from public.waitlist
  group by coalesce(source, 'desconhecido')
  order by count(*) desc;
$$;

-- ── Consumo de API por tipo (timeout conta como erro) ───────────────────────
create function public.admin_api_usage_by_type(p_since timestamptz)
returns table (
  api_type   text,
  calls      bigint,
  errors     bigint,
  cache_hits bigint,
  cost_cents numeric
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(api_type, '—') as api_type,
    count(*)::bigint as calls,
    count(*) filter (where request_status in ('error','timeout'))::bigint as errors,
    count(*) filter (where request_status = 'cache_hit')::bigint as cache_hits,
    coalesce(sum(estimated_cost_cents), 0) as cost_cents
  from public.api_usage_logs
  where created_at >= p_since
  group by coalesce(api_type, '—')
  order by count(*) desc;
$$;

-- ── Erros agregados por endpoint ────────────────────────────────────────────
create function public.admin_errors_by_endpoint(p_since timestamptz)
returns table (
  endpoint     text,
  total        bigint,
  last_seen    timestamptz,
  error_codes  text
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(endpoint, '—') as endpoint,
    count(*)::bigint as total,
    max(created_at) as last_seen,
    string_agg(distinct coalesce(error_code, ''), ', ')
      filter (where error_code is not null and error_code <> '') as error_codes
  from public.error_logs
  where created_at >= p_since
  group by coalesce(endpoint, '—')
  order by count(*) desc;
$$;

-- ── Permissões: só service_role (o admin) ───────────────────────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.admin_user_stats()',
    'public.admin_funnel(timestamptz)',
    'public.admin_cohorts()',
    'public.admin_api_usage_by_type(timestamptz)',
    'public.admin_errors_by_endpoint(timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
