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
import * as Linking from "expo-linking";
import { getSupabase } from "@/services/supabase";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (!email) {
      setError("Informe seu e-mail.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    const redirectTo = Linking.createURL("reset-password");
    const { error: authError } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);
    if (authError) {
      setError("Não foi possível enviar o e-mail. Verifique o endereço.");
    } else {
      setMessage("E-mail enviado! Verifique sua caixa de entrada e siga o link para redefinir a senha.");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>MotoRoute</Text>
        <Text style={styles.subtitle}>Recuperar senha</Text>
      </View>

      <View style={styles.form}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        {message && <Text style={styles.successText}>{message}</Text>}

        {!message && (
          <>
            <Text style={styles.description}>
              Informe o e-mail cadastrado e enviaremos um link para redefinir sua senha.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={handleReset}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Enviar link</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.back()}>
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
  successText: {
    color: "#4CAF50",
    fontSize: 13,
    textAlign: "center",
    backgroundColor: "#1A2A1A",
    padding: 10,
    borderRadius: 8,
    lineHeight: 20,
  },
});
