import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { getSupabase } from "@/services/supabase";
import type { Database } from "@/types/database";

type FeedbackType = "bug" | "sugestao" | "duvida" | "elogio" | "dor_planejamento";
type Severity = "critica" | "alta" | "media" | "baixa";
type Trip = Pick<Database["public"]["Tables"]["trips"]["Row"], "id" | "title" | "origin" | "destination">;

const TIPOS: { value: FeedbackType; label: string; emoji: string }[] = [
  { value: "bug",              label: "Bug",              emoji: "🐛" },
  { value: "sugestao",         label: "Sugestão",         emoji: "💡" },
  { value: "duvida",           label: "Dúvida",           emoji: "❓" },
  { value: "elogio",           label: "Elogio",           emoji: "⭐" },
  { value: "dor_planejamento", label: "Dor de planejamento", emoji: "😓" },
];

const SEVERIDADES: { value: Severity; label: string; color: string; bg: string }[] = [
  { value: "baixa",   label: "Baixa",   color: "#16A34A", bg: "#F0FDF4" },
  { value: "media",   label: "Média",   color: "#C97826", bg: "#FEF3E2" },
  { value: "alta",    label: "Alta",    color: "#F59E0B", bg: "#FFFBEB" },
  { value: "critica", label: "Crítica", color: "#E53935", bg: "#FEE2E2" },
];

export default function FeedbackScreen() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [severity, setSeverity] = useState<Severity>("media");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tripId, setTripId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      async function loadTrips() {
        const supabase = getSupabase();
        const { data } = await supabase
          .from("trips")
          .select("id, title, origin, destination")
          .order("updated_at", { ascending: false })
          .limit(5);
        setTrips(data ?? []);
      }
      loadTrips();
    }, [])
  );

  function reset() {
    setFeedbackType("bug");
    setSeverity("media");
    setTitle("");
    setBody("");
    setTripId(null);
    setError(null);
    setSuccess(false);
  }

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await getSupabase().auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          feedback_type: feedbackType,
          severity,
          title: title.trim(),
          body: body.trim(),
          trip_id: tripId ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Erro ao enviar feedback");
      }
      setSuccess(true);
    } catch (e: any) {
      setError(e.message ?? "Erro desconhecido");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feedback</Text>
          <Text style={styles.headerSub}>Alfa MotoRoute</Text>
        </View>
        <View style={styles.successWrap}>
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Feedback enviado!</Text>
            <Text style={styles.successMsg}>
              Obrigado. Sua opinião ajuda a melhorar o MotoRoute.
            </Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={reset} activeOpacity={0.8}>
              <Text style={styles.btnPrimaryText}>Enviar outro</Text>
            </TouchableOpacity>
          </View>
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
        <Text style={styles.headerTitle}>Feedback</Text>
        <Text style={styles.headerSub}>Alfa MotoRoute · sua opinião melhora o produto</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* TIPO */}
        <Text style={styles.sectionLabel}>TIPO</Text>
        <View style={styles.chipGrid}>
          {TIPOS.map((t) => {
            const selected = feedbackType === t.value;
            return (
              <TouchableOpacity
                key={t.value}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setFeedbackType(t.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipEmoji}>{t.emoji}</Text>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SEVERIDADE — só para bug */}
        {feedbackType === "bug" && (
          <>
            <Text style={styles.sectionLabel}>SEVERIDADE</Text>
            <View style={styles.sevRow}>
              {SEVERIDADES.map((s) => {
                const selected = severity === s.value;
                return (
                  <TouchableOpacity
                    key={s.value}
                    style={[
                      styles.sevChip,
                      { borderColor: selected ? s.color : "#E5E5E5" },
                      selected && { backgroundColor: s.bg },
                    ]}
                    onPress={() => setSeverity(s.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sevLabel, { color: s.color }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* TÍTULO */}
        <Text style={styles.sectionLabel}>TÍTULO</Text>
        <TextInput
          style={[styles.input, title.length > 0 && styles.inputFilled]}
          placeholder="Resumo do feedback"
          placeholderTextColor="#bbb"
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          returnKeyType="next"
        />

        {/* DESCRIÇÃO */}
        <Text style={styles.sectionLabel}>DESCRIÇÃO</Text>
        <TextInput
          style={[styles.input, styles.inputArea, body.length > 0 && styles.inputFilled]}
          placeholder="Descreva com mais detalhes..."
          placeholderTextColor="#bbb"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* VIAGEM RELACIONADA */}
        {trips.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              VIAGEM RELACIONADA{" "}
              <Text style={styles.sectionLabelOpt}>(opcional)</Text>
            </Text>
            <TouchableOpacity
              style={[styles.tripOption, tripId === null && styles.tripOptionSelected]}
              onPress={() => setTripId(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tripOptionText, tripId === null && styles.tripOptionTextSelected]}>
                Nenhuma
              </Text>
            </TouchableOpacity>
            {trips.map((t) => {
              const selected = tripId === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.tripOption, selected && styles.tripOptionSelected]}
                  onPress={() => setTripId(t.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tripOptionTitle, selected && styles.tripOptionTextSelected]} numberOfLines={1}>
                    {t.title ?? `${t.origin} → ${t.destination}`}
                  </Text>
                  {t.title && (
                    <Text style={styles.tripOptionRoute} numberOfLines={1}>
                      {t.origin} → {t.destination}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ERRO */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* BOTÃO */}
        <TouchableOpacity
          style={[styles.btnPrimary, !canSubmit && styles.btnDisabled]}
          onPress={submit}
          activeOpacity={0.8}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>Enviar feedback</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F5F5F5" },
  header:      { backgroundColor: "#1A1A1A", paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 },

  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#888",
    letterSpacing: 0.8, marginTop: 20, marginBottom: 8, paddingHorizontal: 20,
  },
  sectionLabelOpt: { fontSize: 11, fontWeight: "400", color: "#bbb" },

  chipGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 },
  chip:         {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: "#E5E5E5", borderRadius: 12,
    backgroundColor: "#fff", paddingVertical: 10, paddingHorizontal: 14,
  },
  chipSelected: { borderColor: "#C97826", backgroundColor: "#FEF3E2" },
  chipEmoji:    { fontSize: 14 },
  chipLabel:    { fontSize: 13, fontWeight: "600", color: "#555" },
  chipLabelSelected: { color: "#C97826" },

  sevRow:    { flexDirection: "row", gap: 8, paddingHorizontal: 20 },
  sevChip:   {
    flex: 1, borderWidth: 1.5, borderColor: "#E5E5E5",
    borderRadius: 12, paddingVertical: 10, alignItems: "center",
    backgroundColor: "#fff",
  },
  sevLabel:  { fontSize: 12, fontWeight: "700" },

  input: {
    backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E5E5",
    borderRadius: 14, padding: 14, marginHorizontal: 20,
    fontSize: 15, color: "#1A1A1A",
  },
  inputArea:   { height: 100, paddingTop: 14 },
  inputFilled: { borderColor: "#C97826" },

  tripOption: {
    backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E5E5",
    borderRadius: 12, padding: 12, marginHorizontal: 20, marginBottom: 6,
  },
  tripOptionSelected:    { borderColor: "#C97826", backgroundColor: "#FEF3E2" },
  tripOptionText:        { fontSize: 13, color: "#555", fontWeight: "600" },
  tripOptionTextSelected:{ color: "#C97826" },
  tripOptionTitle:       { fontSize: 13, fontWeight: "700", color: "#1A1A1A" },
  tripOptionRoute:       { fontSize: 11, color: "#888", marginTop: 2 },

  errorBanner: {
    backgroundColor: "#FEE2E2", borderRadius: 12,
    marginHorizontal: 20, marginTop: 12, padding: 12,
  },
  errorText: { fontSize: 13, color: "#E53935", fontWeight: "600" },

  btnPrimary: {
    backgroundColor: "#C97826", borderRadius: 16,
    marginHorizontal: 20, marginTop: 24, paddingVertical: 18,
    alignItems: "center",
  },
  btnDisabled:     { backgroundColor: "#E5C99A" },
  btnPrimaryText:  { color: "#fff", fontSize: 16, fontWeight: "700" },

  successWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  successCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 32,
    alignItems: "center", width: "100%",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  successIcon:  { fontSize: 48, color: "#16A34A", marginBottom: 12 },
  successTitle: { fontSize: 22, fontWeight: "800", color: "#1A1A1A", marginBottom: 8 },
  successMsg:   { fontSize: 14, color: "#555", textAlign: "center", lineHeight: 20, marginBottom: 24 },
});
