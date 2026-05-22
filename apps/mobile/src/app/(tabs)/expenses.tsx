import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Wallet,
  Plus,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
} from 'lucide-react-native'
import { useExpensesStore, ExpenseCategory, EXPENSE_CATEGORIES } from '../../store/useExpensesStore'
import { Colors, addOpacity } from '../../utils/colors'
import { AppButton, AppInput } from '../../components/ui'

const { NAVY, CREAM, WHITE, MUTED, BORDER, BLUE, AMBER } = Colors

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets()
  const {
    expenses,
    addExpense,
    removeExpense,
    updateExpense,
    totalForMonth,
    expensesForMonth,
  } = useExpensesStore()

  // Date selection states
  const [currentDate, setCurrentDate] = useState(new Date())
  const yearMonth = currentDate.toISOString().slice(0, 7) // "YYYY-MM"

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<any>(null)

  // Form states
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('OTHER')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10)) // "YYYY-MM-DD"

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))
  }

  const openAddModal = () => {
    setDescription('')
    setAmount('')
    setCategory('OTHER')
    setExpenseDate(new Date().toISOString().slice(0, 10))
    setIsAddModalOpen(true)
  }

  const openEditModal = (exp: any) => {
    setSelectedExpense(exp)
    setDescription(exp.description)
    setAmount(exp.amount.toString())
    setCategory(exp.category)
    setExpenseDate(exp.date)
    setIsEditModalOpen(true)
  }

  const handleSave = (isEdit: boolean) => {
    if (!description.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir une description.')
      return
    }
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un montant valide.')
      return
    }

    try {
      const payload = {
        description: description.trim(),
        amount: numAmount,
        category,
        date: expenseDate,
      }

      if (isEdit && selectedExpense) {
        updateExpense(selectedExpense.id, payload)
        setIsEditModalOpen(false)
      } else {
        addExpense(payload)
        setIsAddModalOpen(false)
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Une erreur est survenue.')
    }
  }

  const handleDelete = (id: string) => {
    Alert.alert(
      'Supprimer la dépense',
      'Êtes-vous sûr de vouloir supprimer cette sortie de caisse ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            removeExpense(id)
            setIsEditModalOpen(false)
          },
        },
      ]
    )
  }

  const formatMonthLabel = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }

  const renderExpenseItem = ({ item }: { item: any }) => {
    const meta = EXPENSE_CATEGORIES[item.category as ExpenseCategory] || EXPENSE_CATEGORIES.OTHER

    return (
      <TouchableOpacity
        onPress={() => openEditModal(item)}
        activeOpacity={0.75}
        style={{
          backgroundColor: WHITE,
          borderRadius: 14,
          padding: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: BORDER,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          elevation: 1,
          shadowColor: '#000',
          shadowOpacity: 0.02,
          shadowOffset: { width: 0, height: 1 },
          shadowRadius: 2,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          {/* Category Icon */}
          <View style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: meta.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: NAVY }} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              {meta.label} · {new Date(item.date).toLocaleDateString('fr-FR')}
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: 15, fontWeight: '700', color: '#E24B4A' }}>
          -{item.amount.toLocaleString()} F
        </Text>
      </TouchableOpacity>
    )
  }

  const currentMonthExpenses = expensesForMonth(yearMonth)
  const currentMonthTotal = totalForMonth(yearMonth)

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <View style={{
        backgroundColor: NAVY,
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: WHITE }}>Dépenses</Text>
          <Text style={{ fontSize: 12, color: '#85B7EB', marginTop: 2 }}>Suivi de vos sorties de caisse</Text>
        </View>
        <TouchableOpacity
          onPress={openAddModal}
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: AMBER,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={20} color={WHITE} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* ─── Month Navigation & Total Card ────────────────────────────── */}
      <View style={{ padding: 16 }}>
        <View style={{
          backgroundColor: WHITE,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: BORDER,
          padding: 16,
          alignItems: 'center',
          elevation: 2,
          shadowColor: '#000',
          shadowOpacity: 0.03,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 4,
        }}>
          {/* Navigation */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12 }}>
            <TouchableOpacity onPress={handlePrevMonth} style={{ padding: 6 }}>
              <ChevronLeft size={20} color={NAVY} />
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontWeight: '700', color: NAVY, textTransform: 'capitalize' }}>
              {formatMonthLabel(currentDate)}
            </Text>
            <TouchableOpacity onPress={handleNextMonth} style={{ padding: 6 }}>
              <ChevronRight size={20} color={NAVY} />
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: BORDER, width: '100%', marginBottom: 12 }} />

          {/* Total Value */}
          <Text style={{ fontSize: 12, color: MUTED, marginBottom: 2 }}>Total sorties de caisse</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#E24B4A' }}>
            {currentMonthTotal.toLocaleString()} F
          </Text>
        </View>
      </View>

      {/* ─── Expense list ──────────────────────────────────────────────── */}
      {currentMonthExpenses.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: addOpacity(AMBER, '15'), alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={32} color={AMBER} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: NAVY }}>Aucune dépense ce mois-ci</Text>
          <Text style={{ fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 }}>
            Toutes vos dépenses et frais d'exploitation enregistrés s'afficheront ici.
          </Text>
          <AppButton size="sm" onPress={openAddModal} variant="secondary">
            Enregistrer une dépense
          </AppButton>
        </View>
      ) : (
        <FlatList
          data={currentMonthExpenses}
          keyExtractor={(item) => item.id}
          renderItem={renderExpenseItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ─── Form modal (Add / Edit) ───────────────────────────────────── */}
      <Modal
        visible={isAddModalOpen || isEditModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setIsAddModalOpen(false)
          setIsEditModalOpen(false)
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: CREAM }}
        >
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: BORDER,
            backgroundColor: WHITE,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: NAVY }}>
              {isAddModalOpen ? 'Enregistrer une dépense' : 'Modifier la dépense'}
            </Text>
            <TouchableOpacity onPress={() => {
              setIsAddModalOpen(false)
              setIsEditModalOpen(false)
            }}>
              <X size={22} color={NAVY} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <AppInput
              label="Description *"
              placeholder="ex: Achat de cartons, facture électricité..."
              value={description}
              onChangeText={setDescription}
            />

            <AppInput
              label="Montant (F) *"
              placeholder="0"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />

            <AppInput
              label="Date *"
              placeholder="YYYY-MM-DD"
              value={expenseDate}
              onChangeText={setExpenseDate}
              rightSlot={<Calendar size={20} color={MUTED} />}
            />

            {/* Category selection */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED, marginBottom: 8 }}>Catégorie</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.keys(EXPENSE_CATEGORIES).map((key) => {
                  const catKey = key as ExpenseCategory
                  const meta = EXPENSE_CATEGORIES[catKey]
                  const isSelected = category === catKey

                  return (
                    <TouchableOpacity
                      key={catKey}
                      onPress={() => setCategory(catKey)}
                      activeOpacity={0.8}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: isSelected ? meta.color : WHITE,
                        borderWidth: 1,
                        borderColor: isSelected ? meta.color : BORDER,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{meta.emoji}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? WHITE : NAVY }}>
                        {meta.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* Actions */}
            <View style={{ marginTop: 24, gap: 10 }}>
              <AppButton
                onPress={() => handleSave(!isAddModalOpen)}
                fullWidth
              >
                {isAddModalOpen ? 'Enregistrer la dépense' : 'Enregistrer les modifications'}
              </AppButton>

              {isEditModalOpen && selectedExpense && (
                <AppButton
                  variant="danger"
                  onPress={() => handleDelete(selectedExpense.id)}
                  fullWidth
                >
                  <Trash2 size={16} color={WHITE} /> Supprimer la dépense
                </AppButton>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

