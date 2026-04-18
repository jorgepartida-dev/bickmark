import { useRef, useState } from 'react';
import * as THREE from 'three';
import { UploadZone } from './components/UploadZone';
import { Viewer } from './components/Viewer';
import { svgToGeometry } from './lib/svgToMesh';
import { pngToGeometry } from './lib/pngToMesh';
import { downloadStl } from './lib/exportStl';
import './App.css';

type Kind = 'svg' | 'png';

interface Params {
  maxDimension: number;
  thickness: number;
  reliefHeight: number;
  resolution: number;
  invert: boolean;
}

const DEFAULTS: Params = {
  maxDimension: 60,
  thickness: 2,
  reliefHeight: 1.5,
  resolution: 220,
  invert: false,
};

export function App() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [sourceData, setSourceData] = useState<string | File | null>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [params, setParams] = useState<Params>(DEFAULTS);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const meshRef = useRef<THREE.Mesh | null>(null);

  const generate = async (
    type: Kind,
    source: string | File,
    p: Params,
  ): Promise<void> => {
    setError('');
    setStatus('Generating mesh…');
    try {
      const geom =
        type === 'svg'
          ? svgToGeometry(source as string, {
              thickness: p.thickness,
              maxDimension: p.maxDimension,
            })
          : await pngToGeometry(source as File, {
              maxDimension: p.maxDimension,
              baseThickness: p.thickness,
              reliefHeight: p.reliefHeight,
              resolution: p.resolution,
              invert: p.invert,
            });
      geometry?.dispose();
      setGeometry(geom);
      setStatus('');
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const isSvg = file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml';
    if (isSvg) {
      const text = await file.text();
      setKind('svg');
      setSourceData(text);
      generate('svg', text, params);
    } else {
      setKind('png');
      setSourceData(file);
      generate('png', file, params);
    }
  };

  const updateParam = <K extends keyof Params>(key: K, value: Params[K]) => {
    const next = { ...params, [key]: value };
    setParams(next);
    if (kind && sourceData) generate(kind, sourceData, next);
  };

  const handleExport = () => {
    if (!meshRef.current) return;
    const base = fileName.replace(/\.[^.]+$/, '') || 'bookmark';
    downloadStl(meshRef.current, `${base}.stl`);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div>
          <h1>
            <span className="accent">bick</span>mark
          </h1>
          <p className="tagline">PNG / SVG → 3D-printable bookmarks</p>
        </div>

        <UploadZone onFile={handleFile} />

        {fileName && (
          <div className="section">
            <h2>Source</h2>
            <div style={{ fontSize: 13 }}>{fileName}</div>
          </div>
        )}

        <div className="section">
          <h2>Dimensions (mm)</h2>
          <label className="row">
            <span>Longest side</span>
            <input
              type="number"
              min={10}
              max={300}
              step={1}
              value={params.maxDimension}
              onChange={(e) => updateParam('maxDimension', Number(e.target.value))}
            />
          </label>
          <label className="row">
            <span>Base thickness</span>
            <input
              type="number"
              min={0.2}
              max={10}
              step={0.1}
              value={params.thickness}
              onChange={(e) => updateParam('thickness', Number(e.target.value))}
            />
          </label>
          {kind === 'png' && (
            <label className="row">
              <span>Relief height</span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={params.reliefHeight}
                onChange={(e) => updateParam('reliefHeight', Number(e.target.value))}
              />
            </label>
          )}
        </div>

        {kind === 'png' && (
          <div className="section">
            <h2>Image settings</h2>
            <label className="row">
              <span>Resolution</span>
              <input
                type="number"
                min={50}
                max={600}
                step={10}
                value={params.resolution}
                onChange={(e) => updateParam('resolution', Number(e.target.value))}
              />
            </label>
            <label className="row">
              <span>Invert (light = tall)</span>
              <input
                type="checkbox"
                checked={params.invert}
                onChange={(e) => updateParam('invert', e.target.checked)}
              />
            </label>
          </div>
        )}

        <div className="status">{status}</div>
        {error && <div className="error">{error}</div>}

        <button onClick={handleExport} disabled={!geometry}>
          Download STL
        </button>
      </aside>

      <main className="viewer">
        <Viewer geometry={geometry} meshRef={meshRef} />
      </main>
    </div>
  );
}
