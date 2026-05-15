export type TemplateTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

export type TemplateMetaCell = {
  label: string
  value: string
  tone?: TemplateTone
}

export type TemplateStatCard = {
  label: string
  value: string
  hint?: string
  tone?: TemplateTone
}

export type TemplateSection = {
  title?: string
  columns: string[]
  rows: string[][]
  footer?: string[]
}

export type ReportTemplateDocument = {
  title: string
  html: string
  pdfFilename: string
  excelFilename: string
  excelContent: string
}

type BaseTemplateInput = {
  businessName: string
  reportLabel: string
  title: string
  description: string
  rangeLabel: string
  generatedLabel: string
  filenameBase: string
  meta: TemplateMetaCell[]
  summaryRows: Array<{ label: string; value: string }>
  excelSections: TemplateSection[]
}

export type GenericReportTemplateInput = BaseTemplateInput & {
  stats: TemplateStatCard[]
  table?: TemplateSection
  emptyMessage: string
}

type ProfitLossLine = {
  label: string
  amount: string
  share: string
}

type ProfitLossGroup = {
  title: string
  rows: ProfitLossLine[]
  subtotalLabel: string
  subtotalAmount: string
  subtotalShare: string
}

export type ProfitLossTemplateInput = BaseTemplateInput & {
  stats: TemplateStatCard[]
  revenueRows: ProfitLossLine[]
  cogsRows: ProfitLossLine[]
  recurringGroup: ProfitLossGroup
  oneOffGroup: ProfitLossGroup
  grossProfit: { amount: string; share: string; positive: boolean }
  totalExpenses: { amount: string; share: string }
  netResult: { label: string; amount: string; share: string; positive: boolean }
  notes: string[]
}

export type RevenueTrendTemplateInput = BaseTemplateInput & {
  stats: TemplateStatCard[]
  chartPoints: Array<{
    label: string
    revenue: number
    grossProfit: number
    transactions: number
  }>
  table: TemplateSection
  paymentRows: Array<{
    label: string
    amount: string
    share: string
    percent: number
    tone?: TemplateTone
  }>
  notes: string[]
}

export type StockLevelsTemplateInput = BaseTemplateInput & {
  stats: TemplateStatCard[]
  rows: Array<{
    product: string
    sku: string
    category: string
    quantity: string
    threshold: string
    reorderPoint: string
    shortfall: string
    statusLabel: string
    statusTone: TemplateTone
  }>
  notes: string[]
}

export type DebtorsAgeingTemplateInput = BaseTemplateInput & {
  stats: TemplateStatCard[]
  ageingCards: Array<{
    label: string
    value: string
    hint: string
    tone?: TemplateTone
  }>
  rows: Array<{
    customer: string
    reference: string
    saleDate: string
    age: string
    originalAmount: string
    paidAmount: string
    outstandingAmount: string
    statusLabel: string
    statusTone: TemplateTone
    collectedLabel: string
  }>
  notes: string[]
}

export type TemplateMiniCard = {
  label: string
  value: string
  hint?: string
  tone?: TemplateTone
}

export type TemplateProgressRow = {
  label: string
  value: string
  hint?: string
  percent?: number
  tone?: TemplateTone
}

export type TemplateProfileCard = {
  initials: string
  name: string
  subtitle?: string
  value: string
  hint?: string
  accent?: TemplateTone
  stats: TemplateMiniCard[]
  rows?: TemplateProgressRow[]
}

export type TemplateChartPoint = {
  label: string
  revenue: number
  grossProfit?: number
  expenses?: number
}

type CompositeSection =
  | {
      kind: 'stats'
      title?: string
      cards: TemplateStatCard[]
    }
  | {
      kind: 'mini_cards'
      title?: string
      cards: TemplateMiniCard[]
      columns?: 2 | 3 | 4 | 5
    }
  | {
      kind: 'progress_rows'
      title?: string
      rows: TemplateProgressRow[]
    }
  | {
      kind: 'profiles'
      title?: string
      profiles: TemplateProfileCard[]
    }
  | {
      kind: 'table'
      title?: string
      table: TemplateSection
    }
  | {
      kind: 'chart'
      title?: string
      points: TemplateChartPoint[]
      legend?: Array<{ label: string; tone: TemplateTone }>
    }
  | {
      kind: 'note'
      title?: string
      lines: string[]
      tone?: TemplateTone
    }

export type CompositeReportTemplateInput = BaseTemplateInput & {
  sections: CompositeSection[]
}

export function buildGenericReportTemplate(
  input: GenericReportTemplateInput,
): ReportTemplateDocument {
  const bodyHtml = `
    ${renderStats(input.stats)}
    ${
      input.table && input.table.rows.length > 0
        ? `
          <p class="section-hdr">Report detail</p>
          ${renderTable(input.table)}
        `
        : `
          <div class="empty-state">${escapeHtml(input.emptyMessage)}</div>
        `
    }
  `

  return createDocument(input, bodyHtml)
}

export function buildProfitLossReportTemplate(
  input: ProfitLossTemplateInput,
): ReportTemplateDocument {
  const bodyHtml = `
    ${renderStats(input.stats)}

    <p class="section-hdr">Section I - Revenue</p>
    ${renderProfitLossHeader()}
    ${renderProfitLossLines(input.revenueRows)}

    <p class="section-hdr">Section II - Cost of goods sold</p>
    ${renderProfitLossHeader()}
    ${renderProfitLossLines(input.cogsRows)}

    <p class="section-hdr">Section III - Gross result</p>
    <div class="total-row total-${input.grossProfit.positive ? 'success' : 'danger'}">
      <span class="total-label">Gross profit</span>
      <span class="total-value">${escapeHtml(input.grossProfit.amount)}</span>
      <span class="total-share">${escapeHtml(input.grossProfit.share)}</span>
    </div>

    <p class="section-hdr">Section IV - Operating expenses</p>
    ${renderProfitLossHeader()}
    ${renderProfitLossGroup(input.recurringGroup)}
    ${renderProfitLossGroup(input.oneOffGroup)}
    <div class="subtotal-row">
      <span class="subtotal-label">Total operating expenses</span>
      <span class="subtotal-value">${escapeHtml(input.totalExpenses.amount)}</span>
      <span class="subtotal-share">${escapeHtml(input.totalExpenses.share)}</span>
    </div>

    <p class="section-hdr">Section V - Net result</p>
    <div class="total-row total-${input.netResult.positive ? 'success' : 'danger'}">
      <span class="total-label">${escapeHtml(input.netResult.label)}</span>
      <span class="total-value">${escapeHtml(input.netResult.amount)}</span>
      <span class="total-share">${escapeHtml(input.netResult.share)}</span>
    </div>

    ${renderNotes(input.notes)}
  `

  return createDocument(input, bodyHtml)
}

export function buildRevenueTrendReportTemplate(
  input: RevenueTrendTemplateInput,
): ReportTemplateDocument {
  const maxRevenue = Math.max(...input.chartPoints.map((point) => point.revenue), 1)
  const maxTransactions = Math.max(...input.chartPoints.map((point) => point.transactions), 1)

  const chartHtml = input.chartPoints
    .map((point) => {
      const revenueHeight = Math.max(6, Math.round((point.revenue / maxRevenue) * 100))
      const profitHeight =
        point.grossProfit > 0
          ? Math.max(4, Math.round((point.grossProfit / maxRevenue) * 100))
          : 0
      const transactionOffset = Math.max(
        8,
        Math.round((point.transactions / maxTransactions) * 100),
      )

      return `
        <div class="chart-col">
          <div class="chart-bars">
            <div class="chart-bar chart-bar-revenue" style="height:${revenueHeight}%"></div>
            <div class="chart-bar chart-bar-profit" style="height:${profitHeight}%"></div>
            <div class="chart-dot" style="bottom:${transactionOffset}%"></div>
          </div>
          <div class="chart-label">${escapeHtml(point.label)}</div>
        </div>
      `
    })
    .join('')

  const paymentHtml = input.paymentRows
    .map(
      (row) => `
        <div class="pay-cell">
          <p class="pay-method">
            <span class="pay-dot tone-${row.tone ?? 'default'}"></span>
            ${escapeHtml(row.label)}
          </p>
          <p class="pay-amount">${escapeHtml(row.amount)}</p>
          <p class="pay-share">${escapeHtml(row.share)}</p>
          <div class="pay-track">
            <div class="pay-fill tone-${row.tone ?? 'default'}" style="width:${Math.max(
              4,
              Math.min(100, row.percent),
            )}%"></div>
          </div>
        </div>
      `,
    )
    .join('')

  const bodyHtml = `
    ${renderStats(input.stats)}

    <p class="section-hdr">Trend analysis</p>
    <div class="chart-legend">
      <span><i class="legend-block tone-success"></i> Revenue</span>
      <span><i class="legend-block tone-info"></i> Gross profit</span>
      <span><i class="legend-dot"></i> Transactions</span>
    </div>
    <div class="trend-chart">${chartHtml}</div>

    <p class="section-hdr">Period breakdown</p>
    ${renderTable(input.table)}

    <p class="section-hdr">Payment mix</p>
    <div class="pay-grid">${paymentHtml}</div>

    ${renderNotes(input.notes)}
  `

  return createDocument(input, bodyHtml)
}

export function buildStockLevelsReportTemplate(
  input: StockLevelsTemplateInput,
): ReportTemplateDocument {
  const table = {
    columns: [
      'Product',
      'SKU',
      'Category',
      'In stock',
      'Threshold',
      'Reorder pt.',
      'Shortfall',
      'Status',
    ],
    rows: input.rows.map((row) => [
      row.product,
      row.sku,
      row.category,
      row.quantity,
      row.threshold,
      row.reorderPoint,
      row.shortfall,
      row.statusLabel,
    ]),
  }

  const bodyHtml = `
    ${renderStats(input.stats)}

    <p class="section-hdr">Stock listing</p>
    ${renderTable(table)}

    <div class="legend-row">
      <span><span class="pill tone-success">Healthy</span> Stock is above the alert level.</span>
      <span><span class="pill tone-warning">Low stock</span> Restock planning is needed.</span>
      <span><span class="pill tone-danger">Critical</span> Product is out or near-out of stock.</span>
    </div>

    ${renderNotes(input.notes)}
  `

  return createDocument(input, bodyHtml)
}

export function buildDebtorsAgeingReportTemplate(
  input: DebtorsAgeingTemplateInput,
): ReportTemplateDocument {
  const ageingHtml = input.ageingCards
    .map(
      (card) => `
        <div class="age-card tone-${card.tone ?? 'default'}">
          <p class="age-label">${escapeHtml(card.label)}</p>
          <p class="age-value">${escapeHtml(card.value)}</p>
          <p class="age-hint">${escapeHtml(card.hint)}</p>
        </div>
      `,
    )
    .join('')

  const detailTable = {
    columns: [
      'Customer',
      'Reference',
      'Sale date',
      'Age',
      'Original',
      'Paid',
      'Outstanding',
      'Status',
      'Collected',
    ],
    rows: input.rows.map((row) => [
      row.customer,
      row.reference,
      row.saleDate,
      row.age,
      row.originalAmount,
      row.paidAmount,
      row.outstandingAmount,
      row.statusLabel,
      row.collectedLabel,
    ]),
  }

  const bodyHtml = `
    ${renderStats(input.stats)}

    <p class="section-hdr">Ageing summary</p>
    <div class="age-grid">${ageingHtml}</div>

    <p class="section-hdr">Detailed receivables listing</p>
    ${renderTable(detailTable)}

    ${renderNotes(input.notes)}
  `

  return createDocument(input, bodyHtml)
}

export function buildCompositeReportTemplate(
  input: CompositeReportTemplateInput,
): ReportTemplateDocument {
  const bodyHtml = input.sections.map((section) => renderCompositeSection(section)).join('')
  return createDocument(input, bodyHtml)
}

function createDocument(
  input: BaseTemplateInput,
  bodyHtml: string,
): ReportTemplateDocument {
  return {
    title: input.title,
    html: buildHtmlDocument(input, bodyHtml),
    pdfFilename: `${input.filenameBase}.pdf`,
    excelFilename: `${input.filenameBase}.csv`,
    excelContent: buildExcelDocument({
      title: input.title,
      description: input.description,
      businessName: input.businessName,
      rangeLabel: input.rangeLabel,
      generatedLabel: input.generatedLabel,
      summaryRows: input.summaryRows,
      sections: input.excelSections,
    }),
  }
}

function buildHtmlDocument(input: BaseTemplateInput, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #ece8df;
      color: #1a1a1a;
      font-family: Arial, sans-serif;
      padding: 24px;
    }
    .doc {
      max-width: 980px;
      margin: 0 auto;
    }
    .paper {
      background: #ffffff;
      border: 1px solid #ddd5c7;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 18px 48px rgba(24, 24, 24, 0.08);
    }
    .letterhead {
      padding: 24px 28px 18px;
      border-bottom: 3px solid #1d9e75;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
    }
    .biz-name {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .biz-details {
      margin: 0;
      font-size: 11px;
      line-height: 1.65;
      color: #6b655c;
    }
    .report-title-block {
      text-align: right;
    }
    .rpt-label {
      margin: 0 0 4px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #1d9e75;
      font-weight: 700;
    }
    .rpt-name {
      margin: 0 0 6px;
      font-size: 17px;
      font-weight: 700;
    }
    .rpt-period, .rpt-generated {
      margin: 0;
      font-size: 11px;
      color: #6b655c;
      line-height: 1.55;
    }
    .doc-meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-bottom: 1px solid #e6e0d4;
    }
    .meta-cell {
      padding: 12px 18px;
      border-right: 1px solid #e6e0d4;
    }
    .meta-cell:last-child {
      border-right: none;
    }
    .meta-label {
      margin: 0 0 4px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #8f897f;
      font-weight: 700;
    }
    .meta-value {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: #1a1a1a;
    }
    .meta-value.tone-success { color: #085041; }
    .meta-value.tone-warning { color: #8a5a04; }
    .meta-value.tone-danger { color: #9d2f2f; }
    .meta-value.tone-info { color: #184f90; }
    .report-body {
      padding: 24px 28px 28px;
    }
    .section-hdr {
      margin: 18px 0 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #1d9e75;
      font-weight: 700;
      padding-bottom: 7px;
      border-bottom: 2px solid #1d9e75;
    }
    .section-hdr:first-child {
      margin-top: 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .stat-card {
      border: 1px solid #e6e0d4;
      border-radius: 12px;
      padding: 12px 14px;
      background: #faf8f3;
    }
    .stat-card.tone-success { background: #e8f5ef; border-color: #bcdccf; }
    .stat-card.tone-warning { background: #fcf4e5; border-color: #f2d79c; }
    .stat-card.tone-danger { background: #fdecec; border-color: #efc4c4; }
    .stat-card.tone-info { background: #edf4fd; border-color: #c6d9f3; }
    .stat-label {
      margin: 0 0 5px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #7f786e;
      font-weight: 700;
    }
    .stat-value {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      font-family: "Courier New", monospace;
    }
    .stat-hint {
      margin: 4px 0 0;
      font-size: 10px;
      color: #6b655c;
      line-height: 1.45;
    }
    .mini-grid {
      display: grid;
      gap: 10px;
      margin-bottom: 16px;
    }
    .mini-grid.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .mini-grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .mini-grid.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .mini-grid.cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .mini-card {
      border: 1px solid #e6e0d4;
      border-radius: 12px;
      padding: 12px 14px;
      background: #faf8f3;
    }
    .mini-card.tone-success { background: #e8f5ef; border-color: #bcdccf; }
    .mini-card.tone-warning { background: #fcf4e5; border-color: #f2d79c; }
    .mini-card.tone-danger { background: #fdecec; border-color: #efc4c4; }
    .mini-card.tone-info { background: #edf4fd; border-color: #c6d9f3; }
    .mini-label {
      margin: 0 0 5px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #7f786e;
      font-weight: 700;
    }
    .mini-value {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      font-family: "Courier New", monospace;
      color: #1a1a1a;
    }
    .mini-hint {
      margin: 4px 0 0;
      font-size: 10px;
      color: #6b655c;
      line-height: 1.5;
    }
    .profile-stack {
      display: grid;
      gap: 12px;
      margin-bottom: 16px;
    }
    .profile-card {
      position: relative;
      border: 1px solid #e6e0d4;
      border-radius: 14px;
      padding: 14px 16px 16px;
      background: #faf8f3;
      overflow: hidden;
    }
    .profile-strip {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
    }
    .profile-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e6e0d4;
      margin-bottom: 12px;
    }
    .profile-avatar {
      width: 40px;
      height: 40px;
      border-radius: 999px;
      background: #1d9e75;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .profile-meta {
      min-width: 0;
    }
    .profile-name {
      margin: 0 0 3px;
      font-size: 14px;
      font-weight: 700;
      color: #1a1a1a;
    }
    .profile-subtitle {
      margin: 0;
      font-size: 11px;
      color: #7f786e;
      line-height: 1.5;
    }
    .profile-summary {
      margin-left: auto;
      text-align: right;
      min-width: 120px;
    }
    .profile-summary-value {
      margin: 0 0 3px;
      font-size: 18px;
      font-weight: 700;
      font-family: "Courier New", monospace;
    }
    .profile-summary-hint {
      margin: 0;
      font-size: 10px;
      color: #6b655c;
    }
    .profile-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .profile-stat {
      background: #ffffff;
      border: 1px solid #ece6db;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .profile-stat .mini-value {
      font-size: 14px;
    }
    .progress-list {
      display: grid;
      gap: 10px;
      margin-bottom: 16px;
    }
    .progress-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px 14px;
      align-items: start;
    }
    .progress-copy {
      min-width: 0;
    }
    .progress-label {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: #2a2a2a;
    }
    .progress-hint {
      margin: 3px 0 0;
      font-size: 10px;
      color: #6b655c;
      line-height: 1.5;
    }
    .progress-meta {
      text-align: right;
      min-width: 96px;
    }
    .progress-value {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      font-family: "Courier New", monospace;
    }
    .progress-note {
      margin: 3px 0 0;
      font-size: 10px;
      color: #6b655c;
    }
    .progress-track {
      grid-column: 1 / -1;
      height: 7px;
      border-radius: 999px;
      background: #ddd7cd;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 999px;
    }
    .line-header, .line-row, .subtotal-row, .total-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 140px 120px;
      gap: 12px;
      align-items: center;
    }
    .line-header {
      padding: 8px 0;
      border-bottom: 1px solid #e6e0d4;
      color: #8f897f;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 700;
    }
    .line-row {
      padding: 7px 0;
      border-bottom: 1px solid #f1ede5;
      font-size: 12px;
    }
    .line-row:last-child {
      border-bottom: none;
    }
    .line-label {
      color: #2a2a2a;
    }
    .line-amount, .line-share, .subtotal-value, .subtotal-share, .total-value, .total-share {
      text-align: right;
      font-family: "Courier New", monospace;
      font-weight: 700;
    }
    .subtotal-row {
      padding: 10px 0 4px;
      border-top: 1px dashed #cfc8bc;
      margin-bottom: 10px;
      font-size: 12px;
    }
    .subtotal-label {
      font-weight: 700;
    }
    .total-row {
      margin-top: 10px;
      padding: 12px 10px;
      border-radius: 12px;
      border: 2px solid #d8d2c6;
      background: #faf8f3;
      font-size: 13px;
    }
    .total-row.total-success {
      border-color: #9fd2bc;
      background: #e8f5ef;
      color: #085041;
    }
    .total-row.total-danger {
      border-color: #efbcbc;
      background: #fdecec;
      color: #812626;
    }
    .total-label {
      font-weight: 700;
    }
    .trend-chart {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
      gap: 8px;
      align-items: end;
      min-height: 230px;
      padding: 18px 12px 12px;
      border: 1px solid #e6e0d4;
      border-radius: 14px;
      background:
        linear-gradient(to top, rgba(0, 0, 0, 0.05) 1px, transparent 1px) 0 0 / 100% 25%,
        #fbfaf7;
    }
    .chart-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .chart-bars {
      position: relative;
      display: flex;
      align-items: end;
      gap: 4px;
      width: 100%;
      height: 180px;
      justify-content: center;
    }
    .chart-bar {
      width: 12px;
      border-radius: 999px 999px 0 0;
      min-height: 4px;
    }
    .chart-bar-revenue {
      background: #1d9e75;
    }
    .chart-bar-profit {
      background: #a7c7ea;
    }
    .chart-bar-expenses {
      background: #d35b5b;
    }
    .chart-dot {
      position: absolute;
      left: 50%;
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #5f5a52;
      transform: translateX(-50%);
      border: 2px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    }
    .chart-label {
      font-size: 10px;
      color: #6b655c;
      text-align: center;
      line-height: 1.4;
      word-break: break-word;
    }
    .chart-legend, .legend-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 10px;
      font-size: 11px;
      color: #6b655c;
    }
    .legend-block, .legend-dot {
      display: inline-block;
      margin-right: 6px;
      vertical-align: middle;
    }
    .legend-block {
      width: 12px;
      height: 12px;
      border-radius: 3px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #5f5a52;
    }
    .pay-grid, .age-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .age-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .pay-cell, .age-card {
      border: 1px solid #e6e0d4;
      border-radius: 12px;
      padding: 12px 14px;
      background: #faf8f3;
    }
    .pay-method, .age-label {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 700;
      color: #2a2a2a;
    }
    .pay-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      margin-right: 6px;
    }
    .pay-amount, .age-value {
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 700;
      font-family: "Courier New", monospace;
    }
    .pay-share, .age-hint {
      margin: 0;
      font-size: 10px;
      color: #6b655c;
    }
    .pay-track {
      height: 4px;
      border-radius: 999px;
      background: #ddd7cd;
      overflow: hidden;
      margin-top: 8px;
    }
    .pay-fill {
      height: 100%;
      border-radius: 999px;
    }
    .tone-default { background: #444441; color: #444441; }
    .tone-success { background: #1d9e75; color: #1d9e75; }
    .tone-warning { background: #d08b16; color: #8a5a04; }
    .tone-danger { background: #d35b5b; color: #9d2f2f; }
    .tone-info { background: #4f88c7; color: #184f90; }
    .meta-value.tone-default {
      background: none;
      color: #1a1a1a;
    }
    .stat-card.tone-default,
    .mini-card.tone-default {
      background: #faf8f3;
      color: inherit;
      border-color: #e6e0d4;
    }
    .profile-avatar.tone-default,
    .profile-avatar.tone-success,
    .profile-avatar.tone-warning,
    .profile-avatar.tone-danger,
    .profile-avatar.tone-info,
    .pill.tone-default,
    .pill.tone-success,
    .pill.tone-warning,
    .pill.tone-danger,
    .pill.tone-info {
      color: #ffffff;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      color: #ffffff;
      margin-right: 8px;
    }
    .empty-state {
      padding: 18px;
      border: 1px dashed #d8d2c6;
      border-radius: 14px;
      background: #fbfaf7;
      font-size: 12px;
      color: #6b655c;
    }
    .notes-block {
      margin-top: 16px;
      padding: 14px 16px;
      border-left: 3px solid #1d9e75;
      background: #f8f6f0;
      border-radius: 12px;
    }
    .notes-title {
      margin: 0 0 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #1d9e75;
      font-weight: 700;
    }
    .notes-list {
      margin: 0;
      padding-left: 18px;
      font-size: 11px;
      line-height: 1.65;
      color: #4f4941;
    }
    .doc-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 12px;
      margin-bottom: 6px;
    }
    .doc-table thead tr {
      background: #f3f1ea;
      border-bottom: 1px solid #d8d2c6;
    }
    .doc-table th {
      text-align: left;
      padding: 8px 10px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6b655c;
    }
    .doc-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #efebe2;
      vertical-align: top;
      color: #2a2a2a;
      word-break: break-word;
    }
    .doc-table tfoot td {
      background: #faf8f3;
      font-weight: 700;
      border-top: 1px solid #d8d2c6;
    }
    .doc-footer {
      padding: 14px 28px;
      border-top: 1px solid #e6e0d4;
      background: #faf8f3;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 10px;
      color: #7f786e;
      line-height: 1.5;
    }
    .note-tone-success { border-left-color: #1d9e75; }
    .note-tone-warning { border-left-color: #d08b16; }
    .note-tone-danger { border-left-color: #d35b5b; }
    .note-tone-info { border-left-color: #4f88c7; }
    .note-tone-success .notes-title { color: #1d9e75; }
    .note-tone-warning .notes-title { color: #8a5a04; }
    .note-tone-danger .notes-title { color: #9d2f2f; }
    .note-tone-info .notes-title { color: #184f90; }
    .note-lines {
      display: grid;
      gap: 6px;
      margin: 0;
    }
    .note-line {
      margin: 0;
      font-size: 11px;
      color: #4f4941;
      line-height: 1.65;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .doc {
        max-width: none;
      }
      .paper {
        border-radius: 0;
        box-shadow: none;
        border: none;
      }
    }
  </style>
</head>
<body>
  <div class="doc">
    <div class="paper">
      <div class="letterhead">
        <div>
          <p class="biz-name">${escapeHtml(input.businessName)}</p>
          <p class="biz-details">BizTrack CM business report preview</p>
        </div>
        <div class="report-title-block">
          <p class="rpt-label">${escapeHtml(input.reportLabel)}</p>
          <p class="rpt-name">${escapeHtml(input.title)}</p>
          <p class="rpt-period">Range: ${escapeHtml(input.rangeLabel)}</p>
          <p class="rpt-generated">Generated: ${escapeHtml(input.generatedLabel)}</p>
        </div>
      </div>
      ${renderMeta(input.meta)}
      <div class="report-body">
        ${bodyHtml}
      </div>
      <div class="doc-footer">
        <div>Generated by BizTrack CM</div>
        <div>${escapeHtml(input.description)}</div>
      </div>
    </div>
  </div>
</body>
</html>`
}

function renderMeta(meta: TemplateMetaCell[]) {
  if (meta.length === 0) {
    return ''
  }

  const cells = meta
    .slice(0, 4)
    .map(
      (cell) => `
        <div class="meta-cell">
          <p class="meta-label">${escapeHtml(cell.label)}</p>
          <p class="meta-value tone-${cell.tone ?? 'default'}">${escapeHtml(cell.value)}</p>
        </div>
      `,
    )
    .join('')

  return `<div class="doc-meta">${cells}</div>`
}

function renderStats(stats: TemplateStatCard[]) {
  if (stats.length === 0) {
    return ''
  }

  const cards = stats
    .map(
      (stat) => `
        <div class="stat-card tone-${stat.tone ?? 'default'}">
          <p class="stat-label">${escapeHtml(stat.label)}</p>
          <p class="stat-value">${escapeHtml(stat.value)}</p>
          ${stat.hint ? `<p class="stat-hint">${escapeHtml(stat.hint)}</p>` : ''}
        </div>
      `,
    )
    .join('')

  return `<div class="stats-grid">${cards}</div>`
}

function renderProfitLossHeader() {
  return `
    <div class="line-header">
      <span></span>
      <span style="text-align:right">Amount</span>
      <span style="text-align:right">Share</span>
    </div>
  `
}

function renderProfitLossLines(lines: ProfitLossLine[]) {
  return lines
    .map(
      (line) => `
        <div class="line-row">
          <span class="line-label">${escapeHtml(line.label)}</span>
          <span class="line-amount">${escapeHtml(line.amount)}</span>
          <span class="line-share">${escapeHtml(line.share)}</span>
        </div>
      `,
    )
    .join('')
}

function renderProfitLossGroup(group: ProfitLossGroup) {
  return `
    <div class="line-row" style="background:#f7f4ee;font-weight:700">
      <span class="line-label">${escapeHtml(group.title)}</span>
      <span></span>
      <span></span>
    </div>
    ${renderProfitLossLines(group.rows)}
    <div class="subtotal-row">
      <span class="subtotal-label">${escapeHtml(group.subtotalLabel)}</span>
      <span class="subtotal-value">${escapeHtml(group.subtotalAmount)}</span>
      <span class="subtotal-share">${escapeHtml(group.subtotalShare)}</span>
    </div>
  `
}

function renderTable(section: TemplateSection) {
  const headerHtml = section.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join('')

  const rowHtml = section.rows
    .map(
      (row) => `
        <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
      `,
    )
    .join('')

  const footerHtml =
    section.footer && section.footer.length > 0
      ? `<tfoot><tr>${section.footer
          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
          .join('')}</tr></tfoot>`
      : ''

  return `
    <table class="doc-table">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowHtml}</tbody>
      ${footerHtml}
    </table>
  `
}

function renderNotes(notes: string[]) {
  if (notes.length === 0) {
    return ''
  }

  return `
    <div class="notes-block">
      <p class="notes-title">Notes and methodology</p>
      <ol class="notes-list">
        ${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
      </ol>
    </div>
  `
}

function renderCompositeSection(section: CompositeSection) {
  switch (section.kind) {
    case 'stats':
      return `${section.title ? `<p class="section-hdr">${escapeHtml(section.title)}</p>` : ''}${renderStats(
        section.cards,
      )}`
    case 'mini_cards':
      return `${
        section.title ? `<p class="section-hdr">${escapeHtml(section.title)}</p>` : ''
      }${renderMiniCards(section.cards, section.columns ?? 4)}`
    case 'progress_rows':
      return `${
        section.title ? `<p class="section-hdr">${escapeHtml(section.title)}</p>` : ''
      }${renderProgressRows(section.rows)}`
    case 'profiles':
      return `${
        section.title ? `<p class="section-hdr">${escapeHtml(section.title)}</p>` : ''
      }${renderProfiles(section.profiles)}`
    case 'table':
      return `${section.title ? `<p class="section-hdr">${escapeHtml(section.title)}</p>` : ''}${renderTable(
        section.table,
      )}`
    case 'chart':
      return `${section.title ? `<p class="section-hdr">${escapeHtml(section.title)}</p>` : ''}${renderChart(
        section.points,
        section.legend,
      )}`
    case 'note':
      return renderCustomNote(section.title ?? 'Notes', section.lines, section.tone)
    default:
      return ''
  }
}

function renderMiniCards(cards: TemplateMiniCard[], columns: 2 | 3 | 4 | 5) {
  if (cards.length === 0) {
    return ''
  }

  const cardsHtml = cards
    .map(
      (card) => `
        <div class="mini-card tone-${card.tone ?? 'default'}">
          <p class="mini-label">${escapeHtml(card.label)}</p>
          <p class="mini-value">${escapeHtml(card.value)}</p>
          ${card.hint ? `<p class="mini-hint">${escapeHtml(card.hint)}</p>` : ''}
        </div>
      `,
    )
    .join('')

  return `<div class="mini-grid cols-${columns}">${cardsHtml}</div>`
}

function renderProgressRows(rows: TemplateProgressRow[]) {
  if (rows.length === 0) {
    return ''
  }

  const rowsHtml = rows
    .map((row) => {
      const percent =
        typeof row.percent === 'number'
          ? Math.max(4, Math.min(100, Number.isFinite(row.percent) ? row.percent : 0))
          : 0

      return `
        <div class="progress-row">
          <div class="progress-copy">
            <p class="progress-label">${escapeHtml(row.label)}</p>
            ${row.hint ? `<p class="progress-hint">${escapeHtml(row.hint)}</p>` : ''}
          </div>
          <div class="progress-meta">
            <p class="progress-value">${escapeHtml(row.value)}</p>
            ${
              typeof row.percent === 'number'
                ? `<p class="progress-note">${escapeHtml(row.percent.toFixed(1))}%</p>`
                : ''
            }
          </div>
          ${
            typeof row.percent === 'number'
              ? `<div class="progress-track"><div class="progress-fill tone-${
                  row.tone ?? 'default'
                }" style="width:${percent}%"></div></div>`
              : ''
          }
        </div>
      `
    })
    .join('')

  return `<div class="progress-list">${rowsHtml}</div>`
}

function renderProfiles(profiles: TemplateProfileCard[]) {
  if (profiles.length === 0) {
    return ''
  }

  const cardsHtml = profiles
    .map(
      (profile) => `
        <div class="profile-card">
          <div class="profile-strip tone-${profile.accent ?? 'success'}"></div>
          <div class="profile-header">
            <div class="profile-avatar tone-${profile.accent ?? 'success'}">${escapeHtml(
              profile.initials,
            )}</div>
            <div class="profile-meta">
              <p class="profile-name">${escapeHtml(profile.name)}</p>
              ${
                profile.subtitle
                  ? `<p class="profile-subtitle">${escapeHtml(profile.subtitle)}</p>`
                  : ''
              }
            </div>
            <div class="profile-summary">
              <p class="profile-summary-value">${escapeHtml(profile.value)}</p>
              ${profile.hint ? `<p class="profile-summary-hint">${escapeHtml(profile.hint)}</p>` : ''}
            </div>
          </div>
          ${renderMiniCards(profile.stats, 4).replace('mini-grid cols-4', 'profile-stats')}
          ${profile.rows && profile.rows.length > 0 ? renderProgressRows(profile.rows) : ''}
        </div>
      `,
    )
    .join('')

  return `<div class="profile-stack">${cardsHtml}</div>`
}

function renderChart(
  points: TemplateChartPoint[],
  legend?: Array<{ label: string; tone: TemplateTone }>,
) {
  if (points.length === 0) {
    return `<div class="empty-state">No chart data available for this report preview.</div>`
  }

  const maxValue = Math.max(
    ...points.map((point) => Math.max(point.revenue, point.grossProfit ?? 0, point.expenses ?? 0)),
    1,
  )

  const legendHtml = (legend ?? [
    { label: 'Revenue', tone: 'success' as const },
    { label: 'Gross profit', tone: 'info' as const },
    { label: 'Expenses', tone: 'danger' as const },
  ])
    .map(
      (item) => `
        <span><i class="legend-block tone-${item.tone}"></i> ${escapeHtml(item.label)}</span>
      `,
    )
    .join('')

  const pointsHtml = points
    .map((point) => {
      const revenueHeight = Math.max(6, Math.round((point.revenue / maxValue) * 100))
      const profitHeight =
        point.grossProfit && point.grossProfit > 0
          ? Math.max(4, Math.round((point.grossProfit / maxValue) * 100))
          : 0
      const expenseHeight =
        point.expenses && point.expenses > 0
          ? Math.max(4, Math.round((point.expenses / maxValue) * 100))
          : 0

      return `
        <div class="chart-col">
          <div class="chart-bars">
            <div class="chart-bar chart-bar-revenue" style="height:${revenueHeight}%"></div>
            <div class="chart-bar chart-bar-profit" style="height:${profitHeight}%"></div>
            <div class="chart-bar chart-bar-expenses" style="height:${expenseHeight}%"></div>
          </div>
          <div class="chart-label">${escapeHtml(point.label)}</div>
        </div>
      `
    })
    .join('')

  return `
    <div class="chart-legend">${legendHtml}</div>
    <div class="trend-chart">${pointsHtml}</div>
  `
}

function renderCustomNote(title: string, lines: string[], tone?: TemplateTone) {
  if (lines.length === 0) {
    return ''
  }

  return `
    <div class="notes-block note-tone-${tone ?? 'success'}">
      <p class="notes-title">${escapeHtml(title)}</p>
      <div class="note-lines">
        ${lines.map((line) => `<p class="note-line">${escapeHtml(line)}</p>`).join('')}
      </div>
    </div>
  `
}

function buildExcelDocument(input: {
  title: string
  description: string
  businessName: string
  rangeLabel: string
  generatedLabel: string
  summaryRows: Array<{ label: string; value: string }>
  sections: TemplateSection[]
}) {
  const summaryHtml = input.summaryRows
    .map(
      (row) => `
        <tr>
          <th>${escapeHtml(row.label)}</th>
          <td>${escapeHtml(row.value)}</td>
        </tr>
      `,
    )
    .join('')

  const sectionsHtml = input.sections
    .map((section) => {
      const titleHtml = section.title
        ? `<tr><td colspan="${section.columns.length}"><strong>${escapeHtml(
            section.title,
          )}</strong></td></tr>`
        : ''

      const headerHtml = `<tr>${section.columns
        .map((column) => `<th>${escapeHtml(column)}</th>`)
        .join('')}</tr>`
      const rowsHtml = section.rows
        .map(
          (row) => `
            <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
          `,
        )
        .join('')
      const footerHtml =
        section.footer && section.footer.length > 0
          ? `<tr>${section.footer
              .map((cell) => `<td><strong>${escapeHtml(cell)}</strong></td>`)
              .join('')}</tr>`
          : ''

      return `
        <table>
          ${titleHtml}
          ${headerHtml}
          ${rowsHtml}
          ${footerHtml}
        </table>
      `
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; }
    h1, h2, p { margin: 0 0 8px; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 18px; }
    th, td { border: 1px solid #c9c3b7; padding: 8px; text-align: left; }
    th { background: #f3f1ea; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.title)}</h1>
  <p>${escapeHtml(input.businessName)}</p>
  <p>${escapeHtml(input.description)}</p>
  <p>Range: ${escapeHtml(input.rangeLabel)}</p>
  <p>Generated: ${escapeHtml(input.generatedLabel)}</p>
  <h2>Summary</h2>
  <table>${summaryHtml}</table>
  ${sectionsHtml}
</body>
</html>`
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
