import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import { EXPENSE_CATEGORIES, type Expense } from '@/store/useExpensesStore'
import theme from '../../../theme'

const { colors, radius } = theme

interface ExpenseCardProps {
  expense: Expense
  onDelete: (id: string) => void
}

export function ExpenseCard({ expense, onDelete }: ExpenseCardProps) {
  const cat = EXPENSE_CATEGORIES[expense.category] ?? {
    emoji: '❓',
    label: expense.category,
    bg: colors.neutral[100],
    color: colors.neutral[800],
  }

  const dateStr = new Date(expense.date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const handleDelete = () => {
    Alert.alert(
      'Supprimer la dépense',
      `Supprimer "${expense.description}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(expense.id) },
      ],
    )
  }

  return (
    <View style={styles.card}>
      {/* Category dot / emoji */}
      <View style={[styles.iconWrap, { backgroundColor: cat.bg }]}>
        <Text style={styles.emoji}>{cat.emoji}</Text>
      </View>

      {/* Description + category + date */}
      <View style={styles.info}>
        <Text style={styles.desc} numberOfLines={1}>{expense.description}</Text>
        <View style={styles.meta}>
          <View style={[styles.catPill, { backgroundColor: cat.bg }]}>
            <Text style={[styles.catLabel, { color: cat.color }]}>{cat.label}</Text>
          </View>
          <Text style={styles.date}>{dateStr}</Text>
        </View>
      </View>

      {/* Amount */}
      <Text style={styles.amount}>
        {expense.amount.toLocaleString('fr-FR')}
        <Text style={styles.currency}> XAF</Text>
      </Text>

      {/* Delete */}
      <TouchableOpacity
        onPress={handleDelete}
        hitSlop={8}
        style={styles.deleteBtn}
        accessibilityLabel="Supprimer"
      >
        <Trash2 size={14} color={colors.danger[400]} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.neutral[50],
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emoji: {
    fontSize: 18,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  desc: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.neutral[800],
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  catPill: {
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  catLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  date: {
    fontSize: 11,
    color: colors.neutral[400],
  },
  amount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.danger[400],
    textAlign: 'right',
    flexShrink: 0,
  },
  currency: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.neutral[400],
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger[50],
    flexShrink: 0,
  },
})
