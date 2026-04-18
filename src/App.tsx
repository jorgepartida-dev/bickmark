import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { UploadZone } from './components/UploadZone';
import { Viewer } from './components/Viewer';
import { traceImage, type TraceParams } from './lib/imageToSvg';
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

const DEFAULT_TRACE: TraceParams = {
  threshold: null,
  despeckle: 4,
  smoothing: 1,
  invert: false,
};

const DEFAULT_SILHOUETTE: SilhouetteParams = {
  outlineWidth: 2,
  thickness: 3,
  targetLongSide: 140,
  tassel: false,
  tasselDiameter: 4,
  tasselMargin: 5,
};

const DEFAULT_COLORS = {
  outline: '#111827',
  body: '#fbbf24',
};

export function App() {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>('svg');
  const [svgText, setSvgText] = useState('');
  const [otsuHint, setOtsuHint] = useState<number | null>(null);
  const [traceParams, setTraceParams] = useState<TraceParams>(DEFAULT_TRACE);
  const [silhouetteParams, setSilhouetteParams] = useState<SilhouetteParams>(DEFAULT_SILHOUETTE);
  const [colors, setColors] = useState(DEFAULT_COLORS);
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
        setSvgText(r.svg);
        setOtsuHint(r.otsuThreshold);
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
    if (stage !== 'model' || !svgText) return;
    try {
      const next = buildSilhouette(svgText, silhouetteParams);
      setMeshes((prev) => {
        prev?.outline.dispose();
        prev?.body.dispose();
        return next;
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [stage, svgText, silhouetteParams]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setSourceFile(file);
    const isSvg = file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml';
    if (isSvg) {
      const text = await file.text();
      setSourceKind('svg');
      setSvgText(text);
      setStage('model');
    } else {
      setSourceKind('png');
      setStage('trace');
    }
  };

  const baseName = () => fileName.replace(/\.[^.]+$/, '') || 'bookmark';

  const downloadSvg = () => {
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const export3mf = () => {
    if (!meshes) return;
    downloadThreeMf(
      [
        { name: 'outline', geometry: meshes.outline },
        { name: 'body', geometry: meshes.body },
      ],
      baseName(),
    );
  };

  const exportStls = () => {
    if (!meshes) return;
    const parts: Array<[string, THREE.BufferGeometry]> = [
      ['outline', meshes.outline],
      ['body', meshes.body],
    ];
    for (const [name, geom] of parts) {
      const mesh = new THREE.Mesh(geom);
      downloadStl(mesh, `${baseName()}_${name}.stl`);
    }
  };

  const reset = () => {
    setMeshes((prev) => {
      prev?.outline.dispose();
      prev?.body.dispose();
      return null;
    });
    setSvgText('');
    setFileName('');
    setSourceFile(null);
    setOtsuHint(null);
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
  const thresholdUI = thresholdOverride ?? otsuHint ?? 0.5;

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>
            <span className="accent">bick</span>mark
          </h1>
          <p className="tagline">Silhouette bookmarks for multi-filament printing</p>
          <nav className="stages">
            <span className={stage === 'upload' ? 'on' : ''}>1. Upload</span>
            <span className={stage === 'trace' ? 'on' : ''}>2. Trace</span>
            <span className={stage === 'model' ? 'on' : ''}>3. Model</span>
          </nav>
        </header>

        {stage === 'upload' && (
          <>
            <UploadZone onFile={handleFile} />
            <p className="hint">
              PNG/JPG gets auto-traced (Otsu threshold); SVG skips straight to 3D.
            </p>
          </>
        )}

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
              <h2>Trace</h2>
              <label className="row range">
                <span>Threshold</span>
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
              <Range
                label="Despeckle"
                min={0}
                max={30}
                step={1}
                value={traceParams.despeckle}
                onChange={(v) => setTP('despeckle', v)}
                fmt={(v) => String(v)}
              />
              <Range
                label="Smoothing"
                min={0.1}
                max={5}
                step={0.1}
                value={traceParams.smoothing}
                onChange={(v) => setTP('smoothing', v)}
                fmt={(v) => v.toFixed(1)}
              />
              <label className="row">
                <span>Invert</span>
                <input
                  type="checkbox"
                  checked={traceParams.invert}
                  onChange={(e) => setTP('invert', e.target.checked)}
                />
              </label>
            </div>

            {status && <div className="status">{status}</div>}
            {error && <div className="error">{error}</div>}

            <div className="actions">
              <button onClick={downloadSvg} disabled={!svgText}>
                Download SVG
              </button>
              <button
                className="primary"
                onClick={() => setStage('model')}
                disabled={!svgText}
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
              <h2>Silhouette</h2>
              <NumInput
                label="Long side (mm)"
                min={30}
                max={300}
                step={1}
                value={silhouetteParams.targetLongSide}
                onChange={(v) => setSP('targetLongSide', v)}
              />
              <NumInput
                label="Outline width"
                min={0.4}
                max={10}
                step={0.1}
                value={silhouetteParams.outlineWidth}
                onChange={(v) => setSP('outlineWidth', v)}
              />
              <NumInput
                label="Thickness"
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
                <span>Enable</span>
                <input
                  type="checkbox"
                  checked={silhouetteParams.tassel}
                  onChange={(e) => setSP('tassel', e.target.checked)}
                />
              </label>
              {silhouetteParams.tassel && (
                <>
                  <NumInput
                    label="Diameter"
                    min={1}
                    max={15}
                    step={0.5}
                    value={silhouetteParams.tasselDiameter}
                    onChange={(v) => setSP('tasselDiameter', v)}
                  />
                  <NumInput
                    label="Inset from top"
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
                value={colors.outline}
                onChange={(v) => setColors({ ...colors, outline: v })}
              />
              <ColorRow
                label="Body"
                value={colors.body}
                onChange={(v) => setColors({ ...colors, body: v })}
              />
            </div>

            {error && <div className="error">{error}</div>}

            <div className="actions">
              <button className="primary" onClick={export3mf} disabled={!meshes}>
                Export 3MF
              </button>
              <button onClick={exportStls} disabled={!meshes}>
                Export 2 STLs
              </button>
            </div>
          </>
        )}
      </aside>

      <main className="viewer">
        <div className="viewer-layer" style={{ opacity: stage === 'model' ? 1 : 0, pointerEvents: stage === 'model' ? 'auto' : 'none' }}>
          <Viewer meshes={meshes} colors={colors} />
        </div>
        {stage === 'upload' && (
          <div className="empty-hint">Drop a PNG or SVG on the left to get started.</div>
        )}
        {stage === 'trace' && (
          <div className="svg-preview">
            {svgText ? (
              <div className="svg-frame" dangerouslySetInnerHTML={{ __html: svgText }} />
            ) : (
              <div className="empty-hint">{status || 'Tracing…'}</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Range(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <label className="row range">
      <span>{props.label}</span>
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

function NumInput(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="row">
      <span>{props.label}</span>
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

function ColorRow(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="row">
      <span>{props.label}</span>
      <input
        type="color"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
