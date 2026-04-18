import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { UploadZone } from './components/UploadZone';
import { Viewer } from './components/Viewer';
import { Tooltip } from './components/Tooltip';
import { SvgPaintPicker, type Slot } from './components/SvgPaintPicker';
import { traceImage, type TraceParams, type TraceResult } from './lib/imageToSvg';
import {
  buildSilhouette,
  type SilhouetteMeshSet,
  type SilhouetteParams,
} from './lib/svgToSilhouette';
import { downloadStl } from './lib/exportStl';
import { downloadThreeMf } from './lib/export3mf';
import './App.css';

type Stage = 'upload' | 'paint' | 'model';
type SourceKind = 'png' | 'svg';

const OUTLINE_SLOT = 0;
const BODY_SLOT = 1;
const USER_SLOT_IDS = [2, 3];
const ALL_USER_AND_BODY = [BODY_SLOT, ...USER_SLOT_IDS];

const DEFAULT_SLOTS: Slot[] = [
  { id: OUTLINE_SLOT, label: 'Outline', color: '#111827' },
  { id: BODY_SLOT, label: 'Body', color: '#fbbf24' },
  { id: 2, label: 'Detail A', color: '#111111' },
  { id: 3, label: 'Detail B', color: '#f3f4f6' },
];

const DEFAULT_TRACE: TraceParams = {
  source: 'auto',
  threshold: null,
  despeckle: 4,
  smoothing: 3,
  curveSmoothing: 2,
  invert: false,
  includeDetails: true,
  detailThreshold: null,
};

const DEFAULT_SILHOUETTE: SilhouetteParams = {
  outlineWidth: 2,
  thickness: 3,
  targetLongSide: 140,
  tassel: false,
  tasselDiameter: 4,
  tasselMargin: 3,
};

export function App() {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>('svg');

  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const [traceParams, setTraceParams] = useState<TraceParams>(DEFAULT_TRACE);
  const [silhouetteParams, setSilhouetteParams] = useState<SilhouetteParams>(DEFAULT_SILHOUETTE);

  const [meshes, setMeshes] = useState<SilhouetteMeshSet | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (sourceKind !== 'png' || !sourceFile) return;
    let cancelled = false;
    setStatus('Tracing…');
    setError('');
    (async () => {
      try {
        const r = await traceImage(sourceFile, traceParams);
        if (cancelled) return;
        setTrace(r);
        setAssignments((prev) => {
          const next: Record<string, number> = {};
          for (const p of r.paths) {
            next[p.id] = prev[p.id] ?? BODY_SLOT;
          }
          return next;
        });
        setSelected(new Set());
        setStatus('');
      } catch (e) {
        if (cancelled) return;
        setStatus('');
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceFile, sourceKind, traceParams]);

  useEffect(() => {
    if (stage !== 'model' || !trace || trace.paths.length === 0) return;
    try {
      const next = buildSilhouette(
        {
          paths: trace.paths,
          silhouettePathIds: trace.silhouettePathIds,
          assignments,
          userSlotIds: USER_SLOT_IDS,
          width: trace.width,
          height: trace.height,
        },
        silhouetteParams,
      );
      setMeshes((prev) => {
        prev?.outline.dispose();
        prev?.body.dispose();
        for (const s of prev?.slots ?? []) s.geometry.dispose();
        return next;
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [stage, trace, assignments, silhouetteParams]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setSourceFile(file);
    const isSvg = file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml';
    if (isSvg) {
      const text = await file.text();
      setSourceKind('svg');
      const synthetic: TraceResult = {
        paths: [{ id: 'svg_0', d: extractSvgPathsAsD(text), role: 'silhouette', area: 0 }],
        silhouettePathIds: ['svg_0'],
        detailPathIds: [],
        empty: false,
        resolvedSource: 'luminance',
        alphaDetected: false,
        otsuThreshold: 0.5,
        usedThreshold: 0.5,
        detailOtsu: 0.5,
        width: 1000,
        height: 1000,
      };
      setTrace(synthetic);
      setAssignments({ svg_0: BODY_SLOT });
      setSelected(new Set());
      setStage('model');
    } else {
      setSourceKind('png');
      setStage('paint');
    }
  };

  const baseName = () => fileName.replace(/\.[^.]+$/, '') || 'bookmark';

  const toggleSelect = (id: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.size === 1 && next.has(id)) next.clear();
        else {
          next.clear();
          next.add(id);
        }
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const assignSelectedTo = (slotId: number) => {
    if (selected.size === 0 || slotId === OUTLINE_SLOT) return;
    setAssignments((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = slotId;
      return next;
    });
    setSelected(new Set());
  };

  const setSlotColor = (slotId: number, color: string) => {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, color } : s)));
  };

  const resetAssignments = () => {
    if (!trace) return;
    const next: Record<string, number> = {};
    for (const p of trace.paths) next[p.id] = BODY_SLOT;
    setAssignments(next);
    setSelected(new Set());
  };

  const downloadSvg = () => {
    if (!trace) return;
    const parts = trace.paths.map((p) => {
      const slotId = assignments[p.id] ?? BODY_SLOT;
      const color = slots.find((s) => s.id === slotId)?.color ?? '#888';
      return `<path fill="${color}" fill-rule="evenodd" d="${p.d}"/>`;
    });
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${trace.width} ${trace.height}">` +
      parts.join('') +
      `</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportParts = () => {
    if (!meshes) return [] as Array<{ name: string; geometry: THREE.BufferGeometry }>;
    const parts: Array<{ name: string; geometry: THREE.BufferGeometry }> = [
      { name: 'outline', geometry: meshes.outline },
      { name: 'body', geometry: meshes.body },
    ];
    for (const s of meshes.slots) {
      const label = slots.find((x) => x.id === s.slotId)?.label.toLowerCase().replace(/\s+/g, '_') ?? `slot_${s.slotId}`;
      if (s.geometry.attributes.position && s.geometry.attributes.position.count > 0) {
        parts.push({ name: label, geometry: s.geometry });
      }
    }
    return parts;
  };

  const export3mf = () => {
    const parts = exportParts();
    if (parts.length === 0) return;
    downloadThreeMf(parts, baseName());
  };

  const exportStls = () => {
    for (const part of exportParts()) {
      const mesh = new THREE.Mesh(part.geometry);
      downloadStl(mesh, `${baseName()}_${part.name}.stl`);
    }
  };

  const reset = () => {
    setMeshes((prev) => {
      prev?.outline.dispose();
      prev?.body.dispose();
      for (const s of prev?.slots ?? []) s.geometry.dispose();
      return null;
    });
    setTrace(null);
    setAssignments({});
    setSelected(new Set());
    setFileName('');
    setSourceFile(null);
    setTraceParams(DEFAULT_TRACE);
    setStage('upload');
    setError('');
    setStatus('');
  };

  const setTP = <K extends keyof TraceParams>(k: K, v: TraceParams[K]) =>
    setTraceParams({ ...traceParams, [k]: v });
  const setSP = <K extends keyof SilhouetteParams>(k: K, v: SilhouetteParams[K]) =>
    setSilhouetteParams({ ...silhouetteParams, [k]: v });

  const thresholdOverride = traceParams.threshold;
  const thresholdUI = thresholdOverride ?? trace?.otsuThreshold ?? 0.5;
  const resolvedSource = trace?.resolvedSource ?? 'luminance';
  const alphaDetected = trace?.alphaDetected ?? false;

  const slotColorMap: Record<number, string> = {};
  for (const s of slots) slotColorMap[s.id] = s.color;
  const outlineColor = slots.find((s) => s.id === OUTLINE_SLOT)?.color ?? '#111';
  const bodyColor = slots.find((s) => s.id === BODY_SLOT)?.color ?? '#fbbf24';

  const pathCountsBySlot: Record<number, number> = {};
  if (trace) {
    for (const s of ALL_USER_AND_BODY) pathCountsBySlot[s] = 0;
    for (const p of trace.paths) {
      const sid = assignments[p.id] ?? BODY_SLOT;
      pathCountsBySlot[sid] = (pathCountsBySlot[sid] ?? 0) + 1;
    }
  }

  return (
    <div className={`app stage-${stage}`}>
      {stage === 'upload' ? (
        <main className="hero">
          <div className="hero-inner">
            <div className="brand">
              <h1>
                <span className="accent">bick</span>mark
              </h1>
              <p>Turn any image into a multicolor 3D-printable bookmark.</p>
            </div>
            <UploadZone onFile={handleFile} />
            <div className="hero-steps">
              <span>
                <b>1</b> Upload
              </span>
              <span>
                <b>2</b> Paint
              </span>
              <span>
                <b>3</b> Export 3MF → Bambu
              </span>
            </div>
          </div>
        </main>
      ) : (
        <>
          <aside className="sidebar">
            <header>
              <h1>
                <span className="accent">bick</span>mark
              </h1>
              <nav className="stages">
                <button
                  type="button"
                  className={`stage-chip${stage === 'paint' ? ' on' : ''}`}
                  onClick={() => setStage('paint')}
                  disabled={sourceKind !== 'png'}
                >
                  1 · Paint
                </button>
                <button
                  type="button"
                  className={`stage-chip${stage === 'model' ? ' on' : ''}`}
                  onClick={() => setStage('model')}
                  disabled={!trace || trace.paths.length === 0}
                >
                  2 · Model
                </button>
              </nav>
            </header>

            {stage === 'paint' && (
              <>
                <div className="section">
                  <h2>Source</h2>
                  <div className="filename">{fileName}</div>
                  <button className="link" onClick={reset}>
                    Change file
                  </button>
                </div>

                <div className="section">
                  <h2>Trace</h2>
                  <label className="row">
                    <Tooltip
                      label="Silhouette from"
                      hint="Alpha uses transparent background (best for clean PNG cutouts). Luminance picks a brightness threshold."
                    />
                    <select
                      value={traceParams.source}
                      onChange={(e) =>
                        setTP('source', e.target.value as TraceParams['source'])
                      }
                    >
                      <option value="auto">
                        Auto ({alphaDetected ? 'alpha' : 'luminance'})
                      </option>
                      <option value="alpha">Alpha</option>
                      <option value="luminance">Luminance</option>
                    </select>
                  </label>
                  {resolvedSource === 'luminance' && (
                    <>
                      <RangeRow
                        label="Threshold"
                        hint="Pixels darker than this become the silhouette."
                        min={0.05}
                        max={0.95}
                        step={0.01}
                        value={thresholdUI}
                        onChange={(v) => setTP('threshold', v)}
                        fmt={(v) => v.toFixed(2)}
                      />
                      <div className="row-actions">
                        <button
                          className="link"
                          onClick={() => setTP('threshold', null)}
                          disabled={thresholdOverride === null}
                        >
                          Auto (Otsu
                          {trace?.otsuThreshold != null
                            ? ` ${trace.otsuThreshold.toFixed(2)}`
                            : ''}
                          )
                        </button>
                      </div>
                      <label className="row">
                        <Tooltip
                          label="Invert"
                          hint="Flip silhouette/background. Use when the subject is light on a dark background."
                        />
                        <input
                          type="checkbox"
                          checked={traceParams.invert}
                          onChange={(e) => setTP('invert', e.target.checked)}
                        />
                      </label>
                    </>
                  )}
                  <RangeRow
                    label="Despeckle"
                    hint="Drops tiny islands from the trace. Higher cleans speckle; lower keeps small details."
                    min={0}
                    max={30}
                    step={1}
                    value={traceParams.despeckle}
                    onChange={(v) => setTP('despeckle', v)}
                    fmt={(v) => String(v)}
                  />
                  <RangeRow
                    label="Smoothing"
                    hint="Tracer tolerance. Higher = softer curves, fewer points."
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={traceParams.smoothing}
                    onChange={(v) => setTP('smoothing', v)}
                    fmt={(v) => v.toFixed(1)}
                  />
                  <RangeRow
                    label="Curve smoothing"
                    hint="Post-trace corner-cutting pass. 0 keeps corners crisp."
                    min={0}
                    max={4}
                    step={1}
                    value={traceParams.curveSmoothing}
                    onChange={(v) => setTP('curveSmoothing', v)}
                    fmt={(v) => String(v)}
                  />
                  <label className="row">
                    <Tooltip
                      label="Include interior details"
                      hint="Also trace darker pixels inside the silhouette as separate paths you can paint individually."
                    />
                    <input
                      type="checkbox"
                      checked={traceParams.includeDetails}
                      onChange={(e) => setTP('includeDetails', e.target.checked)}
                    />
                  </label>
                </div>

                <div className="section palette">
                  <h2>Palette</h2>
                  <p className="hint">
                    Click paths in the preview (shift-click adds). Then click a slot
                    to paint them.
                  </p>
                  {slots.map((slot) => {
                    const canAssign = selected.size > 0 && slot.id !== OUTLINE_SLOT;
                    const count = pathCountsBySlot[slot.id];
                    return (
                      <div
                        key={slot.id}
                        className={`palette-slot${canAssign ? ' assignable' : ''}${slot.id === OUTLINE_SLOT ? ' auto' : ''}`}
                      >
                        <input
                          type="color"
                          value={slot.color}
                          onChange={(e) => setSlotColor(slot.id, e.target.value)}
                          aria-label={`${slot.label} color`}
                        />
                        <button
                          className="palette-label"
                          onClick={() => canAssign && assignSelectedTo(slot.id)}
                          disabled={!canAssign}
                          type="button"
                        >
                          <span className="palette-name">{slot.label}</span>
                          <span className="palette-count">
                            {slot.id === OUTLINE_SLOT
                              ? 'auto'
                              : count != null
                                ? `${count} path${count === 1 ? '' : 's'}`
                                : ''}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                  <div className="row-actions">
                    {selected.size > 0 && (
                      <span className="hint">
                        {selected.size} selected — click a slot to paint
                      </span>
                    )}
                    <button className="link" onClick={resetAssignments}>
                      Reset paints
                    </button>
                  </div>
                </div>

                {status && <div className="status">{status}</div>}
                {error && <div className="error">{error}</div>}

                <div className="actions">
                  <button onClick={downloadSvg} disabled={!trace || trace.empty}>
                    Download SVG
                  </button>
                  <button
                    className="primary"
                    onClick={() => setStage('model')}
                    disabled={!trace || trace.empty}
                  >
                    Continue → 3D
                  </button>
                </div>
              </>
            )}

            {stage === 'model' && (
              <>
                <div className="section">
                  <h2>Source</h2>
                  <div className="filename">{fileName}</div>
                  <div className="row-actions">
                    {sourceKind === 'png' && (
                      <button className="link" onClick={() => setStage('paint')}>
                        Edit paint
                      </button>
                    )}
                    <button className="link" onClick={reset}>
                      Change file
                    </button>
                  </div>
                </div>

                <div className="section">
                  <h2>Dimensions</h2>
                  <NumRow
                    label="Long side (mm)"
                    hint="Longest dimension of the finished bookmark."
                    min={30}
                    max={300}
                    step={1}
                    value={silhouetteParams.targetLongSide}
                    onChange={(v) => setSP('targetLongSide', v)}
                  />
                  <NumRow
                    label="Outline width (mm)"
                    hint="How far the outline color extends past the silhouette. 1.5–3 mm is typical."
                    min={0.4}
                    max={10}
                    step={0.1}
                    value={silhouetteParams.outlineWidth}
                    onChange={(v) => setSP('outlineWidth', v)}
                  />
                  <NumRow
                    label="Thickness (mm)"
                    hint="Full depth of the bookmark. All parts share this; both faces stay flush."
                    min={0.4}
                    max={10}
                    step={0.1}
                    value={silhouetteParams.thickness}
                    onChange={(v) => setSP('thickness', v)}
                  />
                </div>

                <div className="section">
                  <h2>Tassel hole</h2>
                  <label className="row">
                    <Tooltip
                      label="Enable"
                      hint="Adds a hole at the top edge so you can thread a tassel."
                    />
                    <input
                      type="checkbox"
                      checked={silhouetteParams.tassel}
                      onChange={(e) => setSP('tassel', e.target.checked)}
                    />
                  </label>
                  {silhouetteParams.tassel && (
                    <>
                      <NumRow
                        label="Diameter"
                        hint="3–4 mm fits a thin tassel cord."
                        min={1}
                        max={15}
                        step={0.5}
                        value={silhouetteParams.tasselDiameter}
                        onChange={(v) => setSP('tasselDiameter', v)}
                      />
                      <NumRow
                        label="Inset from top"
                        hint="Distance between the hole and the bookmark's top edge."
                        min={1}
                        max={30}
                        step={0.5}
                        value={silhouetteParams.tasselMargin}
                        onChange={(v) => setSP('tasselMargin', v)}
                      />
                    </>
                  )}
                </div>

                <div className="section palette">
                  <h2>Palette</h2>
                  {slots.map((slot) => (
                    <div key={slot.id} className="palette-slot auto">
                      <input
                        type="color"
                        value={slot.color}
                        onChange={(e) => setSlotColor(slot.id, e.target.value)}
                      />
                      <div className="palette-label disabled">
                        <span className="palette-name">{slot.label}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {error && <div className="error">{error}</div>}

                <div className="actions">
                  <button className="primary" onClick={export3mf} disabled={!meshes}>
                    Export 3MF
                  </button>
                  <button onClick={exportStls} disabled={!meshes}>
                    Export STLs
                  </button>
                </div>
              </>
            )}
          </aside>

          <main className="viewer">
            <div
              className="viewer-layer"
              style={{
                opacity: stage === 'model' ? 1 : 0,
                pointerEvents: stage === 'model' ? 'auto' : 'none',
              }}
            >
              <Viewer
                meshes={meshes}
                outlineColor={outlineColor}
                bodyColor={bodyColor}
                slotColors={slotColorMap}
              />
            </div>
            {stage === 'paint' && (
              <div className="svg-preview">
                {status ? (
                  <div className="empty-hint">{status}</div>
                ) : trace && trace.empty ? (
                  <div className="trace-empty">
                    <strong>No silhouette detected</strong>
                    <p>
                      Try a different <em>Silhouette from</em> mode, slide the
                      threshold, or toggle <em>Invert</em>.
                    </p>
                  </div>
                ) : trace ? (
                  <div className="svg-frame">
                    <SvgPaintPicker
                      paths={trace.paths}
                      width={trace.width}
                      height={trace.height}
                      slots={slots}
                      assignments={assignments}
                      selected={selected}
                      bodySlotId={BODY_SLOT}
                      onSelect={toggleSelect}
                      onClearSelection={clearSelection}
                    />
                  </div>
                ) : (
                  <div className="empty-hint">Tracing…</div>
                )}
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

function extractSvgPathsAsD(svgText: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const pieces: string[] = [];
  doc.querySelectorAll('path').forEach((p) => {
    const d = p.getAttribute('d');
    if (d) pieces.push(d);
  });
  return pieces.join(' ');
}

function RangeRow(props: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <label className="row range">
      <Tooltip label={props.label} hint={props.hint} />
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(+e.target.value)}
      />
      <span className="num">{props.fmt(props.value)}</span>
    </label>
  );
}

function NumRow(props: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="row">
      <Tooltip label={props.label} hint={props.hint} />
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(+e.target.value)}
      />
    </label>
  );
}
