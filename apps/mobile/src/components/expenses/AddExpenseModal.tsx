import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Modal,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { X } from 'lucide-react-native'
import { AppInput } from '@/components/ui/AppInput'
import { AppButton } from '@/components/ui/AppButton'
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from '@/store/useExpensesStore'
import theme from '../../../theme'

const { colors, radius } = theme

const CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]

interface AddExpenseModalProps {
  visible: boolean
  onClose: () => void
  onSave: (data: {
    description: string
    amount: number
    category: ExpenseCategory
    date: string
  }) => void | Promise<void>
}

// ── Simple date helper (today as YYYY-MM-DD, local timezone) ─────────────────
function todayISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function AddExpenseModal({ visible, onClose, onSave }: AddExpenseModalProps) {
  const [description, setDescription] = useState('')
  const [amountStr, setAmountStr]     = useState('')
  const [category, setCategory]       = useState<ExpenseCategory>('OTHER')
  const [date, setDate]               = useState(todayISO)
  const [loading, setLoading]         = useState(false)

  // ── Validation errors ──
  const [errors, setErrors] = useState<{ description?: string; amount?: string; date?: string }>({})

  function validate(): boolean {
    const next: typeof errors = {}
    if (!description.trim()) next.description = 'La description est requise.'
    const amount = Number(amountStr.replace(/\s/g, ''))
    if (!amountStr.trim() || isNaN(amount) || amount <= 0)
      next.amount = 'Entrez un montant valide.'
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/))
      next.date = 'Format attendu : AAAA-MM-JJ'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setLoading(true)
    try {
      await onSave({
        description: description.trim(),
        amount: Number(amountStr.replace(/\s/g, '')),
        category,
        date,
      })
      handleClose()
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setDescription('')
    setAmountStr('')
    setCategory('OTHER')
    setDate(todayISO())
    setErrors({})
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        {/* Backdrop */}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} accessible={false} />

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Ajouter une dépense</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8} accessibilityLabel="Fermer">
              <X size={20} color={colors.neutral[400]} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 14 }}
          >
            {/* Description */}
            <AppInput
              label="Description"
              placeholder="Ex: Achat huile Azur, loyer boutique..."
              value={description}
              onChangeText={setDescription}
              error={errors.description}
              autoCapitalize="sentences"
            />

            {/* Amount */}
            <AppInput
              label="Montant (XAF)"
              placeholder="0"
              value={amountStr}
              onChangeText={(t) => setAmountStr(t.replace(/[^0-9]/g, ''))}
              keyboardType="numeric"
              error={errors.amount}
            />

            {/* Date */}
            <AppInput
              label="Date (AAAA-MM-JJ)"
              placeholder={todayISO()}
              value={date}
              onChangeText={setDate}
              error={errors.date}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            />

            {/* Category chips */}
            <View>
              <Text style={styles.catLabel}>Catégorie</Text>
              <View style={styles.catGrid}>
                {CATEGORY_KEYS.map((key) => {
                  const meta = EXPENSE_CATEGORIES[key]
                  const isActive = category === key
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setCategory(key)}
                      activeOpacity={0.75}
                      style={[
                        styles.catChip,
                        { backgroundColor: isActive ? meta.bg : colors.neutral[50] },
                        isActive && { borderColor: meta.color },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isActive }}
                    >
                      <Text style={styles.catEmoji}>{meta.emoji}</Text>
                      <Text style={[styles.catChipText, isActive && { color: meta.color, fontWeight: '700' }]}>
                        {meta.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </ScrollView>

          {/* Save button — reuses AppButton */}
          <View style={styles.footer}>
            <AppButton fullWidth size="lg" loading={loading} onPress={handleSave}>
              Enregistrer la dépense
            </AppButton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutral[100],
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[50],
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.neutral[800],
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  catLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.neutral[400],
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.btn,
    borderWidth: 1.5,
    borderColor: colors.neutral[100],
  },
  catEmoji: {
    fontSize: 13,
  },
  catChipText: {
    fontSize: 12,
    color: colors.neutral[800],
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
})
