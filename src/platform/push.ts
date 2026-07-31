export type PushStatus = "unsupported" | "denied" | "subscribed" | "unsubscribed";

export interface PushPlatform {
  /** Estado atual do push neste dispositivo/navegador. */
  getPushStatus(): Promise<PushStatus>;
  /** Pede permissão (precisa vir de um gesto do usuário), assina e salva no Supabase. */
  subscribePush(): Promise<PushStatus>;
  /** Cancela a assinatura no navegador e remove do Supabase. */
  unsubscribePush(): Promise<PushStatus>;
}

// Implementação real em push.web.ts; no-op em push.native.ts (o Metro resolve por
// plataforma). Declaradas aqui só para o TypeScript, que resolve este arquivo-base.
export declare const getPushStatus: PushPlatform["getPushStatus"];
export declare const subscribePush: PushPlatform["subscribePush"];
export declare const unsubscribePush: PushPlatform["unsubscribePush"];
