import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/services/supabase";

SplashScreen.preventAutoHideAsync();

function useAuthRedirect(session: Session | null, ready: boolean, isRecovery: boolean) {
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;

    const inAuth = segments[0] === "(auth)";

    if (!session && !inAuth) {
      router.replace("/(auth)/login");
    } else if (session && inAuth && !isRecovery) {
      router.replace("/(tabs)/");
    }
  }, [session, ready, segments, isRecovery]);
}

function isRecoveryUrl() {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location.hash.includes("type=recovery")
  );
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);

      if (isRecoveryUrl()) {
        setIsRecovery(true);
        setReady(true);
        SplashScreen.hideAsync();
        router.replace("/(auth)/reset-password");
      } else {
        setReady(true);
        SplashScreen.hideAsync();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
        router.replace("/(auth)/reset-password");
      } else if (event === "USER_UPDATED") {
        setIsRecovery(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useAuthRedirect(session, ready, isRecovery);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trip" />
        <Stack.Screen name="stop" />
        <Stack.Screen name="lodging" />
        <Stack.Screen name="favoritas" />
        <Stack.Screen name="preferencias" />
        <Stack.Screen name="minha-moto" />
      </Stack>
    </>
  );
}
