import { create } from 'zustand'
import {
  getProducts,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  type Product,
  type ProductCategory,
  type CreateProductPayload,
  type UpdateProductPayload,
} from '../services/products.service'

// ─── State ────────────────────────────────────────────────────────────────────

interface ProductsState {
  products: Product[]
  categories: ProductCategory[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  selectedCategoryId: string | null
  searchQuery: string

  // Computed
  filteredProducts: () => Product[]

  // Filters
  setSelectedCategory: (id: string | null) => void
  setSearchQuery: (q: string) => void

  // Data fetching
  fetchProducts: () => Promise<void>
  fetchCategories: () => Promise<void>

  // Mutations
  addProduct: (payload: CreateProductPayload) => Promise<Product>
  editProduct: (id: string, payload: UpdateProductPayload) => Promise<Product>
  removeProduct: (id: string) => Promise<void>
  addCategory: (name: string) => Promise<ProductCategory>
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  categories: [],
  isLoading: false,
  isSaving: false,
  error: null,
  selectedCategoryId: null,
  searchQuery: '',

  // ── Computed ──

  filteredProducts: () => {
    const { products, selectedCategoryId, searchQuery } = get()
    let result = products.filter((p) => p.isActive)

    if (selectedCategoryId) {
      result = result.filter((p) => p.categoryId === selectedCategoryId)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q),
      )
    }

    return result
  },

  // ── Filters ──

  setSelectedCategory: (id) => set({ selectedCategoryId: id }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  // ── Data fetching ──

  fetchProducts: async () => {
    set({ isLoading: true, error: null })
    try {
      const products = await getProducts()
      // Clear any stale error on success
      set({ products, error: null })
    } catch {
      set({ error: 'Impossible de charger les produits.' })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchCategories: async () => {
    try {
      const categories = await getCategories()
      set({ categories })
    } catch {
      // Categories are supplementary — fail silently
    }
  },

  // ── Mutations ──

  // addProduct lets the error propagate so callers can catch and display it,
  // consistent with editProduct. isSaving is always cleaned up in finally.
  addProduct: async (payload) => {
    set({ isSaving: true })
    try {
      const product = await createProduct(payload)
      set((state) => ({ products: [product, ...state.products] }))
      return product
    } finally {
      set({ isSaving: false })
    }
  },

  editProduct: async (id, payload) => {
    set({ isSaving: true })
    try {
      const updated = await updateProduct(id, payload)
      set((state) => ({
        products: state.products.map((p) => (p.id === id ? updated : p)),
      }))
      return updated
    } finally {
      set({ isSaving: false })
    }
  },

  removeProduct: async (id) => {
    set({ isSaving: true })
    const productToRestore = get().products.find((p) => p.id === id)

    // Optimistic remove
    set((state) => ({ products: state.products.filter((p) => p.id !== id) }))
    try {
      await deleteProduct(id)
    } catch {
      // Rollback: re-find the insertion point in the post-delete state to handle
      // concurrent deletes correctly (avoids stale originalIndex being wrong).
      if (productToRestore) {
        set((state) => {
          // Insert before the first item that sorts after the restored one by id,
          // or append if none found — preserves approximate original position.
          const idx = state.products.findIndex((p) => p.id > productToRestore.id)
          const newProducts = [...state.products]
          newProducts.splice(idx >= 0 ? idx : newProducts.length, 0, productToRestore)
          return { products: newProducts }
        })
      }
      throw new Error('Suppression échouée.')
    } finally {
      set({ isSaving: false })
    }
  },

  addCategory: async (name) => {
    set({ isSaving: true })
    try {
      const category = await createCategory(name)
      set((state) => ({ categories: [...state.categories, category] }))
      return category
    } finally {
      set({ isSaving: false })
    }
  },
}))
