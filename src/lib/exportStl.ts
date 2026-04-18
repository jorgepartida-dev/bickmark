import type * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export function downloadStl(object: THREE.Object3D, filename: string): void {
  const exporter = new STLExporter();
  const result = exporter.parse(object, { binary: true }) as DataView;
  const bytes = new Uint8Array(result.buffer as ArrayBuffer, result.byteOffset, result.byteLength);
  const blob = new Blob([bytes], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.stl') ? filename : `${filename}.stl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
