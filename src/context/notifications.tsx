import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { getSupabase } from "@/services/supabase";

// Notificação genérica (schema em migrations/20260708000001). O `data` traz um
// snapshot (trip_title, actor_name...) que blinda o card contra edição/exclusão
// da viagem de origem.
export interface AppNotification {
  id: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, any>;
  created_at: string;
  read_at: string | null;
  actor_id: string | null;
}

interface NotificationsCtx {
  unreadCount: number;
  notifications: AppNotification[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<NotificationsCtx>({
  unreadCount: 0,
  notifications: [],
  loading: false,
  refresh: async () => {},
});

// Fonte única do badge (aba Perfil) e da lista de notificações. O Tabs não
// re-renderiza sozinho quando o banco muda → refresh() é chamado no foco do
// Perfil e após responder um convite. (Realtime fica p/ a Fase 2.)
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id, type, entity_type, entity_id, data, created_at, read_at, actor_id")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as AppNotification[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <Ctx.Provider value={{ unreadCount, notifications, loading, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() {
  return useContext(Ctx);
}
