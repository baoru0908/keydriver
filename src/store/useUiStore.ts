// UI 偏好状态：主题、当前面板、侧栏折叠、色空间与值宽度/自定义键码基址等校准项（Q3/Q4/A5）。
import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';
export type PanelId = 'keymap' | 'layout' | 'debug' | 'menu' | 'backup' | 'device' | 'macros';
export type ColorSpace = 'hsv' | 'rgb' | 'grb';

const THEME_KEY = 'keydriver:theme';
const PREF_KEY = 'keydriver:uiPrefs';

interface UiPrefs {
  colorSpace: ColorSpace;
  customKeycodeBase: number;
  keymapScale: number;
}

const DEFAULT_PREFS: UiPrefs = {
  colorSpace: 'hsv',
  customKeycodeBase: 0x7e00,
  keymapScale: 1,
};

interface UiState extends UiPrefs {
  theme: ThemeMode;
  currentPanel: PanelId;
  sidebarOpen: boolean;
  /** 右侧键码面板是否展开 */
  keycodePanelOpen: boolean;
  /** 正在等待键码选择的控件来源（'keymap' 或某个 controlId） */
  keycodeTarget: string | null;
  importDialogOpen: boolean;
  /** 当前打开的自定义菜单 id（来自定义文件，零硬编码） */
  currentMenuId: string | null;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setCurrentPanel: (panel: PanelId) => void;
  toggleSidebar: (open?: boolean) => void;
  setKeycodePanelOpen: (open: boolean) => void;
  requestKeycode: (target: string) => void;
  clearKeycodeTarget: () => void;
  setImportDialogOpen: (open: boolean) => void;
  setCurrentMenuId: (menuId: string | null) => void;
  /** 一步切换到某个菜单面板（左侧导航用） */
  openMenu: (menuId: string) => void;
  setPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
}

function loadPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UiPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: UiPrefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // 持久化失败不影响本次会话
  }
}

/**
 * 解析初始主题（T03-3）：
 *   - 若用户曾手动选择（localStorage 有值）→ 直接采用，不再跟随系统；
 *   - 否则首次启动跟随一次系统 `prefers-color-scheme`，随后即锁定（手动选择后才改变）。
 * 在 Node / 无 localStorage 环境下安全回退到深色。
 */
function resolveInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // 忽略：localStorage 不可用时，跟随系统或回退深色
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export const useUiStore = create<UiState>((set, get) => ({
  ...loadPrefs(),
  theme: resolveInitialTheme(),
  currentPanel: 'keymap',
  sidebarOpen: true,
  keycodePanelOpen: true,
  keycodeTarget: null,
  importDialogOpen: false,
  currentMenuId: null,

  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 忽略
    }
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    set({ theme });
  },

  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  setCurrentPanel: (currentPanel) => set({ currentPanel }),
  toggleSidebar: (open) => set((s) => ({ sidebarOpen: open ?? !s.sidebarOpen })),
  setKeycodePanelOpen: (keycodePanelOpen) => set({ keycodePanelOpen }),
  requestKeycode: (keycodeTarget) => set({ keycodeTarget, keycodePanelOpen: true }),
  clearKeycodeTarget: () => set({ keycodeTarget: null }),
  setImportDialogOpen: (importDialogOpen) => set({ importDialogOpen }),
  setCurrentMenuId: (currentMenuId) => set({ currentMenuId }),
  openMenu: (menuId) => set({ currentMenuId: menuId, currentPanel: 'menu', keycodeTarget: null }),

  setPref: (key, value) => {
    set({ [key]: value } as Partial<UiState>);
    const s = get();
    savePrefs({ colorSpace: s.colorSpace, customKeycodeBase: s.customKeycodeBase, keymapScale: s.keymapScale });
  },
}));
