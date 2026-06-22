import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { getSupabase } from "@/services/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    setLoading(true);
    setError(null);

    const { error: authError } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (authError) {
      setError("E-mail ou senha incorretos.");
    } else {
      router.replace("/(tabs)/");
    }
  }

  async function handleSignUp() {
    if (!email || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    setLoading(true);
    setError(null);

    const { error: authError } = await getSupabase().auth.signUp({ email, password });

    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setError("Conta criada! Verifique seu e-mail para confirmar.");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>MotoRoute</Text>
        <Text style={styles.subtitle}>Planejamento de viagens de moto</Text>
      </View>

      <View style={styles.form}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor="#999"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSignUp} disabled={loading}>
          <Text style={styles.linkText}>Não tem conta? Cadastre-se</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    padding: 24,
  },
  header: {
    marginBottom: 48,
    alignItems: "center",
  },
  logo: {
    fontSize: 36,
    fontWeight: "800",
    color: "#C97826",
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    color: "#999",
    marginTop: 6,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
  },
  btnPrimary: {
    backgroundColor: "#C97826",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  linkText: {
    color: "#C97826",
    textAlign: "center",
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: "#E53935",
    fontSize: 13,
    textAlign: "center",
    backgroundColor: "#2A1A1A",
    padding: 10,
    borderRadius: 8,
  },
});
