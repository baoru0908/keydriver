// 「未连接就不显示连接信息」门控测试。
//
// 分两层保证真的能证伪（而不是写一句永远为真的断言）：
// 1) 纯逻辑层：shouldShowConnectionInfo 对四种连接态的取值；
// 2) DOM 层：把组件渲染成字符串后，断言「标签字符串到底有没有出现在输出里」。
//    之所以不直接渲染真实 store：SSR（renderToString）下 zustand 的 useStore 走
//    getInitialState 分支，`setState` 改不动渲染结果；所以用 vi.mock 把 useDeviceStore /
//    useDebugStore 的 hook 换成「读一份可注入的假快照」，才能真正构造 connected / disconnected
//    两种场景。DeviceInfoCard 是纯 props 组件（完全不碰 store），因此那份断言最干净。
import { describe, expect, it, vi } from 'vitest';

/** 可注入的 device store 假快照；用例里直接改字段即可切换场景。 */
const fakeDevice = vi.hoisted(() => ({
  snapshot: {
    transportKind: 'dummy' as const,
    devices: [],
    selectedDeviceId: null,
    state: 'disconnected' as string,
    handshake: null as Record<string, unknown> | null,
    layoutOptions: 0,
    error: null,
    busy: false,
    showAllDevices: false,
    scanSummary: null,
    setTransportKind: () => undefined,
    setShowAllDevices: () => undefined,
    refreshDevices: async () => undefined,
    selectDevice: () => undefined,
    connect: async () => false,
    disconnect: async () => undefined,
    reloadKeymap: async () => undefined,
    applyKeycode: async () => false,
    applyLayoutOptions: async () => undefined,
    menuLoad: async () => undefined,
    menuCommit: async () => false,
    menuTrigger: async () => false,
    menuSaveAll: async () => 0,
    undoLast: async () => false,
    undoDepth: () => 0,
    deviceEepromReset: async () => false,
    macroGetBuffer: async () => new Uint8Array(0),
    macroSetBuffer: async () => undefined,
    backupExport: () => null,
    backupImport: async () => ({ applied: 0, missing: 0 }),
  } as Record<string, unknown>,
}));

/** 调试 store 假快照：默认无报文，StatusBar 用例会按需注入一条。 */
const fakeDebug = vi.hoisted(() => ({
  snapshot: {
    frames: [] as readonly { id: number; dir: string; hex: string; ts: number; durationMs: number }[],
    warnings: [],
    logs: [],
    debugPanelOpen: false,
    pushFrame: () => undefined,
    pushWarning: () => undefined,
    pushLog: () => undefined,
    clearFrames: () => undefined,
    clearWarnings: () => undefined,
    toggleDebugPanel: () => undefined,
  } as Record<string, unknown>,
}));

/** 把 zustand hook 替身：选择器直接跑在我们注入的假快照上。 */
function makeHook(snapshot: Record<string, unknown>): (selector?: (s: unknown) => unknown) => unknown {
  return Object.assign((selector?: (s: unknown) => unknown) => (selector ? selector(snapshot) : snapshot), {
    getState: () => snapshot,
    setState: () => undefined,
    subscribe: () => () => undefined,
    getInitialState: () => snapshot,
    destroy: () => undefined,
  });
}

vi.mock('@/store/useDeviceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/useDeviceStore')>();
  return {
    ...actual,
    useDeviceStore: makeHook(fakeDevice.snapshot) as unknown as typeof actual.useDeviceStore,
  };
});

vi.mock('@/store/useDebugStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/useDebugStore')>();
  return {
    ...actual,
    useDebugStore: makeHook(fakeDebug.snapshot) as unknown as typeof actual.useDebugStore,
  };
});

/** 一份完整的握手结论（字段与 HandshakeResult 一致）。 */
const HANDSHAKE: Record<string, unknown> = {
  protocolVersion: 13,
  layerCount: 4,
  firmwareVersion: 0x00010002,
  layoutOptions: 0,
  keycodesVersion: 12,
  probe: { passed: true, detail: '回显前缀与请求一致' },
};

async function render(element: React.ReactElement): Promise<string> {
  const { renderToString } = await import('react-dom/server');
  const React = await import('react');
  return renderToString(React.createElement(React.Fragment, null, element));
}

/**
 * 抽出渲染结果里的「信息行标签」（<dt> 文本）。
 * 必须精确到 <dt> 节点：卡片底部那句提示里也出现了「协议版本/固件版本/层数」字样，
 * 直接对整段 html 做 not.toContain 会被提示文案误伤（断言失真）。
 */
function renderedRowLabels(html: string): string[] {
  const labels: string[] = [];
  const pattern = /<dt[^>]*>([^<]*)<\/dt>/g;
  let match = pattern.exec(html);
  while (match !== null) {
    labels.push(match[1] ?? '');
    match = pattern.exec(html);
  }
  return labels;
}

/** 给调试 store 注入一条报文摘要（StatusBar 的「最近一条报文」来源）。 */
function seedFrame(): void {
  fakeDebug.snapshot.frames = [{ id: 1, dir: 'out', hex: '0B0B', ts: 0, durationMs: 3 }];
}

describe('未连接时不显示连接态信息', () => {
  it('shouldShowConnectionInfo：仅 connected 为真', async () => {
    const { shouldShowConnectionInfo } = await import('@/ui/device/connectionInfo');
    expect(shouldShowConnectionInfo('connected')).toBe(true);
    expect(shouldShowConnectionInfo('disconnected')).toBe(false);
    expect(shouldShowConnectionInfo('connecting')).toBe(false);
    expect(shouldShowConnectionInfo('error')).toBe(false);
  });

  it('连接态 / 常驻字段清单互不重叠，且覆盖全部需要门控的标签', async () => {
    const { CONNECTION_INFO_LABELS, DEFINITION_INFO_LABELS } = await import(
      '@/ui/device/connectionInfo'
    );
    expect(CONNECTION_INFO_LABELS).toEqual([
      '连接状态',
      '协议版本',
      '固件版本',
      '层数',
      '键码字典版本',
    ]);
    expect(DEFINITION_INFO_LABELS).toEqual(['定义名称', 'VID', 'PID']);
    const overlap = CONNECTION_INFO_LABELS.filter((label) => DEFINITION_INFO_LABELS.includes(label));
    expect(overlap).toEqual([]);
  });

  it('DeviceInfoCard：未连接时不渲染连接态字段，常驻字段与提示仍在', async () => {
    const { DeviceInfoCard } = await import('@/ui/device/DeviceInfoCard');
    const { CONNECTION_INFO_LABELS, CONNECTION_INFO_HINT, DEFINITION_INFO_LABELS } = await import(
      '@/ui/device/connectionInfo'
    );
    const html = await render(
      await (async () => {
        const React = await import('react');
        return React.createElement(DeviceInfoCard, {
          definitionName: 'demo',
          vid: 0x1234,
          pid: 0x0001,
          state: 'disconnected',
          handshake: null,
        });
      })(),
    );
    const labels = renderedRowLabels(html);
    for (const label of CONNECTION_INFO_LABELS) expect(labels).not.toContain(label);
    // 常驻字段必须还在（否则「未连接时不显示」会被误做成「什么都不显示」）
    expect(labels).toEqual(DEFINITION_INFO_LABELS);
    expect(html).toContain(CONNECTION_INFO_HINT);
  },
    30000,
  );

  it('DeviceInfoCard：已连接且有握手结论时渲染连接态字段（含具体取值）', async () => {
    const { DeviceInfoCard } = await import('@/ui/device/DeviceInfoCard');
    const { CONNECTION_INFO_LABELS, CONNECTION_INFO_HINT } = await import(
      '@/ui/device/connectionInfo'
    );
    const { DEFINITION_INFO_LABELS } = await import('@/ui/device/connectionInfo');
    const React = await import('react');
    const html = await render(
      React.createElement(DeviceInfoCard, {
        definitionName: 'demo',
        vid: 0x1234,
        pid: 0x0001,
        state: 'connected',
        handshake: HANDSHAKE as never,
      }),
    );
    const labels = renderedRowLabels(html);
    for (const label of CONNECTION_INFO_LABELS) expect(labels).toContain(label);
    expect(labels).toEqual([...DEFINITION_INFO_LABELS, ...CONNECTION_INFO_LABELS]);
    expect(html).toContain('v13'); // 协议版本
    expect(html).toContain('v12'); // 键码字典版本
    expect(html).not.toContain(CONNECTION_INFO_HINT);
  },
    30000,
  );

  it('DeviceInfoCard：connecting / error 态同样不渲染连接态字段', async () => {
    const { DeviceInfoCard } = await import('@/ui/device/DeviceInfoCard');
    const { CONNECTION_INFO_LABELS } = await import('@/ui/device/connectionInfo');
    const React = await import('react');
    for (const state of ['connecting', 'error'] as const) {
      const html = await render(
        React.createElement(DeviceInfoCard, {
          definitionName: 'demo',
          vid: 0x1234,
          pid: 0x0001,
          state,
          // 故意带上握手结论：此时它是过期数据，也不该显示
          handshake: HANDSHAKE as never,
        }),
      );
      const labels = renderedRowLabels(html);
      for (const label of CONNECTION_INFO_LABELS) expect(labels).not.toContain(label);
    }
  },
    30000,
  );

  it('DevicePanel：未连接时不出现连接态字段，导出/导入按钮仍在（只是禁用）', async () => {
    const { DevicePanel } = await import('@/ui/device/DevicePanel');
    const { CONNECTION_INFO_LABELS, DEFINITION_INFO_LABELS } = await import(
      '@/ui/device/connectionInfo'
    );
    fakeDevice.snapshot.state = 'disconnected';
    fakeDevice.snapshot.handshake = null;

    const html = await render(await (async () => {
      const React = await import('react');
      return React.createElement(DevicePanel);
    })());

    const labels = renderedRowLabels(html);
    for (const label of CONNECTION_INFO_LABELS) expect(labels).not.toContain(label);
    for (const label of DEFINITION_INFO_LABELS) expect(labels).toContain(label);
    // 操作入口保留：用户要的是隐藏连接信息，不是隐藏操作
    expect(html).toContain('导出配置');
    expect(html).toContain('导入配置');
  },
    30000,
  );

  it('DevicePanel：已连接时渲染连接态字段', async () => {
    const { DevicePanel } = await import('@/ui/device/DevicePanel');
    const { CONNECTION_INFO_LABELS } = await import('@/ui/device/connectionInfo');
    fakeDevice.snapshot.state = 'connected';
    fakeDevice.snapshot.handshake = HANDSHAKE;

    const html = await render(await (async () => {
      const React = await import('react');
      return React.createElement(DevicePanel);
    })());

    const labels = renderedRowLabels(html);
    for (const label of CONNECTION_INFO_LABELS) expect(labels).toContain(label);
    expect(html).toContain('已连接');
  },
    30000,
  );

  it('StatusBar：未连接时不显示最近报文摘要（即使缓冲里还有旧报文）', async () => {
    const { StatusBar } = await import('@/ui/layout/StatusBar');
    fakeDevice.snapshot.state = 'disconnected';
    fakeDevice.snapshot.busy = false;
    seedFrame(); // 缓冲里刻意留着旧报文

    const html = await render(await (async () => {
      const React = await import('react');
      return React.createElement(StatusBar);
    })());

    expect(html).toContain('未连接');
    expect(html).not.toContain('OUT');
    expect(html).not.toContain('0B0B');
  },
    30000,
  );

  it('StatusBar：已连接时显示最近报文摘要', async () => {
    const { StatusBar } = await import('@/ui/layout/StatusBar');
    fakeDevice.snapshot.state = 'connected';
    fakeDevice.snapshot.handshake = HANDSHAKE;
    seedFrame();

    const html = await render(await (async () => {
      const React = await import('react');
      return React.createElement(StatusBar);
    })());

    expect(html).toContain('OUT');
    expect(html).toContain('0B0B');
  },
    30000,
  );

  it('LayerSwitcher：未连接时不渲染（包括「层数未知」占位）', async () => {
    const { LayerSwitcher } = await import('@/ui/keymap/LayerSwitcher');
    fakeDevice.snapshot.state = 'disconnected';
    fakeDevice.snapshot.handshake = null;

    const html = await render(await (async () => {
      const React = await import('react');
      return React.createElement(LayerSwitcher);
    })());
    expect(html).toBe('');
  },
    30000,
  );

  it('DebugPanel：未连接时不渲染握手结论块', async () => {
    const { DebugPanel } = await import('@/ui/debug/DebugPanel');
    fakeDevice.snapshot.state = 'disconnected';
    fakeDevice.snapshot.handshake = null;

    const html = await render(await (async () => {
      const React = await import('react');
      return React.createElement(DebugPanel, { embedded: false });
    })());
    expect(html).not.toContain('协议版本');
    expect(html).not.toContain('layout_options');
    expect(html).not.toContain('自校验探针');
  },
    30000,
  );
});
