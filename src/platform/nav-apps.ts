// Metadados dos apps de navegação — módulo NÃO dividido por plataforma (sem .web/.native),
// então NAV_APPS existe em runtime em todas as plataformas (o `navigation` é split e o
// Metro resolveria só o .web/.native, onde um valor de runtime como este não estaria).
// Fonte ÚNICA de rótulo + ícone (MaterialCommunityIcons), usada pelas Preferências e pelo
// botão "Navegar" da viagem ativa.
export type NavApp = 'google_maps' | 'waze';

export const NAV_APPS = {
  google_maps: { label: 'Google Maps', icon: 'google-maps' },
  waze: { label: 'Waze', icon: 'waze' },
} as const;
