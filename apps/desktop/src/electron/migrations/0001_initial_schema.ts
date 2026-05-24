import type Database from 'better-sqlite3'
import { type Migration, ensureColumn } from './runner'

export const migration_0001: Migration = {
  id: 1,
  name: '0001_initial_schema',
  up(db: Database.Database) {
    // ── Core tables ─────────────────────────────────────────────────────────

    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id                   TEXT    PRIMARY KEY,
        business_id          TEXT    NOT NULL,
        name                 TEXT    NOT NULL,
        description          TEXT,
        sku                  TEXT,
        barcode              TEXT,
        price                REAL    NOT NULL,
        cost_price           REAL,
        stock_quantity       INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold  INTEGER NOT NULL DEFAULT 5,
        unit                 TEXT    NOT NULL DEFAULT 'qty',
        category_id          TEXT,
        image_url            TEXT,
        is_active            INTEGER NOT NULL DEFAULT 1,
        is_deleted           INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT    NOT NULL,
        updated_at           TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS product_categories (
        id          TEXT    PRIMARY KEY,
        business_id TEXT    NOT NULL,
        name        TEXT    NOT NULL,
        is_active   INTEGER NOT NULL DEFAULT 1,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS unit_of_measures (
        id           TEXT    PRIMARY KEY,
        name         TEXT    NOT NULL,
        abbreviation TEXT,
        business_id  TEXT,
        type         TEXT,
        is_active    INTEGER NOT NULL DEFAULT 1,
        is_deleted   INTEGER NOT NULL DEFAULT 0,
        is_default   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id             TEXT    PRIMARY KEY,
        business_id    TEXT    NOT NULL,
        type           TEXT    NOT NULL,
        name           TEXT    NOT NULL,
        phone          TEXT,
        phone_alt      TEXT,
        address        TEXT,
        notes          TEXT,
        is_active      INTEGER NOT NULL DEFAULT 1,
        created_by_id  TEXT,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sales (
        id                   TEXT    PRIMARY KEY,
        business_id          TEXT    NOT NULL,
        client_id            TEXT    NOT NULL,
        cashier_id           TEXT    NOT NULL,
        cashier_name         TEXT,
        device_id            TEXT,
        sale_number          TEXT    NOT NULL,
        receipt_number       TEXT    NOT NULL,
        subtotal             REAL    NOT NULL,
        total_amount         REAL    NOT NULL,
        discount_amount      REAL    NOT NULL DEFAULT 0,
        charges_amount       REAL    NOT NULL DEFAULT 0,
        tax_amount           REAL    NOT NULL DEFAULT 0,
        net_amount           REAL    NOT NULL,
        amount_paid          REAL    NOT NULL,
        credit_amount        REAL    NOT NULL DEFAULT 0,
        change_given         REAL    NOT NULL DEFAULT 0,
        payment_method       TEXT,
        momo_reference       TEXT,
        customer_id          TEXT,
        customer_name        TEXT,
        customer_phone       TEXT,
        notes                TEXT,
        price_drift_warning  INTEGER NOT NULL DEFAULT 0,
        currency             TEXT    NOT NULL DEFAULT 'XAF',
        sale_date            TEXT    NOT NULL,
        sold_at              TEXT    NOT NULL,
        synced_at            TEXT,
        voided_at            TEXT,
        voided_by            TEXT,
        void_reason          TEXT,
        status               TEXT    NOT NULL DEFAULT 'COMPLETED',
        is_deleted           INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT    NOT NULL,
        updated_at           TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id            TEXT  PRIMARY KEY,
        sale_id       TEXT  NOT NULL,
        business_id   TEXT  NOT NULL,
        product_id    TEXT  NOT NULL,
        product_name  TEXT  NOT NULL,
        product_sku   TEXT,
        unit_of_measure TEXT,
        quantity      REAL  NOT NULL,
        unit_price    REAL  NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        line_total    REAL  NOT NULL,
        total_price   REAL  NOT NULL,
        cost_price    REAL,
        is_deleted    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT  NOT NULL,
        updated_at    TEXT  NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      );

      CREATE TABLE IF NOT EXISTS sale_payments (
        id                     TEXT PRIMARY KEY,
        sale_id                TEXT NOT NULL,
        business_id            TEXT NOT NULL,
        method                 TEXT NOT NULL,
        amount                 REAL NOT NULL,
        mobile_money_reference TEXT,
        created_at             TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      );

      CREATE TABLE IF NOT EXISTS sale_number_sequences (
        business_id    TEXT    NOT NULL,
        sale_date      TEXT    NOT NULL,
        last_sequence  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (business_id, sale_date)
      );

      CREATE TABLE IF NOT EXISTS expense_categories (
        id          TEXT    PRIMARY KEY,
        business_id TEXT,
        name        TEXT    NOT NULL,
        slug        TEXT,
        color       TEXT,
        icon        TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   INTEGER NOT NULL DEFAULT 1,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id              TEXT    PRIMARY KEY,
        business_id     TEXT    NOT NULL,
        recorded_by_id  TEXT    NOT NULL,
        category        TEXT    NOT NULL,
        description     TEXT    NOT NULL,
        amount          REAL    NOT NULL,
        payment_method  TEXT    NOT NULL,
        receipt_url     TEXT,
        date            TEXT    NOT NULL,
        is_deleted      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT    NOT NULL,
        updated_at      TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_levels (
        id                  TEXT PRIMARY KEY,
        business_id         TEXT NOT NULL,
        product_id          TEXT NOT NULL UNIQUE,
        quantity            REAL NOT NULL DEFAULT 0,
        low_stock_threshold REAL,
        reorder_point       REAL,
        last_restock_at     TEXT,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id               TEXT PRIMARY KEY,
        business_id      TEXT NOT NULL,
        product_id       TEXT NOT NULL,
        type             TEXT NOT NULL,
        quantity_change  REAL NOT NULL,
        quantity_before  REAL NOT NULL,
        quantity_after   REAL NOT NULL,
        reference_type   TEXT,
        reference_id     TEXT,
        notes            TEXT,
        performed_by_id  TEXT,
        performed_by_name TEXT,
        created_at       TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS restock_records (
        id               TEXT PRIMARY KEY,
        business_id      TEXT NOT NULL,
        reference_number TEXT,
        supplier_id      TEXT,
        supplier_name    TEXT,
        total_amount     REAL,
        total_cost       REAL,
        amount_paid      REAL,
        credit_amount    REAL NOT NULL DEFAULT 0,
        notes            TEXT,
        performed_by_id  TEXT,
        created_at       TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS restock_items (
        id                TEXT PRIMARY KEY,
        restock_record_id TEXT NOT NULL,
        product_id        TEXT NOT NULL,
        quantity          REAL NOT NULL,
        unit_cost         REAL,
        new_quantity      REAL NOT NULL,
        created_at        TEXT NOT NULL,
        FOREIGN KEY (restock_record_id) REFERENCES restock_records(id)
      );

      CREATE TABLE IF NOT EXISTS restock_payments (
        id                     TEXT PRIMARY KEY,
        restock_record_id      TEXT NOT NULL,
        business_id            TEXT NOT NULL,
        method                 TEXT NOT NULL,
        amount                 REAL NOT NULL,
        mobile_money_reference TEXT,
        created_at             TEXT NOT NULL,
        FOREIGN KEY (restock_record_id) REFERENCES restock_records(id)
      );

      CREATE TABLE IF NOT EXISTS debts (
        id                  TEXT PRIMARY KEY,
        business_id         TEXT NOT NULL,
        contact_id          TEXT NOT NULL,
        direction           TEXT NOT NULL,
        source_type         TEXT NOT NULL,
        source_id           TEXT NOT NULL,
        source_reference    TEXT NOT NULL,
        original_amount     REAL NOT NULL,
        status              TEXT NOT NULL DEFAULT 'OUTSTANDING',
        due_date            TEXT,
        notes               TEXT,
        created_at          TEXT NOT NULL,
        settled_at          TEXT,
        written_off_at      TEXT,
        written_off_by      TEXT,
        written_off_reason  TEXT
      );

      CREATE TABLE IF NOT EXISTS debt_payments (
        id                     TEXT PRIMARY KEY,
        business_id            TEXT NOT NULL,
        debt_id                TEXT NOT NULL,
        amount                 REAL NOT NULL,
        method                 TEXT NOT NULL,
        mobile_money_reference TEXT,
        payment_date           TEXT NOT NULL,
        notes                  TEXT,
        recorded_by            TEXT NOT NULL,
        created_at             TEXT NOT NULL,
        FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_log (
        id             TEXT    PRIMARY KEY,
        device_id      TEXT    NOT NULL,
        synced_at      TEXT    NOT NULL,
        pushed_count   INTEGER DEFAULT 0,
        pulled_count   INTEGER DEFAULT 0,
        conflict_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id                TEXT    PRIMARY KEY,
        entity            TEXT    NOT NULL,
        record_id         TEXT    NOT NULL,
        operation         TEXT    NOT NULL DEFAULT 'UPSERT',
        payload           TEXT,
        status            TEXT    NOT NULL DEFAULT 'pending',
        attempt_count     INTEGER NOT NULL DEFAULT 0,
        last_attempt_at   TEXT,
        last_error        TEXT,
        last_error_details TEXT,
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plan_state_cache (
        business_id             TEXT    PRIMARY KEY,
        selected_plan           TEXT    NOT NULL,
        effective_plan          TEXT    NOT NULL,
        subscription_status     TEXT    NOT NULL,
        trial_started_at        TEXT,
        trial_ends_at           TEXT,
        current_period_start    TEXT,
        current_period_end      TEXT,
        cancel_at_period_end    INTEGER NOT NULL DEFAULT 0,
        entitlement_valid       INTEGER NOT NULL DEFAULT 1,
        entitlement_expires_at  TEXT,
        auth_permissions_json   TEXT    NOT NULL,
        quotas_json             TEXT    NOT NULL,
        quota_usage_json        TEXT    NOT NULL,
        fetched_at              TEXT    NOT NULL,
        last_validated_at       TEXT    NOT NULL,
        stale_after             TEXT    NOT NULL,
        updated_at              TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    // ── Additive columns (safe on existing databases) ────────────────────────

    ensureColumn(db, 'products', 'currency', "currency TEXT NOT NULL DEFAULT 'XAF'")
    ensureColumn(db, 'products', 'tax_rate', 'tax_rate REAL NOT NULL DEFAULT 0')
    ensureColumn(db, 'products', 'is_service', 'is_service INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'products', 'track_inventory', 'track_inventory INTEGER NOT NULL DEFAULT 1')
    ensureColumn(db, 'products', 'slug', 'slug TEXT')
    ensureColumn(db, 'products', 'barcode_type', 'barcode_type TEXT')
    ensureColumn(db, 'products', 'is_barcode_generated', 'is_barcode_generated INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'products', 'reorder_point', 'reorder_point REAL')
    ensureColumn(db, 'products', 'unit_of_measure_id', 'unit_of_measure_id TEXT')
    ensureColumn(db, 'products', 'created_by_id', 'created_by_id TEXT')

    ensureColumn(db, 'product_categories', 'is_active', 'is_active INTEGER NOT NULL DEFAULT 1')
    ensureColumn(db, 'product_categories', 'slug', 'slug TEXT')
    ensureColumn(db, 'product_categories', 'color', 'color TEXT')
    ensureColumn(db, 'product_categories', 'icon', 'icon TEXT')
    ensureColumn(db, 'product_categories', 'image_url', 'image_url TEXT')
    ensureColumn(db, 'product_categories', 'sort_order', 'sort_order INTEGER')

    ensureColumn(db, 'unit_of_measures', 'is_active', 'is_active INTEGER NOT NULL DEFAULT 1')
    ensureColumn(db, 'unit_of_measures', 'is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0')

    ensureColumn(db, 'contacts', 'phone_alt', 'phone_alt TEXT')
    ensureColumn(db, 'contacts', 'address', 'address TEXT')
    ensureColumn(db, 'contacts', 'notes', 'notes TEXT')
    ensureColumn(db, 'contacts', 'is_active', 'is_active INTEGER NOT NULL DEFAULT 1')
    ensureColumn(db, 'contacts', 'created_by_id', 'created_by_id TEXT')

    ensureColumn(db, 'sales', 'client_id', 'client_id TEXT')
    ensureColumn(db, 'sales', 'cashier_name', 'cashier_name TEXT')
    ensureColumn(db, 'sales', 'sale_number', 'sale_number TEXT')
    ensureColumn(db, 'sales', 'subtotal', 'subtotal REAL')
    ensureColumn(db, 'sales', 'charges_amount', 'charges_amount REAL NOT NULL DEFAULT 0')
    ensureColumn(db, 'sales', 'sale_date', 'sale_date TEXT')
    ensureColumn(db, 'sales', 'sold_at', 'sold_at TEXT')
    ensureColumn(db, 'sales', 'amount_paid', 'amount_paid REAL')
    ensureColumn(db, 'sales', 'credit_amount', 'credit_amount REAL NOT NULL DEFAULT 0')
    ensureColumn(db, 'sales', 'change_given', 'change_given REAL')
    ensureColumn(db, 'sales', 'customer_id', 'customer_id TEXT')
    ensureColumn(db, 'sales', 'customer_name', 'customer_name TEXT')
    ensureColumn(db, 'sales', 'customer_phone', 'customer_phone TEXT')
    ensureColumn(db, 'sales', 'price_drift_warning', 'price_drift_warning INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'sales', 'currency', "currency TEXT NOT NULL DEFAULT 'XAF'")
    ensureColumn(db, 'sales', 'synced_at', 'synced_at TEXT')
    ensureColumn(db, 'sales', 'voided_at', 'voided_at TEXT')
    ensureColumn(db, 'sales', 'voided_by', 'voided_by TEXT')
    ensureColumn(db, 'sales', 'void_reason', 'void_reason TEXT')

    ensureColumn(db, 'sale_items', 'business_id', 'business_id TEXT')
    ensureColumn(db, 'sale_items', 'product_sku', 'product_sku TEXT')
    ensureColumn(db, 'sale_items', 'unit_of_measure', 'unit_of_measure TEXT')
    ensureColumn(db, 'sale_items', 'discount_amount', 'discount_amount REAL NOT NULL DEFAULT 0')
    ensureColumn(db, 'sale_items', 'line_total', 'line_total REAL')
    ensureColumn(db, 'sale_items', 'cost_price', 'cost_price REAL')

    ensureColumn(db, 'expense_categories', 'slug', 'slug TEXT')
    ensureColumn(db, 'expense_categories', 'color', 'color TEXT')
    ensureColumn(db, 'expense_categories', 'icon', 'icon TEXT')
    ensureColumn(db, 'expense_categories', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'expense_categories', 'is_active', 'is_active INTEGER NOT NULL DEFAULT 1')
    ensureColumn(db, 'expense_categories', 'is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'expenses', 'category_id', 'category_id TEXT')
    ensureColumn(db, 'expenses', 'currency', "currency TEXT NOT NULL DEFAULT 'XAF'")
    ensureColumn(db, 'expenses', 'vendor', 'vendor TEXT')
    ensureColumn(db, 'expenses', 'notes', 'notes TEXT')
    ensureColumn(db, 'expenses', 'is_recurring', 'is_recurring INTEGER NOT NULL DEFAULT 0')

    ensureColumn(db, 'restock_records', 'supplier_id', 'supplier_id TEXT')
    ensureColumn(db, 'restock_records', 'total_amount', 'total_amount REAL')
    ensureColumn(db, 'restock_records', 'amount_paid', 'amount_paid REAL')
    ensureColumn(db, 'restock_records', 'credit_amount', 'credit_amount REAL NOT NULL DEFAULT 0')

    ensureColumn(db, 'sync_outbox', 'last_error_details', 'last_error_details TEXT')

    // ── Indexes ───────────────────────────────────────────────────────────────

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_products_business              ON products(business_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_contacts_business              ON contacts(business_id, type, is_active);
      CREATE INDEX IF NOT EXISTS idx_sales_business                 ON sales(business_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_sales_business_client         ON sales(business_id, client_id);
      CREATE INDEX IF NOT EXISTS idx_sales_business_sale_number    ON sales(business_id, sale_number);
      CREATE INDEX IF NOT EXISTS idx_expenses_business             ON expenses(business_id, date);
      CREATE INDEX IF NOT EXISTS idx_product_categories_business   ON product_categories(business_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_inventory_levels_business     ON inventory_levels(business_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_business  ON inventory_movements(business_id, product_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_sale_items_business           ON sale_items(business_id, sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_payments_business        ON sale_payments(business_id, sale_id);
      CREATE INDEX IF NOT EXISTS idx_expense_categories_business   ON expense_categories(business_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_expenses_business_category    ON expenses(business_id, category_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_restock_payments_business     ON restock_payments(business_id, restock_record_id);
      CREATE INDEX IF NOT EXISTS idx_debts_business_status         ON debts(business_id, status);
      CREATE INDEX IF NOT EXISTS idx_debts_business_direction      ON debts(business_id, direction);
      CREATE INDEX IF NOT EXISTS idx_debts_business_contact        ON debts(business_id, contact_id);
      CREATE INDEX IF NOT EXISTS idx_debts_source_lookup           ON debts(source_type, source_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_business_source_direction
        ON debts(business_id, source_type, source_id, direction);
      CREATE INDEX IF NOT EXISTS idx_debt_payments_business        ON debt_payments(business_id);
      CREATE INDEX IF NOT EXISTS idx_debt_payments_debt            ON debt_payments(debt_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_outbox_entity_record ON sync_outbox(entity, record_id);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created    ON sync_outbox(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_plan_state_cache_stale_after  ON plan_state_cache(stale_after);
    `)

    // ── Seeds ─────────────────────────────────────────────────────────────────

    const now = new Date().toISOString()

    const insertUom = db.prepare(`
      INSERT INTO unit_of_measures (id, name, abbreviation, business_id, type, is_active, is_deleted, is_default, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, 1, 0, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name         = excluded.name,
        abbreviation = excluded.abbreviation,
        type         = excluded.type,
        is_active    = excluded.is_active,
        is_deleted   = excluded.is_deleted,
        is_default   = excluded.is_default,
        updated_at   = excluded.updated_at
    `)

    const seedUoms = db.transaction(() => {
      for (const uom of [
        { id: 'uom-piece',    name: 'Piece',     abbreviation: 'pcs', type: 'QUANTITY', isDefault: 1 },
        { id: 'uom-kilogram', name: 'Kilogram',  abbreviation: 'kg',  type: 'WEIGHT',   isDefault: 0 },
        { id: 'uom-liter',    name: 'Liter',     abbreviation: 'L',   type: 'VOLUME',   isDefault: 0 },
        { id: 'uom-meter',    name: 'Meter',     abbreviation: 'm',   type: 'LENGTH',   isDefault: 0 },
        { id: 'uom-service',  name: 'Service',   abbreviation: 'svc', type: 'CUSTOM',   isDefault: 0 },
      ]) {
        insertUom.run(uom.id, uom.name, uom.abbreviation, uom.type, uom.isDefault, now, now)
      }
    })
    seedUoms()

    const insertExpCat = db.prepare(`
      INSERT INTO expense_categories (id, business_id, name, slug, color, icon, sort_order, is_active, is_deleted, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?, NULL, ?, 1, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name       = excluded.name,
        slug       = excluded.slug,
        color      = excluded.color,
        sort_order = excluded.sort_order,
        is_active  = excluded.is_active,
        is_deleted = excluded.is_deleted,
        updated_at = excluded.updated_at
    `)

    const seedExpCats = db.transaction(() => {
      for (const cat of [
        { id: '11111111-1111-4111-8111-111111111111', name: 'Loyer',              slug: 'loyer',          color: '#378ADD', sortOrder: 1 },
        { id: '22222222-2222-4222-8222-222222222222', name: 'Salaires',           slug: 'salaires',       color: '#1D9E75', sortOrder: 2 },
        { id: '33333333-3333-4333-8333-333333333333', name: 'Electricite & Eau',  slug: 'electricite-eau',color: '#EF9F27', sortOrder: 3 },
        { id: '44444444-4444-4444-8444-444444444444', name: 'Transport',          slug: 'transport',      color: '#D85A30', sortOrder: 4 },
        { id: '55555555-5555-4555-8555-555555555555', name: 'Entretien',          slug: 'entretien',      color: '#7F77DD', sortOrder: 5 },
        { id: '66666666-6666-4666-8666-666666666666', name: 'Divers',             slug: 'divers',         color: '#888780', sortOrder: 6 },
      ]) {
        insertExpCat.run(cat.id, cat.name, cat.slug, cat.color, cat.sortOrder, now, now)
      }
    })
    seedExpCats()

    // ── Backfills (idempotent data migrations) ────────────────────────────────

    db.exec(`
      -- Normalise unit_of_measure references on products
      UPDATE unit_of_measures
      SET
        name         = CASE WHEN id = 'uom-piece' THEN 'Piece' ELSE name END,
        abbreviation = CASE WHEN id = 'uom-piece' THEN 'pcs'   ELSE abbreviation END
      WHERE id = 'uom-piece';

      UPDATE products
      SET unit_of_measure_id = CASE
        WHEN lower(COALESCE(unit_of_measure_id, '')) IN ('uom-piece', 'qty', 'piece', 'pcs', 'pc', 'quantity') THEN 'uom-piece'
        WHEN lower(COALESCE(unit_of_measure_id, '')) IN ('uom-kilogram', 'kilogram', 'kg')                     THEN 'uom-kilogram'
        WHEN lower(COALESCE(unit_of_measure_id, '')) IN ('uom-liter', 'liter', 'litre', 'l')                   THEN 'uom-liter'
        WHEN lower(COALESCE(unit_of_measure_id, '')) IN ('uom-meter', 'meter', 'metre', 'm')                   THEN 'uom-meter'
        WHEN lower(COALESCE(unit_of_measure_id, '')) IN ('uom-service', 'service', 'svc')                      THEN 'uom-service'
        WHEN unit_of_measure_id IN (
          SELECT id FROM unit_of_measures WHERE business_id IS NULL AND lower(type) = 'quantity'
            AND (lower(name) IN ('piece','qty','quantity') OR lower(COALESCE(abbreviation,'')) IN ('pcs','qty','pc'))
        ) THEN 'uom-piece'
        WHEN unit_of_measure_id IN (
          SELECT id FROM unit_of_measures WHERE business_id IS NULL AND lower(type) = 'weight'
            AND (lower(name) = 'kilogram' OR lower(COALESCE(abbreviation,'')) = 'kg')
        ) THEN 'uom-kilogram'
        WHEN unit_of_measure_id IN (
          SELECT id FROM unit_of_measures WHERE business_id IS NULL AND lower(type) = 'volume'
            AND (lower(name) IN ('liter','litre') OR lower(COALESCE(abbreviation,'')) = 'l')
        ) THEN 'uom-liter'
        WHEN unit_of_measure_id IN (
          SELECT id FROM unit_of_measures WHERE business_id IS NULL AND lower(type) = 'length'
            AND (lower(name) IN ('meter','metre') OR lower(COALESCE(abbreviation,'')) = 'm')
        ) THEN 'uom-meter'
        WHEN unit_of_measure_id IN (
          SELECT id FROM unit_of_measures WHERE business_id IS NULL
            AND (lower(name) = 'service' OR lower(COALESCE(abbreviation,'')) = 'svc')
        ) THEN 'uom-service'
        WHEN unit_of_measure_id IS NULL OR unit_of_measure_id = '' THEN CASE
          WHEN lower(COALESCE(unit,'')) IN ('kilogram','kg')        THEN 'uom-kilogram'
          WHEN lower(COALESCE(unit,'')) IN ('liter','litre','l')    THEN 'uom-liter'
          WHEN lower(COALESCE(unit,'')) IN ('meter','metre','m')    THEN 'uom-meter'
          WHEN lower(COALESCE(unit,'')) IN ('service','svc') OR COALESCE(is_service,0) = 1 THEN 'uom-service'
          ELSE 'uom-piece'
        END
        ELSE unit_of_measure_id
      END;

      -- Normalise sale rows and backfill sale_payments / sale_number_sequences
      UPDATE sales SET
        client_id       = COALESCE(NULLIF(client_id,''), id),
        sale_number     = COALESCE(NULLIF(sale_number,''), NULLIF(receipt_number,''), id),
        receipt_number  = COALESCE(NULLIF(receipt_number,''), NULLIF(sale_number,''), id),
        subtotal        = COALESCE(subtotal, total_amount, 0),
        charges_amount  = COALESCE(charges_amount, 0),
        amount_paid     = COALESCE(amount_paid, net_amount, total_amount, 0),
        credit_amount   = COALESCE(credit_amount, max(COALESCE(total_amount,net_amount,0) - COALESCE(amount_paid,net_amount,total_amount,0), 0)),
        change_given    = COALESCE(change_given, 0),
        sale_date       = COALESCE(NULLIF(sale_date,''), substr(COALESCE(sold_at,created_at),1,10)),
        sold_at         = COALESCE(NULLIF(sold_at,''), created_at),
        currency        = COALESCE(NULLIF(currency,''), 'XAF'),
        price_drift_warning = COALESCE(price_drift_warning, 0);

      UPDATE sale_items SET
        business_id = COALESCE(NULLIF(business_id,''), (SELECT s.business_id FROM sales s WHERE s.id = sale_items.sale_id)),
        line_total  = COALESCE(line_total, total_price, 0),
        total_price = COALESCE(total_price, line_total, 0);

      INSERT INTO sale_payments (id, sale_id, business_id, method, amount, mobile_money_reference, created_at)
      SELECT
        s.id || '-payment', s.id, s.business_id,
        COALESCE(NULLIF(s.payment_method,''), 'CASH'),
        COALESCE(s.amount_paid, s.net_amount, s.total_amount, 0),
        s.momo_reference, s.created_at
      FROM sales s
      WHERE NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id);

      INSERT INTO sale_number_sequences (business_id, sale_date, last_sequence)
      SELECT
        s.business_id, s.sale_date,
        COALESCE(MAX(CASE
          WHEN COALESCE(NULLIF(s.sale_number,''), NULLIF(s.receipt_number,'')) LIKE 'VTE-' || replace(s.sale_date,'-','') || '-%'
            THEN CAST(substr(COALESCE(NULLIF(s.sale_number,''), NULLIF(s.receipt_number,'')), 14) AS INTEGER)
          ELSE 0 END), 0) AS last_sequence
      FROM sales s
      WHERE s.business_id IS NOT NULL AND s.sale_date IS NOT NULL
      GROUP BY s.business_id, s.sale_date
      ON CONFLICT(business_id, sale_date) DO UPDATE SET
        last_sequence = CASE
          WHEN excluded.last_sequence > sale_number_sequences.last_sequence THEN excluded.last_sequence
          ELSE sale_number_sequences.last_sequence
        END;

      -- Normalise expense rows and map legacy text categories to UUIDs
      UPDATE expenses SET
        currency     = COALESCE(NULLIF(currency,''), 'XAF'),
        is_recurring = COALESCE(is_recurring, 0);

      UPDATE expenses SET category_id = CASE
        WHEN lower(COALESCE(category,'')) IN ('loyer','rent')                                         THEN '11111111-1111-4111-8111-111111111111'
        WHEN lower(COALESCE(category,'')) IN ('salaires','salaire','salary','wages')                  THEN '22222222-2222-4222-8222-222222222222'
        WHEN lower(COALESCE(category,'')) IN ('electricite & eau','electricite / eau','electricite-eau','electricite eau','utilities','utility','water','eau','electricite')
                                                                                                      THEN '33333333-3333-4333-8333-333333333333'
        WHEN lower(COALESCE(category,'')) IN ('transport','livraison','delivery')                     THEN '44444444-4444-4444-8444-444444444444'
        WHEN lower(COALESCE(category,'')) IN ('entretien','maintenance','repair','reparation')        THEN '55555555-5555-4555-8555-555555555555'
        ELSE '66666666-6666-4666-8666-666666666666'
      END
      WHERE category_id IS NULL OR category_id = '';

      -- Backfill debt ledger from sales and restock_records
      INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at, settled_at, written_off_at, written_off_by, written_off_reason)
      SELECT
        'debt:sale:' || s.id, s.business_id, s.customer_id, 'RECEIVABLE', 'SALE', s.id,
        COALESCE(NULLIF(TRIM(s.sale_number),''), NULLIF(TRIM(s.receipt_number),''), s.id),
        max(COALESCE(s.credit_amount, COALESCE(s.total_amount,0) - COALESCE(s.amount_paid,0)), 0),
        CASE WHEN s.status = 'VOIDED' THEN 'WRITTEN_OFF' ELSE 'OUTSTANDING' END,
        NULL, NULLIF(TRIM(s.notes),''), COALESCE(NULLIF(s.sold_at,''), s.created_at), NULL,
        CASE WHEN s.status = 'VOIDED' THEN COALESCE(NULLIF(s.voided_at,''), s.updated_at, s.created_at) ELSE NULL END,
        CASE WHEN s.status = 'VOIDED' THEN NULLIF(TRIM(s.voided_by),'') ELSE NULL END,
        CASE WHEN s.status = 'VOIDED' THEN COALESCE(NULLIF(TRIM(s.void_reason),''), 'Sale voided') ELSE NULL END
      FROM sales s
      WHERE s.business_id IS NOT NULL AND s.customer_id IS NOT NULL AND length(TRIM(s.customer_id)) > 0
        AND max(COALESCE(s.credit_amount, COALESCE(s.total_amount,0) - COALESCE(s.amount_paid,0)), 0) > 0
      ON CONFLICT(business_id, source_type, source_id, direction) DO UPDATE SET
        contact_id       = excluded.contact_id,
        source_reference = excluded.source_reference,
        original_amount  = excluded.original_amount,
        notes            = excluded.notes,
        created_at       = excluded.created_at,
        written_off_at   = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_at   ELSE debts.written_off_at   END,
        written_off_by   = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_by   ELSE debts.written_off_by   END,
        written_off_reason = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_reason ELSE debts.written_off_reason END;

      INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at, settled_at, written_off_at, written_off_by, written_off_reason)
      SELECT
        'debt:restock:' || rr.id, rr.business_id, rr.supplier_id, 'PAYABLE', 'RESTOCK', rr.id,
        COALESCE(NULLIF(TRIM(rr.reference_number),''), rr.id),
        max(COALESCE(rr.credit_amount, COALESCE(rr.total_amount,0) - COALESCE(rr.amount_paid,0)), 0),
        'OUTSTANDING', NULL, NULLIF(TRIM(rr.notes),''), rr.created_at, NULL, NULL, NULL, NULL
      FROM restock_records rr
      WHERE rr.business_id IS NOT NULL AND rr.supplier_id IS NOT NULL AND length(TRIM(rr.supplier_id)) > 0
        AND max(COALESCE(rr.credit_amount, COALESCE(rr.total_amount,0) - COALESCE(rr.amount_paid,0)), 0) > 0
      ON CONFLICT(business_id, source_type, source_id, direction) DO UPDATE SET
        contact_id       = excluded.contact_id,
        source_reference = excluded.source_reference,
        original_amount  = excluded.original_amount,
        notes            = excluded.notes,
        created_at       = excluded.created_at;

      UPDATE debts SET
        status    = CASE
          WHEN status = 'WRITTEN_OFF' THEN status
          WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN 'SETTLED'
          WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) > 0              THEN 'PARTIALLY_PAID'
          ELSE 'OUTSTANDING'
        END,
        settled_at = CASE
          WHEN status = 'WRITTEN_OFF' THEN settled_at
          WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN COALESCE(settled_at, created_at)
          ELSE NULL
        END
      WHERE status <> 'WRITTEN_OFF';
    `)

    // ── Debt ledger triggers ──────────────────────────────────────────────────
    // DROP + CREATE ensures the trigger definition is always up to date.

    db.exec(`
      DROP TRIGGER IF EXISTS trg_sales_source_debt_after_insert;
      DROP TRIGGER IF EXISTS trg_sales_source_debt_after_update;
      DROP TRIGGER IF EXISTS trg_sales_source_debt_write_off;
      DROP TRIGGER IF EXISTS trg_restock_source_debt_after_insert;
      DROP TRIGGER IF EXISTS trg_restock_source_debt_after_update;
      DROP TRIGGER IF EXISTS trg_debt_payments_after_insert;
      DROP TRIGGER IF EXISTS trg_debt_payments_after_delete;

      CREATE TRIGGER trg_sales_source_debt_after_insert
      AFTER INSERT ON sales
      WHEN NEW.customer_id IS NOT NULL
        AND length(TRIM(NEW.customer_id)) > 0
        AND max(COALESCE(NEW.credit_amount, COALESCE(NEW.total_amount,0) - COALESCE(NEW.amount_paid,0)), 0) > 0
      BEGIN
        INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at, settled_at, written_off_at, written_off_by, written_off_reason)
        VALUES (
          'debt:sale:' || NEW.id, NEW.business_id, NEW.customer_id, 'RECEIVABLE', 'SALE', NEW.id,
          COALESCE(NULLIF(TRIM(NEW.sale_number),''), NULLIF(TRIM(NEW.receipt_number),''), NEW.id),
          max(COALESCE(NEW.credit_amount, COALESCE(NEW.total_amount,0) - COALESCE(NEW.amount_paid,0)), 0),
          CASE WHEN NEW.status = 'VOIDED' THEN 'WRITTEN_OFF' ELSE 'OUTSTANDING' END,
          NULL, NULLIF(TRIM(NEW.notes),''), COALESCE(NULLIF(NEW.sold_at,''), NEW.created_at), NULL,
          CASE WHEN NEW.status = 'VOIDED' THEN COALESCE(NULLIF(NEW.voided_at,''), NEW.updated_at, NEW.created_at) ELSE NULL END,
          CASE WHEN NEW.status = 'VOIDED' THEN NULLIF(TRIM(NEW.voided_by),'') ELSE NULL END,
          CASE WHEN NEW.status = 'VOIDED' THEN COALESCE(NULLIF(TRIM(NEW.void_reason),''), 'Sale voided') ELSE NULL END
        )
        ON CONFLICT(business_id, source_type, source_id, direction) DO UPDATE SET
          contact_id         = excluded.contact_id,
          source_reference   = excluded.source_reference,
          original_amount    = excluded.original_amount,
          notes              = excluded.notes,
          created_at         = excluded.created_at,
          written_off_at     = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_at   ELSE debts.written_off_at   END,
          written_off_by     = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_by   ELSE debts.written_off_by   END,
          written_off_reason = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_reason ELSE debts.written_off_reason END;

        UPDATE debts SET
          status     = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN status
            WHEN NEW.status = 'VOIDED' THEN 'WRITTEN_OFF'
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN 'SETTLED'
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) > 0              THEN 'PARTIALLY_PAID'
            ELSE 'OUTSTANDING' END,
          settled_at = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN settled_at
            WHEN NEW.status = 'VOIDED' THEN NULL
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN COALESCE(settled_at, created_at)
            ELSE NULL END,
          written_off_at = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN written_off_at
            WHEN NEW.status = 'VOIDED' THEN COALESCE(NULLIF(NEW.voided_at,''), NEW.updated_at, NEW.created_at)
            ELSE NULL END,
          written_off_by = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN written_off_by
            WHEN NEW.status = 'VOIDED' THEN NULLIF(TRIM(NEW.voided_by),'')
            ELSE NULL END,
          written_off_reason = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN written_off_reason
            WHEN NEW.status = 'VOIDED' THEN COALESCE(NULLIF(TRIM(NEW.void_reason),''), 'Sale voided')
            ELSE NULL END
        WHERE business_id = NEW.business_id AND source_type = 'SALE' AND source_id = NEW.id AND direction = 'RECEIVABLE';
      END;

      CREATE TRIGGER trg_sales_source_debt_after_update
      AFTER UPDATE ON sales
      WHEN NEW.customer_id IS NOT NULL
        AND length(TRIM(NEW.customer_id)) > 0
        AND max(COALESCE(NEW.credit_amount, COALESCE(NEW.total_amount,0) - COALESCE(NEW.amount_paid,0)), 0) > 0
      BEGIN
        INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at, settled_at, written_off_at, written_off_by, written_off_reason)
        VALUES (
          'debt:sale:' || NEW.id, NEW.business_id, NEW.customer_id, 'RECEIVABLE', 'SALE', NEW.id,
          COALESCE(NULLIF(TRIM(NEW.sale_number),''), NULLIF(TRIM(NEW.receipt_number),''), NEW.id),
          max(COALESCE(NEW.credit_amount, COALESCE(NEW.total_amount,0) - COALESCE(NEW.amount_paid,0)), 0),
          CASE WHEN NEW.status = 'VOIDED' THEN 'WRITTEN_OFF' ELSE 'OUTSTANDING' END,
          NULL, NULLIF(TRIM(NEW.notes),''), COALESCE(NULLIF(NEW.sold_at,''), NEW.created_at), NULL,
          CASE WHEN NEW.status = 'VOIDED' THEN COALESCE(NULLIF(NEW.voided_at,''), NEW.updated_at, NEW.created_at) ELSE NULL END,
          CASE WHEN NEW.status = 'VOIDED' THEN NULLIF(TRIM(NEW.voided_by),'') ELSE NULL END,
          CASE WHEN NEW.status = 'VOIDED' THEN COALESCE(NULLIF(TRIM(NEW.void_reason),''), 'Sale voided') ELSE NULL END
        )
        ON CONFLICT(business_id, source_type, source_id, direction) DO UPDATE SET
          contact_id         = excluded.contact_id,
          source_reference   = excluded.source_reference,
          original_amount    = excluded.original_amount,
          notes              = excluded.notes,
          created_at         = excluded.created_at,
          written_off_at     = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_at   ELSE debts.written_off_at   END,
          written_off_by     = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_by   ELSE debts.written_off_by   END,
          written_off_reason = CASE WHEN excluded.status = 'WRITTEN_OFF' THEN excluded.written_off_reason ELSE debts.written_off_reason END;

        UPDATE debts SET
          status     = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN status
            WHEN NEW.status = 'VOIDED' THEN 'WRITTEN_OFF'
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN 'SETTLED'
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) > 0              THEN 'PARTIALLY_PAID'
            ELSE 'OUTSTANDING' END,
          settled_at = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN settled_at
            WHEN NEW.status = 'VOIDED' THEN NULL
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN COALESCE(settled_at, created_at)
            ELSE NULL END,
          written_off_at = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN written_off_at
            WHEN NEW.status = 'VOIDED' THEN COALESCE(NULLIF(NEW.voided_at,''), NEW.updated_at, NEW.created_at)
            ELSE NULL END,
          written_off_by = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN written_off_by
            WHEN NEW.status = 'VOIDED' THEN NULLIF(TRIM(NEW.voided_by),'')
            ELSE NULL END,
          written_off_reason = CASE
            WHEN status = 'WRITTEN_OFF' AND NEW.status <> 'VOIDED' THEN written_off_reason
            WHEN NEW.status = 'VOIDED' THEN COALESCE(NULLIF(TRIM(NEW.void_reason),''), 'Sale voided')
            ELSE NULL END
        WHERE business_id = NEW.business_id AND source_type = 'SALE' AND source_id = NEW.id AND direction = 'RECEIVABLE';
      END;

      CREATE TRIGGER trg_restock_source_debt_after_insert
      AFTER INSERT ON restock_records
      WHEN NEW.supplier_id IS NOT NULL
        AND length(TRIM(NEW.supplier_id)) > 0
        AND max(COALESCE(NEW.credit_amount, COALESCE(NEW.total_amount,0) - COALESCE(NEW.amount_paid,0)), 0) > 0
      BEGIN
        INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at, settled_at, written_off_at, written_off_by, written_off_reason)
        VALUES (
          'debt:restock:' || NEW.id, NEW.business_id, NEW.supplier_id, 'PAYABLE', 'RESTOCK', NEW.id,
          COALESCE(NULLIF(TRIM(NEW.reference_number),''), NEW.id),
          max(COALESCE(NEW.credit_amount, COALESCE(NEW.total_amount,0) - COALESCE(NEW.amount_paid,0)), 0),
          'OUTSTANDING', NULL, NULLIF(TRIM(NEW.notes),''), NEW.created_at, NULL, NULL, NULL, NULL
        )
        ON CONFLICT(business_id, source_type, source_id, direction) DO UPDATE SET
          contact_id       = excluded.contact_id,
          source_reference = excluded.source_reference,
          original_amount  = excluded.original_amount,
          notes            = excluded.notes,
          created_at       = excluded.created_at;

        UPDATE debts SET
          status    = CASE
            WHEN status = 'WRITTEN_OFF' THEN status
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN 'SETTLED'
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) > 0              THEN 'PARTIALLY_PAID'
            ELSE 'OUTSTANDING' END,
          settled_at = CASE
            WHEN status = 'WRITTEN_OFF' THEN settled_at
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN COALESCE(settled_at, created_at)
            ELSE NULL END
        WHERE business_id = NEW.business_id AND source_type = 'RESTOCK' AND source_id = NEW.id AND direction = 'PAYABLE';
      END;

      CREATE TRIGGER trg_restock_source_debt_after_update
      AFTER UPDATE ON restock_records
      WHEN NEW.supplier_id IS NOT NULL
        AND length(TRIM(NEW.supplier_id)) > 0
        AND max(COALESCE(NEW.credit_amount, COALESCE(NEW.total_amount,0) - COALESCE(NEW.amount_paid,0)), 0) > 0
      BEGIN
        INSERT INTO debts (id, business_id, contact_id, direction, source_type, source_id, source_reference, original_amount, status, due_date, notes, created_at, settled_at, written_off_at, written_off_by, written_off_reason)
        VALUES (
          'debt:restock:' || NEW.id, NEW.business_id, NEW.supplier_id, 'PAYABLE', 'RESTOCK', NEW.id,
          COALESCE(NULLIF(TRIM(NEW.reference_number),''), NEW.id),
          max(COALESCE(NEW.credit_amount, COALESCE(NEW.total_amount,0) - COALESCE(NEW.amount_paid,0)), 0),
          'OUTSTANDING', NULL, NULLIF(TRIM(NEW.notes),''), NEW.created_at, NULL, NULL, NULL, NULL
        )
        ON CONFLICT(business_id, source_type, source_id, direction) DO UPDATE SET
          contact_id       = excluded.contact_id,
          source_reference = excluded.source_reference,
          original_amount  = excluded.original_amount,
          notes            = excluded.notes,
          created_at       = excluded.created_at;

        UPDATE debts SET
          status    = CASE
            WHEN status = 'WRITTEN_OFF' THEN status
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN 'SETTLED'
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) > 0              THEN 'PARTIALLY_PAID'
            ELSE 'OUTSTANDING' END,
          settled_at = CASE
            WHEN status = 'WRITTEN_OFF' THEN settled_at
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN COALESCE(settled_at, created_at)
            ELSE NULL END
        WHERE business_id = NEW.business_id AND source_type = 'RESTOCK' AND source_id = NEW.id AND direction = 'PAYABLE';
      END;

      CREATE TRIGGER trg_debt_payments_after_insert
      AFTER INSERT ON debt_payments
      BEGIN
        UPDATE debts SET
          status    = CASE
            WHEN status = 'WRITTEN_OFF' THEN status
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN 'SETTLED'
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) > 0              THEN 'PARTIALLY_PAID'
            ELSE 'OUTSTANDING' END,
          settled_at = CASE
            WHEN status = 'WRITTEN_OFF' THEN settled_at
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN COALESCE(settled_at, NEW.created_at)
            ELSE NULL END
        WHERE id = NEW.debt_id;
      END;

      CREATE TRIGGER trg_debt_payments_after_delete
      AFTER DELETE ON debt_payments
      BEGIN
        UPDATE debts SET
          status    = CASE
            WHEN status = 'WRITTEN_OFF' THEN status
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN 'SETTLED'
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) > 0              THEN 'PARTIALLY_PAID'
            ELSE 'OUTSTANDING' END,
          settled_at = CASE
            WHEN status = 'WRITTEN_OFF' THEN settled_at
            WHEN COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = debts.id),0) >= original_amount THEN COALESCE(settled_at, created_at)
            ELSE NULL END
        WHERE id = OLD.debt_id;
      END;
    `)
  },
}
