import type { PushPlatform } from "./push";

// Web Push é exclusivo da web (PWA). No app nativo (EAS), notificações push
// serão um projeto futuro via expo-notifications — caminho totalmente distinto.
export const getPushStatus: PushPlatform["getPushStatus"] = async () => "unsupported";
export const subscribePush: PushPlatform["subscribePush"] = async () => "unsupported";
export const unsubscribePush: PushPlatform["unsubscribePush"] = async () => "unsupported";
