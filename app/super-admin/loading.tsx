export default function Loading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-56 bg-ink-800 rounded" />
        <div className="h-10 w-40 bg-ink-800 rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card p-4 h-20 bg-ink-800/50" />
        ))}
      </div>
      <div className="card h-96 bg-ink-800/30" />
    </div>
  );
}
