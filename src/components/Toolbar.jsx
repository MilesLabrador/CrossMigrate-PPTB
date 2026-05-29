import React, { useState, useRef } from 'react';
import { Save, Download, Upload, Play, Trash2, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { usePipelineStore } from '../store/usePipelineStore';
import { runPipelineStream, fetchDataverseRows, fetchDataverseView } from '../lib/api';

const SOURCE_TYPES = new Set(['csvInput', 'manualData', 'dataverseInput']);

export default function Toolbar() {
  const {
    projectName, setProjectName,
    save, clearCanvas, loadFromObject, serialize,
    nodes, edges,
    setRunning, running,
    setNodeStatus, resetNodeStatuses,
    updateNodeData,
    selectNode,
  } = usePipelineStore();

  const [savedFlash, setSavedFlash] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [runBanner, setRunBanner] = useState(null);
  const fileInputRef = useRef(null);

  const showBanner = (kind, message, ttl = 6000) => {
    setRunBanner({ kind, message });
    if (ttl > 0) setTimeout(() => setRunBanner(null), ttl);
  };

  const onSave = () => {
    save();
    setSavedFlash(true);
    setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const onExportFile = () => {
    const data = serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.projectName || 'pipeline'}.crossmigrate.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.nodes || !data.edges) throw new Error('Invalid pipeline file');
        loadFromObject(data);
        showBanner('ok', `Loaded "${data.projectName || file.name}"`);
      } catch (err) {
        showBanner('error', `Could not load file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onRun = async () => {
    if (!nodes.length || running) return;

    setRunning(true);
    resetNodeStatuses();

    const unconfigured = nodes.filter(
      (n) =>
        n.type === 'dataverseInput' &&
        (n.data?.config?.mode === 'view'
          ? (!n.data?.config?.entity || !n.data?.config?.fetchXml)
          : !n.data?.config?.entity)
    );
    if (unconfigured.length) {
      const first = unconfigured[0];
      selectNode(first.id);
      showBanner(
        'warn',
        `${first.data?.name || first.type} source is missing its Dataverse table/view — configure this source before running`
      );
      setRunning(false);
      return;
    }

    const unfetched = nodes.filter(
      (n) =>
        n.type === 'dataverseInput' &&
        !(n.data?.rows?.length) &&
        (n.data?.config?.mode === 'view' ? n.data?.config?.fetchXml : n.data?.config?.entity)
    );
    if (unfetched.length) {
      showBanner('ok', `Auto-fetching ${unfetched.length} Dataverse source${unfetched.length > 1 ? 's' : ''}…`, 0);
      for (const n of unfetched) {
        try {
          const cfg = n.data.config;
          let result;
          if (cfg.mode === 'view') {
            result = await fetchDataverseView({
              entityCollection: cfg.entity,
              savedQueryId:     cfg.viewId,
              top:              cfg.top || 5000,
              viewColumns:      cfg.viewColumns || [],
            });
          } else {
            result = await fetchDataverseRows({
              entity:  cfg.entity,
              select:  cfg.select  || '',
              filter:  cfg.filter  || '',
              top:     cfg.top     || 5000,
            });
          }
          updateNodeData(n.id, {
            rows:         result.rows,
            columns:      result.columns,
            _lastFetched: new Date().toLocaleTimeString(),
            _zeroRows:    result.rowCount === 0,
          });
        } catch (err) {
          showBanner('error', `Auto-fetch failed for "${n.data?.name}": ${err.message}`);
          setRunning(false);
          return;
        }
      }
      setRunBanner(null);
    }

    const latestNodes = usePipelineStore.getState().nodes;
    const emptySources = latestNodes.filter(
      (n) => SOURCE_TYPES.has(n.type) && !(n.data?.rows?.length)
    );
    if (emptySources.length) {
      const first = emptySources[0];
      selectNode(first.id);
      showBanner('warn', `${first.data?.name || first.type} source has 0 rows — load data before running`);
      setRunning(false);
      return;
    }

    const latestEdges = usePipelineStore.getState().edges;
    const slim = {
      nodes: latestNodes.map((n) => ({
        id: n.id, type: n.type, position: n.position,
        data: { name: n.data?.name, config: n.data?.config, rows: n.data?.rows, columns: n.data?.columns },
      })),
      edges: latestEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };

    let lastRowCount = 0;
    let errorCount   = 0;

    try {
      await runPipelineStream(slim, (evt) => {
        if (evt.type === 'node') {
          setNodeStatus(evt.nodeId, evt);
          if (evt.status === 'success') {
            lastRowCount = evt.rowCount ?? 0;
            if (Array.isArray(evt.rows)) updateNodeData(evt.nodeId, { _producedRows: evt.rows });
          }
          if (evt.status === 'error') errorCount++;
        }
      });

      if (errorCount > 0) {
        showBanner('error', `Pipeline finished with ${errorCount} node error${errorCount > 1 ? 's' : ''} — check highlighted nodes`);
      } else {
        showBanner('ok', `Pipeline complete · ${lastRowCount.toLocaleString()} rows out`);
      }
    } catch (err) {
      console.error('pipeline run failed', err);
      showBanner('error', `Pipeline failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const bannerColors = {
    ok:    'bg-emerald-900/80 border-emerald-700 text-emerald-200',
    warn:  'bg-amber-900/80 border-amber-700 text-amber-200',
    error: 'bg-rose-900/80 border-rose-700 text-rose-200',
  };
  const BannerIcon = { ok: CheckCircle2, warn: AlertTriangle, error: AlertCircle };

  return (
    <>
      <div className="h-14 flex items-center justify-between px-4 bg-card border-b border-slate-800 z-30 relative shrink-0">
        <div className="flex items-center gap-3">
          <div className="font-bold text-lg tracking-tight text-white">
            Cross<span className="text-emerald-400">Migrate</span>
          </div>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="bg-transparent text-slate-300 text-sm px-2 py-1 rounded hover:bg-slate-800 focus:bg-slate-800 outline-none w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            title={savedAt ? `Last saved at ${savedAt}` : 'Save pipeline (Ctrl+S)'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition"
          >
            {savedFlash ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Save size={14} />}
            {savedFlash ? 'Saved!' : savedAt ? `Saved ${savedAt}` : 'Save'}
          </button>
          <Btn onClick={onExportFile} icon={<Download size={14} />}>Export</Btn>
          <Btn onClick={() => fileInputRef.current?.click()} icon={<Upload size={14} />}>Import</Btn>
          <input ref={fileInputRef} type="file" accept=".json,.crossmigrate.json" onChange={onImportFile} className="hidden" />
          <Btn onClick={() => { if (confirm('Clear the entire canvas?')) clearCanvas(); }} icon={<Trash2 size={14} />}>Clear</Btn>

          <div className="w-px h-5 bg-slate-700 mx-1" />
          <button
            onClick={onRun}
            disabled={running || !nodes.length}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>

      {runBanner && (() => {
        const Icon = BannerIcon[runBanner.kind];
        return (
          <div className={`flex items-center gap-2 px-4 py-2 text-sm border-b z-20 relative shrink-0 ${bannerColors[runBanner.kind]}`}>
            <Icon size={14} className="shrink-0" />
            {runBanner.message}
            <button onClick={() => setRunBanner(null)} className="ml-auto opacity-60 hover:opacity-100 text-xs">✕</button>
          </div>
        );
      })()}
    </>
  );
}

function Btn({ children, onClick, icon }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition">
      {icon}{children}
    </button>
  );
}
