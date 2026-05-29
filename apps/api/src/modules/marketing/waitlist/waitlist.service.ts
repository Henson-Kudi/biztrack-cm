import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { WaitlistEntry } from '@/entities/waitlist-entry.entity'
import { CreateWaitlistDto } from './dto/create-waitlist.dto'
import { NotificationsService } from '@/modules/notifications/services/notifications.service'

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name)

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly repo: Repository<WaitlistEntry>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    dto: CreateWaitlistDto,
    meta: { userAgent?: string; referrer?: string },
  ): Promise<WaitlistEntry> {
    const existing = await this.repo.findOne({ where: { email: dto.email } })

    const entry = this.repo.create({
      ...dto,
      locale: dto.locale ?? 'en',
      user_agent: meta.userAgent?.substring(0, 500),
      referrer: meta.referrer?.substring(0, 100),
      utm_source: dto.utm_source,
      utm_medium: dto.utm_medium,
      utm_campaign: dto.utm_campaign,
      is_duplicate: !!existing,
      status: 'PENDING',
    })

    const saved = await this.repo.save(entry)
    this.logger.log(`Waitlist entry saved: ${saved.id}`)

    await this.notificationsService
      .sendWaitlistNotification(saved)
      .catch(err => this.logger.error('Waitlist email failed', err))

    return saved
  }

  async findAll(filters?: {
    status?: string
    locale?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    limit?: number
  }): Promise<{ entries: WaitlistEntry[]; total: number }> {
    const qb = this.repo.createQueryBuilder('w')

    if (filters?.status) qb.andWhere('w.status = :status', { status: filters.status })
    if (filters?.locale) qb.andWhere('w.locale = :locale', { locale: filters.locale })
    if (filters?.dateFrom) qb.andWhere('w.created_at >= :from', { from: filters.dateFrom })
    if (filters?.dateTo) qb.andWhere('w.created_at <= :to', { to: filters.dateTo })

    qb.orderBy('w.created_at', 'DESC')

    const page = filters?.page ?? 1
    const limit = filters?.limit ?? 50
    qb.skip((page - 1) * limit).take(limit)

    const [entries, total] = await qb.getManyAndCount()
    return { entries, total }
  }

  async getStats(): Promise<{
    total: number
    byStatus: Record<string, number>
    byLocale: Record<string, number>
    byDay: { date: string; count: number }[]
    duplicates: number
    last7days: number
    last30days: number
  }> {
    const total = await this.repo.count()

    const byStatusRaw = await this.repo
      .createQueryBuilder('w')
      .select('w.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('w.status')
      .getRawMany()

    const byLocaleRaw = await this.repo
      .createQueryBuilder('w')
      .select('w.locale', 'locale')
      .addSelect('COUNT(*)', 'count')
      .groupBy('w.locale')
      .getRawMany()

    const byDayRaw = await this.repo
      .createQueryBuilder('w')
      .select("DATE(w.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where("w.created_at >= NOW() - INTERVAL '30 days'")
      .groupBy("DATE(w.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany()

    const duplicates = await this.repo.count({ where: { is_duplicate: true } })

    const last7days = await this.repo
      .createQueryBuilder('w')
      .where("w.created_at >= NOW() - INTERVAL '7 days'")
      .getCount()

    const last30days = await this.repo
      .createQueryBuilder('w')
      .where("w.created_at >= NOW() - INTERVAL '30 days'")
      .getCount()

    return {
      total,
      byStatus: Object.fromEntries(byStatusRaw.map(r => [r.status, parseInt(r.count)])),
      byLocale: Object.fromEntries(byLocaleRaw.map(r => [r.locale, parseInt(r.count)])),
      byDay: byDayRaw.map(r => ({ date: r.date, count: parseInt(r.count) })),
      duplicates,
      last7days,
      last30days,
    }
  }

  async updateStatus(id: string, status: string, notes?: string): Promise<WaitlistEntry> {
    await this.repo.update(id, {
      status: status as WaitlistEntry['status'],
      ...(notes ? { notes } : {}),
    })
    return this.repo.findOneOrFail({ where: { id } })
  }
}
