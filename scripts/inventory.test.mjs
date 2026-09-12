import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

// Compile the real validation module in memory; works on Node 20 as well as 22+.
const compiled = ts.transpileModule(await source('lib/inventory/validation.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const validation = {};
new Function('require', 'exports', compiled)(createRequire(import.meta.url), validation);

test('inventory input validation respects numeric(12,3) and supported units', () => {
  const { AddStockSchema, CreateInventoryItemSchema } = validation;
  const inventoryItemId = '40000000-0000-0000-0000-000000000001';
  for (const quantity of [0.001, 1, 10.125, 999999999.999]) {
    assert.equal(AddStockSchema.safeParse({ inventoryItemId, quantity }).success, true);
  }
  for (const quantity of [0, -1, 0.0001, 1.0001, 1e9, NaN, Infinity, -Infinity, '10']) {
    assert.equal(AddStockSchema.safeParse({ inventoryItemId, quantity }).success, false, String(quantity));
  }
  assert.equal(AddStockSchema.safeParse({ inventoryItemId: 'bad-id', quantity: 1 }).success, false);
  assert.equal(AddStockSchema.safeParse({ inventoryItemId, quantity: 1, notes: 'x'.repeat(501) }).success, false);
  for (const unit of ['kg', 'gram', 'litre', 'ml', 'pcs']) {
    assert.equal(CreateInventoryItemSchema.safeParse({ name: 'Rice', unit, min_alert_limit: 0 }).success, true);
  }
  for (const data of [
    { name: ' ', unit: 'kg', min_alert_limit: 1 },
    { name: 'Rice', unit: 'box', min_alert_limit: 1 },
    { name: 'Rice', unit: 'kg', min_alert_limit: -1 },
    { name: 'Rice', unit: 'kg', min_alert_limit: 0.0001 },
  ]) assert.equal(CreateInventoryItemSchema.safeParse(data).success, false);
});

test('manual restock database contract', async (t) => {
  const db = new PGlite();
  const restaurantA = '10000000-0000-0000-0000-000000000001';
  const restaurantB = '10000000-0000-0000-0000-000000000002';
  const owner = '20000000-0000-0000-0000-000000000001';
  const manager = '20000000-0000-0000-0000-000000000002';
  const waiter = '20000000-0000-0000-0000-000000000003';
  const outsider = '20000000-0000-0000-0000-000000000004';
  const inactive = '20000000-0000-0000-0000-000000000005';
  const ownerMember = '30000000-0000-0000-0000-000000000001';
  const item = '40000000-0000-0000-0000-000000000001';

  async function asUser(userId, operation) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    try { return await operation(); } finally { await db.exec('reset role'); }
  }
  const restock = (quantity, notes = null) => db.query('select * from public.add_inventory_stock($1, $2::numeric, $3)', [item, quantity, notes]);
  async function snapshot() {
    return {
      stock: (await db.query('select current_stock, updated_at from inventory_items where id = $1', [item])).rows,
      logs: (await db.query('select * from inventory_logs where inventory_item_id = $1 order by id', [item])).rows,
    };
  }

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
    // Load the real base schema and auth helpers. These extensions are unrelated
    // to stock and not bundled with PGlite; gen_random_uuid is built into Postgres.
    await db.exec((await source('supabase/migrations/0001_extensions_and_enums.sql')).replace(/^create extension.*$/gm, ''));
    await db.exec(await source('supabase/migrations/0002_tables.sql'));
    await db.exec(await source('supabase/migrations/0004_auth_helpers.sql'));
    await db.exec(await source('supabase/migrations/0039_inventory_and_recipes.sql'));
    await db.exec(await source('supabase/migrations/0040_manual_inventory_restock.sql'));
    await db.exec('grant select, insert, update, delete on public.inventory_items, public.inventory_logs to authenticated');
    await db.query("insert into restaurants (id, name, slug, inventory_tracking_enabled) values ($1, 'A', 'a', true), ($2, 'B', 'b', true)", [restaurantA, restaurantB]);
    for (const userId of [owner, manager, waiter, outsider, inactive]) await db.query('insert into auth.users values ($1)', [userId]);
    await db.query("insert into restaurant_members (id, restaurant_id, user_id, role) values ($1, $2, $3, 'owner')", [ownerMember, restaurantA, owner]);
    for (const [userId, tenant, role, active] of [[manager, restaurantA, 'manager', true], [waiter, restaurantA, 'waiter', true], [outsider, restaurantB, 'owner', true], [inactive, restaurantA, 'manager', false]]) {
      await db.query('insert into restaurant_members (restaurant_id, user_id, role, is_active) values ($1, $2, $3, $4)', [tenant, userId, role, active]);
    }
    await db.query("insert into inventory_items (id, restaurant_id, name, unit) values ($1, $2, 'Rice', 'kg')", [item, restaurantA]);

    await t.test('owner intake increments stock, trims notes, attributes the log, and updates timestamp', async () => {
      const before = await snapshot();
      const result = await asUser(owner, () => restock(10.125, '  Vendor A  '));
      assert.equal(Number(result.rows[0].current_stock), 10.125);
      const after = await snapshot();
      assert.equal(after.logs.length, 1);
      assert.equal(after.logs[0].change_type, 'manual_restock');
      assert.equal(after.logs[0].performed_by, ownerMember);
      assert.equal(after.logs[0].restaurant_id, restaurantA);
      assert.equal(Number(after.logs[0].quantity), 10.125);
      assert.equal(after.logs[0].notes, 'Vendor A');
      assert.notDeepEqual(after.stock[0].updated_at, before.stock[0].updated_at);
    });

    await t.test('multiple manager intakes preserve every addition and audit row', async () => {
      await asUser(manager, () => Promise.all([restock(2, ' '), restock(3.001)]));
      const after = await snapshot();
      assert.equal(Number(after.stock[0].current_stock), 15.126);
      assert.equal(after.logs.length, 3);
      assert.equal(after.logs.filter((log) => log.notes === null).length, 2);
    });

    await t.test('invalid quantities and oversized notes cannot mutate stock or logs', async () => {
      const before = await snapshot();
      for (const quantity of [null, 0, -1, 0.0001, 1.0001, 1e9, 'NaN', 'Infinity', '-Infinity']) {
        await assert.rejects(asUser(owner, () => restock(quantity)), { code: '22023' });
      }
      await assert.rejects(asUser(owner, () => restock(1, 'x'.repeat(501))), { code: '22023' });
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('waiters, inactive staff, other tenants, and anonymous callers are rejected', async () => {
      const before = await snapshot();
      for (const userId of [waiter, outsider, inactive]) await assert.rejects(asUser(userId, () => restock(1)), { code: '42501' });
      await db.exec('set role anon');
      try { await assert.rejects(restock(1), { code: '42501' }); } finally { await db.exec('reset role'); }
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('item and history reads remain isolated through Phase 1 RLS', async () => {
      await asUser(outsider, async () => {
        assert.equal((await db.query('select * from inventory_items where id = $1', [item])).rows.length, 0);
        assert.equal((await db.query('select * from inventory_logs where inventory_item_id = $1', [item])).rows.length, 0);
      });
      await asUser(owner, async () => {
        assert.equal((await db.query('select * from inventory_items where id = $1', [item])).rows.length, 1);
        assert.equal((await db.query('select * from inventory_logs where inventory_item_id = $1', [item])).rows.length, 3);
      });
    });

    await t.test('disabled inventory rejects direct RPC calls', async () => {
      await db.query('update restaurants set inventory_tracking_enabled = false where id = $1', [restaurantA]);
      const before = await snapshot();
      await assert.rejects(asUser(owner, () => restock(1)), { code: '42501' });
      assert.deepEqual(await snapshot(), before);
      await db.query('update restaurants set inventory_tracking_enabled = true where id = $1', [restaurantA]);
    });

    await t.test('an audit insertion failure rolls back stock and updated_at', async () => {
      await db.exec(`
        create function reject_test_log() returns trigger language plpgsql as $$
          begin raise exception 'Simulated audit failure'; end;
        $$;
        create trigger test_reject_log before insert on inventory_logs for each row execute function reject_test_log();
      `);
      const before = await snapshot();
      await assert.rejects(asUser(owner, () => restock(7)), /Simulated audit failure/);
      assert.deepEqual(await snapshot(), before);
      await db.exec('drop trigger test_reject_log on inventory_logs');
    });

    await t.test('stock overflow also rolls back without an audit entry', async () => {
      await db.query('update inventory_items set current_stock = 999999999.999 where id = $1', [item]);
      const before = await snapshot();
      await assert.rejects(asUser(owner, () => restock(0.001)), { code: '22003' });
      assert.deepEqual(await snapshot(), before);
    });
  } finally {
    await db.close();
  }
});
