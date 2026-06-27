import type { NavigationPlatform } from "./navigation";

export const openNavigation: NavigationPlatform["openNavigation"] = (lat, lng, app = 'google_maps') => {
  const url = app === 'waze'
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  window.open(url, "_blank", "noopener,noreferrer");
};
