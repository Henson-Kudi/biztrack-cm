import type { Migration } from './runner'

export const migration_0020: Migration = {
  id: 20,
  name: '0020_local_user_profiles',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_user_profiles (
        id                      TEXT PRIMARY KEY,
        name                    TEXT,
        email                   TEXT,
        phone                   TEXT,
        avatar_url              TEXT,
        role                    TEXT,
        language                TEXT,
        is_email_verified       INTEGER,
        is_phone_verified       INTEGER,
        business_id             TEXT,
        status                  TEXT,
        onboarding_step         TEXT,
        preferred_phone_channel TEXT,
        is_active               INTEGER,
        created_at              TEXT,
        updated_at              TEXT,
        saved_at                TEXT NOT NULL
      )
    `)
  },
}
