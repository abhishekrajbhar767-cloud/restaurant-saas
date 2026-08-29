export default function Loading() {
  return (
    <div className="grid md:grid-cols-3 gap-4 animate-pulse">
      {Array.from({ length: 3 }).map((_, col) => (
        <div key={col} className="space-y-3">
          <div className="h-4 w-20 bg-ink-800 rounded" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card h-32 bg-ink-800/50" />
          ))}
        </div>
      ))}
    </div>
  );
}
