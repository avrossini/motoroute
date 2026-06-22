import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "MotoRoute",
  slug: "motoroute-planner",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#1A1A1A",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.motoroute.planner",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#1A1A1A",
    },
    package: "com.motoroute.planner",
  },
  web: {
    bundler: "metro",
    output: "server",
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-router"],
  scheme: "motoroute",
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    weatherApiKey: process.env.EXPO_PUBLIC_WEATHER_API_KEY,
    eas: {
      projectId: "e384fe33-3a30-4510-8d49-0ce1cc8a517a",
    },
  },
});
