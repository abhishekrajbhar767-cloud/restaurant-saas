// Dark customer chrome. The order tracker under this segment paints its own
// paper background, so this only governs the menu, loading and error screens.
export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface-950 text-white">{children}</div>;
}
