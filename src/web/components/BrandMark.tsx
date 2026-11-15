type BrandMarkProps = {
  className?: string;
};

// Géométrie identique à docs/brand/centurion-mark.svg : 12 barres (les 12 mois),
// pleines quand réalisées, en contour quand à venir, sur la ligne de base du cimier.
const BARS: { x: number; y: number; h: number; done: boolean }[] = [
  { x: 7, y: 33, h: 10, done: true },
  { x: 11.3, y: 27.4, h: 15.6, done: true },
  { x: 15.5, y: 22.9, h: 20.1, done: true },
  { x: 19.8, y: 19.5, h: 23.5, done: true },
  { x: 24.1, y: 17.3, h: 25.7, done: true },
  { x: 28.4, y: 16.1, h: 26.9, done: true },
  { x: 32.6, y: 16.1, h: 26.9, done: true },
  { x: 36.9, y: 17.3, h: 25.7, done: false },
  { x: 41.2, y: 19.5, h: 23.5, done: false },
  { x: 45.5, y: 22.9, h: 20.1, done: false },
  { x: 49.7, y: 27.4, h: 15.6, done: false },
  { x: 54, y: 33, h: 10, done: false },
];

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect x="5" y="43" width="54" height="5" rx="2.5" fill="currentColor" />
      {BARS.map((bar) =>
        bar.done ? (
          <rect key={bar.x} x={bar.x} y={bar.y} width="3" height={bar.h} rx="1.2" fill="currentColor" />
        ) : (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width="3"
            height={bar.h}
            rx="1.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
        ),
      )}
    </svg>
  );
}
