import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { fetchEntities, fetchViews } from '../../lib/api';
import { getCachedEntities as getCached, setCachedEntities as setCached } from '../../lib/entityCache';
import clsx from 'clsx';

function parseColumnsFromFetchXml(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<attribute\s+name="([^"]+)"/g)].map((m) => m[1]);
}

function entityOptionValue(entity) {
  return entity.logicalCollectionName || entity.entitySetName || entity.logicalName || '';
}

function findEntity(entityList, value, logicalName) {
  return entityList.find((e) =>
    entityOptionValue(e) === value ||
    e.logicalName === value ||
    (logicalName && e.logicalName === logicalName)
  );
}

export default function DataverseViewConfig({ nodeId }) {
  const { nodes, updateNodeConfig } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg  = node?.data?.config || {};

  // ── Entity picker ─────────────────────────────────────────────────────────
  const [entities, setEntities]             = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError]   = useState(null);
  const [entitySearch, setEntitySearch]     = useState('');
  const [entityOpen, setEntityOpen]         = useState(false);
  const pickerRef = useRef(null);
  const entityList = Array.isArray(entities) ? entities : [];

  const reloadEntities = useCallback((bust = false) => {
    if (!bust) {
      const cached = getCached('');
      if (cached) { setEntities(cached); return; }
    }
    setEntitiesLoading(true);
    setEntitiesError(null);
    fetchEntities()
      .then((list) => { setCached('', list); setEntities(list); })
      .catch((e) => setEntitiesError(e.message))
      .finally(() => setEntitiesLoading(false));
  }, []);

  useEffect(() => { setEntitiesError(null); reloadEntities(); }, [reloadEntities]);

  useEffect(() => {
    if (!entityList.length || !cfg.entityLogicalName) return;
    const found = entityList.find((e) => e.logicalName === cfg.entityLogicalName);
    if (!found) {
      updateNodeConfig(nodeId, {
        entity: '', entityLogicalName: '', entityDisplayName: '',
        viewId: '', viewName: '', fetchXml: '', viewColumns: [],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities]);

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setEntityOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredEntities = entityList.filter(
    (e) =>
      e.displayName.toLowerCase().includes(entitySearch.toLowerCase()) ||
      e.logicalName.toLowerCase().includes(entitySearch.toLowerCase())
  );

  const chooseEntity = (e) => {
    updateNodeConfig(nodeId, {
      entity:            entityOptionValue(e),
      entityLogicalName: e.logicalName,
      entityDisplayName: e.displayName,
      viewId: '', viewName: '', fetchXml: '',
    });
    setEntitySearch('');
    setEntityOpen(false);
  };

  const chooseEntityByCollectionName = (collectionName) => {
    const next = findEntity(entityList, collectionName);
    if (next) chooseEntity(next);
    else {
      updateNodeConfig(nodeId, {
        entity: '', entityLogicalName: '', entityDisplayName: '',
        viewId: '', viewName: '', fetchXml: '', viewColumns: [],
      });
    }
  };

  const selectedEntity = findEntity(entityList, cfg.entity, cfg.entityLogicalName);

  // ── View picker ───────────────────────────────────────────────────────────
  const [views, setViews]             = useState([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [viewsError, setViewsError]   = useState(null);
  const [viewSearch, setViewSearch]   = useState('');
  const [viewOpen, setViewOpen]       = useState(false);
  const viewPickerRef = useRef(null);

  useEffect(() => {
    if (!cfg.entityLogicalName) { setViews([]); return; }
    setViewsLoading(true);
    setViewsError(null);
    fetchViews(cfg.entityLogicalName)
      .then(setViews)
      .catch((e) => setViewsError(e.message))
      .finally(() => setViewsLoading(false));
  }, [cfg.entityLogicalName]);

  useEffect(() => {
    const handler = (e) => {
      if (viewPickerRef.current && !viewPickerRef.current.contains(e.target)) setViewOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredViews = views.filter((v) =>
    v.name.toLowerCase().includes(viewSearch.toLowerCase())
  );

  const chooseView = (v) => {
    updateNodeConfig(nodeId, {
      viewId:      v.id,
      viewName:    v.name,
      fetchXml:    v.fetchXml,
      viewColumns: parseColumnsFromFetchXml(v.fetchXml),
    });
    setViewSearch('');
    setViewOpen(false);
  };

  return (
    <div className="space-y-5 text-xs">
      {/* Entity picker */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Dataverse Table
        </label>
        <select
          value={cfg.entity || ''}
          onChange={(e) => chooseEntityByCollectionName(e.target.value)}
          disabled={entitiesLoading || !!entitiesError}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 hover:border-slate-500 focus:border-sky-500 outline-none disabled:opacity-60"
        >
          <option value="">{entitiesLoading ? 'Loading tables...' : 'Choose a table...'}</option>
          {entityList.map((e) => (
            <option key={e.logicalName} value={entityOptionValue(e)}>
              {e.displayName} ({e.logicalName})
            </option>
          ))}
        </select>
        {entitiesError ? (
          <div className="mt-1.5 space-y-1">
            <div className="text-rose-400 font-medium">Failed to load tables</div>
            <div className="text-rose-300/70 text-[10px] break-all">{entitiesError}</div>
          </div>
        ) : null}
      </div>

      {/* View picker */}
      {cfg.entityLogicalName && (
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
            View
          </label>
          <div className="relative" ref={viewPickerRef}>
            <button
              type="button"
              onClick={() => setViewOpen((o) => !o)}
              disabled={viewsLoading}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-200 transition disabled:opacity-60"
            >
              <span className="truncate text-[11px]">
                {cfg.viewName
                  ? <span className="font-medium">{cfg.viewName}</span>
                  : <span className="text-slate-500">
                      {viewsLoading ? 'Loading views…' : 'Choose a view…'}
                    </span>}
              </span>
              {viewsLoading
                ? <Loader2 size={12} className="animate-spin text-slate-400 shrink-0" />
                : <ChevronDown size={12} className="text-slate-400 shrink-0" />}
            </button>

            {viewOpen && (
              <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded shadow-xl max-h-64 flex flex-col">
                <div className="p-2 border-b border-slate-700">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800 border border-slate-700">
                    <Search size={11} className="text-slate-400 shrink-0" />
                    <input
                      autoFocus
                      value={viewSearch}
                      onChange={(e) => setViewSearch(e.target.value)}
                      placeholder="Search views…"
                      className="flex-1 bg-transparent outline-none text-slate-200 placeholder-slate-500 text-[11px]"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto">
                  {filteredViews.length === 0 && (
                    <div className="px-3 py-4 text-slate-500 italic text-center">
                      {views.length === 0 ? 'No public views found.' : `No match for "${viewSearch}".`}
                    </div>
                  )}
                  {filteredViews.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => chooseView(v)}
                      className={clsx(
                        'w-full text-left px-3 py-2 hover:bg-slate-800 transition',
                        cfg.viewId === v.id && 'bg-sky-900/30 text-sky-200'
                      )}
                    >
                      <div className="font-medium text-[11px] truncate">{v.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {viewsError && (
            <p className="text-rose-400 text-[10px] mt-1">{viewsError}</p>
          )}
        </div>
      )}

      {/* FetchXML preview */}
      {cfg.fetchXml && (
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
            FetchXML (read-only)
          </label>
          <pre data-allow-horizontal-scroll className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-[10px] text-slate-400 overflow-auto max-h-32 whitespace-pre-wrap break-all font-mono">
            {cfg.fetchXml}
          </pre>
        </div>
      )}

      {cfg.viewName && !cfg.fetchXml && (
        <p className="text-[10px] text-slate-600 italic">No FetchXML available for this view.</p>
      )}
    </div>
  );
}
