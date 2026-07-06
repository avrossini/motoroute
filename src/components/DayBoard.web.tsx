import React, { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  View,
  Pressable,
  Text,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from "react-native";

interface DayBoardProps {
  /** Colunas já renderizadas (uma por dia). */
  columns: React.ReactNode[];
  colWidth: number;
  gap: number;
  numColumns: number;
}

// Combina com o fundo claro da tela (#F5F5F5) para o fade "sangrar" nas bordas.
const FADE = "245,245,245";

/**
 * Board horizontal (WEB) — dias em colunas com snap por coluna (CSS scroll-snap),
 * setas discretas nas laterais e fades indicando que há mais dias fora da tela.
 *
 * react-native-web 0.19 ignora snapToInterval/decelerationRate, mas encaminha chaves
 * de style desconhecidas para o DOM — por isso o snap é feito via scrollSnapType/Align.
 */
export default function DayBoard({ columns, colWidth, gap, numColumns }: DayBoardProps) {
  const scrollRef = useRef<ScrollView>(null);
  const xRef = useRef(0);
  const maxRef = useRef(0);
  const layoutWRef = useRef(0);
  const contentWRef = useRef(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(columns.length > numColumns);

  const recomputeEnds = useCallback(() => {
    maxRef.current = Math.max(0, contentWRef.current - layoutWRef.current);
    const cp = xRef.current > 4;
    const cn = xRef.current < maxRef.current - 4;
    setCanPrev((p) => (p !== cp ? cp : p));
    setCanNext((n) => (n !== cn ? cn : n));
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      xRef.current = e.nativeEvent.contentOffset.x;
      recomputeEnds();
    },
    [recomputeEnds]
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      layoutWRef.current = e.nativeEvent.layout.width;
      recomputeEnds();
    },
    [recomputeEnds]
  );

  const onContentSizeChange = useCallback(
    (w: number) => {
      contentWRef.current = w;
      recomputeEnds();
    },
    [recomputeEnds]
  );

  const nudge = useCallback(
    (dir: number) => {
      const step = colWidth + gap;
      const next = Math.max(0, Math.min(maxRef.current, xRef.current + dir * step));
      scrollRef.current?.scrollTo({ x: next, animated: true });
    },
    [colWidth, gap]
  );

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        style={[styles.track, { scrollSnapType: "x proximity" } as any]}
        contentContainerStyle={[styles.content, { gap, paddingHorizontal: gap }]}
      >
        {columns.map((col, i) => (
          <View key={i} style={[{ width: colWidth }, { scrollSnapAlign: "start" } as any]}>
            {col}
          </View>
        ))}
      </ScrollView>

      {canPrev && (
        <View
          pointerEvents="none"
          style={[styles.fade, styles.fadeL, { backgroundImage: `linear-gradient(90deg, rgba(${FADE},1), rgba(${FADE},0))` } as any]}
        />
      )}
      {canNext && (
        <View
          pointerEvents="none"
          style={[styles.fade, styles.fadeR, { backgroundImage: `linear-gradient(270deg, rgba(${FADE},1), rgba(${FADE},0))` } as any]}
        />
      )}

      {canPrev && (
        <Pressable style={[styles.arrow, styles.arrowL]} onPress={() => nudge(-1)} accessibilityRole="button" accessibilityLabel="Dia anterior">
          <Text style={styles.arrowTxt}>‹</Text>
        </Pressable>
      )}
      {canNext && (
        <Pressable style={[styles.arrow, styles.arrowR]} onPress={() => nudge(1)} accessibilityRole="button" accessibilityLabel="Próximo dia">
          <Text style={styles.arrowTxt}>›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  track: {},
  content: { paddingVertical: 4, alignItems: "flex-start" },
  fade: { position: "absolute", top: 0, bottom: 0, width: 28, zIndex: 2 },
  fadeL: { left: 0 },
  fadeR: { right: 0 },
  arrow: {
    position: "absolute",
    top: "50%",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#E5E5E5",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
    transform: [{ translateY: -18 }],
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  arrowL: { left: 2 },
  arrowR: { right: 2 },
  arrowTxt: { fontSize: 22, lineHeight: 24, color: "#1A1A1A", fontWeight: "700", marginTop: -2 },
});
