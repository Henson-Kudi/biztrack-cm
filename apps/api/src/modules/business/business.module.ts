import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessesController } from './businesses.controller'
import { BusinessService } from './business.service'
import { Business } from '../../entities/business.entity'
import { User } from '../../entities/user.entity'
import { BusinessMember } from '../../entities/business-member.entity'
import { BusinessesRepository } from './repositories/businesses.repository'
import { BusinessMembersRepository } from './repositories/business-members.repository'
import { RolesModule } from '@/modules/roles/roles.module'

@Module({
  imports: [TypeOrmModule.forFeature([Business, User, BusinessMember]), RolesModule],
  controllers: [BusinessesController],
  providers: [BusinessesRepository, BusinessMembersRepository, BusinessService],
  exports: [BusinessService, BusinessesRepository],
})
export class BusinessModule {}
