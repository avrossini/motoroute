import { useEffect, useState } from "react";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/services/supabase";

SplashScreen.preventAutoHideAsync();

function useAuthRedirect(session: Session | null, ready: boolean) {
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;

    const inAuth = segments[0] === "(auth)";

    if (!session && !inAuth) {
      router.replace("/(auth)/login");
    } else if (session && inAuth) {
      router.replace("/(tabs)/");
    }
  }, [session, ready, segments]);
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      SplashScreen.hideAsync();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  useAuthRedirect(session, ready);

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
