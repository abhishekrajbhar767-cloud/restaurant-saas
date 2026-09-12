import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const compiled = ts.transpileModule(await source('lib/menu/recipe.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const validation = {};
new Function('require', 'exports', compiled)(createRequire(import.meta.url), validation);

test('menu cards show Recipe only when inventory tracking is enabled', async () => {
  const require = createRequire(import.meta.url);
  const menuModule = {};
  const menuSource = ts.transpileModule(await source('components/admin/menu-manager.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', menuSource)((specifier) => {
    if (specifier === 'next/navigation') return { useRouter: () => ({ refresh() {} }) };
    // Closed dialogs and event handlers do not run on the initial render.
    if (specifier === '@/components/admin/menu/recipe-mapping-modal' || specifier === '@/app/admin/menu/actions') return {};
    return require(specifier);
  }, menuModule);
  const props = {
    restaurantId: 'restaurant-a',
    categories: [{ id: 'category-a', name: 'Dishes', is_active: true }],
    items: [{ id: 'dish-a', category_id: 'category-a', name: 'Rice Bowl', food_type: 'veg', is_available: true, price: 150, prep_time: 15, image_url: null }],
  };
  const disabled = renderToStaticMarkup(createElement(menuModule.MenuManager, { ...props, inventoryEnabled: false }));
  const enabled = renderToStaticMarkup(createElement(menuModule.MenuManager, { ...props, inventoryEnabled: true }));
  assert.doesNotMatch(disabled, /Recipe|Ingredient Mapping/);
  assert.match(enabled, /aria-label="Recipe for Rice Bowl"/);
  for (const markup of [disabled, enabled]) {
    assert.match(markup, /Rice Bowl/);
    assert.match(markup, />Edit<\/button>/);
    assert.match(markup, />Disable<\/button>/);
  }
});

test('recipe validation accepts empty lists and rejects invalid quantities and duplicate ingredients', () => {
  const { RecipeIngredientsSchema } = validation;
  const id = '40000000-0000-0000-0000-00000000000a';
  const line = (quantity_required) => ({ inventory_item_id: id, quantity_required });
  assert.equal(RecipeIngredientsSchema.safeParse([]).success, true);
  for (const quantity of [0.001, 0.25, 1, 999999999.999]) {
    assert.equal(RecipeIngredientsSchema.safeParse([line(quantity)]).success, true);
  }
  for (const quantity of [0, -1, 0.0001, 1e9, Infinity, NaN, '0.25', null]) {
    assert.equal(RecipeIngredientsSchema.safeParse([line(quantity)]).success, false);
  }
  for (const value of [null, {}, [null], [{}], [{ inventory_item_id: 'bad-id', quantity_required: 1 }]]) {
    assert.equal(RecipeIngredientsSchema.safeParse(value).success, false);
  }
  assert.equal(RecipeIngredientsSchema.safeParse([line(1), line(2)]).success, false);
  assert.equal(RecipeIngredientsSchema.safeParse([line(1), { inventory_item_id: id.toUpperCase(), quantity_required: 2 }]).success, false);
});

test('recipe mapping database contract', async (t) => {
  const db = new PGlite();
  const restaurantA = '10000000-0000-0000-0000-000000000001';
  const restaurantB = '10000000-0000-0000-0000-000000000002';
  const owner = '20000000-0000-0000-0000-000000000001';
  const manager = '20000000-0000-0000-0000-000000000002';
  const waiter = '20000000-0000-0000-0000-000000000003';
  const outsider = '20000000-0000-0000-0000-000000000004';
  const inactive = '20000000-0000-0000-0000-000000000005';
  const kitchen = '20000000-0000-0000-0000-000000000006';
  const categoryA = '30000000-0000-0000-0000-000000000001';
  const categoryB = '30000000-0000-0000-0000-000000000002';
  const rice = '40000000-0000-0000-0000-000000000001';
  const water = '40000000-0000-0000-0000-000000000002';
  const salt = '40000000-0000-0000-0000-000000000003';
  const foreignIngredient = '40000000-0000-0000-0000-000000000004';
  const dishA = '50000000-0000-0000-0000-000000000001';
  const dishB = '50000000-0000-0000-0000-000000000002';
  const line = (inventory_item_id, quantity_required) => ({ inventory_item_id, quantity_required });

  async function asUser(userId, operation) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    try { return await operation(); } finally { await db.exec('reset role'); }
  }
  const save = (ingredients, dish = dishA) => db.query('select public.save_menu_item_recipe($1, $2::jsonb)', [dish, JSON.stringify(ingredients)]);
  const remove = (id) => db.query('select public.delete_recipe_ingredient($1)', [id]);
  const snapshot = async () => (await db.query('select * from menu_item_recipes order by id')).rows;

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    // PGlite runs real Postgres SQL; unrelated extensions are omitted.
    await db.exec((await source('supabase/migrations/0001_extensions_and_enums.sql')).replace(/^create extension.*$/gm, ''));
    for (const migration of ['0002_tables.sql', '0004_auth_helpers.sql', '0005_rls_policies.sql', '0039_inventory_and_recipes.sql', '0041_menu_item_recipe_management.sql']) {
      await db.exec(await source(`supabase/migrations/${migration}`));
    }
    await db.exec('grant select, insert, update, delete on public.menu_item_recipes, public.inventory_items, public.inventory_logs, public.menu_items to authenticated');
    await db.query("insert into restaurants (id, name, slug, inventory_tracking_enabled) values ($1, 'A', 'a', true), ($2, 'B', 'b', true)", [restaurantA, restaurantB]);
    for (const [userId, tenant, role, active] of [[owner, restaurantA, 'owner', true], [manager, restaurantA, 'manager', true], [waiter, restaurantA, 'waiter', true], [outsider, restaurantB, 'owner', true], [inactive, restaurantA, 'manager', false], [kitchen, restaurantA, 'kitchen', true]]) {
      await db.query('insert into auth.users values ($1)', [userId]);
      await db.query('insert into restaurant_members (restaurant_id, user_id, role, is_active) values ($1, $2, $3, $4)', [tenant, userId, role, active]);
    }
    await db.query("insert into menu_categories (id, restaurant_id, name) values ($1, $2, 'Dishes'), ($3, $4, 'Dishes')", [categoryA, restaurantA, categoryB, restaurantB]);
    await db.query("insert into menu_items (id, restaurant_id, category_id, name, price) values ($1, $2, $3, 'Rice Bowl', 150), ($4, $5, $6, 'Other Dish', 200)", [dishA, restaurantA, categoryA, dishB, restaurantB, categoryB]);
    for (const [id, tenant, name, unit] of [[rice, restaurantA, 'Rice', 'kg'], [water, restaurantA, 'Water', 'litre'], [salt, restaurantA, 'Salt', 'gram'], [foreignIngredient, restaurantB, 'Oil', 'ml']]) {
      await db.query('insert into inventory_items (id, restaurant_id, name, unit, current_stock) values ($1, $2, $3, $4, 10)', [id, tenant, name, unit]);
    }
    const stockBefore = (await db.query('select * from inventory_items order by id')).rows;

    await t.test('owner saves a recipe; joined reads expose name, unit, and per-serving quantity', async () => {
      await asUser(owner, () => save([line(rice, 0.25), line(water, 0.1)]));
      await asUser(owner, async () => {
        const result = await db.query(`select i.name, i.unit, r.quantity_required from menu_item_recipes r
          join inventory_items i on i.id = r.inventory_item_id where r.menu_item_id = $1 order by i.name`, [dishA]);
        assert.deepEqual(result.rows.map((row) => ({ ...row, quantity_required: Number(row.quantity_required) })), [
          { name: 'Rice', unit: 'kg', quantity_required: 0.25 },
          { name: 'Water', unit: 'litre', quantity_required: 0.1 },
        ]);
      });
    });

    await t.test('manager sync updates quantities, preserves retained IDs, inserts additions, and removes omissions', async () => {
      const originalRice = (await snapshot()).find((row) => row.inventory_item_id === rice);
      await asUser(manager, () => save([line(rice, 0.5), line(salt, 2)]));
      const rows = await snapshot();
      assert.equal(rows.length, 2);
      assert.equal(rows.find((row) => row.inventory_item_id === rice).id, originalRice.id);
      assert.equal(Number(rows.find((row) => row.inventory_item_id === rice).quantity_required), 0.5);
      assert.equal(rows.some((row) => row.inventory_item_id === water), false);
      assert.equal(rows.some((row) => row.inventory_item_id === salt), true);
      await asUser(owner, () => save([line(rice, 0.5), line(salt, 2)]));
      assert.deepEqual(await snapshot(), rows);
    });

    await t.test('invalid payloads cannot partially replace an existing recipe', async () => {
      const before = await snapshot();
      for (const ingredients of [null, {}, 'bad', [null], [{}], [line(rice, null)], [line(rice, '0.25')], [line(rice, 0)], [line(rice, -1)], [line(rice, 0.0001)], [line(rice, 1e9)], [line(rice, 1), line(rice, 2)]]) {
        await assert.rejects(asUser(owner, () => save(ingredients)), { code: '22023' });
      }
      await assert.rejects(asUser(owner, () => save([line('bad-uuid', 1)])), { code: '22P02' });
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('foreign or missing ingredients cannot be attached to an owned dish', async () => {
      const before = await snapshot();
      for (const id of [foreignIngredient, '40000000-0000-0000-0000-000000000099']) {
        await assert.rejects(asUser(owner, () => save([line(rice, 1), line(id, 2)])), { code: '22023' });
      }
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('unauthorized roles and other restaurants cannot save, clear, or delete recipes', async () => {
      const before = await snapshot();
      const recipeId = before[0].id;
      for (const userId of [waiter, kitchen, inactive, outsider]) {
        await assert.rejects(asUser(userId, () => save([])), { code: '42501' });
        await assert.rejects(asUser(userId, () => remove(recipeId)), { code: '42501' });
      }
      await assert.rejects(asUser(owner, () => save([], dishB)), { code: '42501' });
      await db.exec('set role anon');
      try {
        await assert.rejects(save([]), { code: '42501' });
        await assert.rejects(remove(recipeId), { code: '42501' });
      } finally { await db.exec('reset role'); }
      await asUser(outsider, async () => {
        assert.equal((await db.query('select * from menu_item_recipes where menu_item_id = $1', [dishA])).rows.length, 0);
      });
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('disabled inventory blocks saves and single-ingredient deletion', async () => {
      const before = await snapshot();
      await db.query('update restaurants set inventory_tracking_enabled = false where id = $1', [restaurantA]);
      await assert.rejects(asUser(owner, () => save([])), { code: '42501' });
      await assert.rejects(asUser(owner, () => remove(before[0].id)), { code: '42501' });
      assert.deepEqual(await snapshot(), before);
      await db.query('update restaurants set inventory_tracking_enabled = true where id = $1', [restaurantA]);
    });

    await t.test('failed insertion rolls back prior deletions and quantity changes', async () => {
      const before = await snapshot();
      await db.exec(`create function fail_recipe_insert() returns trigger language plpgsql as $$
        begin if new.inventory_item_id = '${water}'::uuid then raise exception 'Simulated recipe failure'; end if; return new; end;
        $$;
        create trigger test_recipe_failure before insert on menu_item_recipes for each row execute function fail_recipe_insert();`);
      await assert.rejects(asUser(owner, () => save([line(rice, 8), line(water, 5)])), /Simulated recipe failure/);
      assert.deepEqual(await snapshot(), before);
      await db.exec('drop trigger test_recipe_failure on menu_item_recipes');
    });

    await t.test('single deletion removes only the selected mapping; empty save clears the remaining recipe', async () => {
      const before = await snapshot();
      await asUser(manager, () => remove(before[0].id));
      assert.deepEqual(await snapshot(), before.slice(1));
      await asUser(owner, () => save([]));
      assert.deepEqual(await snapshot(), []);
    });

    await t.test('recipe operations never mutate ingredient stock or inventory logs', async () => {
      assert.deepEqual((await db.query('select * from inventory_items order by id')).rows, stockBefore);
      assert.equal((await db.query('select * from inventory_logs')).rows.length, 0);
    });
  } finally {
    await db.close();
  }
});
