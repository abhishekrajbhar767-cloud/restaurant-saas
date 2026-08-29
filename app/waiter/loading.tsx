export default function Loading() {
  return (
    <div className="max-w-lg mx-auto space-y-5 animate-pulse">
      <div className="h-20 bg-ink-800 rounded-lg" />
      <div className="h-4 w-32 bg-ink-800 rounded" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card h-16 bg-ink-800/50" />
        ))}
      </div>
    </div>
  );
}
