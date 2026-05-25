import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, ChevronDown, Check, Loader2 } from 'lucide-react';
import { usePipelineStore } from '../../store/usePipelineStore';
import { fetchEntities, fetchEntityFields } from '../../lib/api';
import { getCachedEntities as getCached, setCachedEntities as setCached } from '../../lib/entityCache';
import clsx from 'clsx';

function MaxRowsInput({ value, onChange }) {
  const [local, setLocal] = React.useState(String(value));
  React.useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(local, 10);
    if (!isNaN(n) && n > 0) onChange(Math.min(n, 50000));
    else setLocal(String(value));
  };
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
        Max Rows
      </label>
      <input
        type="number" min={1} max={50000} value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition"
      />
      <p className="text-[10px] text-slate-600 mt-1">Max 50,000. Uses OData pagination automatically.</p>
    </div>
  );
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

export default function DataverseInputConfig({ nodeId }) {
  const { nodes, updateNodeConfig } = usePipelineStore();
  const node = nodes.find((n) => n.id === nodeId);
  const cfg  = node?.data?.config || {};

  const [entities, setEntities]         = useState([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError]     = useState(null);
  const [entitySearch, setEntitySearch]       = useState('');
  const [entityOpen, setEntityOpen]           = useState(false);
  const pickerRef = useRef(null);

  const [fields, setFields]           = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [selectedFields, setSelectedFields] = useState(
    cfg.select ? cfg.select.split(',').map((s) => s.trim()).filter(Boolean) : []
  );
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

  useEffect(() => {
    setEntitiesError(null);
    reloadEntities();
  }, [reloadEntities]);

  useEffect(() => {
    if (!entityList.length || !cfg.entityLogicalName) return;
    const found = entityList.find((e) => e.logicalName === cfg.entityLogicalName);
    if (!found) {
      updateNodeConfig(nodeId, { entity: '', entityLogicalName: '', entityDisplayName: '', select: '' });
      setSelectedFields([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities]);

  const entityKey = cfg.entityLogicalName || cfg.entity;
  useEffect(() => {
    if (!entityKey) { setFields([]); return; }
    setFieldsLoading(true);
    fetchEntityFields(entityKey)
      .then((f) => {
        setFields(f);
        if (selectedFields.length) {
          const valid = new Set(f.map((field) => field.logicalName));
          const kept = selectedFields.filter((s) => valid.has(s));
          if (kept.length !== selectedFields.length) {
            setSelectedFields(kept);
            updateNodeConfig(nodeId, { select: kept.join(',') });
          }
        }
      })
      .catch(() => setFields([]))
      .finally(() => setFieldsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey]);

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
      select: '',
      filter: cfg.filter || '',
      top:    cfg.top    || 5000,
    });
    setSelectedFields([]);
    setEntitySearch('');
    setEntityOpen(false);
  };

  const chooseEntityByCollectionName = (collectionName) => {
    const next = findEntity(entityList, collectionName);
    if (next) chooseEntity(next);
    else {
      updateNodeConfig(nodeId, { entity: '', entityLogicalName: '', entityDisplayName: '', select: '' });
      setSelectedFields([]);
    }
  };

  const toggleField = (logicalName) => {
    const next = selectedFields.includes(logicalName)
      ? selectedFields.filter((f) => f !== logicalName)
      : [...selectedFields, logicalName];
    setSelectedFields(next);
    updateNodeConfig(nodeId, { select: next.join(',') });
  };

  const selectedEntity = findEntity(entityList, cfg.entity, cfg.entityLogicalName);

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

      {cfg.entity && (
        <>
          {/* Column selector */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
              Columns to Fetch
              <span className="ml-1 text-slate-600 normal-case font-normal">(blank = all)</span>
            </label>
            {fieldsLoading ? (
              <div className="flex items-center gap-2 text-slate-500 py-2">
                <Loader2 size={11} className="animate-spin" /> Loading fields…
              </div>
            ) : fields.length > 0 ? (
              <div className="max-h-48 overflow-y-auto border border-slate-700 rounded divide-y divide-slate-800">
                {fields.map((f) => {
                  const on = selectedFields.includes(f.logicalName);
                  return (
                    <label
                      key={f.logicalName}
                      className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleField(f.logicalName)}
                        className="accent-emerald-500"
                      />
                      <span className="flex-1">
                        <span className="text-slate-200">{f.displayName}</span>
                        <span className="text-slate-600 ml-1.5 text-[10px]">{f.logicalName}</span>
                      </span>
                      <span className="text-[10px] text-slate-600 shrink-0">{f.attributeType}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-500 py-1">No fields found</div>
            )}
          </div>

          {/* OData filter */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
              OData Filter
              <span className="ml-1 text-slate-600 normal-case font-normal">(optional)</span>
            </label>
            <input
              value={cfg.filter || ''}
              onChange={(e) => updateNodeConfig(nodeId, { filter: e.target.value })}
              placeholder="e.g. statecode eq 0 and createdon gt 2024-01-01"
              className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:border-slate-500 focus:border-sky-500 text-slate-200 outline-none transition font-mono text-[11px]"
            />
          </div>

          {/* Max rows */}
          <MaxRowsInput
            value={cfg.top ?? 5000}
            onChange={(v) => updateNodeConfig(nodeId, { top: v })}
          />
        </>
      )}
    </div>
  );
}
