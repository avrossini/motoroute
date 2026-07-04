// Mini-mapa (web) para o modal de alternativas de parada: mostra os postos
// candidatos como pinpoints numerados, o selecionado em verde. Ajuda o usuário a
// decidir espacialmente. Native é um stub (mapa nativo ainda não implementado).
import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";

interface AltPonto {
  place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_selected?: boolean;
}

interface Props {
  alternatives: AltPonto[];
}

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export default function StopAltMap({ alternatives }: Props) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapsReady, setMapsReady] = useState(false);

  // Carrega o Google Maps JS (ou aguarda quem já carregou) via polling — robusto
  // a coexistir com o TripMap sem conflito de callback.
  useEffect(() => {
    const w = window as any;
    if (w.google?.maps) {
      setMapsReady(true);
      return;
    }
    if (!document.querySelector(`script[src*="maps.googleapis.com"]`)) {
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=pt-BR`;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    const iv = setInterval(() => {
      if (w.google?.maps) {
        setMapsReady(true);
        clearInterval(iv);
      }
    }, 200);
    return () => clearInterval(iv);
  }, []);

  // (Re)desenha os marcadores quando o mapa fica pronto ou a lista muda.
  useEffect(() => {
    if (!mapsReady || !mapDivRef.current || alternatives.length === 0) return;
    const google = (window as any).google;

    if (!mapRef.current) {
      mapRef.current = new google.maps.Map(mapDivRef.current, {
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
      });
    }

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    alternatives.forEach((a, i) => {
      const pos = { lat: a.latitude, lng: a.longitude };
      const marker = new google.maps.Marker({
        position: pos,
        map: mapRef.current,
        label: { text: String(i + 1), color: "#fff", fontWeight: "700", fontSize: "11px" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: a.is_selected ? "#16A34A" : "#C97826",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        title: a.name,
        zIndex: a.is_selected ? 10 : 5,
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
    });

    mapRef.current.fitBounds(bounds, 36);
    if (alternatives.length === 1) mapRef.current.setZoom(14);
  }, [mapsReady, alternatives]);

  return (
    <View style={styles.wrap}>
      {/* @ts-ignore — div é web-only; sempre no DOM p/ o ref existir antes do effect */}
      <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />
      {!mapsReady && (
        <View style={styles.loading}>
          <ActivityIndicator color="#C97826" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 170,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 14,
    backgroundColor: "#ECECEC",
    position: "relative",
  },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
});
