'use client';

import { useEffect, useRef, useState } from 'react';

export function TableQrPanel({ tableNumber, url }: { tableNumber: string; url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(url, { margin: 1, width: 280, color: { dark: '#14171C', light: '#FFFFFF' } }))
      .then((generated) => {
        if (!cancelled) setDataUrl(generated);
      })
      .catch(() => {
        if (!cancelled) setError('Could not generate QR code.');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function handlePrint() {
    if (!dataUrl) return;
    const printWindow = window.open('', '_blank', 'width=400,height=520');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head><title>Table ${tableNumber} QR</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h2 style="margin-bottom:8px;">Table ${tableNumber}</h2>
          <img src="${dataUrl}" width="280" height="280" alt="Table ${tableNumber} QR code" />
          <p style="margin-top:8px;font-size:12px;color:#555;">Scan to view the menu and order</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div ref={printRef} className="flex flex-col items-center gap-3 p-4">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image can't optimize it
        <img src={dataUrl} width={200} height={200} alt={`QR code for table ${tableNumber}`} className="rounded bg-white p-2" />
      ) : (
        <div className="h-[200px] w-[200px] rounded bg-ink-800 animate-pulse" aria-hidden />
      )}
      <div className="flex gap-2">
        <button onClick={handlePrint} disabled={!dataUrl} className="btn-secondary text-sm">
          Print
        </button>
        {dataUrl && (
          <a href={dataUrl} download={`table-${tableNumber}-qr.png`} className="btn-secondary text-sm">
            Download
          </a>
        )}
      </div>
    </div>
  );
}
