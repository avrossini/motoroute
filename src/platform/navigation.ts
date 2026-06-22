export interface NavigationPlatform {
  openNavigation(lat: number, lng: number, label?: string): void;
}
