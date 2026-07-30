import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getSupabase } from "@/services/supabase";
import { getPushStatus, subscribePush, unsubscribePush, type PushStatus } from "@/platform/push";
import { useNotifications, AppNotification } from "@/context/notifications";

interface Motorcycle {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  fuel_economy_km_l: number;
  tank_liters: number;
  odometer_km: number;
  is_active: boolean;
}

interface UserInfo {
  email: string;
  name: string;
  avatarUrl: string | null;
}

export default function PerfilScreen() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [moto, setMoto] = useState<Motorcycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [notifMsg, setNotifMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { notifications, refresh: refreshNotifs } = useNotifications();

  const [pushStatus, setPushStatus] = useState<PushStatus>("unsupported");
  const [pushBusy, setPushBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshNotifs();
      getPushStatus().then(setPushStatus);
    }, [refreshNotifs])
  );

  // Convite contextual: ativa o push a partir do gesto do usuário no banner.
  async function enablePush() {
    setPushBusy(true);
    try {
      const status = await subscribePush();
      setPushStatus(status);
      // Feedback via notifMsg (Alert é no-op no web — padrão já usado nesta tela)
      if (status === "subscribed") {
        setNotifMsg({ ok: true, text: "Notificações ativadas neste dispositivo. 🔔" });
      } else if (status === "denied") {
        setNotifMsg({ ok: false, text: "O navegador bloqueou as notificações. Libere nas configurações do site e tente de novo." });
      } else {
        setNotifMsg({ ok: false, text: "Não foi possível ativar as notificações. Tente novamente." });
      }
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const supabase = getSupabase();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const email = authUser.email ?? "";
      const meta = authUser.user_metadata ?? {};
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", authUser.id)
        .maybeSingle();
      const name = profile?.display_name ?? meta.full_name ?? meta.name ?? email.split("@")[0] ?? "Usuário";
      setUser({ email, name, avatarUrl: profile?.avatar_url ?? null });
    }

    const { data } = await supabase
      .from("motorcycles")
      .select("id, make, model, year, color, fuel_economy_km_l, tank_liters, odometer_km, is_active")
      .eq("is_active", true)
      .maybeSingle();

    setMoto(data ?? null);
    setLoading(false);
  }

  async function signOut() {
    // Remove a subscription de push ANTES do signOut (a RLS precisa da sessão viva) —
    // senão o dispositivo continua recebendo notificações da conta que saiu.
    await unsubscribePush().catch(() => {});
    const supabase = getSupabase();
    await supabase.auth.signOut();
    router.replace("/(auth)/login" as never);
  }

  // Aceitar/recusar convite de viagem. respond_to_share é atômico (FOR UPDATE +
  // status='pending') → duplo-clique retorna erro em vez de forjar 2 cópias.
  async function respondShare(n: AppNotification, accept: boolean) {
    if (!n.entity_id || respondingId) return;
    setNotifMsg(null);
    setRespondingId(n.id);
    const { error } = await getSupabase().rpc("respond_to_share", {
      p_share_id: n.entity_id,
      p_accept: accept,
    });
    setRespondingId(null);
    if (error) {
      // feedback inline (Alert é no-op no web)
      setNotifMsg({ ok: false, text: "Não foi possível responder. Tente novamente." });
      await refreshNotifs();
      return;
    }
    await refreshNotifs();
    if (accept) {
      setNotifMsg({ ok: true, text: "Viagem adicionada à sua aba Viagens." });
    }
  }

  // Notificações informativas (ex.: convite aceito) — só marca como lida.
  async function dismissNotif(n: AppNotification) {
    await getSupabase()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", n.id);
    await refreshNotifs();
  }

  const unread = notifications.filter((n) => !n.read_at);

  const avatarLetter = user?.name?.[0]?.toUpperCase() ?? "?";
  const autonomia = moto ? Math.round(moto.fuel_economy_km_l * moto.tank_liters) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header do perfil (toca para editar nome/foto) */}
      <TouchableOpacity
        style={styles.profileHeader}
        activeOpacity={0.8}
        onPress={() => router.push("/editar-perfil" as never)}
      >
        {user?.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{avatarLetter}</Text>
          </View>
        )}
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name ?? "—"}</Text>
          <Text style={styles.profileEmail}>{user?.email ?? "—"}</Text>
        </View>
        <Text style={styles.editHint}>Editar ›</Text>
      </TouchableOpacity>

      {/* Feedback do aceite/recusa (Alert é no-op no web); toque para dispensar */}
      {notifMsg && (
        <TouchableOpacity style={styles.section} activeOpacity={0.8} onPress={() => setNotifMsg(null)}>
          <Text style={notifMsg.ok ? styles.notifBannerOk : styles.notifBannerErr}>{notifMsg.text}</Text>
        </TouchableOpacity>
      )}

      {/* Notificações (convites de viagem + avisos) */}
      {unread.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NOTIFICAÇÕES</Text>
          {pushStatus === "unsubscribed" && (
            <TouchableOpacity
              style={styles.pushBanner}
              onPress={enablePush}
              disabled={pushBusy}
              accessibilityRole="button"
              accessibilityLabel="Ativar notificações no dispositivo"
            >
              <Text style={styles.pushBannerText}>
                🔔 Ative as notificações no celular para não perder convites
              </Text>
              {pushBusy
                ? <ActivityIndicator color="#C97826" size="small" />
                : <Text style={styles.pushBannerCta}>Ativar</Text>}
            </TouchableOpacity>
          )}
          {unread.map((n) => (
            <NotificationCard
              key={n.id}
              n={n}
              busy={respondingId === n.id}
              onAccept={() => respondShare(n, true)}
              onDecline={() => respondShare(n, false)}
              onDismiss={() => dismissNotif(n)}
            />
          ))}
        </View>
      )}

      {/* Moto ativa */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MINHA MOTO</Text>
        {loading ? null : moto ? (
          <TouchableOpacity
            style={styles.motoCard}
            onPress={() => router.push("/minha-moto" as never)}
            activeOpacity={0.8}
          >
            <View style={styles.motoCardLeft}>
              <Text style={styles.motoEmoji}>🏍️</Text>
              <View>
                <Text style={styles.motoName}>{moto.make} {moto.model}</Text>
                <Text style={styles.motoYear}>{moto.year}{moto.color ? ` · ${moto.color}` : ""}</Text>
                <Text style={styles.motoStats}>
                  {moto.fuel_economy_km_l} km/L · {moto.tank_liters} L · ~{autonomia} km
                </Text>
              </View>
            </View>
            <Text style={styles.motoArrow}>›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.motoEmpty}
            onPress={() => router.push("/minha-moto" as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.motoEmptyIcon}>🏍️</Text>
            <View>
              <Text style={styles.motoEmptyTitle}>Cadastrar moto</Text>
              <Text style={styles.motoEmptyDesc}>Consumo e tanque para alertas de combustível</Text>
            </View>
            <Text style={styles.motoArrow}>›</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Menu */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>VIAGENS</Text>
        <MenuItem icon="⭐" label="Paradas Favoritas" onPress={() => router.push("/favoritas" as never)} />
        <MenuItem icon="🏁" label="Viagens Realizadas" onPress={() => router.push("/viagens" as never)} />
        <MenuItem icon="💾" label="Roteiros Salvos" onPress={() => router.push("/viagens" as never)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CONFIGURAÇÕES</Text>
        <MenuItem icon="⚙️" label="Preferências Padrão" onPress={() => router.push("/preferencias" as never)} />
      </View>

      <View style={styles.section}>
        {confirmLogout ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>Deseja mesmo sair?</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity onPress={() => setConfirmLogout(false)} style={styles.confirmCancel}>
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={signOut} style={styles.confirmSair}>
                <Text style={styles.confirmSairText}>Sair</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.signOutBtn} onPress={() => setConfirmLogout(true)}>
            <Text style={styles.signOutIcon}>🚪</Text>
            <Text style={styles.signOutText}>Sair da conta</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function NotificationCard({
  n,
  busy,
  onAccept,
  onDecline,
  onDismiss,
}: {
  n: AppNotification;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  const actor = n.data?.actor_name ?? "Alguém";

  if (n.type === "trip_shared") {
    return (
      <View style={styles.notifCard}>
        <Text style={styles.notifText}>
          <Text style={styles.notifBold}>{actor}</Text> compartilhou uma viagem com você.
        </Text>
        {n.data?.trip_title ? (
          <Text style={styles.notifTripTitle}>{n.data.trip_title}</Text>
        ) : null}
        {n.data?.trip_route ? (
          <Text style={styles.notifTripRoute}>{n.data.trip_route}</Text>
        ) : null}
        <View style={styles.notifActions}>
          <TouchableOpacity
            style={[styles.notifBtn, styles.notifDecline]}
            onPress={onDecline}
            disabled={busy}
          >
            <Text style={styles.notifDeclineText}>Recusar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.notifBtn, styles.notifAccept]}
            onPress={onAccept}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.notifAcceptText}>Aceitar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Informativa (ex.: share_accepted) — só "OK" (marca lida)
  const msg =
    n.type === "share_accepted"
      ? `${actor} aceitou a viagem que você compartilhou.`
      : (n.data?.message ?? "Nova notificação.");
  return (
    <View style={styles.notifCard}>
      <Text style={styles.notifText}>{msg}</Text>
      <View style={styles.notifActions}>
        <TouchableOpacity style={[styles.notifBtn, styles.notifDecline]} onPress={onDismiss}>
          <Text style={styles.notifDeclineText}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },

  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#C97826",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImg: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#333" },
  avatarLetter: { fontSize: 24, fontWeight: "700", color: "#fff" },
  profileInfo: { flex: 1 },
  editHint: { fontSize: 12, color: "#C97826", fontWeight: "600" },
  profileName: { fontSize: 18, fontWeight: "700", color: "#fff" },
  profileEmail: { fontSize: 13, color: "#aaa", marginTop: 2 },

  section: { marginTop: 24, marginHorizontal: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  motoCard: {
    backgroundColor: "#1E3A5F",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  motoCardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  motoEmoji: { fontSize: 28 },
  motoName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  motoYear: { fontSize: 13, color: "#9DB4CC", marginTop: 1 },
  motoStats: { fontSize: 12, color: "#7A9BB5", marginTop: 3 },
  motoArrow: { fontSize: 22, color: "#9DB4CC" },

  motoEmpty: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderStyle: "dashed",
  },
  motoEmptyIcon: { fontSize: 28 },
  motoEmptyTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  motoEmptyDesc: { fontSize: 12, color: "#888", marginTop: 2, maxWidth: 200 },

  notifCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#C97826",
  },
  notifText: { fontSize: 14, color: "#333", lineHeight: 20 },
  notifBold: { fontWeight: "700", color: "#1A1A1A" },
  notifTripTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A", marginTop: 6 },
  notifTripRoute: { fontSize: 12.5, color: "#888", marginTop: 2 },
  notifActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 12 },
  notifBtn: {
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9,
    alignItems: "center", justifyContent: "center", minWidth: 92,
  },
  notifAccept: { backgroundColor: "#16A34A" },
  notifAcceptText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  notifDecline: { backgroundColor: "#F0F0F0" },
  notifDeclineText: { color: "#555", fontWeight: "600", fontSize: 14 },
  notifBannerOk: {
    backgroundColor: "#E7F6EC", color: "#16A34A", fontSize: 13.5, fontWeight: "600",
    padding: 12, borderRadius: 10, overflow: "hidden",
  },
  notifBannerErr: {
    backgroundColor: "#FDECEA", color: "#E53935", fontSize: 13.5, fontWeight: "600",
    padding: 12, borderRadius: 10, overflow: "hidden",
  },
  pushBanner: {
    backgroundColor: "#FDF3E7", borderRadius: 10, borderWidth: 1, borderColor: "#F0DCC3",
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  pushBannerText: { flex: 1, fontSize: 13, color: "#7A5A2E", lineHeight: 18 },
  pushBannerCta: { fontSize: 13.5, fontWeight: "700", color: "#C97826" },

  menuItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  menuIcon: { fontSize: 20, marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 15, color: "#1A1A1A" },
  menuArrow: { fontSize: 20, color: "#bbb" },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  signOutIcon: { fontSize: 20 },
  signOutText: { fontSize: 15, color: "#E53935", fontWeight: "600" },

  confirmBox: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  confirmText: { fontSize: 15, color: "#1A1A1A", marginBottom: 12 },
  confirmBtns: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  confirmCancel: { paddingHorizontal: 16, paddingVertical: 8 },
  confirmCancelText: { color: "#888", fontSize: 14 },
  confirmSair: { backgroundColor: "#E53935", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  confirmSairText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
