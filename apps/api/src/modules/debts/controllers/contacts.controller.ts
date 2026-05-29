import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  DebtDirection,
  Resource,
  type ContactDetail,
  type ContactListResult,
  type ContactNetPosition,
  type ContactOpeningBalance,
  type ContactStatement,
  type DebtListResult,
  type JwtPayload,
} from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { ContactStatementQueryDto } from '../dto/contact-statement-query.dto'
import { CreateContactDto } from '../dto/create-contact.dto'
import { ListContactsQueryDto } from '../dto/list-contacts-query.dto'
import { ListDebtsQueryDto } from '../dto/list-debts-query.dto'
import { UpdateContactDto } from '../dto/update-contact.dto'
import { UpsertOpeningBalanceDto } from '../dto/upsert-opening-balance.dto'
import { ContactsService } from '../services/contacts.service'
import { OpeningBalancesService } from '../services/opening-balances.service'

@ApiTags('Contacts')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly openingBalancesService: OpeningBalancesService,
  ) {}

  @Get()
  @RequireResource(Resource.CONTACTS_VIEW)
  @ApiOperation({ summary: 'List contacts' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListContactsQueryDto,
  ): Promise<ContactListResult> {
    return this.contactsService.findAll(user.businessId as string, query)
  }

  @Get(':id')
  @RequireResource(Resource.CONTACTS_VIEW)
  @ApiOperation({ summary: 'Get contact detail with debt summary' })
  findById(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<ContactDetail> {
    return this.contactsService.findById(id, user.businessId as string)
  }

  @Post()
  @RequireResource(Resource.CONTACTS_MANAGE)
  @ApiOperation({ summary: 'Create a contact' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateContactDto): Promise<ContactDetail> {
    return this.contactsService.create(user.businessId as string, user, dto)
  }

  @Patch(':id')
  @RequireResource(Resource.CONTACTS_MANAGE)
  @ApiOperation({ summary: 'Update a contact' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<ContactDetail> {
    return this.contactsService.update(id, user.businessId as string, dto)
  }

  @Delete(':id')
  @RequireResource(Resource.CONTACTS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a contact' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.contactsService.remove(id, user.businessId as string)
  }

  @Get(':id/debts')
  @RequireResource(Resource.DEBTS_VIEW)
  @ApiOperation({ summary: 'List debts for a contact' })
  getDebts(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: ListDebtsQueryDto,
  ): Promise<DebtListResult> {
    return this.contactsService.getDebts(id, user.businessId as string, query)
  }

  @Get(':id/statement')
  @RequireResource(Resource.DEBTS_VIEW)
  @ApiOperation({ summary: 'Get a contact statement' })
  getStatement(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: ContactStatementQueryDto,
  ): Promise<ContactStatement> {
    return this.contactsService.getStatement(id, user.businessId as string, query.direction)
  }

  @Post(':id/opening-balance')
  @RequireResource(Resource.OPENING_BALANCES)
  @ApiOperation({ summary: 'Upsert an opening balance for a contact' })
  upsertOpeningBalance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpsertOpeningBalanceDto,
  ): Promise<ContactOpeningBalance> {
    return this.openingBalancesService.upsert(id, user.businessId as string, dto, user)
  }

  @Get(':id/opening-balance')
  @RequireResource(Resource.CONTACTS_VIEW)
  @ApiOperation({ summary: 'List opening balances for a contact' })
  getOpeningBalances(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<ContactOpeningBalance[]> {
    return this.openingBalancesService.findAllForContact(id, user.businessId as string)
  }

  @Delete(':id/opening-balance/:direction')
  @RequireResource(Resource.CONTACTS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an opening balance for a contact' })
  deleteOpeningBalance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('direction') direction: DebtDirection,
  ): Promise<void> {
    return this.openingBalancesService.delete(id, user.businessId as string, direction)
  }

  @Get(':id/net-position')
  @RequireResource(Resource.DEBTS_VIEW)
  @ApiOperation({ summary: 'Get net position for a contact' })
  getNetPosition(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<ContactNetPosition> {
    return this.openingBalancesService.getNetPosition(id, user.businessId as string)
  }
}
