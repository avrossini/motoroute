export interface NavigationPlatform {
  openNavigation(lat: number, lng: number, app?: 'google_maps' | 'waze'): void;
}
