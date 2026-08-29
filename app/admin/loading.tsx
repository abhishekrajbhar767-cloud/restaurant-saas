export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-40 bg-ink-800 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 h-20 bg-ink-800/50" />
        ))}
      </div>
    </div>
  );
}
