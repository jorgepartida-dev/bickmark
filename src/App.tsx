import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { UploadZone } from './components/UploadZone';
import { Viewer } from './components/Viewer';
import { traceImage, type TraceParams } from './lib/imageToSvg';
import { buildMeshes, type FrameParams, type MeshSet } from './lib/svgToMeshes';
import { downloadStl } from './lib/exportStl';
import { downloadThreeMf } from './lib/export3mf';
import './App.css';

type Stage = 'upload' | 'trace' | 'model';
type SourceKind = 'png' | 'svg';

const DEFAULT_TRACE: TraceParams = {
  threshold: 0.5,
  despeckle: 8,
  smoothing: 1,
  invert: false,
};

const DEFAULT_FRAME: FrameParams = {
  shape: 'rect',
  outerWidth: 50,
  outerHeight: 150,
  cornerRadius: 5,
  borderWidth: 3,
  padding: 3,
  thickness: 3,
  tassel: false,
  tasselDiameter: 4,
  tasselMargin: 5,
};

const DEFAULT_COLORS = {
  frame: '#111827',
  background: '#f3f4f6',
  logo: '#fbbf24',
};

export function App() {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>('svg');
  const [svgText, setSvgText] = useState('');
  const [traceParams, setTraceParams] = useState<TraceParams>(DEFAULT_TRACE);
  const [frameParams, setFrameParams] = useState<FrameParams>(DEFAULT_FRAME);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [meshes, setMeshes] = useState<MeshSet | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (sourceKind !== 'png' || !sourceFile) return;
    let cancelled = false;
    setStatus('Tracing…');
    setError('');
    (async () => {
      try {
        const svg = await traceImage(sourceFile, traceParams);
        if (cancelled) return;
        setSvgText(svg);
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
      const next = buildMeshes(svgText, frameParams);
      setMeshes((prev) => {
        prev?.logo.dispose();
        prev?.frame.dispose();
        prev?.background.dispose();
        return next;
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [stage, svgText, frameParams]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setSourceFile(file);
    const isSvg =
      file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml';
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
        { name: 'frame', geometry: meshes.frame },
        { name: 'background', geometry: meshes.background },
        { name: 'logo', geometry: meshes.logo },
      ],
      baseName(),
    );
  };

  const exportStls = () => {
    if (!meshes) return;
    const parts: Array<[string, THREE.BufferGeometry]> = [
      ['frame', meshes.frame],
      ['background', meshes.background],
      ['logo', meshes.logo],
    ];
    for (const [name, geom] of parts) {
      const mesh = new THREE.Mesh(geom);
      downloadStl(mesh, `${baseName()}_${name}.stl`);
    }
  };

  const reset = () => {
    setMeshes((prev) => {
      prev?.logo.dispose();
      prev?.frame.dispose();
      prev?.background.dispose();
      return null;
    });
    setSvgText('');
    setFileName('');
    setSourceFile(null);
    setStage('upload');
    setError('');
    setStatus('');
  };

  const setTP = <K extends keyof TraceParams>(k: K, v: TraceParams[K]) =>
    setTraceParams({ ...traceParams, [k]: v });
  const setFP = <K extends keyof FrameParams>(k: K, v: FrameParams[K]) =>
    setFrameParams({ ...frameParams, [k]: v });

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>
            <span className="accent">bick</span>mark
          </h1>
          <p className="tagline">Multicolor 3D-printable bookmarks</p>
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
              PNG or SVG. PNG gets auto-traced to SVG; SVG skips straight to the 3D
              step.
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
              <Range
                label="Threshold"
                min={0.05}
                max={0.95}
                step={0.01}
                value={traceParams.threshold}
                onChange={(v) => setTP('threshold', v)}
                fmt={(v) => v.toFixed(2)}
              />
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
              <h2>Frame</h2>
              <label className="row">
                <span>Shape</span>
                <select
                  value={frameParams.shape}
                  onChange={(e) => setFP('shape', e.target.value as 'rect' | 'circle')}
                >
                  <option value="rect">Rounded rect</option>
                  <option value="circle">Circle</option>
                </select>
              </label>
              <NumInput
                label="Width (mm)"
                min={20}
                max={300}
                step={1}
                value={frameParams.outerWidth}
                onChange={(v) => setFP('outerWidth', v)}
              />
              {frameParams.shape === 'rect' && (
                <NumInput
                  label="Height (mm)"
                  min={20}
                  max={300}
                  step={1}
                  value={frameParams.outerHeight}
                  onChange={(v) => setFP('outerHeight', v)}
                />
              )}
              {frameParams.shape === 'rect' && (
                <NumInput
                  label="Corner radius"
                  min={0}
                  max={30}
                  step={0.5}
                  value={frameParams.cornerRadius}
                  onChange={(v) => setFP('cornerRadius', v)}
                />
              )}
              <NumInput
                label="Border width"
                min={0.5}
                max={20}
                step={0.1}
                value={frameParams.borderWidth}
                onChange={(v) => setFP('borderWidth', v)}
              />
              <NumInput
                label="Padding"
                min={0}
                max={20}
                step={0.5}
                value={frameParams.padding}
                onChange={(v) => setFP('padding', v)}
              />
              <NumInput
                label="Thickness"
                min={0.4}
                max={10}
                step={0.1}
                value={frameParams.thickness}
                onChange={(v) => setFP('thickness', v)}
              />
            </div>

            <div className="section">
              <h2>Tassel hole</h2>
              <label className="row">
                <span>Enable</span>
                <input
                  type="checkbox"
                  checked={frameParams.tassel}
                  onChange={(e) => setFP('tassel', e.target.checked)}
                />
              </label>
              {frameParams.tassel && (
                <>
                  <NumInput
                    label="Diameter"
                    min={1}
                    max={15}
                    step={0.5}
                    value={frameParams.tasselDiameter}
                    onChange={(v) => setFP('tasselDiameter', v)}
                  />
                  <NumInput
                    label="Margin from top"
                    min={1}
                    max={30}
                    step={0.5}
                    value={frameParams.tasselMargin}
                    onChange={(v) => setFP('tasselMargin', v)}
                  />
                </>
              )}
            </div>

            <div className="section">
              <h2>Preview colors</h2>
              <ColorRow
                label="Frame"
                value={colors.frame}
                onChange={(v) => setColors({ ...colors, frame: v })}
              />
              <ColorRow
                label="Background"
                value={colors.background}
                onChange={(v) => setColors({ ...colors, background: v })}
              />
              <ColorRow
                label="Logo"
                value={colors.logo}
                onChange={(v) => setColors({ ...colors, logo: v })}
              />
            </div>

            {error && <div className="error">{error}</div>}

            <div className="actions">
              <button className="primary" onClick={export3mf} disabled={!meshes}>
                Export 3MF
              </button>
              <button onClick={exportStls} disabled={!meshes}>
                Export 3 STLs
              </button>
            </div>
          </>
        )}
      </aside>

      <main className="viewer">
        {stage === 'upload' && (
          <div className="empty-hint">
            Drop a PNG or SVG on the left to get started.
          </div>
        )}
        {stage === 'trace' && (
          <div className="svg-preview">
            {svgText ? (
              <div dangerouslySetInnerHTML={{ __html: svgText }} />
            ) : (
              <div className="empty-hint">{status || 'Tracing…'}</div>
            )}
          </div>
        )}
        {stage === 'model' && <Viewer meshes={meshes} colors={colors} />}
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
