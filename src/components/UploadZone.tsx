import { useCallback, useRef, useState } from 'react';

interface UploadZoneProps {
  onFile: (file: File) => void;
}

export function UploadZone({ onFile }: UploadZoneProps) {
  const [active, setActive] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      const name = file.name.toLowerCase();
      const ok =
        name.endsWith('.png') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.svg') ||
        file.type.startsWith('image/');
      if (!ok) {
        setInvalid(true);
        setTimeout(() => setInvalid(false), 1800);
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  return (
    <div
      className={`drop-hero${active ? ' active' : ''}${invalid ? ' invalid' : ''}`}
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
      role="button"
      tabIndex={0}
    >
      <div className="drop-icon" aria-hidden>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3v13m0-13l-4 4m4-4l4 4M5 21h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="drop-primary">
        {invalid ? 'Unsupported file' : 'Drop an image here'}
      </div>
      <div className="drop-secondary">or click to browse</div>
      <div className="drop-formats">PNG · JPG · SVG</div>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg,image/*"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
