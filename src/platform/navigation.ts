import type { NavApp } from './nav-apps';

export interface NavigationPlatform {
  openNavigation(lat: number, lng: number, app?: NavApp): void;
}

// Implementação real em navigation.web.ts / navigation.native.ts (o Metro resolve por
// plataforma). Declarada aqui só para o TypeScript, que resolve este arquivo-base.
export declare const openNavigation: NavigationPlatform['openNavigation'];
