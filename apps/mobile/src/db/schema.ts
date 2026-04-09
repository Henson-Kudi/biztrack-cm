import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Base tracking columns injected into syncable tables
const baseColumns = {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
};

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  businessId: text('business_id'),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  role: text('role').notNull(),
  language: text('language').default('en'),
  avatarUrl: text('avatar_url'),
  ...baseColumns,
});

export const businesses = sqliteTable('businesses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  city: text('city'),
  country: text('country').notNull(),
  ...baseColumns,
});

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  categoryId: text('category_id'),
  name: text('name').notNull(),
  sku: text('sku'),
  barcode: text('barcode'),
  price: real('price').notNull(),
  costPrice: real('cost_price'),
  stockQuantity: integer('stock_quantity').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  unit: text('unit').notNull(),
  imageUrl: text('image_url'),
  ...baseColumns,
});

export const productCategories = sqliteTable('product_categories', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  name: text('name').notNull(),
  ...baseColumns,
});

export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  cashierId: text('cashier_id').notNull(),
  deviceId: text('device_id'),
  totalAmount: real('total_amount').notNull(),
  discountAmount: real('discount_amount').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  netAmount: real('net_amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  momoReference: text('momo_reference'),
  receiptNumber: text('receipt_number').notNull(),
  status: text('status').notNull(),
  ...baseColumns,
});

export const saleItems = sqliteTable('sale_items', {
  id: text('id').primaryKey(),
  saleId: text('sale_id').notNull(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  totalPrice: real('total_price').notNull(),
  ...baseColumns,
});

export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  amount: real('amount').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  ...baseColumns,
});

export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  type: text('type').notNull(),
  quantity: integer('quantity').notNull(),
  reason: text('reason'),
  ...baseColumns,
});

export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  businessId: text('business_id').notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull(),
});
