'use client';

import { QrCodeIcon, ShareIcon } from '@/components/customer/icons';

// Shown when the menu is opened without a table context (a link shared on
// WhatsApp / social, or a stale QR token). Deliberately not dismissible: it is
// the only thing on the page explaining why no dish has an ADD button.
export function BrowseOnlyBanner({
  /** Set when a table code was supplied but no longer resolves to an active table. */
  tableCodeRejected,
  onShare,
}: {
  tableCodeRejected: boolean;
  onShare: () => void;
}) {
  return (
    <div className="px-4 pt-4 sm:px-6">
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-surface-800 px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-300">
          <QrCodeIcon size={18} />
        </span>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-zinc-300">
          <span className="font-semibold text-white">
            {tableCodeRejected ? 'That table code is no longer active.' : 'You are viewing the digital menu.'}
          </span>{' '}
          Scan a table QR code at the restaurant to place orders.
        </p>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share this menu"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ShareIcon size={15} />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>
    </div>
  );
}
