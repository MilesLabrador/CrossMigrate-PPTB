// API adapter layer — bridges CrossMigrate's API surface to PPTB's
// window.dataverseAPI. Uses the real PPTB methods:
//   queryData(), getAllEntitiesMetadata(), getEntityMetadata(),
//   getEntityRelatedMetadata(), create(), update(), delete(), execute()

import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import dayjs from 'dayjs';

function dv() {
  if (!window.dataverseAPI) throw new Error('Not connected to Power Platform ToolBox');
  return window.dataverseAPI;
}

function connectionTargetFromOptions(options) {
  if (options === 'primary' || options === 'secondary') return options;
  if (options?.connectionTarget === 'secondary') return 'secondary';
  return 'primary';
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.value)) return value.value;
  if (Array.isArray(value?.entities)) return value.entities;
  if (Array.isArray(value?.Entities)) return value.Entities;
  return [];
}

export async function fetchEntities(options = {}) {
  const api = dv();
  const connectionTarget = connectionTargetFromOptions(options);
  const metadata = await api.getAllEntitiesMetadata(
    ['LogicalName', 'DisplayName', 'EntitySetName', 'LogicalCollectionName', 'IsCustomizable'],
    connectionTarget
  );
  return toArray(metadata)
    .filter((e) => e?.LogicalName)
    .filter((e) => e.IsCustomizable?.Value !== false)
    .map((e) => ({
      logicalName: e.LogicalName,
      displayName: e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName,
      entitySetName: e.EntitySetName || e.LogicalCollectionName || e.LogicalName,
      logicalCollectionName: e.EntitySetName || e.LogicalCollectionName || e.LogicalName,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function fetchEntityFields(logicalName, options = {}) {
  const api = dv();
  const connectionTarget = connectionTargetFromOptions(options);
  const attrs = await api.getEntityRelatedMetadata(
    logicalName,
    'Attributes',
    ['LogicalName', 'DisplayName', 'AttributeType', 'AttributeTypeName', 'RequiredLevel', 'IsValidForCreate', 'Targets'],
    connectionTarget
  );
  return toArray(attrs).filter((f) => f?.LogicalName).map((f) => ({
    logicalName: f.LogicalName,
    displayName: f.DisplayName?.UserLocalizedLabel?.Label || f.LogicalName,
    type: f.AttributeType,
    attributeType: f.AttributeType,
    attributeTypeName: f.AttributeTypeName?.Value,
    requiredLevel: f.RequiredLevel?.Value,
    isValidForCreate: f.IsValidForCreate,
    targets: f.Targets || [],
  }));
}

export async function fetchDataverseRows({ entity, select = '', filter = '', top = 5000, orgUrl = '', connectionTarget = 'primary' }) {
  const api = dv();
  const params = [];
  if (select) params.push(`$select=${select}`);
  if (filter) params.push(`$filter=${filter}`);
  if (top) params.push(`$top=${top}`);
  const qs = params.length ? `?${params.join('&')}` : '';
  const query = `${entity}${qs}`;
  const data = await api.queryData(query, connectionTargetFromOptions(connectionTarget));
  const rows = data?.value || data || [];
  const rowArray = Array.isArray(rows) ? rows : [];
  const columns = rowArray.length > 0 ? Object.keys(rowArray[0]).filter((k) => !k.startsWith('@') && !k.startsWith('_')) : [];
  return { rows: rowArray, columns, rowCount: rowArray.length };
}

export async function fetchViews(logicalName, options = {}) {
  const api = dv();
  const connectionTarget = connectionTargetFromOptions(options);
  const query = `savedqueries?$filter=returnedtypecode eq '${logicalName}' and statecode eq 0&$select=name,savedqueryid,fetchxml,layoutxml`;
  const data = await api.queryData(query, connectionTarget);
  const views = data?.value || data || [];
  return (Array.isArray(views) ? views : []).map((v) => ({
    id: v.savedqueryid,
    savedqueryid: v.savedqueryid,
    name: v.name,
    fetchXml: v.fetchxml,
    fetchxml: v.fetchxml,
    layoutxml: v.layoutxml,
  }));
}

export async function fetchDataverseView({ entityCollection, savedQueryId, top = 5000, viewColumns = [], connectionTarget = 'primary' }) {
  const api = dv();
  const select = viewColumns.length ? `&$select=${viewColumns.join(',')}` : '';
  const query = `${entityCollection}?savedQuery=${savedQueryId}&$top=${top}${select}`;
  const data = await api.queryData(query, connectionTargetFromOptions(connectionTarget));
  const rows = data?.value || data || [];
  const rowArray = Array.isArray(rows) ? rows : [];
  const columns = rowArray.length > 0
    ? Object.keys(rowArray[0]).filter((k) => !k.startsWith('@') && !k.startsWith('_'))
    : viewColumns;
  return { rows: rowArray, columns, rowCount: rowArray.length };
}

// Client-side CSV parsing (replaces server upload route)
export async function uploadCsv(file, { delimiter = ',', header = true } = {}) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      delimiter: delimiter || undefined,
      header,
      skipEmptyLines: true,
      complete(results) {
        const rows = results.data;
        const columns = results.meta.fields || (rows[0] ? Object.keys(rows[0]) : []);
        resolve({ rows, columns });
      },
      error: reject,
    });
  });
}

// Client-side XLSX parsing (replaces server upload route)
export async function uploadXlsx(file, { header = true, sheet = '' } = {}) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = sheet || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: header ? undefined : 1 });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    rows,
    columns,
    sheets: wb.SheetNames,
    sheetName,
    activeSheet: sheetName,
    fileId: `local_${Date.now()}`,
  };
}

export async function fetchXlsxSheet(fileId, { sheet, header = true } = {}) {
  throw new Error('fetchXlsxSheet is not available in PPTB mode — re-upload the file to change sheets.');
}

// Settings stored in localStorage (no server)
const SETTINGS_KEY = 'crossmigrate-pptb:settings';

export async function fetchSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export async function saveSettings(values) {
  const current = await fetchSettings();
  const merged = { ...current, ...values };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

// Import rows into Dataverse via PPTB API
export async function importToDataverseSSE({ entity, rows, orgUrl = '', connectionTarget = 'primary' }, onEvent) {
  const api = dv();
  const target = connectionTargetFromOptions(connectionTarget);
  let success = 0;
  let failed = 0;
  const failedRows = [];
  for (const row of rows) {
    try {
      await api.create(entity, row, target);
      success++;
      onEvent({ type: 'progress', processed: success + failed, success, failed, total: rows.length });
    } catch (err) {
      failed++;
      failedRows.push({ ...row, _error: String(err) });
      onEvent({ type: 'progress', processed: success + failed, success, failed, total: rows.length });
    }
  }
  onEvent({ type: 'done', success, failed, total: rows.length, failedRows });
}

// Pipeline execution runs client-side in PPTB mode (no server engine)
export async function runPipelineStream(pipeline, onEvent) {
  const nodes = Array.isArray(pipeline?.nodes) ? pipeline.nodes : [];
  const edges = Array.isArray(pipeline?.edges) ? pipeline.edges : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    incoming.get(edge.target).push(edge);
    outgoing.get(edge.source).push(edge);
  }

  const indegree = new Map(nodes.map((n) => [n.id, incoming.get(n.id)?.length || 0]));
  const queue = nodes.filter((n) => (indegree.get(n.id) || 0) === 0).map((n) => n.id);
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    for (const edge of outgoing.get(id) || []) {
      const next = (indegree.get(edge.target) || 0) - 1;
      indegree.set(edge.target, next);
      if (next === 0) queue.push(edge.target);
    }
  }

  if (ordered.length !== nodes.length) {
    throw new Error('Pipeline graph contains a cycle');
  }

  const outputs = new Map();
  for (const id of ordered) {
    const node = byId.get(id);
    const inputRows = mergeIncomingRows(node.id, incoming, outputs);
    const result = executeNode(node, inputRows);
    outputs.set(id, result);
    onEvent({
      type: 'node',
      nodeId: node.id,
      status: 'success',
      rowCount: result.rows.length,
      rows: result.rows,
      columns: result.columns,
      sample: result.rows.slice(0, 3),
      meta: result.meta || { rowCount: result.rows.length },
    });
  }
  onEvent({ type: 'done' });
}

function mergeIncomingRows(nodeId, incoming, outputs) {
  const sourceEdges = incoming.get(nodeId) || [];
  if (!sourceEdges.length) return [];
  if (sourceEdges.length === 1) return outputs.get(sourceEdges[0].source)?.rows || [];
  return sourceEdges.flatMap((edge) => outputs.get(edge.source)?.rows || []);
}

function executeNode(node, inputRows) {
  const cfg = node.data?.config || {};
  const rows = Array.isArray(inputRows) ? inputRows : [];
  switch (node.type) {
    case 'csvInput':
    case 'xlsxInput':
    case 'manualData':
    case 'dataverseInput':
      return result(node.data?.rows || [], node.data?.columns);
    case 'selectColumns':
      return result(selectColumns(rows, cfg.columns || []));
    case 'selectMap':
      return result(selectMap(rows, cfg.mappings || []));
    case 'filter':
    {
      const filtered = filterRows(rows, cfg);
      return result(filtered, undefined, { rowCount: filtered.length, matchedOf: rows.length });
    }
    case 'transform':
      return result(transformRows(rows, cfg.fieldTransforms || []));
    case 'deduplicate':
      return result(deduplicateRows(rows, cfg.fields || [], cfg.strategy || 'first'));
    case 'randomSample': {
      const sampled = cfg.withReplacement
        ? sampleWithReplacement(rows, cfg.size || 100)
        : sampleRows(rows, cfg.size || 100);
      return result(sampled, undefined, { rowCount: sampled.length, sampledFrom: rows.length });
    }
    case 'preview':
      return result(rows);
    case 'previewColumns': {
      const columns = inferColumns(rows);
      return result(rows, columns, { rowCount: rows.length, schema: buildSchema(rows, columns) });
    }
    case 'fieldUsage':
    {
      const columns = inferColumns(rows);
      return result(rows, columns, { rowCount: rows.length, fieldStats: buildFieldStats(rows, columns) });
    }
    case 'csvExport':
    case 'dataverseOutput':
    default:
      return result(rows);
  }
}

function result(rows, columns, meta) {
  const rowArray = Array.isArray(rows) ? rows : [];
  return {
    rows: rowArray,
    columns: columns?.length ? columns : inferColumns(rowArray),
    meta: meta || { rowCount: rowArray.length },
  };
}

function inferColumns(rows) {
  const cols = new Set();
  rows.slice(0, 25).forEach((row) => Object.keys(row || {}).forEach((col) => cols.add(col)));
  return Array.from(cols);
}

function buildSchema(rows, columns = inferColumns(rows)) {
  return columns.map((name) => {
    const values = rows.map((row) => row?.[name]);
    return {
      name,
      type: inferValueType(values),
      nullCount: values.filter(isEmptyValue).length,
    };
  });
}

function buildFieldStats(rows, columns = inferColumns(rows)) {
  return buildSchema(rows, columns).map((field) => {
    const values = rows.map((row) => row?.[field.name]).filter((value) => !isEmptyValue(value));
    return {
      ...field,
      uniqueCount: new Set(values.map((value) => String(value))).size,
      samples: Array.from(new Set(values.map((value) => String(value)))).slice(0, 5),
    };
  });
}

function isEmptyValue(value) {
  return value == null || value === '';
}

function inferValueType(values) {
  const nonEmpty = values.filter((value) => !isEmptyValue(value)).slice(0, 50);
  if (!nonEmpty.length) return 'empty';
  if (nonEmpty.every((value) => typeof value === 'boolean' || ['true', 'false'].includes(String(value).toLowerCase()))) {
    return 'boolean';
  }
  if (nonEmpty.every((value) => value !== '' && Number.isFinite(Number(value)))) {
    return 'number';
  }
  if (nonEmpty.every((value) => {
    const text = String(value);
    return /\d{4}-\d{2}-\d{2}/.test(text) && dayjs(text).isValid();
  })) {
    return 'date';
  }
  return 'text';
}

function selectColumns(rows, columns) {
  if (!columns.length) return rows;
  return rows.map((row) => Object.fromEntries(columns.map((col) => [col, row[col]])));
}

function selectMap(rows, mappings) {
  if (!mappings.length) return rows;
  return rows.map((row) => {
    const out = {};
    for (const mapping of mappings) {
      if (mapping.skip) continue;
      const target = mapping.target || mapping.source;
      if (!target) continue;
      out[target] = row[mapping.source];
    }
    return out;
  });
}

function filterRows(rows, cfg) {
  const conditions = cfg.conditions || [];
  if (!conditions.length) return rows;
  const combinator = cfg.combinator === 'OR' ? 'OR' : 'AND';
  return rows.filter((row) => {
    const checks = conditions.map((condition) => matchesCondition(row, condition));
    return combinator === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
  });
}

function matchesCondition(row, condition) {
  const actual = row[condition.field];
  const expected = condition.value ?? '';
  const actualText = String(actual ?? '').toLowerCase();
  const expectedText = String(expected).toLowerCase();
  switch (condition.op) {
    case 'not_equals':
      return actualText !== expectedText;
    case 'contains':
      return actualText.includes(expectedText);
    case 'not_contains':
      return !actualText.includes(expectedText);
    case 'starts_with':
      return actualText.startsWith(expectedText);
    case 'ends_with':
      return actualText.endsWith(expectedText);
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'is_empty':
      return actual == null || actual === '';
    case 'is_not_empty':
      return actual != null && actual !== '';
    case 'equals':
    default:
      return actualText === expectedText;
  }
}

function transformRows(rows, transforms) {
  if (!transforms.length) return rows;
  return rows.map((row) => {
    const next = { ...row };
    for (const transform of transforms) {
      if (!transform.field) continue;
      next[transform.field] = transformValue(next[transform.field], transform);
    }
    return next;
  });
}

function transformValue(value, transform) {
  const text = String(value ?? '');
  switch (transform.type) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'date_format': {
      const parsed = transform.opts?.input ? dayjs(text, transform.opts.input) : dayjs(text);
      return parsed.isValid() ? parsed.format(transform.opts?.output || 'YYYY-MM-DD') : value;
    }
    case 'replace':
      return text.replaceAll(transform.opts?.find || '', transform.opts?.replace || '');
    case 'regex_extract': {
      const match = text.match(new RegExp(transform.opts?.pattern || ''));
      return match?.[Number(transform.opts?.group ?? 1)] ?? '';
    }
    case 'trim':
    default:
      return text.trim();
  }
}

function deduplicateRows(rows, fields, strategy) {
  if (!fields.length) return rows;
  const seen = new Map();
  const orderedKeys = [];
  rows.forEach((row) => {
    const key = fields.map((field) => String(row[field] ?? '')).join('\u001f');
    if (!seen.has(key)) orderedKeys.push(key);
    if (strategy === 'last' || !seen.has(key)) seen.set(key, row);
  });
  return orderedKeys.map((key) => seen.get(key));
}

function sampleRows(rows, size) {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(size, copy.length));
}

function sampleWithReplacement(rows, size) {
  if (!rows.length) return [];
  const out = [];
  for (let i = 0; i < size; i++) {
    out.push({ ...rows[Math.floor(Math.random() * rows.length)] });
  }
  return out;
}
