import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

export class DatabaseService {
  private db: Database.Database

  constructor() {
    const dbPath = app.isPackaged
      ? join(app.getPath('userData'), 'biztrack.db')
      : join(__dirname, '../../../biztrack-dev.db')

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initialize()
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        sku TEXT,
        barcode TEXT,
        price REAL NOT NULL,
        cost_price REAL,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER NOT NULL DEFAULT 5,
        unit TEXT NOT NULL DEFAULT 'qty',
        category_id TEXT,
        image_url TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS product_categories (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        cashier_id TEXT NOT NULL,
        device_id TEXT,
        total_amount REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        net_amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        momo_reference TEXT,
        notes TEXT,
        receipt_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'COMPLETED',
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        recorded_by_id TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        receipt_url TEXT,
        date TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        pushed_count INTEGER DEFAULT 0,
        pulled_count INTEGER DEFAULT 0,
        conflict_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        record_id TEXT NOT NULL,
        operation TEXT NOT NULL DEFAULT 'UPSERT',
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS unit_of_measures (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        abbreviation TEXT,
        business_id TEXT,
        type TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_levels (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        product_id TEXT NOT NULL UNIQUE,
        quantity REAL NOT NULL DEFAULT 0,
        low_stock_threshold REAL,
        reorder_point REAL,
        last_restock_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity_change REAL NOT NULL,
        quantity_before REAL NOT NULL,
        quantity_after REAL NOT NULL,
        reference_type TEXT,
        reference_id TEXT,
        notes TEXT,
        performed_by_id TEXT,
        performed_by_name TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS restock_records (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        reference_number TEXT,
        supplier_name TEXT,
        total_cost REAL,
        notes TEXT,
        performed_by_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS restock_items (
        id TEXT PRIMARY KEY,
        restock_record_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL,
        new_quantity REAL NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (restock_record_id) REFERENCES restock_records(id)
      );

      CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_sales_business ON sales(business_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id, date);
      CREATE INDEX IF NOT EXISTS idx_product_categories_business ON product_categories(business_id, is_deleted);
      CREATE INDEX IF NOT EXISTS idx_inventory_levels_business ON inventory_levels(business_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_business ON inventory_movements(business_id, product_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_outbox_entity_record ON sync_outbox(entity, record_id);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created ON sync_outbox(status, created_at);
    `)

    this.ensureProductColumns()
    this.ensureCategoryColumns()
    this.ensureUnitColumns()
    this.seedUnitOfMeasures()
  }

  query(sql: string, params?: unknown[]): unknown[] {
    return this.db.prepare(sql).all(params ?? [])
  }

  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.db.prepare(sql).run(params ?? [])
  }

  batch(operations: Array<{ sql: string; params?: unknown[] }>): { changes: number } {
    const transaction = this.db.transaction(
      (steps: Array<{ sql: string; params?: unknown[] }>) => {
        let changes = 0
        for (const step of steps) {
          changes += this.db.prepare(step.sql).run(step.params ?? []).changes
        }
        return { changes }
      },
    )

    return transaction(operations)
  }

  close() {
    this.db.close()
  }

  private ensureProductColumns() {
    this.ensureColumn('products', 'currency', "currency TEXT NOT NULL DEFAULT 'XAF'")
    this.ensureColumn('products', 'tax_rate', 'tax_rate REAL NOT NULL DEFAULT 0')
    this.ensureColumn('products', 'is_service', 'is_service INTEGER NOT NULL DEFAULT 0')
    this.ensureColumn('products', 'track_inventory', 'track_inventory INTEGER NOT NULL DEFAULT 1')
    this.ensureColumn('products', 'slug', 'slug TEXT')
    this.ensureColumn('products', 'barcode_type', 'barcode_type TEXT')
    this.ensureColumn(
      'products',
      'is_barcode_generated',
      'is_barcode_generated INTEGER NOT NULL DEFAULT 0',
    )
    this.ensureColumn('products', 'reorder_point', 'reorder_point REAL')
    this.ensureColumn('products', 'unit_of_measure_id', 'unit_of_measure_id TEXT')
    this.ensureColumn('products', 'created_by_id', 'created_by_id TEXT')
  }

  private ensureCategoryColumns() {
    this.ensureColumn('product_categories', 'is_active', 'is_active INTEGER NOT NULL DEFAULT 1')
    this.ensureColumn('product_categories', 'slug', 'slug TEXT')
    this.ensureColumn('product_categories', 'color', 'color TEXT')
    this.ensureColumn('product_categories', 'icon', 'icon TEXT')
    this.ensureColumn('product_categories', 'image_url', 'image_url TEXT')
    this.ensureColumn('product_categories', 'sort_order', 'sort_order INTEGER')
  }

  private ensureUnitColumns() {
    this.ensureColumn('unit_of_measures', 'is_active', 'is_active INTEGER NOT NULL DEFAULT 1')
    this.ensureColumn('unit_of_measures', 'is_deleted', 'is_deleted INTEGER NOT NULL DEFAULT 0')
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name?: string }>

    if (columns.some((item) => item.name === column)) {
      return
    }

    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
  }

  private seedUnitOfMeasures() {
    const now = new Date().toISOString()
    const defaults = [
      {
        id: 'uom-piece',
        name: 'Qty',
        abbreviation: 'qty',
        type: 'QUANTITY',
        isDefault: 1,
      },
      {
        id: 'uom-kilogram',
        name: 'Kilogram',
        abbreviation: 'kg',
        type: 'WEIGHT',
        isDefault: 0,
      },
      {
        id: 'uom-liter',
        name: 'Liter',
        abbreviation: 'L',
        type: 'VOLUME',
        isDefault: 0,
      },
      {
        id: 'uom-meter',
        name: 'Meter',
        abbreviation: 'm',
        type: 'LENGTH',
        isDefault: 0,
      },
      {
        id: 'uom-service',
        name: 'Service',
        abbreviation: 'svc',
        type: 'CUSTOM',
        isDefault: 0,
      },
    ]

    const insert = this.db.prepare(`
      INSERT INTO unit_of_measures (
        id,
        name,
        abbreviation,
        business_id,
        type,
        is_active,
        is_deleted,
        is_default,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, NULL, ?, 1, 0, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        abbreviation = excluded.abbreviation,
        type = excluded.type,
        is_active = excluded.is_active,
        is_deleted = excluded.is_deleted,
        is_default = excluded.is_default,
        updated_at = excluded.updated_at
    `)

    const transaction = this.db.transaction(() => {
      for (const unit of defaults) {
        insert.run(
          unit.id,
          unit.name,
          unit.abbreviation,
          unit.type,
          unit.isDefault,
          now,
          now,
        )
      }
    })

    transaction()
  }
}
