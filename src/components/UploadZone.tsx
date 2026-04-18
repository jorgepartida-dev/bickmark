import { useCallback, useRef, useState } from 'react';

interface UploadZoneProps {
  onFile: (file: File) => void;
}

export function UploadZone({ onFile }: UploadZoneProps) {
  const [active, setActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      const name = file.name.toLowerCase();
      if (!name.endsWith('.png') && !name.endsWith('.svg') && !file.type.startsWith('image/')) {
        alert('Please drop a PNG or SVG file.');
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  return (
    <div
      className={`drop${active ? ' active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <strong>Drop PNG or SVG</strong>
      <small>or click to browse</small>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.svg,image/png,image/svg+xml"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
