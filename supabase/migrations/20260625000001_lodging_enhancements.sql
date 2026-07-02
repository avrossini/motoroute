-- Remover NOT NULL de campos que passam a ser opcionais (entradas manuais)
ALTER TABLE lodging_suggestions ALTER COLUMN place_id DROP NOT NULL;
ALTER TABLE lodging_suggestions ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE lodging_suggestions ALTER COLUMN longitude DROP NOT NULL;

-- Novos campos
ALTER TABLE lodging_suggestions
  ADD COLUMN IF NOT EXISTS source               text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS address              text,
  ADD COLUMN IF NOT EXISTS lodging_type         text,
  ADD COLUMN IF NOT EXISTS guest_count          integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS booking_url          text,
  ADD COLUMN IF NOT EXISTS notes                text,
  ADD COLUMN IF NOT EXISTS parking_requirement  text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS breakfast_requirement text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS parking_status       text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS breakfast_status     text NOT NULL DEFAULT 'unknown';
