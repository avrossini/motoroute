-- Add km_at_checkin and fueled_up to checkins table
ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS km_at_checkin integer,
  ADD COLUMN IF NOT EXISTS fueled_up boolean DEFAULT false;
