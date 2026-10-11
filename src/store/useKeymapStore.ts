// 键位状态：layer × (row × col) 键码矩阵、当前层、选中键位、脏标记（逐键精确订阅，避免全量重渲染）。
import { create } from 'zustand';

export interface SelectedKey {
  readonly row: number;
  readonly col: number;
}

interface KeymapState {
  /** 每层一个 rows×cols 的键码矩阵 */
  layers: readonly Uint16Array[];
  rows: number;
  cols: number;
  currentLayer: number;
  selected: SelectedKey | null;
  dirtyKeys: ReadonlySet<string>;
  loading: boolean;
  loadProgress: number;
  setLayers: (layers: readonly Uint16Array[], rows: number, cols: number) => void;
  setCurrentLayer: (layer: number) => void;
  setKeycode: (layer: number, row: number, col: number, keycode: number) => void;
  select: (selected: SelectedKey | null) => void;
  markClean: (layer: number, row: number, col: number) => void;
  setLoading: (loading: boolean, loadProgress?: number) => void;
  reset: () => void;
}

const EMPTY_LAYERS: readonly Uint16Array[] = [];
const EMPTY_DIRTY: ReadonlySet<string> = new Set();

function keyId(layer: number, row: number, col: number): string {
  return `${layer}:${row}:${col}`;
}

export const useKeymapStore = create<KeymapState>((set) => ({
  layers: EMPTY_LAYERS,
  rows: 0,
  cols: 0,
  currentLayer: 0,
  selected: null,
  dirtyKeys: EMPTY_DIRTY,
  loading: false,
  loadProgress: 0,

  setLayers: (layers, rows, cols) => set({ layers, rows, cols }),

  setCurrentLayer: (currentLayer) => set({ currentLayer }),

  setKeycode: (layer, row, col, keycode) =>
    set((state) => {
      const layerData = state.layers[layer];
      if (!layerData || state.cols === 0) return state;
      const next = new Uint16Array(layerData);
      next[row * state.cols + col] = keycode & 0xffff;
      const layers = [...state.layers];
      layers[layer] = next;
      return { layers, dirtyKeys: new Set(state.dirtyKeys).add(keyId(layer, row, col)) };
    }),

  select: (selected) => set({ selected }),

  markClean: (layer, row, col) =>
    set((state) => {
      if (!state.dirtyKeys.has(keyId(layer, row, col))) return state;
      const next = new Set(state.dirtyKeys);
      next.delete(keyId(layer, row, col));
      return { dirtyKeys: next };
    }),

  setLoading: (loading, loadProgress) =>
    set((state) => ({ loading, loadProgress: loadProgress ?? state.loadProgress })),

  reset: () =>
    set({
      layers: EMPTY_LAYERS,
      rows: 0,
      cols: 0,
      currentLayer: 0,
      selected: null,
      dirtyKeys: EMPTY_DIRTY,
      loading: false,
      loadProgress: 0,
    }),
}));

/** 读取指定层指定位置的键码（越界返回禁用键 0x0000）。 */
export function selectKeycode(
  state: KeymapState,
  layer: number,
  row: number,
  col: number,
): number {
  const data = state.layers[layer];
  if (!data || state.cols === 0) return 0x0000;
  return data[row * state.cols + col] ?? 0x0000;
}
