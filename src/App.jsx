import React, { useEffect } from 'react';
import Toolbar from './components/Toolbar';
import NodePalette from './components/NodePalette';
import Canvas from './components/Canvas';
import ConfigPanel from './components/ConfigPanel';
import DragGhost from './components/DragGhost';
import { usePipelineStore } from './store/usePipelineStore';
import { recordGestureOrigin } from './lib/gestureTracker';
import { useConnection } from './hooks/useToolboxAPI';

export default function App() {
  const { save, load } = usePipelineStore();
  const connected = useConnection();

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  useEffect(() => {
    window.addEventListener('wheel', recordGestureOrigin, { capture: true, passive: true });
    return () => window.removeEventListener('wheel', recordGestureOrigin, { capture: true });
  }, []);

  useEffect(() => {
    const preventHorizontalSwipe = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      const el = e.target.closest?.('[data-allow-horizontal-scroll], [data-config-panel]');
      if (!el) e.preventDefault();
    };
    window.addEventListener('wheel', preventHorizontalSwipe, { passive: false });
    return () => window.removeEventListener('wheel', preventHorizontalSwipe);
  }, []);

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0f1117] text-white">
        <div className="text-center space-y-4">
          <div className="font-bold text-2xl tracking-tight">
            Cross<span className="text-emerald-400">Migrate</span>
          </div>
          <p className="text-gray-400">Waiting for Power Platform ToolBox connection...</p>
          <p className="text-sm text-gray-500">
            This tool must be loaded inside Power Platform ToolBox.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f1117] text-white overflow-hidden">
      <Toolbar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <NodePalette />
        <Canvas />
        <ConfigPanel />
      </div>
      <DragGhost />
    </div>
  );
}
