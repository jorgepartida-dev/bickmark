import { useRef, useState, type ReactNode } from 'react';

interface TooltipProps {
  label: ReactNode;
  hint: string;
}

export function Tooltip({ label, hint }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 180);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      className="tip"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={-1}
    >
      <span className="tip-label">{label}</span>
      <span className={`tip-bubble${open ? ' on' : ''}`}>{hint}</span>
    </span>
  );
}
