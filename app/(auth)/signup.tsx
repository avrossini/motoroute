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
  ScrollView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getSupabase } from "@/services/supabase";

export default function SignupScreen() {
  const { code, inviteId, email: inviteEmail, cohort } = useLocalSearchParams<{
    code: string;
    inviteId: string;
    email?: string;
    cohort: string;
  }>();

  const [email, setEmail] = useState(inviteEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSignUp() {
    if (!email || !password || !confirm) {
      setError("Preencha todos os campos.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await getSupabase().auth.signUp({
        email,
        password,
        options: {
          data: { invite_code: code, cohort: cohort ?? "alfa" },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // Marca o convite como usado
      if (inviteId) {
        await fetch(`/api/invites/${inviteId}/use`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: data.user?.id ?? null }),
        });
      }

      setSuccess(true);
    } catch (e: any) {
      setError(e.message ?? "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <KeyboardAvoidingView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>MotoRoute</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.successText}>
            Conta criada! Verifique seu e-mail para confirmar o cadastro e então faça login.
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.btnPrimaryText}>Ir para o login</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>MotoRoute</Text>
          <Text style={styles.subtitle}>Criar conta</Text>
          {cohort && (
            <View style={styles.cohortBadge}>
              <Text style={styles.cohortText}>{cohort}</Text>
            </View>
          )}
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
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Senha (mín. 8 caracteres)"
            placeholderTextColor="#999"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirmar senha"
            placeholderTextColor="#999"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.btnPrimary, loading && styles.btnDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>Criar conta</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} disabled={loading}>
            <Text style={styles.linkText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  scroll: {
    flexGrow: 1,
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
  cohortBadge: {
    marginTop: 10,
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#C97826",
  },
  cohortText: {
    color: "#C97826",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
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
  successText: {
    color: "#4CAF50",
    fontSize: 14,
    textAlign: "center",
    backgroundColor: "#1A2A1A",
    padding: 16,
    borderRadius: 12,
    lineHeight: 22,
  },
});
