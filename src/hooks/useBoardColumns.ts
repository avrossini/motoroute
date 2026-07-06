import { useWindowDimensions, Platform } from "react-native";

export interface BoardColumns {
  /** Quantas colunas (dias) cabem na largura atual. */
  numColumns: number;
  /** Largura de cada coluna, em px. */
  colWidth: number;
  /** Espaçamento entre colunas, em px. */
  gap: number;
  /** true em iOS/Android nativo (sempre 1 coluna + peek). */
  isNative: boolean;
}

const GAP = 12;
const SIDE = 12; // respiro lateral do board (padding horizontal do track)

/**
 * Calcula o layout adaptativo do board de Expedição (dias em colunas, estilo Trello).
 * Espelha o padrão de useIsDesktopWeb: reage ao resize via useWindowDimensions.
 *
 * - Nativo (celular): 1 coluna + "espiada" (~14%) do próximo dia → swipe.
 * - Web: 5 → 4 → 3 → 2 → 1 conforme a largura da viewport; 1 coluna também com peek.
 */
export function useBoardColumns(): BoardColumns {
  const { width } = useWindowDimensions();
  const isNative = Platform.OS !== "web";
  const boardW = Math.max(0, width - SIDE * 2);

  if (isNative) {
    return { numColumns: 1, colWidth: Math.round(boardW * 0.86), gap: GAP, isNative };
  }

  let n: number;
  if (width >= 1340) n = 5;
  else if (width >= 1060) n = 4;
  else if (width >= 760) n = 3;
  else if (width >= 520) n = 2;
  else n = 1;

  if (n === 1) {
    // Coluna única com peek do próximo dia (mesma intenção do nativo).
    return { numColumns: 1, colWidth: Math.round(boardW * 0.9), gap: GAP, isNative };
  }

  const colWidth = Math.floor((boardW - GAP * (n - 1)) / n);
  return { numColumns: n, colWidth, gap: GAP, isNative };
}
