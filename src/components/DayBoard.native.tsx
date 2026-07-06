import React, { useCallback, useState } from "react";
import {
  ScrollView,
  View,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";

interface DayBoardProps {
  /** Colunas já renderizadas (uma por dia). */
  columns: React.ReactNode[];
  colWidth: number;
  gap: number;
  numColumns: number;
}

/**
 * Board horizontal (NATIVO iOS/Android) — dias em colunas com snap real por coluna.
 * 1 coluna + peek do próximo dia → swipe. Pontinhos indicam a posição.
 */
export default function DayBoard({ columns, colWidth, gap, numColumns }: DayBoardProps) {
  const [page, setPage] = useState(0);
  const step = colWidth + gap;

  const onEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.round(e.nativeEvent.contentOffset.x / step));
    },
    [step]
  );

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEventThrottle={16}
        onMomentumScrollEnd={onEnd}
        contentContainerStyle={[styles.content, { gap, paddingHorizontal: gap }]}
      >
        {columns.map((col, i) => (
          <View key={i} style={{ width: colWidth }}>
            {col}
          </View>
        ))}
      </ScrollView>

      {numColumns === 1 && columns.length > 1 && (
        <View style={styles.dots}>
          {columns.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 4, alignItems: "flex-start" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#D0D0D0" },
  dotActive: { width: 20, backgroundColor: "#C97826" },
});
