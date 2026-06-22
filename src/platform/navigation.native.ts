import { Linking } from "react-native";
import type { NavigationPlatform } from "./navigation";

export const openNavigation: NavigationPlatform["openNavigation"] = (lat, lng, label) => {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.openURL(url);
};
