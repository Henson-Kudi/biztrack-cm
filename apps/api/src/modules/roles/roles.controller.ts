import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload, ListPermissionsResponse, ListRolesResponse, RoleWithPermissions } from '@biztrack/types'
import { RolesService } from './roles.service'
import { CreateRoleDto } from './dto/create-role.dto'
import { AddRolePermissionDto, SetRolePermissionsDto, UpdateRoleDto } from './dto/update-role.dto'

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'List roles for the current business (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<ListRolesResponse> {
    return this.rolesService.listRoles(user.businessId as string, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
    })
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom role' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRoleDto,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.createRole(user, user.businessId as string, dto)
  }

  @Get('permissions')
  @ApiOperation({ summary: 'List all available permissions' })
  listPermissions(): ListPermissionsResponse {
    return this.rolesService.listPermissions()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a role with its permissions' })
  async getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.getRole(id, user.businessId as string)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update role name/description/colour (custom roles only)' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.updateRole(user, id, user.businessId as string, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a custom role' })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ deleted: boolean }> {
    return this.rolesService.deleteRole(user, id, user.businessId as string)
  }

  @Put(':id/permissions')
  @ApiOperation({ summary: 'Replace the full permission set for a role' })
  async setPermissions(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.setRolePermissions(user, id, user.businessId as string, dto.permissions)
  }

  @Post(':id/permissions')
  @ApiOperation({ summary: 'Add a single permission to a role' })
  async addPermission(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddRolePermissionDto,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.addPermission(user, id, user.businessId as string, dto.permission)
  }

  @Delete(':id/permissions/:permission')
  @ApiOperation({ summary: 'Remove a single permission from a role' })
  async removePermission(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('permission') permission: string,
  ): Promise<RoleWithPermissions> {
    return this.rolesService.removePermission(user, id, user.businessId as string, permission)
  }
}
