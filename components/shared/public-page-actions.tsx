'use client';

// Owner-facing shortcuts rendered in the staff topbar: open the restaurant's
// public menu page in a new tab, and generate/download a QR code for it.

import { useEffect, useState } from 'react';

export function PublicPageActions({ restaurantSlug }: { restaurantSlug: string }) {
  const [qrOpen, setQrOpen] = useState(false);
  const publicPath = `/menu/${restaurantSlug}`;

  return (
    <>
      <div className="flex items-center gap-2">
        <a href={publicPath} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs" title="Open the public menu page">
          View Public Page ↗
        </a>
        <button onClick={() => setQrOpen(true)} className="btn-secondary text-xs" title="Generate a QR code for the public menu">
          Generate QR Code
        </button>
      </div>
      {qrOpen && <QrModal restaurantSlug={restaurantSlug} publicPath={publicPath} onClose={() => setQrOpen(false)} />}
    </>
  );
}

function QrModal({
  restaurantSlug,
  publicPath,
  onClose,
}: {
  restaurantSlug: string;
  publicPath: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  // Escape closes the modal; lock background scroll while it's open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // window.location.origin only exists in the browser, so generate after mount.
  useEffect(() => {
    let cancelled = false;
    const fullUrl = window.location.origin + publicPath;
    setUrl(fullUrl);
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(fullUrl, { margin: 1, width: 320, color: { dark: '#14171C', light: '#FFFFFF' } }))
      .then((generated) => {
        if (!cancelled) setDataUrl(generated);
      })
      .catch(() => {
        if (!cancelled) setError('Could not generate QR code.');
      });
    return () => {
      cancelled = true;
    };
  }, [publicPath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Public menu QR code">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden />

      <div className="relative card p-6 w-full max-w-sm flex flex-col items-center gap-3 text-center">
        <button
          onClick={onClose}
          className="absolute top-2 right-3 text-text-muted hover:text-text text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>

        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-amber">Menu QR Code</h2>
        <p className="text-xs text-text-muted -mt-1">Scan to open the public menu</p>

        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image can't optimize it
          <img src={dataUrl} width={240} height={240} alt={`QR code for ${url}`} className="rounded bg-white p-2" />
        ) : (
          <div className="h-[240px] w-[240px] rounded bg-ink-800 animate-pulse" aria-hidden />
        )}

        <p className="font-mono text-xs text-text-muted break-all max-w-[240px]">{url}</p>

        <div className="flex gap-2 mt-1">
          {dataUrl && (
            <a href={dataUrl} download={`${restaurantSlug}-qr.png`} className="btn-primary text-sm">
              Download PNG
            </a>
          )}
          <button onClick={onClose} className="btn-secondary text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
