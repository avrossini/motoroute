import type { NavigationPlatform } from "./navigation";

export const openNavigation: NavigationPlatform["openNavigation"] = (lat, lng, label) => {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, "_blank", "noopener,noreferrer");
};
