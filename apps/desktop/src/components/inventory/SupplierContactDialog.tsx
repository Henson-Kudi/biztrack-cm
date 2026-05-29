'use client'

import { useTranslations } from 'next-intl'
import { DebtDirection } from '@biztrack/types'
import { ContactPickerDialog } from '@/components/contacts/ContactPickerDialog'
import {
  createSupplierContactLocal,
  listSupplierContactsLocal,
  type LocalContactRecord,
} from '@/services/contacts.local'

type SupplierContactDialogProps = {
  businessId: string | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedSupplierId?: string | null
  createdById?: string | null
  onSelect: (supplier: LocalContactRecord) => void
}

export function SupplierContactDialog({
  businessId,
  open,
  onOpenChange,
  selectedSupplierId,
  createdById,
  onSelect,
}: SupplierContactDialogProps) {
  const t = useTranslations('app.inventory')
  const tContacts = useTranslations('app.contacts')

  return (
    <ContactPickerDialog
      businessId={businessId}
      open={open}
      onOpenChange={onOpenChange}
      selectedContactId={selectedSupplierId}
      createdById={createdById}
      onSelect={onSelect}
      listContacts={listSupplierContactsLocal}
      createContact={createSupplierContactLocal}
      openingBalanceDirection={DebtDirection.PAYABLE}
      copy={{
        title: t('restock.supplier_dialog_title'),
        description: t('restock.supplier_dialog_description'),
        searchPlaceholder: t('restock.search_supplier'),
        noResults: t('restock.no_suppliers_found'),
        noPhone: t('restock.no_supplier_phone'),
        addNew: t('restock.add_new'),
        backToList: t('restock.back_to_list'),
        fullName: t('restock.supplier_full_name'),
        phone: t('restock.supplier_phone'),
        alternatePhone: t('restock.alternate_phone'),
        address: t('restock.address'),
        notes: t('restock.notes'),
        notesPlaceholder: t('restock.notes_placeholder'),
        save: t('restock.save_supplier'),
        saving: t('restock.submitting'),
        cancel: t('dialog.close_action'),
        saved: t('restock.supplier_saved'),
        loadError: t('restock.supplier_load_error'),
        phoneRequired: t('restock.phone_required'),
        phoneInvalid: t('restock.phone_invalid'),
        nameRequired: t('restock.name_required'),
        contactExists: t('restock.contact_exists'),
        obTitle: tContacts('dialog.ob_title'),
        obHint: tContacts('dialog.ob_hint'),
        obAmountLabel: tContacts('dialog.ob_payable_label'),
        obAmountPlaceholder: tContacts('dialog.ob_amount_placeholder'),
        obDateLabel: tContacts('dialog.ob_date_label'),
        obSaveError: tContacts('dialog.ob_save_error'),
      }}
    />
  )
}
