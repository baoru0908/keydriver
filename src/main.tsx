// 应用入口：挂载 React、注册日志 sink、恢复上次使用的定义文件。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { registerLogSink } from '@/shared/log';
import { debugActions } from '@/store/useDebugStore';

// 结构化日志统一汇入调试面板（架构 §8.8：任何被吞掉的错误都必须可见）
registerLogSink((record) => {
  debugActions.log({
    level: record.level,
    scope: record.scope,
    message: record.message,
    at: record.at,
  });
});

// 开发期调试钩子：便于在浏览器控制台直接驱动 store 做联调（生产构建不注入）。
if (import.meta.env.DEV) {
  void (async () => {
    const [{ useDefinitionStore }, { useDeviceStore }, { useKeymapStore }] = await Promise.all([
      import('@/store/useDefinitionStore'),
      import('@/store/useDeviceStore'),
      import('@/store/useKeymapStore'),
    ]);
    Object.assign(window as unknown as Record<string, unknown>, {
      __keydriver: { useDefinitionStore, useDeviceStore, useKeymapStore },
    });
  })();
}

const container = document.getElementById('root');
if (!container) throw new Error('未找到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
