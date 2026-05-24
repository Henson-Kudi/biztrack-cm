export interface RoleItem {
  id: string
  businessId: string
  name: string
  description: string | null
  isSystem: boolean
  isOwnerRole: boolean
  colour: string | null
  userCount: number
}

export interface RoleWithPermissions extends RoleItem {
  permissions: string[]
}

export interface PermissionCatalogItem {
  key: string
  label: string
  description: string
  group: string
}

export interface ListRolesResponse {
  roles: RoleItem[]
  total: number
  page: number
  limit: number
}

export interface ListPermissionsResponse {
  permissions: PermissionCatalogItem[]
}

export interface CreateRoleRequest {
  name: string
  description?: string
  permissions: string[]
  colour?: string
}

export interface UpdateRoleRequest {
  name?: string
  description?: string
  colour?: string
}

export interface SetRolePermissionsRequest {
  permissions: string[]
}

export interface AddRolePermissionRequest {
  permission: string
}
