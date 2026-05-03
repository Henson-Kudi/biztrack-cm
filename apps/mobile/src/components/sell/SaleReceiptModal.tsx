import { View, Text, ScrollView, Modal, StyleSheet, Platform } from 'react-native'
import { CheckCircle, Printer, ShoppingBag } from 'lucide-react-native'
import { AppButton } from '@/components/ui/AppButton'
import type { Sale } from '@/services/sales.service'
import { UNIT_LABELS } from '../products/productHelpers'
import theme from '../../../theme'

const { colors, radius } = theme

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte',
}

interface SaleReceiptModalProps {
  sale: Sale | null
  visible: boolean
  onClose: () => void
  onNewSale: () => void
}

export function SaleReceiptModal({ sale, visible, onClose, onNewSale }: SaleReceiptModalProps) {
  if (!sale) return null

  const date = new Date(sale.createdAt)
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const timeStr = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Success header */}
          <View style={styles.successHeader}>
            <View style={styles.checkCircle}>
              <CheckCircle size={36} color={colors.success[400]} strokeWidth={1.8} />
            </View>
            <Text style={styles.successTitle}>Vente enregistrée !</Text>
            <Text style={styles.receiptNo}>Reçu #{sale.receiptNumber}</Text>
            <Text style={styles.dateTime}>{dateStr} à {timeStr}</Text>
          </View>

          {/* Divider with zigzag feel */}
          <View style={styles.divider} />

          {/* Line items */}
          <ScrollView style={styles.itemList} showsVerticalScrollIndicator={false}>
            {sale.items.map((item, idx) => {
              const unitLabel = UNIT_LABELS[item.productId] ?? 'pce'
              return (
                <View key={idx} style={styles.lineItem}>
                  <View style={styles.lineLeft}>
                    <Text style={styles.lineName}>{item.productName}</Text>
                    <Text style={styles.lineQty}>
                      {item.quantity} × {item.unitPrice.toLocaleString('fr-FR')} XAF
                    </Text>
                  </View>
                  <Text style={styles.lineTotal}>
                    {item.subtotal.toLocaleString('fr-FR')} XAF
                  </Text>
                </View>
              )
            })}
          </ScrollView>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Totals */}
          <View style={styles.totals}>
            {sale.subtotal !== sale.total && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Sous-total</Text>
                <Text style={styles.totalValue}>{sale.subtotal.toLocaleString('fr-FR')} XAF</Text>
              </View>
            )}
            {sale.discountAmount > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.danger[400] }]}>Remise</Text>
                <Text style={[styles.totalValue, { color: colors.danger[400] }]}>
                  − {sale.discountAmount.toLocaleString('fr-FR')} XAF
                </Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text style={styles.grandLabel}>Total payé</Text>
              <Text style={styles.grandValue}>{sale.total.toLocaleString('fr-FR')} XAF</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Mode de paiement</Text>
              <Text style={styles.totalValue}>{PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <View style={styles.actionBtn}>
              <AppButton variant="secondary" size="md" onPress={onClose} fullWidth>
                <Printer size={15} color={colors.primary} strokeWidth={2} />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Imprimer</Text>
              </AppButton>
            </View>
            <View style={styles.actionBtn}>
              <AppButton variant="primary" size="md" onPress={onNewSale} fullWidth>
                <ShoppingBag size={15} color="#fff" strokeWidth={2} />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Nouvelle vente</Text>
              </AppButton>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.hero,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  successHeader: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: colors.success[50],
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: colors.success[400],
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.success[800],
    marginBottom: 4,
  },
  receiptNo: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success[400],
    marginBottom: 2,
  },
  dateTime: {
    fontSize: 12,
    color: colors.neutral[400],
  },
  divider: {
    height: 1,
    backgroundColor: colors.neutral[50],
    marginHorizontal: 16,
  },
  itemList: {
    maxHeight: 200,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    gap: 8,
  },
  lineLeft: {
    flex: 1,
  },
  lineName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.neutral[800],
  },
  lineQty: {
    fontSize: 11,
    color: colors.neutral[400],
    marginTop: 1,
  },
  lineTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brand[800],
  },
  totals: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  grandTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.neutral[50],
    paddingTop: 8,
    marginTop: 2,
    marginBottom: 2,
  },
  grandLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.neutral[800],
  },
  grandValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  actionBtn: {
    flex: 1,
  },
})
