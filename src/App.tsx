import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { UploadZone } from './components/UploadZone';
import { Viewer } from './components/Viewer';
import { Tooltip } from './components/Tooltip';
import {
  traceImage,
  type DetailLayerConfig,
  type TraceParams,
} from './lib/imageToSvg';
import {
  buildSilhouette,
  type SilhouetteMeshSet,
  type SilhouetteParams,
} from './lib/svgToSilhouette';
import { downloadStl } from './lib/exportStl';
import { downloadThreeMf } from './lib/export3mf';
import './App.css';

type Stage = 'upload' | 'trace' | 'model';
type SourceKind = 'png' | 'svg';

const DEFAULT_DETAIL_1: DetailLayerConfig = { enabled: false, threshold: 0.3, color: '#111827' };
const DEFAULT_DETAIL_2: DetailLayerConfig = { enabled: false, threshold: 0.6, color: '#9ca3af' };

const DEFAULT_TRACE: TraceParams = {
  source: 'auto',
  threshold: null,
  despeckle: 4,
  smoothing: 3,
  curveSmoothing: 2,
  invert: false,
  bodyColor: '#fbbf24',
  details: [DEFAULT_DETAIL_1, DEFAULT_DETAIL_2],
};

const DEFAULT_SILHOUETTE: SilhouetteParams = {
  outlineWidth: 2,
  thickness: 3,
  targetLongSide: 140,
  tassel: false,
  tasselDiameter: 4,
  tasselMargin: 3,
};

const DEFAULT_OUTLINE_COLOR = '#111827';

export function App() {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>('svg');
  const [silhouetteSvg, setSilhouetteSvg] = useState('');
  const [detailSvgs, setDetailSvgs] = useState<Array<{ svg: string; color: string }>>([]);
  const [previewSvg, setPreviewSvg] = useState('');
  const [otsuHint, setOtsuHint] = useState<number | null>(null);
  const [resolvedSource, setResolvedSource] = useState<'alpha' | 'luminance'>('luminance');
  const [alphaDetected, setAlphaDetected] = useState(false);
  const [traceParams, setTraceParams] = useState<TraceParams>(DEFAULT_TRACE);
  const [silhouetteParams, setSilhouetteParams] = useState<SilhouetteParams>(DEFAULT_SILHOUETTE);
  const [outlineColor, setOutlineColor] = useState(DEFAULT_OUTLINE_COLOR);
  const [meshes, setMeshes] = useState<SilhouetteMeshSet | null>(null);
  const [traceEmpty, setTraceEmpty] = useState(false);
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
        setSilhouetteSvg(r.silhouetteSvg);
        setDetailSvgs(r.detailLayers.map((d) => ({ svg: d.svg, color: d.color })));
        setPreviewSvg(r.previewSvg);
        setOtsuHint(r.otsuThreshold);
        setResolvedSource(r.resolvedSource);
        setAlphaDetected(r.alphaDetected);
        setTraceEmpty(r.empty);
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
    if (stage !== 'model' || !silhouetteSvg) return;
    try {
      const next = buildSilhouette(
        silhouetteSvg,
        detailSvgs.map((d) => ({ svg: d.svg, color: d.color })),
        silhouetteParams,
      );
      setMeshes((prev) => {
        prev?.outline.dispose();
        prev?.body.dispose();
        for (const d of prev?.details ?? []) d.dispose();
        return next;
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [stage, silhouetteSvg, detailSvgs, silhouetteParams]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setSourceFile(file);
    const isSvg = file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml';
    if (isSvg) {
      const text = await file.text();
      setSourceKind('svg');
      setSilhouetteSvg(text);
      setDetailSvgs([]);
      setPreviewSvg(text);
      setStage('model');
    } else {
      setSourceKind('png');
      setStage('trace');
    }
  };

  const baseName = () => fileName.replace(/\.[^.]+$/, '') || 'bookmark';

  const downloadSvg = () => {
    const blob = new Blob([silhouetteSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parts3mf = () => {
    if (!meshes) return [];
    const parts = [
      { name: 'outline', geometry: meshes.outline },
      { name: 'body', geometry: meshes.body },
      ...meshes.details.map((g, i) => ({ name: `detail_${i + 1}`, geometry: g })),
    ];
    return parts;
  };

  const export3mf = () => {
    const parts = parts3mf();
    if (parts.length === 0) return;
    downloadThreeMf(parts, baseName());
  };

  const exportStls = () => {
    const parts = parts3mf();
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry);
      downloadStl(mesh, `${baseName()}_${part.name}.stl`);
    }
  };

  const reset = () => {
    setMeshes((prev) => {
      prev?.outline.dispose();
      prev?.body.dispose();
      for (const d of prev?.details ?? []) d.dispose();
      return null;
    });
    setSilhouetteSvg('');
    setDetailSvgs([]);
    setPreviewSvg('');
    setFileName('');
    setSourceFile(null);
    setOtsuHint(null);
    setTraceEmpty(false);
    setTraceParams(DEFAULT_TRACE);
    setStage('upload');
    setError('');
    setStatus('');
  };

  const setTP = <K extends keyof TraceParams>(k: K, v: TraceParams[K]) =>
    setTraceParams({ ...traceParams, [k]: v });
  const setSP = <K extends keyof SilhouetteParams>(k: K, v: SilhouetteParams[K]) =>
    setSilhouetteParams({ ...silhouetteParams, [k]: v });
  const setDetail = (idx: number, patch: Partial<DetailLayerConfig>) => {
    const next = traceParams.details.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    setTraceParams({ ...traceParams, details: next });
  };

  const thresholdOverride = traceParams.threshold;
  const thresholdUI = thresholdOverride ?? otsuHint ?? 0.5;

  const viewerColors = {
    outline: outlineColor,
    body: traceParams.bodyColor,
    details: traceParams.details.map((d) => d.color),
  };

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
                <b>1</b> Upload image
              </span>
              <span>
                <b>2</b> Tune the trace
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
                  className={`stage-chip${stage === 'trace' ? ' on' : ''}`}
                  onClick={() => setStage('trace')}
                  disabled={sourceKind !== 'png'}
                >
                  1 · Trace
                </button>
                <button
                  type="button"
                  className={`stage-chip${stage === 'model' ? ' on' : ''}`}
                  onClick={() => setStage('model')}
                  disabled={!silhouetteSvg || traceEmpty}
                >
                  2 · Model
                </button>
              </nav>
            </header>

            {stage === 'trace' && (
              <>
                <div className="section">
                  <h2>Source</h2>
                  <div className="filename">{fileName}</div>
                  <button className="link" onClick={reset}>
                    Change file
                  </button>
                </div>

                <div className="section">
                  <h2>Silhouette</h2>
                  <label className="row">
                    <Tooltip
                      label="From"
                      hint="How to find the outline of the subject. Alpha uses transparent pixels (great for PNGs with clean cutouts). Luminance picks a brightness threshold."
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
                      <option value="alpha">Alpha channel</option>
                      <option value="luminance">Luminance</option>
                    </select>
                  </label>
                  {resolvedSource === 'luminance' && (
                    <>
                      <label className="row range">
                        <Tooltip
                          label="Threshold"
                          hint="Pixels darker than this become part of the subject. Slide down to catch more, up to keep only dark ink."
                        />
                        <input
                          type="range"
                          min={0.05}
                          max={0.95}
                          step={0.01}
                          value={thresholdUI}
                          onChange={(e) => setTP('threshold', +e.target.value)}
                        />
                        <span className="num">{thresholdUI.toFixed(2)}</span>
                      </label>
                      <div className="row-actions">
                        <button
                          className="link"
                          onClick={() => setTP('threshold', null)}
                          disabled={thresholdOverride === null}
                        >
                          Auto (Otsu{otsuHint != null ? ` ${otsuHint.toFixed(2)}` : ''})
                        </button>
                      </div>
                      <label className="row">
                        <Tooltip
                          label="Invert"
                          hint="Flip what's considered inside/outside. Use when the subject is light on a dark background."
                        />
                        <input
                          type="checkbox"
                          checked={traceParams.invert}
                          onChange={(e) => setTP('invert', e.target.checked)}
                        />
                      </label>
                    </>
                  )}
                </div>

                <div className="section">
                  <h2>Trace quality</h2>
                  <RangeRow
                    label="Despeckle"
                    hint="Drops small islands from the trace. Raise to clean up speckle; lower to keep tiny details."
                    min={0}
                    max={30}
                    step={1}
                    value={traceParams.despeckle}
                    onChange={(v) => setTP('despeckle', v)}
                    fmt={(v) => String(v)}
                  />
                  <RangeRow
                    label="Smoothing"
                    hint="How tightly the tracer hugs the edges. Higher = softer curves, less jitter, fewer points."
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={traceParams.smoothing}
                    onChange={(v) => setTP('smoothing', v)}
                    fmt={(v) => v.toFixed(1)}
                  />
                  <RangeRow
                    label="Curve smoothing"
                    hint="Post-trace corner-cutting pass (Chaikin). Each step makes curves smoother and rounder — 0 keeps corners crisp."
                    min={0}
                    max={4}
                    step={1}
                    value={traceParams.curveSmoothing}
                    onChange={(v) => setTP('curveSmoothing', v)}
                    fmt={(v) => String(v)}
                  />
                </div>

                <div className="section">
                  <h2>Colors</h2>
                  <ColorRow
                    label="Body fill"
                    hint="The base color that fills the silhouette. Everything not claimed by a detail layer prints in this filament."
                    value={traceParams.bodyColor}
                    onChange={(v) => setTP('bodyColor', v)}
                  />
                </div>

                <div className="section">
                  <h2>Detail layers</h2>
                  {traceParams.details.map((d, i) => (
                    <DetailLayerRow
                      key={i}
                      index={i}
                      config={d}
                      onChange={(patch) => setDetail(i, patch)}
                    />
                  ))}
                  <p className="hint">
                    Each enabled layer captures the remaining darkest pixels up to its
                    threshold and becomes a separate filament.
                  </p>
                </div>

                {status && <div className="status">{status}</div>}
                {error && <div className="error">{error}</div>}

                <div className="actions">
                  <button onClick={downloadSvg} disabled={!silhouetteSvg}>
                    Download silhouette SVG
                  </button>
                  <button
                    className="primary"
                    onClick={() => setStage('model')}
                    disabled={!silhouetteSvg}
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
                      <button className="link" onClick={() => setStage('trace')}>
                        Edit trace
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
                    hint="The longest dimension of the finished bookmark."
                    min={30}
                    max={300}
                    step={1}
                    value={silhouetteParams.targetLongSide}
                    onChange={(v) => setSP('targetLongSide', v)}
                  />
                  <NumRow
                    label="Outline width (mm)"
                    hint="How far the outline color extends past the silhouette. Too thin and it'll be fragile; 1.5-3 mm is typical."
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
                      hint="Adds a small hole at the top so you can tie a tassel/ribbon to the bookmark."
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
                        hint="Hole width. 3-4 mm fits a thin tassel cord."
                        min={1}
                        max={15}
                        step={0.5}
                        value={silhouetteParams.tasselDiameter}
                        onChange={(v) => setSP('tasselDiameter', v)}
                      />
                      <NumRow
                        label="Inset from top"
                        hint="How far down from the very top edge the hole sits."
                        min={1}
                        max={30}
                        step={0.5}
                        value={silhouetteParams.tasselMargin}
                        onChange={(v) => setSP('tasselMargin', v)}
                      />
                    </>
                  )}
                </div>

                <div className="section">
                  <h2>Preview colors</h2>
                  <ColorRow
                    label="Outline"
                    hint="Color of the outer rim. Often a dark filament for contrast."
                    value={outlineColor}
                    onChange={setOutlineColor}
                  />
                  <ColorRow
                    label="Body"
                    hint="Filament for the main silhouette fill."
                    value={traceParams.bodyColor}
                    onChange={(v) => setTP('bodyColor', v)}
                  />
                  {traceParams.details.map((d, i) =>
                    d.enabled ? (
                      <ColorRow
                        key={i}
                        label={`Detail ${i + 1}`}
                        hint="Filament for this detail layer."
                        value={d.color}
                        onChange={(v) => setDetail(i, { color: v })}
                      />
                    ) : null,
                  )}
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
              <Viewer meshes={meshes} colors={viewerColors} />
            </div>
            {stage === 'trace' && (
              <div className="svg-preview">
                {status ? (
                  <div className="empty-hint">{status}</div>
                ) : traceEmpty ? (
                  <div className="trace-empty">
                    <strong>No silhouette detected</strong>
                    <p>
                      Try a different <em>Silhouette from</em> mode, slide the
                      threshold, or toggle <em>Invert</em>. If the source image has
                      tiny details, lower <em>Despeckle</em>.
                    </p>
                  </div>
                ) : previewSvg ? (
                  <div
                    className="svg-frame"
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
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

function ColorRow(props: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="row">
      <Tooltip label={props.label} hint={props.hint} />
      <input
        type="color"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function DetailLayerRow(props: {
  index: number;
  config: DetailLayerConfig;
  onChange: (patch: Partial<DetailLayerConfig>) => void;
}) {
  const { index, config, onChange } = props;
  const hintBase =
    index === 0
      ? 'Usually the darkest pixels (black ink, outlines). Everything under this luminance becomes its own filament.'
      : 'The next band of darker pixels, above the previous layer but below this threshold.';
  return (
    <div className={`detail-block${config.enabled ? ' on' : ''}`}>
      <label className="row">
        <Tooltip label={`Layer ${index + 1}`} hint={hintBase} />
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
      </label>
      {config.enabled && (
        <>
          <label className="row range">
            <Tooltip
              label="Threshold"
              hint="Luminance cutoff for this layer. Pixels below this (and above the previous layer) go into this filament."
            />
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={config.threshold}
              onChange={(e) => onChange({ threshold: +e.target.value })}
            />
            <span className="num">{config.threshold.toFixed(2)}</span>
          </label>
          <label className="row">
            <Tooltip label="Color" hint="Filament color for this layer in the preview." />
            <input
              type="color"
              value={config.color}
              onChange={(e) => onChange({ color: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}
