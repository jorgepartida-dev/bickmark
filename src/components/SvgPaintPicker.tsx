import type { TracedPath } from '../lib/imageToSvg';

export interface Slot {
  id: number;
  label: string;
  color: string;
}

interface Props {
  paths: TracedPath[];
  width: number;
  height: number;
  slots: Slot[];
  assignments: Record<string, number>;
  selected: Set<string>;
  bodySlotId: number;
  onSelect: (id: string, shift: boolean) => void;
  onClearSelection: () => void;
}

export function SvgPaintPicker(props: Props) {
  const {
    paths,
    width,
    height,
    slots,
    assignments,
    selected,
    bodySlotId,
    onSelect,
    onClearSelection,
  } = props;

  const colorFor = (pathId: string): string => {
    const slotId = assignments[pathId] ?? bodySlotId;
    return slots.find((s) => s.id === slotId)?.color ?? '#888';
  };

  const silhouettePaths = paths.filter((p) => p.role === 'silhouette');
  const detailPaths = paths
    .filter((p) => p.role === 'detail')
    .sort((a, b) => b.area - a.area);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={onClearSelection}
      width="100%"
      height="100%"
    >
      {silhouettePaths.map((p) => (
        <path
          key={p.id}
          d={p.d}
          fill={colorFor(p.id)}
          fillRule="evenodd"
          stroke={selected.has(p.id) ? '#fbbf24' : 'none'}
          strokeWidth={selected.has(p.id) ? 1.5 : 0}
          vectorEffect="non-scaling-stroke"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(p.id, e.shiftKey);
          }}
          style={{ cursor: 'pointer' }}
        />
      ))}
      {detailPaths.map((p) => {
        const isSelected = selected.has(p.id);
        return (
          <path
            key={p.id}
            d={p.d}
            fill={colorFor(p.id)}
            fillRule="evenodd"
            stroke={isSelected ? '#fbbf24' : 'rgba(0,0,0,0.25)'}
            strokeWidth={isSelected ? 2 : 0.6}
            vectorEffect="non-scaling-stroke"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(p.id, e.shiftKey);
            }}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
    </svg>
  );
}
