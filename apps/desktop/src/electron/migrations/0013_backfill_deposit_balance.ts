import type { Migration } from './runner'

export const migration_0013: Migration = {
  id: 13,
  name: '0013_backfill_deposit_balance',
  up(db) {
    // deposit_balance was never written on creation or payment recording, so all
    // existing open preorders have balance = 0 even though deposits were made.
    // Backfill: for any non-terminal preorder where deposit_balance is 0 but
    // deposit_paid is positive, set deposit_balance = deposit_paid.
    db.prepare(`
      UPDATE preorders
      SET deposit_balance = deposit_paid
      WHERE deposit_balance = 0
        AND deposit_paid > 0
        AND collected_at IS NULL
        AND cancelled_at IS NULL
    `).run()
  },
}
