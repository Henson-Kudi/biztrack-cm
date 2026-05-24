import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type {
  CreateRoleRequest,
  JwtPayload,
  ListPermissionsResponse,
  ListRolesResponse,
  RoleWithPermissions,
  UpdateRoleRequest,
} from '@biztrack/types'
import { BusinessMemberRole } from '@biztrack/types'
import { Role } from '@/entities/role.entity'
import { RolePermission } from '@/entities/role-permission.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import {
  AppBadRequestException,
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
} from '@/common/exceptions/app-exceptions'
import {
  PERMISSION_CATALOGUE,
  PERMISSION_KEYS,
  SYSTEM_ROLE_NAMES,
  SYSTEM_ROLE_PERMISSIONS,
} from './permissions.catalogue'

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly rolesRepo: Repository<Role>,
    @InjectRepository(RolePermission) private readonly rolePermsRepo: Repository<RolePermission>,
    @InjectRepository(BusinessMember) private readonly membersRepo: Repository<BusinessMember>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.logger.setContext('RolesService')
  }

  async listRoles(
    businessId: string,
    options: { page?: number; limit?: number; search?: string } = {},
  ): Promise<ListRolesResponse> {
    const page = Math.max(1, options.page ?? 1)
    const limit = Math.min(50, Math.max(1, options.limit ?? 5))
    const offset = (page - 1) * limit

    const qb = this.rolesRepo
      .createQueryBuilder('r')
      .where('r.business_id = :businessId', { businessId })
      .andWhere('r.is_owner_role = false')

    if (options.search?.trim()) {
      qb.andWhere('LOWER(r.name) LIKE :search', {
        search: `%${options.search.trim().toLowerCase()}%`,
      })
    }

    const [roles, total] = await qb
      .orderBy('r.is_system', 'DESC')
      .addOrderBy('r.name', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount()

    const memberCounts = await this.membersRepo
      .createQueryBuilder('m')
      .select('m.role_id', 'roleId')
      .addSelect('COUNT(*)', 'count')
      .where('m.business_id = :businessId', { businessId })
      .andWhere('m.role_id IS NOT NULL')
      .groupBy('m.role_id')
      .getRawMany<{ roleId: string; count: string }>()

    const countMap = new Map(memberCounts.map((r) => [r.roleId, parseInt(r.count, 10)]))

    return {
      roles: roles.map((r) => ({
        id: r.id,
        businessId: r.businessId,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        isOwnerRole: r.isOwnerRole,
        colour: r.colour,
        userCount: countMap.get(r.id) ?? 0,
      })),
      total,
      page,
      limit,
    }
  }

  async getRole(id: string, businessId: string): Promise<RoleWithPermissions> {
    const role = await this.rolesRepo.findOne({ where: { id, businessId } })
    if (!role) {
      throw new AppNotFoundException('Role not found', 'ROLE_NOT_FOUND')
    }

    const perms = await this.rolePermsRepo.find({ where: { roleId: id } })

    const memberCount = await this.membersRepo.count({ where: { businessId, roleId: id } as any })

    return {
      id: role.id,
      businessId: role.businessId,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isOwnerRole: role.isOwnerRole,
      colour: role.colour,
      userCount: memberCount,
      permissions: perms.map((p) => p.permission),
    }
  }

  // ── Containment helpers ──────────────────────────────────────────────────────

  /** Return the permission set for a given roleId (empty set if no roleId). */
  async getActorPermissions(roleId: string | null | undefined, businessId: string): Promise<Set<string>> {
    if (!roleId) return new Set()
    const perms = await this.rolePermsRepo.find({ where: { roleId, businessId } })
    return new Set(perms.map((p) => p.permission))
  }

  /**
   * Ensure the actor has `roles:manage` and that every permission on the
   * target role is within the actor's own permission set.
   * Owner users bypass all checks.
   */
  private async requireRolesManageAccess(actor: JwtPayload, targetRoleId?: string): Promise<void> {
    if (actor.isOwner) return

    const actorPerms = await this.getActorPermissions(actor.roleId, actor.businessId as string)

    if (!actorPerms.has('roles:manage')) {
      throw new AppForbiddenException(
        'You need the "roles:manage" permission to perform this action',
        'INSUFFICIENT_PERMISSIONS',
      )
    }

    if (targetRoleId) {
      await this.assertRoleContained(targetRoleId, actorPerms)
    }
  }

  /**
   * Verify every permission on `targetRoleId` is present in `actorPermSet`.
   * Throws if the target role has permissions the actor does not hold.
   */
  async assertRoleContained(targetRoleId: string, actorPermSet: Set<string>): Promise<void> {
    const perms = await this.rolePermsRepo.find({ where: { roleId: targetRoleId } })
    const violation = perms.find((p) => !actorPermSet.has(p.permission))
    if (violation) {
      throw new AppForbiddenException(
        'You cannot manage a role that has permissions exceeding your own',
        'ROLE_CONTAINMENT_VIOLATION',
      )
    }
  }

  /**
   * Verify every permission in the given list is held by the actor.
   * Prevents granting permissions the actor does not possess.
   */
  assertPermissionsGrantable(permissions: string[], actorPermSet: Set<string>): void {
    const violation = permissions.find((p) => !actorPermSet.has(p))
    if (violation) {
      throw new AppForbiddenException(
        `You cannot grant the permission "${violation}" because you do not hold it`,
        'PERMISSION_ESCALATION',
      )
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────

  async createRole(actor: JwtPayload, businessId: string, dto: CreateRoleRequest): Promise<RoleWithPermissions> {
    await this.requireRolesManageAccess(actor)

    const invalid = dto.permissions.filter((p) => !PERMISSION_KEYS.includes(p))
    if (invalid.length) {
      throw new AppBadRequestException(`Unknown permissions: ${invalid.join(', ')}`, 'INVALID_PERMISSIONS')
    }

    // Non-owners cannot grant permissions they don't hold
    if (!actor.isOwner && dto.permissions.length) {
      const actorPerms = await this.getActorPermissions(actor.roleId, businessId)
      this.assertPermissionsGrantable(dto.permissions, actorPerms)
    }

    const existing = await this.rolesRepo.findOne({ where: { businessId, name: dto.name } })
    if (existing) {
      throw new AppConflictException('A role with this name already exists', 'ROLE_NAME_CONFLICT')
    }

    const role = this.rolesRepo.create({
      businessId,
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      isOwnerRole: false,
      colour: dto.colour ?? null,
      createdBy: actor.sub,
    })
    await this.rolesRepo.save(role)

    if (dto.permissions.length) {
      const permEntities = dto.permissions.map((perm) =>
        this.rolePermsRepo.create({
          roleId: role.id,
          businessId,
          permission: perm,
          grantedAt: new Date(),
          grantedBy: actor.sub,
        }),
      )
      await this.rolePermsRepo.save(permEntities)
    }

    return this.getRole(role.id, businessId)
  }

  async updateRole(actor: JwtPayload, id: string, businessId: string, dto: UpdateRoleRequest): Promise<RoleWithPermissions> {
    await this.requireRolesManageAccess(actor, id)

    const role = await this.rolesRepo.findOne({ where: { id, businessId } })
    if (!role) throw new AppNotFoundException('Role not found', 'ROLE_NOT_FOUND')
    if (role.isSystem) throw new AppForbiddenException('System roles cannot be edited', 'ROLE_SYSTEM_IMMUTABLE')

    if (dto.name && dto.name !== role.name) {
      const conflict = await this.rolesRepo.findOne({ where: { businessId, name: dto.name } })
      if (conflict) throw new AppConflictException('A role with this name already exists', 'ROLE_NAME_CONFLICT')
    }

    await this.rolesRepo.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.colour !== undefined && { colour: dto.colour }),
    })

    return this.getRole(id, businessId)
  }

  async deleteRole(actor: JwtPayload, id: string, businessId: string): Promise<{ deleted: boolean }> {
    await this.requireRolesManageAccess(actor, id)

    const role = await this.rolesRepo.findOne({ where: { id, businessId } })
    if (!role) throw new AppNotFoundException('Role not found', 'ROLE_NOT_FOUND')
    if (role.isSystem) throw new AppForbiddenException('System roles cannot be deleted', 'ROLE_SYSTEM_IMMUTABLE')

    const memberCount = await this.membersRepo.count({ where: { businessId, roleId: id } as any })
    if (memberCount > 0) {
      throw new AppBadRequestException(
        'Cannot delete a role that is assigned to users',
        'ROLE_HAS_MEMBERS',
      )
    }

    await this.rolesRepo.delete(id)
    return { deleted: true }
  }

  async setRolePermissions(actor: JwtPayload, id: string, businessId: string, permissions: string[]): Promise<RoleWithPermissions> {
    await this.requireRolesManageAccess(actor, id)

    const role = await this.rolesRepo.findOne({ where: { id, businessId } })
    if (!role) throw new AppNotFoundException('Role not found', 'ROLE_NOT_FOUND')
    if (role.isOwnerRole) throw new AppForbiddenException('Owner role permissions cannot be changed', 'ROLE_OWNER_IMMUTABLE')

    const invalid = permissions.filter((p) => !PERMISSION_KEYS.includes(p))
    if (invalid.length) throw new AppBadRequestException(`Unknown permissions: ${invalid.join(', ')}`, 'INVALID_PERMISSIONS')

    if (!actor.isOwner) {
      const actorPerms = await this.getActorPermissions(actor.roleId, businessId)
      this.assertPermissionsGrantable(permissions, actorPerms)
    }

    await this.rolePermsRepo.delete({ roleId: id })

    if (permissions.length) {
      const perms = permissions.map((perm) =>
        this.rolePermsRepo.create({ roleId: id, businessId, permission: perm, grantedAt: new Date(), grantedBy: actor.sub }),
      )
      await this.rolePermsRepo.save(perms)
    }

    return this.getRole(id, businessId)
  }

  async addPermission(actor: JwtPayload, id: string, businessId: string, permission: string): Promise<RoleWithPermissions> {
    await this.requireRolesManageAccess(actor, id)

    const role = await this.rolesRepo.findOne({ where: { id, businessId } })
    if (!role) throw new AppNotFoundException('Role not found', 'ROLE_NOT_FOUND')
    if (role.isOwnerRole) throw new AppForbiddenException('Owner role permissions cannot be changed', 'ROLE_OWNER_IMMUTABLE')
    if (!PERMISSION_KEYS.includes(permission)) throw new AppBadRequestException(`Unknown permission: ${permission}`, 'INVALID_PERMISSIONS')

    if (!actor.isOwner) {
      const actorPerms = await this.getActorPermissions(actor.roleId, businessId)
      this.assertPermissionsGrantable([permission], actorPerms)
    }

    const existing = await this.rolePermsRepo.findOne({ where: { roleId: id, permission } })
    if (!existing) {
      await this.rolePermsRepo.save(
        this.rolePermsRepo.create({ roleId: id, businessId, permission, grantedAt: new Date(), grantedBy: actor.sub }),
      )
    }

    return this.getRole(id, businessId)
  }

  async removePermission(actor: JwtPayload, id: string, businessId: string, permission: string): Promise<RoleWithPermissions> {
    await this.requireRolesManageAccess(actor, id)

    const role = await this.rolesRepo.findOne({ where: { id, businessId } })
    if (!role) throw new AppNotFoundException('Role not found', 'ROLE_NOT_FOUND')
    if (role.isOwnerRole) throw new AppForbiddenException('Owner role permissions cannot be changed', 'ROLE_OWNER_IMMUTABLE')

    await this.rolePermsRepo.delete({ roleId: id, permission })
    return this.getRole(id, businessId)
  }

  listPermissions(): ListPermissionsResponse {
    return { permissions: PERMISSION_CATALOGUE }
  }

  /** Seed the 4 default system roles for a newly created business */
  async seedDefaultRoles(businessId: string, ownerUserId: string): Promise<void> {
    const defaultRoles = [
      { name: 'OWNER', description: 'Full access — cannot be edited', isOwnerRole: true },
      { name: 'MANAGER', description: 'Can manage most operations', isOwnerRole: false },
      { name: 'CASHIER', description: 'Can process sales', isOwnerRole: false },
      { name: 'ACCOUNTANT', description: 'Can view financial reports', isOwnerRole: false },
    ]

    for (const def of defaultRoles) {
      const role = this.rolesRepo.create({
        businessId,
        name: def.name,
        description: def.description,
        isSystem: true,
        isOwnerRole: def.isOwnerRole,
        colour: null,
        createdBy: null,
      })
      await this.rolesRepo.save(role)

      const perms = (SYSTEM_ROLE_PERMISSIONS[def.name] ?? []).map((perm) =>
        this.rolePermsRepo.create({
          roleId: role.id,
          businessId,
          permission: perm,
          grantedAt: new Date(),
          grantedBy: ownerUserId,
        }),
      )
      if (perms.length) await this.rolePermsRepo.save(perms)
    }
  }

  /** Look up a role by ID for a specific business, throws if not found */
  async findByIdOrFail(roleId: string, businessId: string): Promise<Role> {
    const role = await this.rolesRepo.findOne({ where: { id: roleId, businessId } })
    if (!role) throw new AppNotFoundException('Role not found', 'ROLE_NOT_FOUND')
    return role
  }

  /** Find the owner role for a business */
  async findOwnerRole(businessId: string): Promise<Role | null> {
    return this.rolesRepo.findOne({ where: { businessId, isOwnerRole: true } })
  }

  /** Map a role's name to the BusinessMemberRole enum (for backward compat) */
  static toMemberRoleEnum(roleName: string): BusinessMemberRole {
    const map: Record<string, BusinessMemberRole> = {
      OWNER: BusinessMemberRole.OWNER,
      MANAGER: BusinessMemberRole.MANAGER,
      CASHIER: BusinessMemberRole.CASHIER,
      ACCOUNTANT: BusinessMemberRole.ACCOUNTANT,
    }
    return map[roleName] ?? BusinessMemberRole.STAFF
  }

  /** Find a system role by name for a business */
  async findSystemRole(businessId: string, name: string): Promise<Role | null> {
    return this.rolesRepo.findOne({ where: { businessId, name, isSystem: true } })
  }
}
