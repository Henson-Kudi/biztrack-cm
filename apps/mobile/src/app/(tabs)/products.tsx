import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Package,
  Plus,
  Search,
  X,
  Trash2,
  AlertTriangle,
  Barcode,
  Edit2,
} from 'lucide-react-native'
import { useProductsStore } from '../../store/useProductsStore'
import { Colors, addOpacity } from '../../utils/colors'
import { AppButton, AppInput } from '../../components/ui'

const { NAVY, GREEN, AMBER, CREAM, WHITE, MUTED, BORDER, BLUE } = Colors

export default function ProductsScreen() {
  const insets = useSafeAreaInsets()
  const {
    products,
    categories,
    isLoading,
    isSaving,
    error,
    searchQuery,
    selectedCategoryId,
    filteredProducts,
    setSearchQuery,
    setSelectedCategory,
    fetchProducts,
    fetchCategories,
    addProduct,
    editProduct,
    removeProduct,
  } = useProductsStore()

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)

  // Form states
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [stockQuantity, setStockQuantity] = useState('')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [unit, setUnit] = useState('piece')
  const [lowStockThreshold, setLowStockThreshold] = useState('5')
  const [categoryId, setCategoryId] = useState('')

  // Load products on mount
  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [])

  // Populate edit fields
  const openDetailModal = (product: any) => {
    setSelectedProduct(product)
    setName(product.name)
    setPrice(product.price.toString())
    setCostPrice(product.costPrice ? product.costPrice.toString() : '')
    setStockQuantity(product.stockQuantity.toString())
    setSku(product.sku || '')
    setBarcode(product.barcode || '')
    setUnit(product.unit || 'piece')
    setLowStockThreshold(product.lowStockThreshold.toString())
    setCategoryId(product.categoryId || '')
    setIsDetailModalOpen(true)
  }

  const openAddModal = () => {
    setName('')
    setPrice('')
    setCostPrice('')
    setStockQuantity('0')
    setSku('')
    setBarcode('')
    setUnit('piece')
    setLowStockThreshold('5')
    setCategoryId(categories[0]?.id || '')
    setIsAddModalOpen(true)
  }

  const handleSave = async (isEdit: boolean) => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir un nom de produit.')
      return
    }
    const numPrice = parseFloat(price)
    if (isNaN(numPrice) || numPrice <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un prix de vente valide.')
      return
    }

    const payload = {
      name: name.trim(),
      price: numPrice,
      costPrice: costPrice.trim() ? parseFloat(costPrice) : undefined,
      stockQuantity: stockQuantity.trim() ? parseInt(stockQuantity, 10) : 0,
      sku: sku.trim() || undefined,
      barcode: barcode.trim() || undefined,
      unit: unit.trim() || 'piece',
      lowStockThreshold: lowStockThreshold.trim() ? parseInt(lowStockThreshold, 10) : 5,
      categoryId: categoryId.trim() || undefined,
    }

    try {
      if (isEdit && selectedProduct) {
        await editProduct(selectedProduct.id, payload)
        setIsDetailModalOpen(false)
      } else {
        await addProduct(payload)
        setIsAddModalOpen(false)
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Une erreur est survenue lors de l\'enregistrement.')
    }
  }

  const handleDelete = (id: string) => {
    Alert.alert(
      'Supprimer le produit',
      'Êtes-vous sûr de vouloir supprimer ce produit du catalogue ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeProduct(id)
              setIsDetailModalOpen(false)
            } catch (err: any) {
              Alert.alert('Erreur', err.message || 'La suppression a échoué.')
            }
          },
        },
      ]
    )
  }

  const renderProductItem = ({ item }: { item: any }) => {
    const isLowStock = item.stockQuantity <= item.lowStockThreshold
    const catName = categories.find((c) => c.id === item.categoryId)?.name || 'Sans catégorie'

    return (
      <TouchableOpacity
        onPress={() => openDetailModal(item)}
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
        <View style={{ flex: 1, marginRight: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: NAVY }}>{item.name}</Text>
            {item.sku ? (
              <View style={{ backgroundColor: addOpacity(MUTED, '15'), borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: MUTED, fontWeight: '600' }}>{item.sku}</Text>
              </View>
            ) : null}
          </View>

          <Text style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{catName} · {item.unit}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: GREEN }}>
              {item.price.toLocaleString()} F
            </Text>
            {item.costPrice ? (
              <Text style={{ fontSize: 11, color: MUTED, textDecorationLine: 'line-through' }}>
                {item.costPrice.toLocaleString()} F
              </Text>
            ) : null}
          </View>
        </View>

        {/* Stock status */}
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={{
            backgroundColor: isLowStock ? addOpacity(AMBER, '15') : addOpacity(GREEN, '15'),
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}>
            {isLowStock ? <AlertTriangle size={12} color={AMBER} /> : null}
            <Text style={{ fontSize: 12, fontWeight: '700', color: isLowStock ? AMBER : GREEN }}>
              Stock: {item.stockQuantity}
            </Text>
          </View>
          <Text style={{ fontSize: 9, color: MUTED }}>min: {item.lowStockThreshold}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  const itemsToRender = filteredProducts()

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
          <Text style={{ fontSize: 18, fontWeight: '700', color: WHITE }}>Catalogue</Text>
          <Text style={{ fontSize: 12, color: '#85B7EB', marginTop: 2 }}>Gérer vos articles & stock</Text>
        </View>
        <TouchableOpacity
          onPress={openAddModal}
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: BLUE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={20} color={WHITE} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* ─── Search & Filters ─────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 10 }}>
        {/* Search input */}
        <AppInput
          placeholder="Rechercher par nom, SKU ou code barre..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftSlot={<Search size={18} color={MUTED} />}
          rightSlot={searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        />

        {/* Categories horizontal list */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        >
          <TouchableOpacity
            onPress={() => setSelectedCategory(null)}
            activeOpacity={0.72}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: selectedCategoryId === null ? NAVY : WHITE,
              borderWidth: 1,
              borderColor: selectedCategoryId === null ? NAVY : BORDER,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: selectedCategoryId === null ? WHITE : NAVY }}>
              Tous
            </Text>
          </TouchableOpacity>

          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setSelectedCategory(cat.id)}
              activeOpacity={0.72}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: selectedCategoryId === cat.id ? NAVY : WHITE,
                borderWidth: 1,
                borderColor: selectedCategoryId === cat.id ? NAVY : BORDER,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: selectedCategoryId === cat.id ? WHITE : NAVY }}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ─── Content List ──────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={{ color: MUTED, marginTop: 8, fontSize: 12 }}>Chargement du catalogue...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
          <AlertTriangle size={36} color={AMBER} />
          <Text style={{ fontSize: 14, color: NAVY, fontWeight: '600', textAlign: 'center' }}>{error}</Text>
          <AppButton size="sm" onPress={fetchProducts}>Réessayer</AppButton>
        </View>
      ) : itemsToRender.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: addOpacity(GREEN, '12'), alignItems: 'center', justifyContent: 'center' }}>
            <Package size={32} color={GREEN} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: NAVY }}>Aucun produit trouvé</Text>
          <Text style={{ fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 }}>
            {searchQuery ? 'Modifiez votre recherche ou sélectionnez une autre catégorie.' : 'Commencez à remplir votre catalogue en ajoutant votre premier produit.'}
          </Text>
          {!searchQuery && (
            <AppButton size="sm" onPress={openAddModal}>
              Créer un produit
            </AppButton>
          )}
        </View>
      ) : (
        <FlatList
          data={itemsToRender}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ─── Form modal (Add / Edit) ───────────────────────────────────── */}
      <Modal
        visible={isAddModalOpen || isDetailModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setIsAddModalOpen(false)
          setIsDetailModalOpen(false)
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
              {isAddModalOpen ? 'Nouveau produit' : 'Détails du produit'}
            </Text>
            <TouchableOpacity onPress={() => {
              setIsAddModalOpen(false)
              setIsDetailModalOpen(false)
            }}>
              <X size={22} color={NAVY} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <AppInput
              label="Nom du produit *"
              placeholder="ex: Coca Cola 33cl"
              value={name}
              onChangeText={setName}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AppInput
                label="Prix de vente (F) *"
                placeholder="0"
                keyboardType="numeric"
                value={price}
                onChangeText={setPrice}
                containerStyle={{ flex: 1 }}
              />
              <AppInput
                label="Prix d'achat (F)"
                placeholder="0"
                keyboardType="numeric"
                value={costPrice}
                onChangeText={setCostPrice}
                containerStyle={{ flex: 1 }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AppInput
                label="Stock initial"
                placeholder="0"
                keyboardType="numeric"
                value={stockQuantity}
                onChangeText={setStockQuantity}
                containerStyle={{ flex: 1 }}
                editable={isAddModalOpen} // Adjustments managed via separate flows once active
              />
              <AppInput
                label="Alerte stock bas"
                placeholder="5"
                keyboardType="numeric"
                value={lowStockThreshold}
                onChangeText={setLowStockThreshold}
                containerStyle={{ flex: 1 }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AppInput
                label="SKU / Référence"
                placeholder="ex: COCA-33"
                value={sku}
                onChangeText={setSku}
                containerStyle={{ flex: 1 }}
              />
              <AppInput
                label="Unité"
                placeholder="piece / kg / sac"
                value={unit}
                onChangeText={setUnit}
                containerStyle={{ flex: 1 }}
              />
            </View>

            <AppInput
              label="Code barre"
              placeholder="Scannez ou saisissez..."
              value={barcode}
              onChangeText={setBarcode}
              rightSlot={<Barcode size={20} color={MUTED} />}
            />

            {/* Category selection */}
            {categories.length > 0 && (
              <View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED, marginBottom: 6 }}>Catégorie</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setCategoryId(c.id)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: categoryId === c.id ? NAVY : WHITE,
                        borderWidth: 1,
                        borderColor: categoryId === c.id ? NAVY : BORDER,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: categoryId === c.id ? WHITE : NAVY }}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Actions */}
            <View style={{ marginTop: 24, gap: 10 }}>
              <AppButton
                loading={isSaving}
                onPress={() => handleSave(!isAddModalOpen)}
                fullWidth
              >
                {isAddModalOpen ? 'Créer le produit' : 'Enregistrer les modifications'}
              </AppButton>

              {isDetailModalOpen && selectedProduct && (
                <AppButton
                  variant="danger"
                  onPress={() => handleDelete(selectedProduct.id)}
                  fullWidth
                >
                  <Trash2 size={16} color={WHITE} /> Supprimer le produit
                </AppButton>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

