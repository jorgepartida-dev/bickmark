import * as THREE from 'three';
import { strToU8, zipSync } from 'fflate';

export interface PartInput {
  name: string;
  geometry: THREE.BufferGeometry;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

export function downloadThreeMf(parts: PartInput[], filename: string): void {
  const bytes = buildThreeMf(parts);
  const view = new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  const blob = new Blob([view], {
    type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.3mf') ? filename : `${filename}.3mf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildThreeMf(parts: PartInput[]): Uint8Array {
  const modelXml = buildModelXml(parts);
  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(modelXml),
  });
}

function buildModelXml(parts: PartInput[]): string {
  const objects: string[] = [];
  const items: string[] = [];

  parts.forEach((part, i) => {
    const id = i + 1;
    const { vertices, triangles } = extractMesh(part.geometry);

    const vtxXml = vertices
      .map((v) => `<vertex x="${fmt(v[0])}" y="${fmt(v[1])}" z="${fmt(v[2])}"/>`)
      .join('');
    const triXml = triangles
      .map((t) => `<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`)
      .join('');

    objects.push(
      `<object id="${id}" name="${escapeXml(part.name)}" type="model">` +
        `<mesh><vertices>${vtxXml}</vertices><triangles>${triXml}</triangles></mesh>` +
        `</object>`,
    );
    items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`);
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="en-US" ` +
    `xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<resources>${objects.join('')}</resources>` +
    `<build>${items.join('')}</build>` +
    `</model>`
  );
}

function extractMesh(geom: THREE.BufferGeometry): {
  vertices: [number, number, number][];
  triangles: [number, number, number][];
} {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const idx = geom.getIndex();
  const vertices: [number, number, number][] = [];
  for (let i = 0; i < pos.count; i++) {
    vertices.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  const triangles: [number, number, number][] = [];
  if (idx) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      triangles.push([arr[i], arr[i + 1], arr[i + 2]]);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      triangles.push([i, i + 1, i + 2]);
    }
  }
  return { vertices, triangles };
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(4) : '0';
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&apos;',
  );
}
