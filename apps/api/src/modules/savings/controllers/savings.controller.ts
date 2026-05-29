import { Controller, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { SavingsService } from '../services/savings.service'

@ApiTags('Savings')
@ApiBearerAuth()
@Controller('savings')
@UseGuards(Phase2Guard)
export class SavingsController {
  constructor(private readonly savingsService: SavingsService) {}
}
