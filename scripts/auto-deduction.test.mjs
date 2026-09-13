import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('disabled scheduling performs no work and enabled scheduling does not wait for deduction', async () => {
  let clients = 0;
  let calls = 0;
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const module = {};
  const compiled = ts.transpileModule(await source('lib/kitchen/inventory.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'exports', compiled)((specifier) => {
    assert.equal(specifier, '@/lib/supabase/client');
    return { createClient: () => {
      clients++;
      return { rpc: () => ({ abortSignal: () => { calls++; return pending; } }) };
    } };
  }, module);

  assert.equal(module.scheduleInventoryDeduction('order-off', false), undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(clients, 0);
  assert.equal(calls, 0);

  const before = performance.now();
  assert.equal(module.scheduleInventoryDeduction('order-on', true), undefined);
  assert.ok(performance.now() - before < 20);
  assert.equal(clients, 1);
  assert.equal(calls, 1);
  finish({ error: null });
  await pending;
});

test('automatic inventory deduction database contract', async (t) => {
  const db = new PGlite();
  const tenantA = '10000000-0000-0000-0000-000000000001';
  const tenantB = '10000000-0000-0000-0000-000000000002';
  const kitchen = '20000000-0000-0000-0000-000000000001';
  const manager = '20000000-0000-0000-0000-000000000002';
  const waiter = '20000000-0000-0000-0000-000000000003';
  const outsider = '20000000-0000-0000-0000-000000000004';
  const kitchenMember = '30000000-0000-0000-0000-000000000001';
  const tableA = '40000000-0000-0000-0000-000000000001';
  const tableB = '40000000-0000-0000-0000-000000000002';
  const categoryA = '50000000-0000-0000-0000-000000000001';
  const categoryB = '50000000-0000-0000-0000-000000000002';
  const dishA = '60000000-0000-0000-0000-000000000001';
  const dishB = '60000000-0000-0000-0000-000000000002';
  const rice = '70000000-0000-0000-0000-000000000001';
  const salt = '70000000-0000-0000-0000-000000000002';
  let orderSequence = 0;

  async function asUser(userId, operation) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    try { return await operation(); } finally { await db.exec('reset role'); }
  }
  const deduct = (orderId) => db.query('select public.deduct_order_inventory($1)', [orderId]);
  async function createOrder(status = 'preparing', lines = [[dishA, 2], [dishB, 3]]) {
    const id = `80000000-0000-0000-0000-${String(++orderSequence).padStart(12, '0')}`;
    await db.query('insert into orders (id, restaurant_id, table_id, status, subtotal) values ($1, $2, $3, $4, 1)', [id, tenantA, tableA, status]);
    for (const [menuItemId, quantity, itemStatus = 'active'] of lines) {
      await db.query("insert into order_items (order_id, menu_item_id, item_name, unit_price, quantity, status) values ($1, $2, 'Dish', 1, $3, $4)", [id, menuItemId, quantity, itemStatus]);
    }
    return id;
  }
  async function snapshot(orderId) {
    return {
      order: (await db.query('select inventory_deducted from orders where id = $1', [orderId])).rows[0],
      stock: (await db.query('select id, current_stock from inventory_items order by id')).rows,
      logs: (await db.query('select inventory_item_id, change_type, quantity, notes, performed_by from inventory_logs order by inventory_item_id')).rows,
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
    await db.exec((await source('supabase/migrations/0001_extensions_and_enums.sql')).replace(/^create extension.*$/gm, ''));
    await db.exec(await source('supabase/migrations/0002_tables.sql'));
    await db.exec(await source('supabase/migrations/0004_auth_helpers.sql'));
    await db.exec("create type order_item_status as enum ('active', 'voided'); alter table order_items add column status order_item_status not null default 'active'; alter table orders add column auto_closed_at timestamptz;");
    await db.exec(await source('supabase/migrations/0039_inventory_and_recipes.sql'));
    await db.exec(await source('supabase/migrations/0042_kitchen_auto_deduction.sql'));
    await db.exec('grant select, update on orders to authenticated; grant select on inventory_items, inventory_logs to authenticated');
    await db.query("insert into restaurants (id, name, slug, inventory_tracking_enabled, recipe_auto_deduct_enabled) values ($1, 'A', 'a', true, true), ($2, 'B', 'b', true, true)", [tenantA, tenantB]);
    for (const [userId, tenant, role, memberId] of [[kitchen, tenantA, 'kitchen', kitchenMember], [manager, tenantA, 'manager', null], [waiter, tenantA, 'waiter', null], [outsider, tenantB, 'kitchen', null]]) {
      await db.query('insert into auth.users values ($1)', [userId]);
      await db.query('insert into restaurant_members (id, restaurant_id, user_id, role) values (coalesce($1, gen_random_uuid()), $2, $3, $4)', [memberId, tenant, userId, role]);
    }
    await db.query("insert into tables (id, restaurant_id, table_number) values ($1, $2, '1'), ($3, $4, '1')", [tableA, tenantA, tableB, tenantB]);
    await db.query("insert into menu_categories (id, restaurant_id, name) values ($1, $2, 'Food'), ($3, $4, 'Food')", [categoryA, tenantA, categoryB, tenantB]);
    await db.query("insert into menu_items (id, restaurant_id, category_id, name, price) values ($1, $2, $3, 'Bowl', 1), ($4, $2, $3, 'Side', 1)", [dishA, tenantA, categoryA, dishB]);
    await db.query("insert into inventory_items (id, restaurant_id, name, unit, current_stock, min_alert_limit) values ($1, $2, 'Rice', 'kg', 0.5, 1), ($3, $2, 'Salt', 'gram', 10, 3)", [rice, tenantA, salt]);
    await db.query('insert into menu_item_recipes (restaurant_id, menu_item_id, inventory_item_id, quantity_required) values ($1,$2,$3,0.25),($1,$2,$4,2),($1,$5,$3,0.1)', [tenantA, dishA, rice, salt, dishB]);

    await t.test('aggregates shared ingredients, skips voided lines, allows shortages, and audits negative quantities', async () => {
      const orderId = await createOrder('preparing', [[dishA, 2], [dishB, 3], [dishA, 10, 'voided']]);
      const orderNumber = (await db.query('select order_number from orders where id = $1', [orderId])).rows[0].order_number;
      await asUser(kitchen, () => deduct(orderId));
      const after = await snapshot(orderId);
      assert.equal(after.order.inventory_deducted, true);
      assert.deepEqual(after.stock.map((row) => Number(row.current_stock)), [-0.3, 6]);
      assert.deepEqual(after.logs.map((row) => Number(row.quantity)), [-0.8, -4]);
      assert.ok(after.logs.every((row) => row.change_type === 'auto_deduct'));
      assert.ok(after.logs.every((row) => row.notes === `Order #${orderNumber}`));
      assert.ok(after.logs.every((row) => row.performed_by === kitchenMember));
    });

    await t.test('repeat and concurrent calls are idempotent', async () => {
      const orderId = await createOrder();
      const before = await snapshot(orderId);
      await asUser(manager, () => Promise.all([deduct(orderId), deduct(orderId), deduct(orderId)]));
      const once = await snapshot(orderId);
      await asUser(kitchen, () => deduct(orderId));
      assert.deepEqual(await snapshot(orderId), once);
      assert.equal(once.logs.length, before.logs.length + 2);
    });

    await t.test('either disabled toggle returns without mutation or marking the order', async () => {
      for (const [tracking, auto] of [[false, true], [true, false], [false, false]]) {
        const orderId = await createOrder();
        await db.query('update restaurants set inventory_tracking_enabled = $1, recipe_auto_deduct_enabled = $2 where id = $3', [tracking, auto, tenantA]);
        const before = await snapshot(orderId);
        await asUser(kitchen, () => deduct(orderId));
        assert.deepEqual(await snapshot(orderId), before);
      }
      await db.query('update restaurants set inventory_tracking_enabled = true, recipe_auto_deduct_enabled = true where id = $1', [tenantA]);
    });

    await t.test('orders outside kitchen processing states return untouched', async () => {
      const orderId = await createOrder('placed');
      const before = await snapshot(orderId);
      await asUser(kitchen, () => deduct(orderId));
      assert.deepEqual(await snapshot(orderId), before);
    });

    await t.test('no recipe mappings is a completed no-op and never retroactively deducts', async () => {
      const id = '60000000-0000-0000-0000-000000000099';
      await db.query("insert into menu_items (id, restaurant_id, category_id, name, price) values ($1, $2, $3, 'Unmapped', 1)", [id, tenantA, categoryA]);
      const orderId = await createOrder('preparing', [[id, 2]]);
      const before = await snapshot(orderId);
      await asUser(kitchen, () => deduct(orderId));
      const after = await snapshot(orderId);
      assert.equal(after.order.inventory_deducted, true);
      assert.deepEqual(after.stock, before.stock);
      assert.deepEqual(after.logs, before.logs);
      await db.query('insert into menu_item_recipes (restaurant_id, menu_item_id, inventory_item_id, quantity_required) values ($1,$2,$3,9)', [tenantA, id, rice]);
      await asUser(kitchen, () => deduct(orderId));
      assert.deepEqual(await snapshot(orderId), after);
    });

    await t.test('unauthorized staff and other tenants cannot trigger deduction', async () => {
      const orderId = await createOrder();
      const before = await snapshot(orderId);
      for (const user of [waiter, outsider]) await assert.rejects(asUser(user, () => deduct(orderId)), { code: '42501' });
      await db.exec('set role anon');
      try { await assert.rejects(deduct(orderId), { code: '42501' }); } finally { await db.exec('reset role'); }
      assert.deepEqual(await snapshot(orderId), before);
    });

    await t.test('audit failure rolls back all ingredient changes and the idempotency flag', async () => {
      const orderId = await createOrder();
      await db.exec(`create function fail_auto_log() returns trigger language plpgsql as $$
        begin if new.change_type = 'auto_deduct' then raise exception 'Simulated log failure'; end if; return new; end;
        $$; create trigger test_auto_log_failure before insert on inventory_logs for each row execute function fail_auto_log();`);
      const before = await snapshot(orderId);
      await assert.rejects(asUser(kitchen, () => deduct(orderId)), /Simulated log failure/);
      assert.deepEqual(await snapshot(orderId), before);
      await db.exec('drop trigger test_auto_log_failure on inventory_logs');
    });

    await t.test('low-stock count is tenant-scoped and feature-aware', async () => {
      await db.query('update inventory_items set current_stock = case when id = $1 then 0 else 10 end where restaurant_id = $2', [rice, tenantA]);
      assert.equal((await asUser(manager, () => db.query('select public.get_low_stock_count($1) as count', [tenantA]))).rows[0].count, 1);
      await db.query('update restaurants set inventory_tracking_enabled = false where id = $1', [tenantA]);
      assert.equal((await asUser(manager, () => db.query('select public.get_low_stock_count($1) as count', [tenantA]))).rows[0].count, 0);
      await assert.rejects(asUser(outsider, () => db.query('select public.get_low_stock_count($1)', [tenantA])), { code: '42501' });
    });
  } finally {
    await db.close();
  }
});
