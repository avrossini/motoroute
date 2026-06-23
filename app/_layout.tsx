import { useEffect, useState } from "react";
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

function getInitialRecovery() {
  if (typeof window === "undefined") return false;
  return window.location.hash.includes("type=recovery");
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isRecovery, setIsRecovery] = useState(getInitialRecovery);

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      SplashScreen.hideAsync();
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
