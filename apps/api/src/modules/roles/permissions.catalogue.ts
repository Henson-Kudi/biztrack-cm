import type { PermissionCatalogItem } from '@biztrack/types'

export const PERMISSION_CATALOGUE: PermissionCatalogItem[] = [
  // Sales
  { key: 'sales:create', group: 'sales', label: 'Enregistrer une vente', description: 'Créer une nouvelle vente' },
  { key: 'sales:void', group: 'sales', label: 'Annuler une vente', description: 'Annuler une vente existante' },
  { key: 'sales:view_all', group: 'sales', label: 'Voir toutes les ventes', description: 'Consulter toutes les ventes (pas seulement les siennes)' },
  { key: 'sales:view_own', group: 'sales', label: 'Voir ses propres ventes', description: 'Consulter uniquement ses propres ventes' },
  // Expenses
  { key: 'expenses:create', group: 'expenses', label: 'Enregistrer une dépense', description: 'Créer une nouvelle dépense' },
  { key: 'expenses:view', group: 'expenses', label: 'Voir les dépenses', description: 'Consulter la liste des dépenses' },
  { key: 'expenses:delete', group: 'expenses', label: 'Supprimer une dépense', description: 'Supprimer une dépense existante' },
  // Contacts
  { key: 'contacts:create', group: 'contacts', label: 'Ajouter un contact', description: 'Créer un nouveau client ou fournisseur' },
  { key: 'contacts:view', group: 'contacts', label: 'Voir les contacts', description: 'Consulter la liste des contacts' },
  { key: 'contacts:edit', group: 'contacts', label: 'Modifier un contact', description: 'Mettre à jour les informations d\'un contact' },
  // Inventory
  { key: 'inventory:adjust', group: 'inventory', label: 'Ajuster le stock', description: 'Effectuer des ajustements de stock manuels' },
  { key: 'inventory:view', group: 'inventory', label: 'Voir le stock complet', description: 'Consulter les niveaux de stock détaillés' },
  { key: 'inventory:view_stock', group: 'inventory', label: 'Voir les niveaux de stock', description: 'Voir les niveaux de stock actuels' },
  // Debts
  { key: 'debts:record_payment', group: 'debts', label: 'Enregistrer un paiement de dette', description: 'Marquer un paiement sur une dette' },
  { key: 'debts:view', group: 'debts', label: 'Voir les dettes', description: 'Consulter la liste des dettes' },
  { key: 'debts:write_off', group: 'debts', label: 'Passer en perte', description: 'Radier une mauvaise créance (sensible)' },
  // Reports
  { key: 'reports:basic', group: 'reports', label: 'Rapports de base', description: 'Accéder aux rapports de ventes standards' },
  { key: 'reports:financial', group: 'reports', label: 'Rapports financiers', description: 'Accéder aux rapports P&L et financiers' },
  // Admin
  { key: 'users:manage', group: 'admin', label: 'Gérer les utilisateurs', description: 'Inviter ou désactiver des membres' },
  { key: 'roles:manage', group: 'admin', label: 'Gérer les rôles', description: 'Créer, modifier et supprimer des rôles (limité à la portée de ses propres permissions)' },
  { key: 'business:settings', group: 'admin', label: 'Paramètres de l\'entreprise', description: 'Modifier le nom, le plan, etc. (propriétaire seulement)' },
]

export const PERMISSION_KEYS = PERMISSION_CATALOGUE.map((p) => p.key)

/** System role name → permission array */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: PERMISSION_CATALOGUE.map((p) => p.key),
  MANAGER: [
    'sales:create', 'sales:void', 'sales:view_all',
    'expenses:create', 'expenses:view',
    'contacts:create', 'contacts:view', 'contacts:edit',
    'inventory:adjust', 'inventory:view',
    'debts:record_payment', 'debts:view',
    'reports:basic', 'reports:financial',
    'roles:manage',
  ],
  CASHIER: [
    'sales:create', 'sales:view_own',
    'contacts:view',
    'inventory:view_stock',
  ],
  ACCOUNTANT: [
    'sales:view_all',
    'expenses:view',
    'contacts:view',
    'debts:view',
    'reports:basic', 'reports:financial',
  ],
}

export const SYSTEM_ROLE_NAMES = ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT']
