import { useEffect, useRef, useState, type ReactNode } from 'react';

interface TooltipProps {
  label: ReactNode;
  hint: string;
}

const SHOW_EVENT = 'bickmark-tooltip-show';

export function Tooltip({ label, hint }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const idRef = useRef<symbol>();
  if (!idRef.current) idRef.current = Symbol('tip');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onShow = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail !== idRef.current) setOpen(false);
    };
    window.addEventListener(SHOW_EVENT, onShow);
    return () => window.removeEventListener(SHOW_EVENT, onShow);
  }, []);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: idRef.current }));
      setOpen(true);
    }, 180);
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
