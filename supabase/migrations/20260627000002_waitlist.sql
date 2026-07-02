CREATE TABLE IF NOT EXISTS waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL UNIQUE,
  whatsapp    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public sign-up)
CREATE POLICY "waitlist_anon_insert"
  ON waitlist FOR INSERT
  TO anon
  WITH CHECK (true);
