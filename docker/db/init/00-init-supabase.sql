-- Inicialização do Postgres para rodar a stack Supabase self-hosted.
-- Cria os roles e schemas que os serviços (GoTrue, PostgREST, Storage, Realtime) esperam encontrar.
-- Baseado no script de inicialização oficial do Supabase CLI.

-- Extensions necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- Schemas do Supabase
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS _realtime;
CREATE SCHEMA IF NOT EXISTS supabase_functions;

-- Role: anon (acesso público sem autenticação)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- Role: authenticated (usuários autenticados via JWT)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- Role: service_role (bypassa RLS — usado internamente pelos serviços)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- Role: supabase_admin (administração interna)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS;
  END IF;
END
$$;
ALTER ROLE supabase_admin WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_admin;

-- Role: authenticator (usado pelo PostgREST para trocar de role via JWT)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
END
$$;
ALTER ROLE authenticator WITH PASSWORD 'postgres';
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
GRANT supabase_admin TO authenticator;

-- Role: supabase_auth_admin (usado pelo GoTrue para migrations de auth)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOINHERIT LOGIN;
  END IF;
END
$$;
ALTER ROLE supabase_auth_admin WITH PASSWORD 'postgres';
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;

-- Role: supabase_storage_admin (usado pelo Storage API)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin NOINHERIT LOGIN;
  END IF;
END
$$;
ALTER ROLE supabase_storage_admin WITH PASSWORD 'postgres';
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;

-- Grants de schema para os roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO supabase_admin;

-- pg_net extension (usada pelo Realtime e Functions)
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- pgsodium (criptografia — usada pelo Vault do Supabase)
CREATE EXTENSION IF NOT EXISTS pgsodium;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
