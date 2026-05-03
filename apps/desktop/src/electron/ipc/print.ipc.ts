import { app, BrowserWindow, ipcMain, type WebContentsPrintOptions } from 'electron'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { basename, join, parse } from 'path'
import { pathToFileURL } from 'url'
import {
  getDefaultPrinter as getSystemDefaultPrinter,
  getPrinters as getSystemPrinters,
  print as printPdfWithSystem,
  type PrintOptions as SystemPrintOptions,
  type Printer as SystemPrinter,
} from 'pdf-to-printer'

type PrintReceiptPayload = {
  buffer?: number[] | ArrayBuffer | Uint8Array
  html?: string
  filename?: string
  printerName?: string
  paperWidthMm?: number
  silent?: boolean
}

type PrintReceiptResult = {
  success: boolean
  printerName?: string
}

const DEFAULT_RECEIPT_WIDTH_MM = 58
const DEFAULT_RECEIPT_HEIGHT_MM = 160
const CSS_PIXELS_PER_INCH = 96
const MICRONS_PER_INCH = 25_400
const MICRONS_PER_MM = 1_000

export function registerPrintIpc() {
  ipcMain.handle(
    'print:receipt',
    async (_event, payload: PrintReceiptPayload | undefined): Promise<PrintReceiptResult> => {
      const printPayload = payload ?? {}
      const printableHtml = printPayload.html?.trim()

      if (printableHtml) {
        const printerName = await printHtmlReceipt(printableHtml, printPayload)
        return { success: true, printerName }
      }

      const pdfBuffer = toBuffer(printPayload.buffer)
      validatePdf(pdfBuffer)

      const filename = sanitizeFileName(printPayload.filename ?? 'receipt.pdf')
      const tempPath = await writeTempFile(pdfBuffer, filename)

      try {
        const printerName = await printPdfReceipt(tempPath, printPayload)
        return { success: true, printerName }
      } finally {
        void unlink(tempPath).catch(() => undefined)
      }
    },
  )
}

function sanitizeFileName(filename: string) {
  const cleaned = basename(filename || 'receipt.pdf')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()

  const safeName = cleaned || 'receipt.pdf'
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`
}

function toBuffer(buffer: PrintReceiptPayload['buffer']) {
  if (Array.isArray(buffer)) {
    return Buffer.from(buffer)
  }

  if (buffer instanceof Uint8Array) {
    return Buffer.from(buffer)
  }

  if (buffer instanceof ArrayBuffer) {
    return Buffer.from(buffer)
  }

  throw new Error('Receipt PDF data is missing.')
}

function validatePdf(buffer: Buffer) {
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('Receipt print payload is not a PDF.')
  }
}

async function writeTempFile(buffer: Buffer, filename: string) {
  const tempDir = join(app.getPath('temp'), 'biztrack-receipts')
  await mkdir(tempDir, { recursive: true })

  const tempPath = await uniqueFilePath(tempDir, filename)
  await writeFile(tempPath, buffer)

  return tempPath
}

async function uniqueFilePath(directory: string, filename: string) {
  const parsed = parse(filename)
  const extension = parsed.ext || '.pdf'
  const baseName = parsed.name || 'receipt'

  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const candidate = join(directory, `${baseName}${suffix}${extension}`)

    try {
      await writeFile(candidate, '', { flag: 'wx' })
      return candidate
    } catch (error) {
      if (!isFileAlreadyExistsError(error)) {
        throw error
      }
    }
  }

  throw new Error('Unable to create a unique receipt print file name.')
}

function isFileAlreadyExistsError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
}

function createPrintWindow() {
  const parentWindow =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())

  return new BrowserWindow({
    show: false,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#ffffff',
    width: 420,
    height: 760,
    autoHideMenuBar: true,
    ...(parentWindow ? { parent: parentWindow } : {}),
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
}

async function printHtmlReceipt(html: string, payload: PrintReceiptPayload) {
  const printWindow = createPrintWindow()

  try {
    const printers = await printWindow.webContents.getPrintersAsync()
    const deviceName = resolvePrinterDeviceName(printers, payload.printerName)

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pageSize = await getHtmlReceiptPageSize(printWindow, payload.paperWidthMm)
    await preparePrintWindow(printWindow, payload)

    await printWebContents(
      printWindow,
      buildPrintOptions(payload, deviceName, { pageSize, marginType: 'none' }),
    )

    return deviceName || printers.find((printer) => printer.isDefault)?.name
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close()
    }
  }
}

async function printPdfReceipt(
  filePath: string,
  payload: PrintReceiptPayload,
) {
  if (process.platform === 'win32') {
    return printPdfReceiptWithSystem(filePath, payload)
  }

  const printWindow = createPrintWindow()

  try {
    const printers = await printWindow.webContents.getPrintersAsync()
    const deviceName = resolvePrinterDeviceName(printers, payload.printerName)

    await loadPdfIntoPrintWindow(printWindow, filePath)
    await waitForPdfViewer()
    await preparePrintWindow(printWindow, payload)

    await printWebContents(
      printWindow,
      buildPrintOptions(payload, deviceName, {
        marginType: 'default',
        usePrinterDefaultPageSize: true,
        dpi: { horizontal: 203, vertical: 203 },
      }),
    )

    return deviceName || printers.find((printer) => printer.isDefault)?.name
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close()
    }
  }
}

async function printPdfReceiptWithSystem(
  filePath: string,
  payload: PrintReceiptPayload,
) {
  const printer = await resolveSystemPrinter(payload.printerName)
  const paperSize = selectSystemPaperSize(printer as SystemPrinter, payload.paperWidthMm)
  const options: SystemPrintOptions = {
    orientation: 'portrait',
    scale: 'noscale',
    silent: true,
    ...(typeof printer === 'string' ? { printer } : printer?.name ? { printer: printer.name } : {}),
    ...(paperSize ? { paperSize } : {}),
  }

  await printPdfWithSystem(filePath, options)

  return typeof printer === 'string' ? printer : printer?.name
}

function buildPrintOptions(
  payload: PrintReceiptPayload,
  deviceName: string | undefined,
  options?: {
    pageSize?: { width: number; height: number }
    marginType?: 'default' | 'none' | 'printableArea'
    usePrinterDefaultPageSize?: boolean
    dpi?: { horizontal: number; vertical: number }
  },
): WebContentsPrintOptions {
  return {
    silent: payload.silent ?? true,
    printBackground: true,
    margins: { marginType: options?.marginType ?? 'printableArea' },
    ...(options?.pageSize ? { pageSize: options.pageSize } : {}),
    ...(options?.usePrinterDefaultPageSize ? { usePrinterDefaultPageSize: true } : {}),
    ...(options?.dpi ? { dpi: options.dpi } : {}),
    ...(deviceName ? { deviceName } : {}),
  }
}

function resolvePrinterDeviceName(
  printers: Electron.PrinterInfo[],
  requestedPrinterName: string | undefined,
) {
  if (printers.length === 0) {
    throw new Error('No printer is installed on this computer.')
  }

  const requested = requestedPrinterName?.trim()
  if (!requested) return undefined

  const printer = printers.find(
    (candidate) => candidate.name === requested || candidate.displayName === requested,
  )

  if (!printer) {
    throw new Error(`Printer "${requested}" is not available on this computer.`)
  }

  return printer.name
}

async function resolveSystemPrinter(requestedPrinterName: string | undefined) {
  const requested = requestedPrinterName?.trim()
  if (!requested) {
    return (await getSystemDefaultPrinter()) ?? undefined
  }

  const printers = await getSystemPrinters()
  if (printers.length === 0) {
    throw new Error('No printer is installed on this computer.')
  }

  const printer = printers.find((candidate) => candidate.name === requested)
  if (!printer) {
    throw new Error(`Printer "${requested}" is not available on this computer.`)
  }

  return printer.name
}

function selectSystemPaperSize(
  printer: SystemPrinter | undefined,
  paperWidthMm: number | undefined,
) {
  if (!printer?.paperSizes?.length) return undefined

  const requestedWidth = Math.round(paperWidthMm || DEFAULT_RECEIPT_WIDTH_MM)
  const exactMatches = printer.paperSizes.filter((size) => {
    const normalized = size.toLowerCase()
    return (
      normalized.startsWith(`${requestedWidth}(`) ||
      normalized.startsWith(`${requestedWidth} x`) ||
      normalized.startsWith(`${requestedWidth}mm`) ||
      normalized.includes(`${requestedWidth}(`)
    )
  })

  if (exactMatches.length === 0) return undefined

  return (
    exactMatches.find((size) => /3276|3000|roll|receipt/i.test(size)) ??
    exactMatches[exactMatches.length - 1]
  )
}

async function getHtmlReceiptPageSize(
  printWindow: BrowserWindow,
  paperWidthMm: number | undefined,
) {
  await waitForHtmlLayout(printWindow)

  const contentHeight = await printWindow.webContents.executeJavaScript(`
    Math.ceil(
      Math.max(
        document.documentElement?.scrollHeight ?? 0,
        document.body?.scrollHeight ?? 0,
        document.documentElement?.offsetHeight ?? 0,
        document.body?.offsetHeight ?? 0
      )
    )
  `)

  const widthMm = paperWidthMm || DEFAULT_RECEIPT_WIDTH_MM
  const measuredHeightMicrons =
    typeof contentHeight === 'number' && Number.isFinite(contentHeight)
      ? pixelsToMicrons(contentHeight) + mmToMicrons(8)
      : mmToMicrons(DEFAULT_RECEIPT_HEIGHT_MM)

  return {
    width: mmToMicrons(widthMm),
    height: Math.max(measuredHeightMicrons, mmToMicrons(50)),
  }
}

function mmToMicrons(mm: number) {
  return Math.round(mm * MICRONS_PER_MM)
}

function pixelsToMicrons(pixels: number) {
  return Math.round((pixels / CSS_PIXELS_PER_INCH) * MICRONS_PER_INCH)
}

async function waitForHtmlLayout(printWindow: BrowserWindow) {
  await printWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const settle = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(true))
        })
      }

      if (document.readyState === 'complete') {
        settle()
        return
      }

      window.addEventListener('load', settle, { once: true })
    })
  `)
}

async function loadPdfIntoPrintWindow(printWindow: BrowserWindow, filePath: string) {
  await new Promise<void>((resolve, reject) => {
    let didFinishLoad = false
    let didFirstRender = false

    const renderFallbackTimer = setTimeout(() => {
      didFirstRender = true
      maybeResolve()
    }, 1500)

    const loadTimeout = setTimeout(() => {
      cleanup()
      reject(new Error('PDF load timed out before the receipt was ready to print.'))
    }, 15000)

    const cleanup = () => {
      clearTimeout(renderFallbackTimer)
      clearTimeout(loadTimeout)
      printWindow.removeListener('ready-to-show', onReadyToShow)
      printWindow.webContents.off('did-finish-load', onFinish)
      printWindow.webContents.off('did-fail-load', onFail)
    }

    const maybeResolve = () => {
      if (!didFinishLoad || !didFirstRender) return

      cleanup()
      resolve()
    }

    const onReadyToShow = () => {
      didFirstRender = true
      maybeResolve()
    }

    const onFinish = () => {
      didFinishLoad = true
      maybeResolve()
    }

    const onFail = (_event: unknown, code: number, description: string) => {
      cleanup()
      reject(new Error(`PDF failed to load: ${description} (${code})`))
    }

    printWindow.once('ready-to-show', onReadyToShow)
    printWindow.webContents.once('did-finish-load', onFinish)
    printWindow.webContents.once('did-fail-load', onFail)
    void printWindow.loadURL(pathToFileURL(filePath).toString())
  })
}

async function waitForPdfViewer() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 900)
  })
}

function printWebContents(
  printWindow: BrowserWindow,
  options: WebContentsPrintOptions,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const safetyTimeout = setTimeout(() => {
      if (settled) return

      settled = true
      console.warn('[print] callback did not fire within 10s; assuming the job was handed off')
      resolve()
    }, 10_000)

    printWindow.webContents.print(options, (success, failureReason) => {
      if (settled) return

      settled = true
      clearTimeout(safetyTimeout)
      console.log('[print] callback', { success, failureReason, options })

      if (success) {
        resolve()
        return
      }

      if (failureReason && /cancelled|canceled|cancel/i.test(failureReason)) {
        reject(new Error('Print dialog cancelled.'))
        return
      }

      reject(new Error(failureReason || 'The receipt printer did not accept the print job.'))
    })
  })
}

async function preparePrintWindow(
  printWindow: BrowserWindow,
  payload: Pick<PrintReceiptPayload, 'silent'>,
) {
  if (printWindow.isDestroyed()) return

  if (payload.silent ?? true) {
    printWindow.setSkipTaskbar(true)

    if (!printWindow.isVisible()) {
      printWindow.setPosition(-10_000, 0, false)
      printWindow.showInactive()
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300)
    })

    return
  }

  if (!printWindow.isVisible()) {
    printWindow.show()
  }

  printWindow.focus()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 150)
  })
}
