import { useRef, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Modal,
  TouchableOpacity,
  Animated,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { ShoppingCart, X, Tag, AlertTriangle } from 'lucide-react-native'
import { useCartStore } from '@/store/cart.store'
import { AppInput } from '@/components/ui/AppInput'
import { AppButton } from '@/components/ui/AppButton'
import { CartItemRow } from './CartItemRow'
import { PaymentMethodPicker } from './PaymentMethodPicker'
import theme from '../../../theme'

const { colors, radius } = theme

interface CartDrawerProps {
  visible: boolean
  onClose: () => void
  onCheckout: () => Promise<void>
  isCheckingOut: boolean
}

export function CartDrawer({ visible, onClose, onCheckout, isCheckingOut }: CartDrawerProps) {
  const {
    items,
    paymentMethod,
    discountAmount,
    itemCount,
    subtotal,
    total,
    updateQuantity,
    removeItem,
    setPaymentMethod,
    setDiscount,
  } = useCartStore()

  const slideAnim = useRef(new Animated.Value(0)).current
  // Keep the Modal mounted while closing so the spring animation is visible.
  // isMounted goes true immediately when opening, and false only after the
  // spring has finished settling to 0 (i.e. the sheet is off-screen).
  const [isMounted, setIsMounted] = useState(visible)

  useEffect(() => {
    if (visible) setIsMounted(true)
  }, [visible])

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start(({ finished }) => {
      if (finished && !visible) setIsMounted(false)
    })
  }, [visible])

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  })

  const count = itemCount()
  const sub = subtotal()
  const tot = total()

  return (
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
        accessible={false}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <ShoppingCart size={18} color={colors.primary} strokeWidth={2} />
              <Text style={styles.headerTitle}>Panier</Text>
              {count > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{count}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Fermer le panier">
              <X size={20} color={colors.neutral[400]} />
            </TouchableOpacity>
          </View>

          {count === 0 ? (
            <View style={styles.empty}>
              <ShoppingCart size={36} color={colors.neutral[100]} strokeWidth={1.5} />
              <Text style={styles.emptyText}>Panier vide</Text>
              <Text style={styles.emptySubtext}>Appuyez sur un produit pour l'ajouter</Text>
            </View>
          ) : (
            <>
              {/* Cart items */}
              <ScrollView
                style={styles.itemList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {items.map((item) => (
                  <CartItemRow
                    key={item.product.id}
                    item={item}
                    onIncrement={() => updateQuantity(item.product.id, item.quantity + 1)}
                    onDecrement={() => updateQuantity(item.product.id, item.quantity - 1)}
                    onRemove={() => removeItem(item.product.id)}
                  />
                ))}
              </ScrollView>

              {/* Discount input */}
              <View style={styles.section}>
                <AppInput
                  label="Remise (XAF)"
                  placeholder="0"
                  keyboardType="numeric"
                  value={discountAmount > 0 ? String(discountAmount) : ''}
                  onChangeText={(t) => setDiscount(Number(t.replace(/[^0-9]/g, '')) || 0)}
                  leftSlot={<Tag size={14} color={colors.neutral[400]} />}
                  hint={discountAmount >= sub && sub > 0 ? undefined : undefined}
                />
              </View>

              {/* Zero-total warning — shown when discount wipes out the full subtotal */}
              {tot === 0 && sub > 0 && (
                <View style={styles.zeroWarning}>
                  <AlertTriangle size={14} color={colors.warning[800]} strokeWidth={2} />
                  <Text style={styles.zeroWarningText}>
                    La remise couvre le total. La vente sera enregistrée à 0 XAF.
                  </Text>
                </View>
              )}

              {/* Payment method */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Mode de paiement</Text>
                <PaymentMethodPicker selected={paymentMethod} onSelect={setPaymentMethod} />
              </View>

              {/* Totals */}
              <View style={styles.totals}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Sous-total</Text>
                  <Text style={styles.totalValue}>{sub.toLocaleString('fr-FR')} XAF</Text>
                </View>
                {discountAmount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: colors.danger[400] }]}>Remise</Text>
                    <Text style={[styles.totalValue, { color: colors.danger[400] }]}>
                      − {discountAmount.toLocaleString('fr-FR')} XAF
                    </Text>
                  </View>
                )}
                <View style={[styles.totalRow, styles.totalFinal]}>
                  <Text style={styles.totalFinalLabel}>Total</Text>
                  <Text style={styles.totalFinalValue}>{tot.toLocaleString('fr-FR')} XAF</Text>
                </View>
              </View>

              {/* Checkout button — reuses AppButton */}
              <View style={styles.checkoutWrap}>
                <AppButton
                  fullWidth
                  size="lg"
                  loading={isCheckingOut}
                  onPress={onCheckout}
                >
                  Valider la vente · {tot.toLocaleString('fr-FR')} XAF
                </AppButton>
              </View>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  keyboardAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.neutral[800],
  },
  countBadge: {
    backgroundColor: colors.primary,
    borderRadius: 99,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.neutral[400],
  },
  emptySubtext: {
    fontSize: 12,
    color: colors.neutral[100],
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  itemList: {
    maxHeight: 240,
    paddingHorizontal: 16,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.neutral[400],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totals: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: colors.neutral[400],
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.neutral[800],
  },
  totalFinal: {
    borderTopWidth: 1,
    borderTopColor: colors.neutral[50],
    paddingTop: 8,
    marginTop: 4,
  },
  totalFinalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.neutral[800],
  },
  totalFinalValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },
  checkoutWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  zeroWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[400],
  },
  zeroWarningText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning[800],
    fontWeight: '500',
  },
})
