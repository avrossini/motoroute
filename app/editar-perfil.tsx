import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import { getSupabase } from "@/services/supabase";
import { pickImage } from "@/platform/image-picker";

export default function EditarPerfilScreen() {
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, handle, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? "");
        setHandle(data.handle ?? "");
        setAvatarUrl(data.avatar_url ?? null);
      }
    }
    setLoading(false);
  }

  // Foto de perfil: escolhe imagem, sobe para o bucket 'avatars' (path por uid),
  // grava avatar_url com ?v=timestamp (cache-bust do CDN). Web usa <input>, nativo picker.
  async function onPickAvatar() {
    const picked = await pickImage();
    if (!picked) return;
    setUploading(true);
    try {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Sessão expirada", "Faça login novamente.");
        return;
      }
      const path = `${user.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, picked.blob, { upsert: true, contentType: picked.mimeType || "image/jpeg" });
      if (upErr) {
        Alert.alert("Erro ao enviar foto", upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (updErr) {
        Alert.alert("Erro ao salvar foto", updErr.message);
        return;
      }
      setAvatarUrl(url);
    } catch (e: any) {
      Alert.alert("Erro ao enviar foto", e?.message ?? "Tente novamente.");
    } finally {
      setUploading(false);
      // libera o objectURL de preview (web); no exibimos a URL pública, então ele não é usado
      if (picked.uri?.startsWith("blob:") && typeof URL !== "undefined" && URL.revokeObjectURL) {
        URL.revokeObjectURL(picked.uri);
      }
    }
  }

  async function save() {
    const name = displayName.trim();
    if (!name) {
      Alert.alert("Nome obrigatório", "Informe como você quer aparecer.");
      return;
    }
    const h = handle.trim().toLowerCase();
    if (h && !/^[a-z0-9_]{3,20}$/.test(h)) {
      Alert.alert("@usuário inválido", "Use 3–20 caracteres: letras minúsculas, números ou _.");
      return;
    }

    setSaving(true);
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      Alert.alert("Sessão expirada", "Faça login novamente.");
      return;
    }

    // disponibilidade do handle (case-insensitive, ignorando o próprio)
    if (h) {
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", h)
        .neq("id", user.id)
        .maybeSingle();
      if (taken) {
        setSaving(false);
        Alert.alert("@usuário indisponível", `@${h} já está em uso. Escolha outro.`);
        return;
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name, handle: h || null })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      // 23505 = violação de unique (corrida no handle)
      Alert.alert("Erro ao salvar", error.code === "23505" ? "Esse @usuário já está em uso." : error.message);
    } else {
      router.back();
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#C97826" size="large" />
      </View>
    );
  }

  const letter = (displayName?.[0] ?? "?").toUpperCase();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar perfil</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.avatarWrap}>
          <TouchableOpacity onPress={onPickAvatar} activeOpacity={0.8} disabled={uploading}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarLetter}>{letter}</Text>
              </View>
            )}
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.avatarHint}>{uploading ? "Enviando…" : "Toque para trocar a foto"}</Text>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>IDENTIDADE</Text>
          <Field
            label="Nome *"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Como você aparece para outros pilotos"
          />
          <Field
            label="@usuário"
            value={handle}
            onChangeText={(v) => setHandle(v.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="andre_rossini"
            hint="3–20 caracteres: letras minúsculas, números ou _. Usado no futuro para te encontrarem."
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Salvar</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        autoCorrect={false}
        autoCapitalize={autoCapitalize ?? "sentences"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5F5" },
  container: { flex: 1, backgroundColor: "#F5F5F5" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  backBtnText: { fontSize: 22, color: "#fff" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: "#fff" },

  avatarWrap: { alignItems: "center", marginTop: 24, gap: 8 },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: "#C97826",
    justifyContent: "center", alignItems: "center",
  },
  avatarImg: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#eee" },
  avatarLetter: { fontSize: 34, fontWeight: "700", color: "#fff" },
  avatarOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 42, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  avatarHint: { fontSize: 12, color: "#C97826", fontWeight: "600" },

  group: { marginHorizontal: 16, marginTop: 24 },
  groupLabel: { fontSize: 11, fontWeight: "700", color: "#999", letterSpacing: 0.8, marginBottom: 8 },

  field: {
    backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14,
    paddingTop: 10, paddingBottom: 6, marginBottom: 8,
  },
  fieldLabel: { fontSize: 11, fontWeight: "600", color: "#888", marginBottom: 2 },
  fieldHint: { fontSize: 11, color: "#aaa", marginBottom: 2, fontStyle: "italic" },
  fieldInput: {
    fontSize: 15, color: "#1A1A1A", paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: "#F0F0F0",
  },

  saveBtn: {
    backgroundColor: "#C97826", borderRadius: 14, marginHorizontal: 16,
    marginTop: 28, paddingVertical: 16, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
