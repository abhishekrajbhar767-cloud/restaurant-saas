export function StatCard({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted mb-1.5">{label}</div>
      <div className={`font-display text-2xl font-bold ${accent ? 'text-amber' : 'text-text'}`}>{value}</div>
    </div>
  );
}
