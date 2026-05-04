import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronUp, Plus, Check } from 'lucide-react-native'
import type { Product, ProductCategory, CreateProductPayload } from '@/services/products.service'

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = ['piece', 'kg', 'litre', 'metre', 'box', 'dozen', 'pack'] as const

const UNIT_LABELS: Record<string, string> = {
  piece: 'Pièce',
  kg: 'Kilogramme (kg)',
  litre: 'Litre (L)',
  metre: 'Mètre (m)',
  box: 'Boîte',
  dozen: 'Douzaine',
  pack: 'Pack',
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  name: string
  price: string
  costPrice: string
  stockQuantity: string
  lowStockThreshold: string
  unit: string
  sku: string
  barcode: string
  description: string
  categoryId: string
}

const EMPTY_FORM: FormState = {
  name: '',
  price: '',
  costPrice: '',
  stockQuantity: '0',
  lowStockThreshold: '5',
  unit: 'piece',
  sku: '',
  barcode: '',
  description: '',
  categoryId: '',
}

function productToForm(p: Product): FormState {
  return {
    name: p.name,
    price: String(p.price),
    costPrice: p.costPrice != null ? String(p.costPrice) : '',
    stockQuantity: String(p.stockQuantity),
    lowStockThreshold: String(p.lowStockThreshold),
    unit: p.unit,
    sku: p.sku ?? '',
    barcode: p.barcode ?? '',
    description: p.description ?? '',
    categoryId: p.categoryId ?? '',
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <Text className="text-[11px] uppercase font-semibold tracking-wider mb-2" style={{ color: '#888780' }}>
      {label}
    </Text>
  )
}

function FieldWrapper({ children, error, last }: { children: React.ReactNode; error?: string; last?: boolean }) {
  return (
    <View className={last ? '' : 'border-b border-gray-50'}>
      <View className="px-4 py-3">{children}</View>
      {error ? <Text className="text-[11px] px-4 pb-2" style={{ color: '#E24B4A' }}>{error}</Text> : null}
    </View>
  )
}

function FieldLabel({ label }: { label: string }) {
  return (
    <Text className="text-[10px] uppercase font-semibold tracking-wider mb-1.5" style={{ color: '#888780' }}>
      {label}
    </Text>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProductFormModalProps {
  visible: boolean
  product?: Product | null
  categories: ProductCategory[]
  onClose: () => void
  onSave: (payload: CreateProductPayload) => Promise<void>
  onAddCategory: (name: string) => Promise<ProductCategory>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductFormModal({
  visible,
  product,
  categories,
  onClose,
  onSave,
  onAddCategory,
}: ProductFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [showUnitPicker, setShowUnitPicker] = useState(false)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [isAddingCat, setIsAddingCat] = useState(false)

  const isEditing = Boolean(product)

  useEffect(() => {
    if (visible) {
      setForm(product ? productToForm(product) : EMPTY_FORM)
      setErrors({})
      setShowUnitPicker(false)
      setShowCategoryPicker(false)
      setNewCatName('')
    }
  }, [visible, product])

  const setField = (key: keyof FormState) => (val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  function validate() {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) e.name = 'Le nom est requis'
    const price = Number(form.price)
    if (!form.price || isNaN(price) || price < 0) e.price = 'Prix de vente invalide'
    if (form.costPrice && (isNaN(Number(form.costPrice)) || Number(form.costPrice) < 0))
      e.costPrice = "Prix d'achat invalide"
    if (form.stockQuantity && (isNaN(Number(form.stockQuantity)) || Number(form.stockQuantity) < 0))
      e.stockQuantity = 'Quantité invalide'
    if (form.lowStockThreshold && (isNaN(Number(form.lowStockThreshold)) || Number(form.lowStockThreshold) < 0))
      e.lowStockThreshold = 'Seuil invalide'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setIsSaving(true)
    try {
      const payload: CreateProductPayload = {
        name: form.name.trim(),
        price: Number(form.price),
        ...(form.description.trim() && { description: form.description.trim() }),
        ...(form.sku.trim() && { sku: form.sku.trim() }),
        ...(form.barcode.trim() && { barcode: form.barcode.trim() }),
        ...(form.costPrice && { costPrice: Number(form.costPrice) }),
        stockQuantity: form.stockQuantity ? Number(form.stockQuantity) : 0,
        lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : 5,
        unit: form.unit,
        ...(form.categoryId && { categoryId: form.categoryId }),
      }
      await onSave(payload)
      onClose()
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder le produit. Vérifiez votre connexion.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return
    setIsAddingCat(true)
    try {
      const cat = await onAddCategory(newCatName.trim())
      setForm((prev) => ({ ...prev, categoryId: cat.id }))
      setNewCatName('')
      setShowCategoryPicker(false)
    } catch {
      Alert.alert('Erreur', 'Impossible de créer la catégorie.')
    } finally {
      setIsAddingCat(false)
    }
  }

  const selectedCategory = categories.find((c) => c.id === form.categoryId)
  const selectedUnitLabel = UNIT_LABELS[form.unit] ?? form.unit

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1"
        style={{ backgroundColor: '#F1EFE8' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View
          className="px-4 pt-5 pb-4 flex-row items-center justify-between border-b border-gray-100"
          style={{ backgroundColor: '#fff' }}
        >
          <Text className="text-[17px] font-bold text-gray-900">
            {isEditing ? 'Modifier le produit' : 'Nouveau produit'}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: '#F1EFE8' }}
          >
            <X size={16} color="#444441" />
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Section: Informations ────────────────────────────────────── */}
          <SectionLabel label="Informations" />
          <View className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5"
            style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
          >
            <FieldWrapper error={errors.name}>
              <FieldLabel label="Nom du produit *" />
              <TextInput
                value={form.name}
                onChangeText={setField('name')}
                placeholder="ex: Coca-Cola 50cl"
                placeholderTextColor="#D3D1C7"
                className="text-[14px] text-gray-800"
              />
            </FieldWrapper>
            <FieldWrapper last>
              <FieldLabel label="Description" />
              <TextInput
                value={form.description}
                onChangeText={setField('description')}
                placeholder="Optionnel"
                placeholderTextColor="#D3D1C7"
                multiline
                numberOfLines={2}
                className="text-[14px] text-gray-800"
                style={{ textAlignVertical: 'top' }}
              />
            </FieldWrapper>
          </View>

          {/* ── Section: Prix ─────────────────────────────────────────────── */}
          <SectionLabel label="Prix" />
          <View className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5"
            style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
          >
            <View className="flex-row">
              <View className="flex-1 border-r border-b border-gray-50">
                <FieldWrapper error={errors.price} last>
                  <FieldLabel label="Prix de vente * (XAF)" />
                  <TextInput
                    value={form.price}
                    onChangeText={setField('price')}
                    keyboardType="numeric"
                    placeholder="500"
                    placeholderTextColor="#D3D1C7"
                    className="text-[14px] text-gray-800"
                  />
                </FieldWrapper>
              </View>
              <View className="flex-1">
                <FieldWrapper error={errors.costPrice} last>
                  <FieldLabel label="Prix d'achat (XAF)" />
                  <TextInput
                    value={form.costPrice}
                    onChangeText={setField('costPrice')}
                    keyboardType="numeric"
                    placeholder="300"
                    placeholderTextColor="#D3D1C7"
                    className="text-[14px] text-gray-800"
                  />
                </FieldWrapper>
              </View>
            </View>
          </View>

          {/* ── Section: Stock ─────────────────────────────────────────────── */}
          <SectionLabel label="Stock" />
          <View className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5"
            style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
          >
            <View className="flex-row">
              <View className="flex-1 border-r border-gray-50">
                <FieldWrapper error={errors.stockQuantity}>
                  <FieldLabel label="Quantité initiale" />
                  <TextInput
                    value={form.stockQuantity}
                    onChangeText={setField('stockQuantity')}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#D3D1C7"
                    className="text-[14px] text-gray-800"
                  />
                </FieldWrapper>
              </View>
              <View className="flex-1">
                <FieldWrapper error={errors.lowStockThreshold}>
                  <FieldLabel label="Seuil d'alerte" />
                  <TextInput
                    value={form.lowStockThreshold}
                    onChangeText={setField('lowStockThreshold')}
                    keyboardType="numeric"
                    placeholder="5"
                    placeholderTextColor="#D3D1C7"
                    className="text-[14px] text-gray-800"
                  />
                </FieldWrapper>
              </View>
            </View>

            {/* Unit selector */}
            <TouchableOpacity
              onPress={() => setShowUnitPicker((v) => !v)}
              activeOpacity={0.7}
              className="flex-row items-center justify-between px-4 py-3 border-t border-gray-100"
            >
              <FieldLabel label="Unité de mesure" />
              <View className="flex-row items-center gap-1">
                <Text className="text-[13px] font-medium text-gray-700">{selectedUnitLabel}</Text>
                {showUnitPicker ? <ChevronUp size={14} color="#888780" /> : <ChevronDown size={14} color="#888780" />}
              </View>
            </TouchableOpacity>

            {showUnitPicker && (
              <View className="border-t border-gray-100">
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    onPress={() => {
                      setField('unit')(u)
                      setShowUnitPicker(false)
                    }}
                    className="flex-row items-center justify-between px-4 py-3 border-b border-gray-50"
                  >
                    <Text className="text-[13px] text-gray-700">{UNIT_LABELS[u]}</Text>
                    {form.unit === u && <Check size={14} color="#185FA5" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* ── Section: Catégorie ─────────────────────────────────────────── */}
          <SectionLabel label="Catégorie" />
          <View className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5"
            style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
          >
            <TouchableOpacity
              onPress={() => setShowCategoryPicker((v) => !v)}
              activeOpacity={0.7}
              className="flex-row items-center justify-between px-4 py-3"
            >
              <Text className="text-[13px] text-gray-700">
                {selectedCategory ? selectedCategory.name : 'Aucune catégorie'}
              </Text>
              {showCategoryPicker ? <ChevronUp size={14} color="#888780" /> : <ChevronDown size={14} color="#888780" />}
            </TouchableOpacity>

            {showCategoryPicker && (
              <View className="border-t border-gray-100">
                {/* None option */}
                <TouchableOpacity
                  onPress={() => { setField('categoryId')(''); setShowCategoryPicker(false) }}
                  className="flex-row items-center justify-between px-4 py-3 border-b border-gray-50"
                >
                  <Text className="text-[13px] text-gray-400">Aucune</Text>
                  {!form.categoryId && <Check size={14} color="#185FA5" />}
                </TouchableOpacity>

                {/* Existing categories */}
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => { setField('categoryId')(cat.id); setShowCategoryPicker(false) }}
                    className="flex-row items-center justify-between px-4 py-3 border-b border-gray-50"
                  >
                    <Text className="text-[13px] text-gray-700">{cat.name}</Text>
                    {form.categoryId === cat.id && <Check size={14} color="#185FA5" />}
                  </TouchableOpacity>
                ))}

                {/* Add new category inline */}
                <View className="flex-row items-center px-4 py-3 gap-2">
                  <TextInput
                    value={newCatName}
                    onChangeText={setNewCatName}
                    placeholder="Nouvelle catégorie..."
                    placeholderTextColor="#D3D1C7"
                    className="flex-1 text-[13px] text-gray-800"
                  />
                  <TouchableOpacity
                    onPress={handleAddCategory}
                    disabled={isAddingCat || !newCatName.trim()}
                    className="w-8 h-8 rounded-lg items-center justify-center"
                    style={{ backgroundColor: newCatName.trim() ? '#185FA5' : '#D3D1C7' }}
                  >
                    {isAddingCat ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Plus size={14} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* ── Section: Référencement ────────────────────────────────────── */}
          <SectionLabel label="Référencement (Optionnel)" />
          <View className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6"
            style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3 }}
          >
            <FieldWrapper>
              <FieldLabel label="SKU (Référence interne)" />
              <TextInput
                value={form.sku}
                onChangeText={setField('sku')}
                placeholder="ex: COKE-50CL"
                placeholderTextColor="#D3D1C7"
                autoCapitalize="characters"
                className="text-[14px] text-gray-800"
              />
            </FieldWrapper>
            <FieldWrapper last>
              <FieldLabel label="Code-barre" />
              <TextInput
                value={form.barcode}
                onChangeText={setField('barcode')}
                placeholder="ex: 5449000000996"
                placeholderTextColor="#D3D1C7"
                keyboardType="numeric"
                className="text-[14px] text-gray-800"
              />
            </FieldWrapper>
          </View>
        </ScrollView>

        {/* ── Footer: Save button ─────────────────────────────────────────── */}
        <View
          className="px-4 py-4 border-t border-gray-100"
          style={{ backgroundColor: '#fff' }}
        >
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.85}
            className="rounded-xl py-3.5 items-center justify-center"
            style={{ backgroundColor: isSaving ? '#B5D4F4' : '#185FA5' }}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-[15px]">
                {isEditing ? 'Enregistrer les modifications' : 'Ajouter le produit'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
