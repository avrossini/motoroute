import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";

interface Props {
  tripId: string;
  tripOrigin: string;
  tripDestination: string;
  onSwitchToList: () => void;
}

export default function TripMap({ tripOrigin, tripDestination, onSwitchToList }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.toggle}>
        <TouchableOpacity style={styles.toggleBtn} onPress={onSwitchToList}>
          <Text style={styles.toggleBtnText}>📋 Lista</Text>
        </TouchableOpacity>
        <View style={[styles.toggleBtn, styles.toggleBtnActive]}>
          <Text style={styles.toggleBtnActiveText}>🗺️ Mapa</Text>
        </View>
      </View>
      <View style={styles.placeholder}>
        <ActivityIndicator color="#C97826" size="large" />
        <Text style={styles.placeholderText}>Mapa nativo em breve</Text>
        <Text style={styles.placeholderSub}>{tripOrigin} → {tripDestination}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={onSwitchToList}>
          <Text style={styles.backBtnText}>Voltar para Lista</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  toggle: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: "#EFEFEF",
    borderRadius: 12,
    padding: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  toggleBtnActive: { backgroundColor: "#fff", elevation: 1 },
  toggleBtnActiveText: { fontSize: 13, fontWeight: "600", color: "#1A1A1A" },
  toggleBtnText: { fontSize: 13, fontWeight: "600", color: "#888" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  placeholderText: { fontSize: 16, fontWeight: "700", color: "#1A1A1A" },
  placeholderSub: { fontSize: 13, color: "#888", textAlign: "center" },
  backBtn: { backgroundColor: "#1A1A1A", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  backBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
