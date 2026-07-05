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
import { router, useLocalSearchParams } from "expo-router";

export default function InviteCodeScreen() {
  // Código pode vir pré-preenchido pelo link do email de convite (?code=XXXX)
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((codeParam ?? "").toUpperCase());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleValidate() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Digite seu código de convite.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/invites/validate/${trimmed}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Código inválido.");
        return;
      }

      const params = new URLSearchParams({
        code: trimmed,
        inviteId: data.inviteId,
        cohort: data.cohort,
      });
      if (data.email) params.set("email", data.email);

      router.push(`/(auth)/signup?${params.toString()}`);
    } catch {
      setError("Erro ao validar código. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>MotoRoute</Text>
        <Text style={styles.subtitle}>Código de convite</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.description}>
          O MotoRoute está em alfa fechado. Digite seu código de convite para criar uma conta.
        </Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Ex: ABC12345"
          placeholderTextColor="#999"
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          maxLength={8}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.btnPrimary, (!code.trim() || loading) && styles.btnDisabled]}
          onPress={handleValidate}
          disabled={!code.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>Validar código</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} disabled={loading}>
          <Text style={styles.linkText}>Voltar ao login</Text>
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
  description: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  input: {
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    padding: 16,
    fontSize: 22,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
    textAlign: "center",
    letterSpacing: 4,
    fontWeight: "700",
  },
  btnPrimary: {
    backgroundColor: "#C97826",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: {
    backgroundColor: "#5A4010",
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
