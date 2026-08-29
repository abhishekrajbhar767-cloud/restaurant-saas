'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  addCategory,
  renameCategory,
  setCategoryActive,
  moveCategory,
  addItem,
  updateItem,
  setItemAvailable,
  moveItem,
} from '@/app/admin/menu/actions';
import type { MenuCategory, MenuItem, FoodType } from '@/types/database';

const FOOD_TYPE_LABEL: Record<FoodType, string> = { veg: 'Veg', non_veg: 'Non-veg', egg: 'Egg', vegan: 'Vegan' };
const FOOD_TYPE_DOT: Record<FoodType, string> = {
  veg: 'bg-success',
  vegan: 'bg-success',
  egg: 'bg-amber',
  non_veg: 'bg-danger',
};

export function MenuManager({ categories, items }: { categories: MenuCategory[]; items: MenuItem[] }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <AddCategoryForm onError={setError} />

      <div className="space-y-5">
        {categories.map((category, i) => (
          <CategorySection
            key={category.id}
            category={category}
            items={items.filter((it) => it.category_id === category.id)}
            isFirst={i === 0}
            isLast={i === categories.length - 1}
            onError={setError}
          />
        ))}
        {categories.length === 0 && <p className="text-sm text-text-muted">No categories yet — add one above to get started.</p>}
      </div>
    </div>
  );
}

function AddCategoryForm({ onError }: { onError: (e: string | null) => void }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await addCategory(formData);
        formRef.current?.reset();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not add category.');
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2">
      <input name="name" required placeholder="New category name" className="field-input max-w-xs" />
      <button type="submit" disabled={isPending} className="btn-secondary">
        {isPending ? 'Adding…' : '+ Add category'}
      </button>
    </form>
  );
}

function CategorySection({
  category,
  items,
  isFirst,
  isLast,
  onError,
}: {
  category: MenuCategory;
  items: MenuItem[];
  isFirst: boolean;
  isLast: boolean;
  onError: (e: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  function run(action: () => Promise<void>) {
    onError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    });
  }

  return (
    <section className={`card p-4 ${!category.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {renaming ? (
          <RenameCategoryForm
            category={category}
            onDone={() => setRenaming(false)}
            onError={onError}
          />
        ) : (
          <h2 className="font-display font-bold text-lg">
            {category.name}
            {!category.is_active && <span className="ml-2 text-xs text-text-muted uppercase">Inactive</span>}
          </h2>
        )}

        <div className="flex items-center gap-3 text-xs">
          <button disabled={isFirst || isPending} onClick={() => run(() => moveCategory(category.id, 'up'))} className="text-text-muted hover:text-text disabled:opacity-30">
            ↑
          </button>
          <button disabled={isLast || isPending} onClick={() => run(() => moveCategory(category.id, 'down'))} className="text-text-muted hover:text-text disabled:opacity-30">
            ↓
          </button>
          {!renaming && (
            <button onClick={() => setRenaming(true)} className="underline underline-offset-2 text-text-muted hover:text-text">
              Rename
            </button>
          )}
          <button
            onClick={() => run(() => setCategoryActive(category.id, !category.is_active))}
            disabled={isPending}
            className={`underline underline-offset-2 ${category.is_active ? 'text-danger' : 'text-success'}`}
          >
            {category.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      <div className="mt-4 divide-y divide-line">
        {items.map((item, i) => (
          <ItemRow key={item.id} item={item} isFirst={i === 0} isLast={i === items.length - 1} onError={onError} />
        ))}
        {items.length === 0 && <p className="text-sm text-text-muted py-3">No items in this category yet.</p>}
      </div>

      <div className="mt-3">
        {showAddItem ? (
          <ItemForm categoryId={category.id} onDone={() => setShowAddItem(false)} onError={onError} />
        ) : (
          <button onClick={() => setShowAddItem(true)} className="text-sm text-amber underline underline-offset-2">
            + Add item
          </button>
        )}
      </div>
    </section>
  );
}

function RenameCategoryForm({ category, onDone, onError }: { category: MenuCategory; onDone: () => void; onError: (e: string | null) => void }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(category.name);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    startTransition(async () => {
      try {
        await renameCategory(category.id, name);
        onDone();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not rename category.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className="field-input" autoFocus />
      <button type="submit" disabled={isPending} className="btn-secondary text-sm">
        Save
      </button>
      <button type="button" onClick={onDone} className="text-sm text-text-muted underline underline-offset-2">
        Cancel
      </button>
    </form>
  );
}

function ItemRow({ item, isFirst, isLast, onError }: { item: MenuItem; isFirst: boolean; isLast: boolean; onError: (e: string | null) => void }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  function run(action: () => Promise<void>) {
    onError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    });
  }

  if (editing) {
    return (
      <div className="py-3">
        <ItemForm categoryId={item.category_id} item={item} onDone={() => setEditing(false)} onError={onError} />
      </div>
    );
  }

  return (
    <div className={`py-3 flex items-center gap-3 ${!item.is_available ? 'opacity-50' : ''}`}>
      {item.image_url ? (
        <Image src={item.image_url} alt="" width={44} height={44} className="rounded-sm object-cover shrink-0" />
      ) : (
        <div className="h-11 w-11 rounded-sm bg-ink-800 shrink-0" aria-hidden />
      )}

      <span className={`h-2 w-2 rounded-full shrink-0 ${FOOD_TYPE_DOT[item.food_type]}`} title={FOOD_TYPE_LABEL[item.food_type]} />

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.name}</div>
        <div className="text-xs text-text-muted truncate">{item.description}</div>
      </div>

      <div className="font-mono text-sm shrink-0">₹{Number(item.price).toLocaleString('en-IN')}</div>
      <div className="text-xs text-text-muted shrink-0">{item.prep_time}m</div>

      <div className="flex items-center gap-2 text-xs shrink-0">
        <button disabled={isFirst || isPending} onClick={() => run(() => moveItem(item.id, item.category_id, 'up'))} className="text-text-muted hover:text-text disabled:opacity-30">
          ↑
        </button>
        <button disabled={isLast || isPending} onClick={() => run(() => moveItem(item.id, item.category_id, 'down'))} className="text-text-muted hover:text-text disabled:opacity-30">
          ↓
        </button>
        <button onClick={() => setEditing(true)} className="underline underline-offset-2 text-text-muted hover:text-text">
          Edit
        </button>
        <button
          onClick={() => run(() => setItemAvailable(item.id, !item.is_available))}
          disabled={isPending}
          className={`underline underline-offset-2 ${item.is_available ? 'text-danger' : 'text-success'}`}
        >
          {item.is_available ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  );
}

function ItemForm({
  categoryId,
  item,
  onDone,
  onError,
}: {
  categoryId: string;
  item?: MenuItem;
  onDone: () => void;
  onError: (e: string | null) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (item) {
          formData.set('itemId', item.id);
          await updateItem(formData);
        } else {
          await addItem(formData);
        }
        onDone();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not save item.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3 bg-ink-800/50">
      <input type="hidden" name="categoryId" value={categoryId} />

      <div className="grid sm:grid-cols-2 gap-3">
        <input name="name" required defaultValue={item?.name} placeholder="Item name" className="field-input" />
        <input name="price" type="number" step="0.01" min="0" required defaultValue={item?.price} placeholder="Price" className="field-input" />
      </div>

      <textarea name="description" defaultValue={item?.description ?? ''} placeholder="Description" rows={2} className="field-input" />

      <div className="grid sm:grid-cols-3 gap-3">
        <select name="foodType" defaultValue={item?.food_type ?? 'veg'} className="field-input">
          <option value="veg">Veg</option>
          <option value="non_veg">Non-veg</option>
          <option value="egg">Egg</option>
          <option value="vegan">Vegan</option>
        </select>
        <input name="prepTime" type="number" min="0" required defaultValue={item?.prep_time ?? 15} placeholder="Prep time (min)" className="field-input" />
        <input name="image" type="file" accept="image/*" className="field-input file:mr-3 file:rounded file:border-0 file:bg-amber file:text-ink-950 file:px-2 file:py-1" />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn-primary text-sm">
          {isPending ? 'Saving…' : item ? 'Save changes' : 'Add item'}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-text-muted underline underline-offset-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
