import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  Linking,
  Switch,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useState, useRef } from "react";
import { getSupabase } from "@/services/supabase";

type SortKey = "distance" | "rating" | "price";
type Mode = "search" | "manual";

interface GeoResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface LodgingResult {
  place_id: string;
  name: string;
  rating: number | null;
  total_ratings: number | null;
  price_level: number | null;
  latitude: number;
  longitude: number;
  distance_m: number;
  vicinity: string;
  lodging_type: string | null;
  parking_status: string;
  breakfast_status: string;
}

function priceLabel(level: number | null) {
  if (level == null) return "";
  return ["", "$", "$$", "$$$", "$$$$"][level] ?? "";
}

function distLabel(m: number) {
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function distColor(m: number) {
  if (m < 1000) return "#16A34A";
  if (m <= 3000) return "#2563EB";
  return "#888";
}

function openExternal(url: string) {
  if (Platform.OS === "web") {
    (window as any).open(url, "_blank");
  } else {
    Linking.openURL(url);
  }
}

function ParkingChip({ status }: { status: string }) {
  const confirmed = status === "confirmed";
  return (
    <View style={[styles.attrChip, confirmed ? styles.chipGreen : styles.chipAmber]}>
      <Text style={[styles.attrChipText, confirmed ? styles.chipGreenText : styles.chipAmberText]}>
        {confirmed ? "🏍️ Garagem confirmada" : "⚠️ Garagem não confirmada"}
      </Text>
    </View>
  );
}

function BreakfastChip({ status }: { status: string }) {
  const confirmed = status === "confirmed";
  return (
    <View style={[styles.attrChip, confirmed ? styles.chipOrange : styles.chipGray]}>
      <Text style={[styles.attrChipText, confirmed ? styles.chipOrangeText : styles.chipGrayText]}>
        {confirmed ? "☕ Café incluso" : "Café não confirmado"}
      </Text>
    </View>
  );
}

export default function LodgingSearchScreen() {
  const { id, day, city: initialCity, checkin, checkout } = useLocalSearchParams<{
    id: string;
    day: string;
    city: string;
    checkin: string;
    checkout: string;
  }>();

  // Mode
  const [mode, setMode] = useState<Mode>("search");

  // Search state
  const [query, setQuery] = useState(initialCity ?? "");
  const [results, setResults] = useState<LodgingResult[]>([]);
  const [refLabel, setRefLabel] = useState("");
  const [refLat, setRefLat] = useState<number | null>(null);
  const [refLng, setRefLng] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("distance");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Preferences
  const [showPrefs, setShowPrefs] = useState(false);
  const [guestCount, setGuestCount] = useState(1);
  const [parkingPref, setParkingPref] = useState<"none" | "preferred" | "required">("none");
  const [breakfastPref, setBreakfastPref] = useState<"none" | "preferred" | "required">("none");

  // Selected (staged before saving)
  const [selected, setSelected] = useState<LodgingResult | null>(null);
  const [selectedIsReserved, setSelectedIsReserved] = useState(false);

  // Manual form
  const [manualNome, setManualNome] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<GeoResult[]>([]);
  const [addressGeo, setAddressGeo] = useState<GeoResult | null>(null);
  const [addressSearching, setAddressSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualLink, setManualLink] = useState("");
  const [manualObs, setManualObs] = useState("");
  const [manualReservado, setManualReservado] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch("/api/places-lodging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: query.trim() }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResults(json.results ?? []);
      setRefLabel(json.ref_label ?? query);
      setRefLat(json.ref_lat ?? null);
      setRefLng(json.ref_lng ?? null);
    } catch (e: any) {
      Alert.alert("Erro na busca", e.message ?? "Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function sortedResults() {
    let r = [...results];
    // Client-side filter by parking preference
    if (parkingPref === "required") r = r.filter((x) => x.parking_status === "confirmed");
    if (breakfastPref === "required") r = r.filter((x) => x.breakfast_status === "confirmed");
    if (sort === "rating") return r.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (sort === "price") return r.sort((a, b) => (a.price_level ?? 99) - (b.price_level ?? 99));
    return r.sort((a, b) => a.distance_m - b.distance_m);
  }

  function selectLodging(option: LodgingResult) {
    setSelected(option);
    setSelectedIsReserved(false);
  }

  async function confirmSelection() {
    if (!selected) return;
    setSaving(selected.place_id);
    const supabase = getSupabase();
    try {
      await supabase
        .from("lodging_suggestions")
        .delete()
        .eq("trip_id", id)
        .eq("day_index", Number(day));

      await supabase.from("lodging_suggestions").insert({
        trip_id: id,
        day_index: Number(day),
        source: "auto",
        place_id: selected.place_id,
        name: selected.name,
        address: selected.vicinity,
        rating: selected.rating,
        total_ratings: selected.total_ratings,
        price_level: selected.price_level,
        latitude: selected.latitude,
        longitude: selected.longitude,
        city: refLabel || query,
        checkin_date: checkin,
        checkout_date: checkout,
        is_selected: true,
        is_reserved: selectedIsReserved,
        reference_lat: refLat,
        reference_lng: refLng,
        reference_label: refLabel ? `centro de ${refLabel}` : query,
        distance_m: selected.distance_m,
        lodging_type: selected.lodging_type,
        guest_count: guestCount,
        parking_status: selected.parking_status,
        breakfast_status: selected.breakfast_status,
        parking_requirement: parkingPref,
        breakfast_requirement: breakfastPref,
      });

      router.back();
    } catch (e: any) {
      Alert.alert("Erro ao salvar", e.message ?? "Tente novamente.");
      setSaving(null);
    }
  }

  async function saveManual() {
    if (!manualNome.trim()) {
      Alert.alert("Atenção", "Informe o nome da hospedagem.");
      return;
    }
    setSavingManual(true);
    const supabase = getSupabase();
    try {
      await supabase
        .from("lodging_suggestions")
        .delete()
        .eq("trip_id", id)
        .eq("day_index", Number(day));

      await supabase.from("lodging_suggestions").insert({
        trip_id: id,
        day_index: Number(day),
        source: "manual",
        place_id: null,
        name: manualNome.trim(),
        address: addressGeo?.address ?? null,
        city: addressGeo?.name ?? initialCity ?? "",
        latitude: addressGeo?.lat ?? null,
        longitude: addressGeo?.lng ?? null,
        checkin_date: checkin,
        checkout_date: checkout,
        is_selected: true,
        is_reserved: manualReservado,
        booking_url: manualLink.trim() || null,
        notes: manualObs.trim() || null,
        guest_count: guestCount,
        parking_status: "unknown",
        breakfast_status: "unknown",
      });

      router.back();
    } catch (e: any) {
      Alert.alert("Erro ao salvar", e.message ?? "Tente novamente.");
    } finally {
      setSavingManual(false);
    }
  }

  function openBooking(cityOrAddr: string) {
    const url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(cityOrAddr)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guestCount}`;
    openExternal(url);
  }

  function openMaps(lat: number, lng: number) {
    openExternal(`https://maps.google.com/?q=${lat},${lng}`);
  }

  function handleAddressChange(text: string) {
    setAddressQuery(text);
    setAddressGeo(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setAddressResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setAddressSearching(true);
      try {
        const res = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text.trim() }),
        });
        const json = await res.json();
        setAddressResults(json.results ?? []);
      } catch {
        setAddressResults([]);
      } finally {
        setAddressSearching(false);
      }
    }, 500);
  }

  function selectAddress(r: GeoResult) {
    setAddressGeo(r);
    setAddressQuery("");
    setAddressResults([]);
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hospedagem — Dia {day}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, mode === "search" && styles.tabActive]}
          onPress={() => setMode("search")}
        >
          <Text style={[styles.tabText, mode === "search" && styles.tabTextActive]}>Buscar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === "manual" && styles.tabActive]}
          onPress={() => setMode("manual")}
        >
          <Text style={[styles.tabText, mode === "manual" && styles.tabTextActive]}>
            Inserir manualmente
          </Text>
        </TouchableOpacity>
      </View>

      {mode === "search" ? (
        <>
          {/* Context bar */}
          <View style={styles.ctxBar}>
            <Text style={styles.ctxText}>📅 {checkin} → {checkout}</Text>
            <Text style={styles.ctxSep}>·</Text>
            <Text style={styles.ctxText}>👤 {guestCount}</Text>
          </View>

          {/* Search bar */}
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Cidade ou endereço"
              placeholderTextColor="#aaa"
              onSubmitEditing={search}
              returnKeyType="search"
              autoFocus={!initialCity}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.searchBtnText}>Buscar</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Ref note */}
          {refLabel ? (
            <Text style={styles.refNote}>
              Usando o centro de {refLabel} como referência. Para refinar, informe um endereço.
            </Text>
          ) : null}

          {/* Preferences toggle */}
          <TouchableOpacity style={styles.prefsToggle} onPress={() => setShowPrefs((v) => !v)}>
            <Text style={styles.prefsToggleText}>
              {showPrefs ? "▲ Preferências" : "▼ Preferências"}
            </Text>
          </TouchableOpacity>

          {showPrefs && (
            <View style={styles.prefsPanel}>
              {/* Garagem */}
              <Text style={styles.prefLabel}>Garagem</Text>
              <View style={styles.prefRow}>
                {(["none", "preferred", "required"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.prefChip, parkingPref === v && styles.prefChipActive]}
                    onPress={() => setParkingPref(v)}
                  >
                    <Text style={[styles.prefChipText, parkingPref === v && styles.prefChipTextActive]}>
                      {v === "none" ? "Não filtrar" : v === "preferred" ? "Preferencial" : "Obrigatória"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Café */}
              <Text style={styles.prefLabel}>Café da manhã</Text>
              <View style={styles.prefRow}>
                {(["none", "preferred", "required"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.prefChip, breakfastPref === v && styles.prefChipActive]}
                    onPress={() => setBreakfastPref(v)}
                  >
                    <Text style={[styles.prefChipText, breakfastPref === v && styles.prefChipTextActive]}>
                      {v === "none" ? "Não filtrar" : v === "preferred" ? "Preferencial" : "Obrigatório"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Hóspedes */}
              <Text style={styles.prefLabel}>Hóspedes</Text>
              <View style={styles.guestRow}>
                <TouchableOpacity
                  style={styles.guestBtn}
                  onPress={() => setGuestCount((n) => Math.max(1, n - 1))}
                >
                  <Text style={styles.guestBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.guestCount}>{guestCount}</Text>
                <TouchableOpacity
                  style={styles.guestBtn}
                  onPress={() => setGuestCount((n) => Math.min(10, n + 1))}
                >
                  <Text style={styles.guestBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 32 }}>
            {/* Sort chips */}
            {results.length > 0 && (
              <View style={styles.sortRow}>
                <Text style={styles.resultsCount}>{sortedResults().length} resultado(s)</Text>
                {(["distance", "rating", "price"] as SortKey[]).map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.sortChip, sort === k && styles.sortChipActive]}
                    onPress={() => setSort(k)}
                  >
                    <Text style={[styles.sortChipText, sort === k && styles.sortChipTextActive]}>
                      {k === "distance" ? "Distância" : k === "rating" ? "Avaliação" : "Preço"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Selected block */}
            {selected && (
              <View style={styles.selectedBlock}>
                <Text style={styles.selectedLabel}>✓ Selecionada</Text>
                <Text style={styles.selectedName}>{selected.name}</Text>
                <Text style={styles.selectedMeta}>{selected.vicinity}</Text>
                <Text style={styles.selectedDates}>
                  {checkin} → {checkout} · {guestCount} hóspede(s)
                </Text>
                <View style={styles.selectedActions}>
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      selectedIsReserved && styles.confirmBtnGreen,
                    ]}
                    onPress={() => setSelectedIsReserved((v) => !v)}
                  >
                    <Text style={styles.confirmBtnText}>
                      {selectedIsReserved ? "✓ Já está reservado" : "Marcar como reservado"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, styles.confirmBtnOrange, saving ? { opacity: 0.6 } : {}]}
                    onPress={confirmSelection}
                    disabled={saving != null}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmBtnText}>Confirmar seleção →</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openBooking(selected.vicinity || refLabel || query)}>
                    <Text style={styles.externalLink}>🌐 Ver no Booking</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={styles.clearSelected}>Limpar seleção</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Result cards */}
            {sortedResults().map((option) => (
              <View key={option.place_id} style={styles.optionCard}>
                <View style={styles.optionTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionName} numberOfLines={2}>{option.name}</Text>
                    <Text style={styles.optionVicinity} numberOfLines={1}>{option.vicinity}</Text>
                  </View>
                  <View
                    style={[
                      styles.distBadge,
                      {
                        backgroundColor: distColor(option.distance_m) + "22",
                        borderColor: distColor(option.distance_m),
                      },
                    ]}
                  >
                    <Text style={[styles.distBadgeText, { color: distColor(option.distance_m) }]}>
                      {distLabel(option.distance_m)}
                    </Text>
                  </View>
                </View>

                <View style={styles.optionMeta}>
                  {option.rating != null && (
                    <Text style={styles.optionRating}>★ {option.rating} ({option.total_ratings ?? 0})</Text>
                  )}
                  {option.price_level != null && (
                    <Text style={styles.optionPrice}>{priceLabel(option.price_level)}</Text>
                  )}
                </View>

                {/* Attribute chips — always shown */}
                <View style={styles.chipsRow}>
                  <ParkingChip status={option.parking_status} />
                  <BreakfastChip status={option.breakfast_status} />
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[
                      styles.selectBtn,
                      selected?.place_id === option.place_id && styles.selectBtnSelected,
                    ]}
                    onPress={() => selectLodging(option)}
                    disabled={saving != null}
                  >
                    <Text style={styles.selectBtnText}>
                      {selected?.place_id === option.place_id ? "✓ Selecionado" : "Selecionar"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => openBooking(option.vicinity || refLabel || query)}
                  >
                    <Text style={styles.linkBtnText}>Booking</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => openMaps(option.latitude, option.longitude)}
                  >
                    <Text style={styles.linkBtnText}>Maps</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {results.length === 0 && !loading && query.trim() && (
              <Text style={styles.emptyText}>
                Nenhuma hospedagem encontrada. Tente outra cidade ou endereço.
              </Text>
            )}

            {/* Limitation note */}
            {results.length > 0 && (
              <Text style={styles.limitNote}>
                ⚠️ Garagem e café não confirmados pela API do Google Places — verifique com a hospedagem antes de reservar.
              </Text>
            )}
          </ScrollView>
        </>
      ) : (
        /* Manual mode */
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={styles.manualSectionTitle}>Inserir hospedagem manualmente</Text>

          <Text style={styles.fieldLabel}>Nome *</Text>
          <TextInput
            style={styles.fieldInput}
            value={manualNome}
            onChangeText={setManualNome}
            placeholder="Ex: Pousada Serra Verde"
            placeholderTextColor="#aaa"
          />

          <Text style={styles.fieldLabel}>Endereço</Text>
          {addressGeo ? (
            <View style={styles.addressConfirmed}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addressConfirmedName}>📍 {addressGeo.name}</Text>
                <Text style={styles.addressConfirmedAddr} numberOfLines={1}>{addressGeo.address}</Text>
              </View>
              <TouchableOpacity onPress={() => setAddressGeo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.addressClearBtn}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={{ position: "relative", justifyContent: "center" }}>
                <TextInput
                  style={styles.fieldInput}
                  value={addressQuery}
                  onChangeText={handleAddressChange}
                  placeholder="Buscar endereço ou cidade..."
                  placeholderTextColor="#aaa"
                />
                {addressSearching && (
                  <ActivityIndicator
                    size="small"
                    color="#C97826"
                    style={{ position: "absolute", right: 14 }}
                  />
                )}
              </View>
              {addressResults.length > 0 && (
                <View style={styles.addressDropdown}>
                  {addressResults.map((item, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.addressDropdownItem}
                      onPress={() => selectAddress(item)}
                    >
                      <Text style={styles.addressDropdownName}>{item.name}</Text>
                      <Text style={styles.addressDropdownAddr} numberOfLines={1}>{item.address}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          <Text style={styles.fieldLabel}>Link da reserva</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputDashed]}
            value={manualLink}
            onChangeText={setManualLink}
            placeholder="https://booking.com/... ou Airbnb..."
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.fieldLabel}>Observações</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputDashed, { height: 80 }]}
            value={manualObs}
            onChangeText={setManualObs}
            placeholder="Informações adicionais..."
            placeholderTextColor="#aaa"
            multiline
          />

          {/* Hóspedes */}
          <Text style={styles.fieldLabel}>Hóspedes</Text>
          <View style={styles.guestRow}>
            <TouchableOpacity
              style={styles.guestBtn}
              onPress={() => setGuestCount((n) => Math.max(1, n - 1))}
            >
              <Text style={styles.guestBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.guestCount}>{guestCount}</Text>
            <TouchableOpacity
              style={styles.guestBtn}
              onPress={() => setGuestCount((n) => Math.min(10, n + 1))}
            >
              <Text style={styles.guestBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Já reservado */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Já está reservado</Text>
            <Switch
              value={manualReservado}
              onValueChange={setManualReservado}
              trackColor={{ true: "#16A34A", false: "#ccc" }}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveManualBtn, savingManual && { opacity: 0.6 }]}
            onPress={saveManual}
            disabled={savingManual}
          >
            {savingManual ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveManualBtnText}>Salvar hospedagem</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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

  tabRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tab: { flex: 1, paddingVertical: 13, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#C97826" },
  tabText: { fontSize: 14, color: "#888" },
  tabTextActive: { color: "#C97826", fontWeight: "700" },

  ctxBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ctxText: { fontSize: 12, color: "#ccc" },
  ctxSep: { color: "#555" },

  searchRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  searchBtn: {
    backgroundColor: "#C97826",
    borderRadius: 10,
    paddingHorizontal: 18,
    height: 44,
    justifyContent: "center",
  },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  refNote: {
    fontSize: 12,
    color: "#2563EB",
    fontStyle: "italic",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },

  prefsToggle: { paddingHorizontal: 16, paddingVertical: 10 },
  prefsToggleText: { fontSize: 13, color: "#C97826", fontWeight: "600" },

  prefsPanel: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  prefLabel: { fontSize: 12, color: "#888", fontWeight: "600", marginTop: 10, marginBottom: 4 },
  prefRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  prefChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  prefChipActive: { backgroundColor: "#1A1A1A", borderColor: "#1A1A1A" },
  prefChipText: { fontSize: 12, color: "#555" },
  prefChipTextActive: { color: "#fff", fontWeight: "600" },

  guestRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  guestBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  guestBtnText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  guestCount: { fontSize: 18, fontWeight: "700", color: "#1A1A1A", minWidth: 24, textAlign: "center" },

  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexWrap: "wrap",
  },
  resultsCount: { fontSize: 12, color: "#888", marginRight: 4 },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  sortChipActive: { backgroundColor: "#1A1A1A", borderColor: "#1A1A1A" },
  sortChipText: { fontSize: 13, color: "#555" },
  sortChipTextActive: { color: "#fff", fontWeight: "700" },

  // Selected block
  selectedBlock: {
    backgroundColor: "#1E3A5F",
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    padding: 16,
  },
  selectedLabel: { fontSize: 11, color: "#7aafff", fontWeight: "700", marginBottom: 4 },
  selectedName: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 2 },
  selectedMeta: { fontSize: 12, color: "#ccc", marginBottom: 4 },
  selectedDates: { fontSize: 12, color: "#aaa", marginBottom: 12 },
  selectedActions: { gap: 8, marginBottom: 8 },
  confirmBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#2A4A7F",
  },
  confirmBtnGreen: { backgroundColor: "#14532D" },
  confirmBtnOrange: { backgroundColor: "#C97826" },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  externalLink: { color: "#7aafff", fontSize: 13, textAlign: "center", marginTop: 4 },
  clearSelected: { color: "#888", fontSize: 12, textAlign: "center", marginTop: 8 },

  list: { flex: 1 },

  optionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  optionTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 6 },
  optionName: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  optionVicinity: { fontSize: 12, color: "#888", marginTop: 2 },
  distBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  distBadgeText: { fontSize: 12, fontWeight: "700" },
  optionMeta: { flexDirection: "row", gap: 12, marginBottom: 8 },
  optionRating: { fontSize: 13, color: "#F59E0B", fontWeight: "600" },
  optionPrice: { fontSize: 13, color: "#555" },

  chipsRow: { flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" },
  attrChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  chipGreen: { backgroundColor: "#DCFCE7", borderColor: "#16A34A" },
  chipGreenText: { color: "#15803D", fontSize: 11, fontWeight: "600" },
  chipAmber: { backgroundColor: "#FEF3C7", borderColor: "#D97706" },
  chipAmberText: { color: "#92400E", fontSize: 11, fontWeight: "600" },
  chipOrange: { backgroundColor: "#FEF3C7", borderColor: "#C97826" },
  chipOrangeText: { color: "#92400E", fontSize: 11, fontWeight: "600" },
  chipGray: { backgroundColor: "#F5F5F5", borderColor: "#ccc" },
  chipGrayText: { color: "#888", fontSize: 11 },
  attrChipText: {},

  cardActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  selectBtn: {
    flex: 1,
    backgroundColor: "#C97826",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    minWidth: 90,
  },
  selectBtnSelected: { backgroundColor: "#1A1A1A" },
  selectBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  linkBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  linkBtnText: { fontSize: 13, color: "#1A1A1A", fontWeight: "600" },

  emptyText: { textAlign: "center", color: "#aaa", marginTop: 40, fontSize: 14 },
  limitNote: {
    fontSize: 11,
    color: "#aaa",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 20,
    marginHorizontal: 20,
  },

  // Manual form
  manualSectionTitle: { fontSize: 16, fontWeight: "700", color: "#1A1A1A", marginBottom: 20 },
  fieldLabel: { fontSize: 12, color: "#555", fontWeight: "600", marginBottom: 6, marginTop: 14 },
  fieldInput: {
    height: 44,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  fieldInputDashed: { borderStyle: "dashed", borderColor: "#ccc" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    marginTop: 16,
  },
  switchLabel: { fontSize: 15, color: "#1A1A1A" },
  // Address autocomplete
  addressConfirmed: {
    backgroundColor: "#FEF3E2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C97826",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  addressConfirmedName: { fontSize: 14, fontWeight: "600", color: "#C97826" },
  addressConfirmedAddr: { fontSize: 12, color: "#A0622A", marginTop: 2 },
  addressClearBtn: { fontSize: 16, color: "#C97826", paddingLeft: 10 },
  addressDropdown: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginTop: 4,
    overflow: "hidden",
  },
  addressDropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  addressDropdownName: { fontSize: 14, fontWeight: "600", color: "#1A1A1A" },
  addressDropdownAddr: { fontSize: 12, color: "#888", marginTop: 2 },

  saveManualBtn: {
    backgroundColor: "#C97826",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  saveManualBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
