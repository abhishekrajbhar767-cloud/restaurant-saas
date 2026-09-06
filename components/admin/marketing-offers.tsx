'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createPromotionalBanner,
  deleteLoyaltyBannerImage,
  deletePromotionalBanner,
  saveLoyaltySettings,
  setPromotionalBannerActive,
  uploadLoyaltyBannerImage,
} from '@/app/admin/manager/actions';
import { compressImage } from '@/lib/media/compress-image';
import { BANNER_QUOTA_MESSAGE, MAX_PROMOTIONAL_BANNERS } from '@/lib/media/restaurant-media';
import { defaultLoyaltyText } from '@/lib/customer/loyalty';
import type { LoyaltySettings, PromotionalBanner } from '@/types/database';

export function MarketingOffers({
  initialLoyalty,
  initialBanners,
}: {
  initialLoyalty: LoyaltySettings;
  initialBanners: PromotionalBanner[];
}) {
  const [loyalty, setLoyalty] = useState(initialLoyalty);
  const [threshold, setThreshold] = useState(String(initialLoyalty.visit_threshold));
  const [percent, setPercent] = useState(String(initialLoyalty.discount_percentage));
  const [customText, setCustomText] = useState(initialLoyalty.custom_text);
  const [loyaltyPending, setLoyaltyPending] = useState(false);
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  const [loyaltyUploading, setLoyaltyUploading] = useState(false);

  const [banners, setBanners] = useState(initialBanners);
  const [title, setTitle] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [compressingBanner, setCompressingBanner] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingBannerId, setPendingBannerId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

  const atQuota = banners.length >= MAX_PROMOTIONAL_BANNERS;

  async function handleLoyaltyToggle() {
    if (loyaltyPending) return;
    const next = !loyalty.is_enabled;
    setError(null);
    setLoyaltyPending(true);
    setLoyalty((prev) => ({ ...prev, is_enabled: next }));

    const { settings, error: writeError } = await saveLoyaltySettings({ isEnabled: next });
    setLoyaltyPending(false);
    if (writeError || !settings) {
      setLoyalty((prev) => ({ ...prev, is_enabled: !next }));
      setError(writeError ?? 'Could not update Loyalty Pass.');
      return;
    }
    setLoyalty(settings);
  }

  async function handleSaveLoyalty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingLoyalty) return;

    const visitThreshold = Number(threshold);
    const discountPercentage = Number(percent);
    setError(null);
    setSavingLoyalty(true);
    const { settings, error: writeError } = await saveLoyaltySettings({
      visitThreshold,
      discountPercentage,
      customText,
    });
    setSavingLoyalty(false);

    if (writeError || !settings) {
      setError(writeError ?? 'Could not save Loyalty Pass settings.');
      return;
    }
    setLoyalty(settings);
    setThreshold(String(settings.visit_threshold));
    setPercent(String(settings.discount_percentage));
    setCustomText(settings.custom_text);
    setToast('Loyalty Pass settings saved.');
  }

  async function handleLoyaltyImage(file: File | null) {
    if (!file || loyaltyUploading) return;
    setError(null);
    setLoyaltyUploading(true);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.set('image', compressed);
      const { settings, error: writeError } = await uploadLoyaltyBannerImage(form);
      if (writeError || !settings) {
        setError(writeError ?? 'Could not upload the Loyalty banner.');
        return;
      }
      setLoyalty(settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compress that image.');
    } finally {
      setLoyaltyUploading(false);
    }
  }

  async function handleRemoveLoyaltyImage() {
    if (loyaltyUploading || !loyalty.banner_image_url) return;
    setError(null);
    setLoyaltyUploading(true);
    const { settings, error: writeError } = await deleteLoyaltyBannerImage();
    setLoyaltyUploading(false);
    if (writeError || !settings) {
      setError(writeError ?? 'Could not remove the Loyalty banner.');
      return;
    }
    setLoyalty(settings);
  }

  async function handleBannerFile(file: File | null) {
    if (!file) return;
    setError(null);
    setCompressingBanner(true);
    try {
      const compressed = await compressImage(file);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      setBannerFile(compressed);
      setBannerPreview(URL.createObjectURL(compressed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compress that image.');
    } finally {
      setCompressingBanner(false);
    }
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (adding || compressingBanner) return;

    if (banners.length >= MAX_PROMOTIONAL_BANNERS) {
      setToast(BANNER_QUOTA_MESSAGE);
      return;
    }
    if (!bannerFile) {
      setError('Please upload an image for the banner.');
      return;
    }

    setError(null);
    setAdding(true);
    const form = new FormData();
    form.set('title', title);
    form.set('image', bannerFile);
    const { banner, error: writeError } = await createPromotionalBanner(form);
    setAdding(false);

    if (writeError || !banner) {
      if (writeError === BANNER_QUOTA_MESSAGE) setToast(BANNER_QUOTA_MESSAGE);
      setError(writeError ?? 'Could not add that banner.');
      return;
    }

    setBanners((prev) => [banner, ...prev]);
    setTitle('');
    setBannerFile(null);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(null);
  }

  async function handleToggleBanner(banner: PromotionalBanner) {
    if (pendingBannerId) return;
    const next = !banner.is_active;
    setError(null);
    setPendingBannerId(banner.id);
    setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, is_active: next } : b)));

    const { error: writeError } = await setPromotionalBannerActive(banner.id, next);
    setPendingBannerId(null);
    if (writeError) {
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, is_active: banner.is_active } : b)));
      setError(writeError);
    }
  }

  async function handleDeleteBanner(banner: PromotionalBanner) {
    if (pendingBannerId) return;
    if (!window.confirm(`Delete “${banner.title}”? This also removes the image from storage.`)) return;

    setError(null);
    setPendingBannerId(banner.id);
    const { error: writeError } = await deletePromotionalBanner(banner.id);
    setPendingBannerId(null);
    if (writeError) {
      setError(writeError);
      return;
    }
    setBanners((prev) => prev.filter((b) => b.id !== banner.id));
  }

  const activeCount = banners.filter((b) => b.is_active).length;
  const suggestedCopy = defaultLoyaltyText(Number(threshold) || loyalty.visit_threshold, Number(percent) || loyalty.discount_percentage);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-lg font-bold">Marketing / Offers</h2>
          <p className="text-xs text-text-muted">
            Up to {MAX_PROMOTIONAL_BANNERS} promotional banners on the customer menu, plus an optional Loyalty Pass.
          </p>
        </div>
        <span className={`text-xs font-medium ${activeCount > 0 || loyalty.is_enabled ? 'text-success' : 'text-text-muted'}`}>
          {activeCount} live banner{activeCount === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div
        className={`mt-4 rounded-lg border border-line bg-ink-800/50 px-3.5 py-3 ${loyaltyPending ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Loyalty Pass</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Guests join with name and mobile. The reward fires automatically on the visit you set.
            </p>
          </div>
          <span className={`mt-0.5 shrink-0 text-[10px] font-medium uppercase tracking-wide ${loyalty.is_enabled ? 'text-success' : 'text-text-muted'}`}>
            {loyalty.is_enabled ? 'On' : 'Off'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={loyalty.is_enabled}
            aria-label="Loyalty Pass"
            disabled={loyaltyPending}
            onClick={() => void handleLoyaltyToggle()}
            className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:pointer-events-none ${
              loyalty.is_enabled ? 'border-success/60 bg-success/70' : 'border-line bg-ink-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-paper transition-transform ${
                loyalty.is_enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
              aria-hidden
            />
          </button>
        </div>

        <form onSubmit={handleSaveLoyalty} className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="visitThreshold" className="field-label">
                Visit threshold
              </label>
              <input
                id="visitThreshold"
                type="number"
                min={1}
                max={50}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="field-input"
              />
              <p className="mt-1 text-[11px] text-text-muted">Reward on this visit (e.g. 5).</p>
            </div>
            <div>
              <label htmlFor="discountPercentage" className="field-label">
                Discount %
              </label>
              <input
                id="discountPercentage"
                type="number"
                min={1}
                max={100}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="field-input"
              />
              <p className="mt-1 text-[11px] text-text-muted">Taken off the bill on the reward visit.</p>
            </div>
          </div>

          <div>
            <label htmlFor="loyaltyCopy" className="field-label">
              Custom promotional text
            </label>
            <input
              id="loyaltyCopy"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={suggestedCopy}
              maxLength={160}
              className="field-input"
            />
          </div>

          <div>
            <p className="field-label">Loyalty banner image</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {loyalty.banner_image_url && (
                // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded storage URL
                <img
                  src={loyalty.banner_image_url}
                  alt=""
                  width={96}
                  height={56}
                  className="h-14 w-24 rounded object-cover ring-1 ring-line"
                />
              )}
              <ImageUploadButton
                label={loyalty.banner_image_url ? 'Replace image' : 'Upload image'}
                busy={loyaltyUploading}
                onFile={(file) => void handleLoyaltyImage(file)}
              />
              {loyalty.banner_image_url && (
                <button
                  type="button"
                  disabled={loyaltyUploading}
                  onClick={() => void handleRemoveLoyaltyImage()}
                  className="text-xs text-danger underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Remove image
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-text-muted">Compressed on this device to under 300KB before upload.</p>
          </div>

          <button type="submit" disabled={savingLoyalty} className="btn-primary text-sm">
            {savingLoyalty ? 'Saving…' : 'Save loyalty settings'}
          </button>
        </form>
      </div>

      <form onSubmit={handleAdd} className="mt-4 space-y-3 border-t border-line pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          New banner · {banners.length}/{MAX_PROMOTIONAL_BANNERS}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bannerTitle" className="field-label">
              Title
            </label>
            <input
              id="bannerTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekend thali · 20% off"
              maxLength={80}
              className="field-input"
            />
          </div>
          <div>
            <span className="field-label">Banner image</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {bannerPreview && (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL
                <img src={bannerPreview} alt="" width={96} height={56} className="h-14 w-24 rounded object-cover ring-1 ring-line" />
              )}
              <ImageUploadButton
                label={bannerFile ? 'Change image' : 'Upload image'}
                busy={compressingBanner}
                disabled={atQuota}
                onDisabledClick={() => setToast(BANNER_QUOTA_MESSAGE)}
                onFile={(file) => void handleBannerFile(file)}
              />
            </div>
          </div>
        </div>
        <span
          className="inline-flex"
          onClick={() => {
            if (atQuota) setToast(BANNER_QUOTA_MESSAGE);
          }}
        >
          <button
            type="submit"
            disabled={adding || compressingBanner || atQuota}
            className={`btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50 ${atQuota ? 'pointer-events-none' : ''}`}
          >
            {adding ? 'Uploading…' : compressingBanner ? 'Compressing…' : 'Add banner'}
          </button>
        </span>
      </form>

      {banners.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {banners.map((banner) => {
            const busy = pendingBannerId === banner.id;
            return (
              <li key={banner.id} className={`flex items-center gap-3 py-3 ${busy ? 'opacity-60' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied URL can be any host */}
                <img
                  src={banner.image_url}
                  alt=""
                  width={56}
                  height={36}
                  className="h-9 w-14 shrink-0 rounded object-cover ring-1 ring-line"
                />
                <p className="min-w-0 flex-1 truncate text-sm">{banner.title}</p>
                <span
                  className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${
                    banner.is_active ? 'text-success' : 'text-text-muted'
                  }`}
                >
                  {banner.is_active ? 'On' : 'Off'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={banner.is_active}
                  aria-label={`${banner.is_active ? 'Hide' : 'Show'} ${banner.title}`}
                  disabled={pendingBannerId !== null}
                  onClick={() => void handleToggleBanner(banner)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:pointer-events-none ${
                    banner.is_active ? 'border-success/60 bg-success/70' : 'border-line bg-ink-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-paper transition-transform ${
                      banner.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  disabled={pendingBannerId !== null}
                  onClick={() => void handleDeleteBanner(banner)}
                  className="shrink-0 rounded border border-danger/30 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-paper px-4 py-2 text-sm font-medium text-text-onPaper shadow-xl"
        >
          {toast}
        </div>
      )}
    </section>
  );
}

function ImageUploadButton({
  label,
  busy,
  disabled,
  onDisabledClick,
  onFile,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onDisabledClick?: () => void;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (disabled) {
            onDisabledClick?.();
            return;
          }
          inputRef.current?.click();
        }}
        className={`rounded border border-line bg-ink-700 px-3 py-2 text-xs font-medium text-text hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-50 ${
          disabled ? 'cursor-not-allowed opacity-50' : ''
        }`}
      >
        {busy ? 'Working…' : label}
      </button>
    </>
  );
}
