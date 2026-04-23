import { app, BrowserWindow, ipcMain, type WebContentsPrintOptions } from 'electron'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { basename, join, parse } from 'path'
import { pathToFileURL } from 'url'

type PrintReceiptPayload = {
  buffer?: number[] | ArrayBuffer | Uint8Array
  filename?: string
  printerName?: string
  paperWidthMm?: number
  silent?: boolean
}

type PrintReceiptResult = {
  success: boolean
  printerName?: string
}

const DEFAULT_RECEIPT_WIDTH_MM = 80
const POINTS_PER_INCH = 72
const MICRONS_PER_INCH = 25_400
const MICRONS_PER_MM = 1_000

export function registerPrintIpc() {
  ipcMain.handle(
    'print:receipt',
    async (_event, payload: PrintReceiptPayload | undefined): Promise<PrintReceiptResult> => {
      const printPayload = payload ?? {}
      const pdfBuffer = toBuffer(printPayload.buffer)
      validatePdf(pdfBuffer)

      const filename = sanitizeFileName(printPayload.filename ?? 'receipt.pdf')
      const tempPath = await writeTempFile(pdfBuffer, filename)

      try {
        const printerName = await printPdfReceipt(tempPath, pdfBuffer, printPayload)
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

async function printPdfReceipt(
  filePath: string,
  pdfBuffer: Buffer,
  payload: PrintReceiptPayload,
) {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  try {
    const printers = await printWindow.webContents.getPrintersAsync()
    const deviceName = resolvePrinterDeviceName(printers, payload.printerName)
    const pageSize = getReceiptPageSize(pdfBuffer, payload.paperWidthMm)

    await printWindow.loadURL(pathToFileURL(filePath).toString())
    await waitForPdfViewer()

    await printWebContents(printWindow, {
      silent: payload.silent ?? true,
      printBackground: true,
      color: false,
      margins: { marginType: 'none' },
      pageSize,
      ...(deviceName ? { deviceName } : {}),
    })

    return deviceName || printers.find((printer) => printer.isDefault)?.name
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close()
    }
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

function getReceiptPageSize(pdfBuffer: Buffer, paperWidthMm: number | undefined) {
  const mediaBox = parsePdfMediaBox(pdfBuffer)

  if (mediaBox) {
    return {
      width: pointsToMicrons(mediaBox.width),
      height: pointsToMicrons(mediaBox.height),
    }
  }

  return {
    width: Math.round((paperWidthMm || DEFAULT_RECEIPT_WIDTH_MM) * MICRONS_PER_MM),
    height: Math.round(160 * MICRONS_PER_MM),
  }
}

function parsePdfMediaBox(pdfBuffer: Buffer) {
  const pdfText = pdfBuffer.toString('latin1')
  const match = pdfText.match(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/)
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return { width, height }
}

function pointsToMicrons(points: number) {
  return Math.round((points / POINTS_PER_INCH) * MICRONS_PER_INCH)
}

function waitForPdfViewer() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 350)
  })
}

function printWebContents(
  printWindow: BrowserWindow,
  options: WebContentsPrintOptions,
) {
  return new Promise<void>((resolve, reject) => {
    printWindow.webContents.print(options, (success, failureReason) => {
      if (success) {
        resolve()
        return
      }

      reject(new Error(failureReason || 'The receipt printer did not accept the print job.'))
    })
  })
}
