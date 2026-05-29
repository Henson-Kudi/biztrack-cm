import type { Migration } from './runner'

const SYSTEM_CHARGE_TYPES = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'TVA',
    description: 'Taxe sur la valeur ajoutee (19.25%)',
    rate_type: 'PERCENT',
    default_value: 19.25,
    sort_order: 0,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Transport',
    description: 'Frais de transport / livraison',
    rate_type: 'FIXED',
    default_value: 0,
    sort_order: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Service',
    description: 'Frais de service',
    rate_type: 'PERCENT',
    default_value: 0,
    sort_order: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Emballage',
    description: "Frais d'emballage",
    rate_type: 'FIXED',
    default_value: 0,
    sort_order: 3,
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Commission',
    description: 'Commission sur la vente',
    rate_type: 'PERCENT',
    default_value: 0,
    sort_order: 4,
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    name: 'Penalite',
    description: 'Penalite ou frais supplementaire',
    rate_type: 'FIXED',
    default_value: 0,
    sort_order: 5,
  },
]

export const migration_0009: Migration = {
  id: 9,
  name: '0009_charge_types',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS charge_types (
        id TEXT PRIMARY KEY,
        business_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        rate_type TEXT NOT NULL DEFAULT 'FIXED',
        default_value REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_system INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_charge_types_business_id ON charge_types(business_id);
      CREATE INDEX IF NOT EXISTS idx_charge_types_is_active ON charge_types(is_active);

      CREATE TABLE IF NOT EXISTS sale_charges (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        charge_type_id TEXT,
        name TEXT NOT NULL,
        rate_type TEXT NOT NULL DEFAULT 'FIXED',
        rate_value REAL NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sale_charges_sale_id ON sale_charges(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_charges_business_id ON sale_charges(business_id);
    `)

    const now = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO charge_types
        (id, business_id, name, description, rate_type, default_value, is_active, is_system, sort_order, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?, ?, 1, 1, ?, ?, ?)
    `)

    for (const ct of SYSTEM_CHARGE_TYPES) {
      stmt.run(ct.id, ct.name, ct.description, ct.rate_type, ct.default_value, ct.sort_order, now, now)
    }
  },
}
