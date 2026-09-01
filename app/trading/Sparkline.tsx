export function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <span className="trading-spark trading-spark--empty" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 64;
      const y = 18 - ((value - min) / span) * 16;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg aria-hidden="true" className={`trading-spark ${positive ? "is-positive" : "is-negative"}`} viewBox="0 0 64 20">
      <polyline fill="none" points={points} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
