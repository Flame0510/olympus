export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={`skeleton ${className}`.trim()} style={style} />;
}

export function SkeletonMetric({ width = 92 }: { width?: number }) {
  return <Skeleton className="skeleton--metric" style={{ width }} />;
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="skeleton--line" style={{ width: `${100 - index * 14}%` }} />
      ))}
    </div>
  );
}
