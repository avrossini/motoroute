ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS default_navigation_app text DEFAULT NULL
  CHECK (default_navigation_app IN ('google_maps', 'waze'));
