-- Add geocoded coordinates for origin and destination on trips.
-- These are populated at trip creation time via the geocoding picker.
alter table trips
  add column if not exists origin_lat  double precision,
  add column if not exists origin_lng  double precision,
  add column if not exists dest_lat    double precision,
  add column if not exists dest_lng    double precision;
