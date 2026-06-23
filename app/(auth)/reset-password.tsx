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

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleUpdate() {
    if (!password || !confirm) {
      setError("Preencha os dois campos.");
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

    const { error: authError } = await getSupabase().auth.updateUser({ password });

    setLoading(false);
    if (authError) {
      setError("Não foi possível atualizar a senha. O link pode ter expirado.");
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>MotoRoute</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.successText}>Senha atualizada com sucesso!</Text>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.btnPrimaryText}>Ir para o login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>MotoRoute</Text>
        <Text style={styles.subtitle}>Nova senha</Text>
      </View>

      <View style={styles.form}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Nova senha"
          placeholderTextColor="#999"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirmar nova senha"
          placeholderTextColor="#999"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleUpdate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>Salvar nova senha</Text>
          )}
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
    padding: 12,
    borderRadius: 8,
  },
});
