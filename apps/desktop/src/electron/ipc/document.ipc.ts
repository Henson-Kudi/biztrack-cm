import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'

type ExportPdfPayload = {
  html?: string
  filename?: string
}

type ExportFilePayload = {
  content?: string
  filename?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
}

type ExportPdfResult = {
  success: boolean
  path?: string
  canceled?: boolean
  error?: string
}

type RenderPdfResult = {
  success: boolean
  buffer?: number[]
  error?: string
}

export function registerDocumentIpc() {
  ipcMain.handle(
    'document:export-pdf',
    async (_event, payload: ExportPdfPayload | undefined): Promise<ExportPdfResult> => {
      try {
        const printableHtml = payload?.html?.trim()
        if (!printableHtml) {
          throw new Error('Document HTML is missing.')
        }

        const filename = sanitizePdfFileName(payload?.filename ?? 'document.pdf')
        const pdfBuffer = await renderHtmlToPdfBuffer(printableHtml)
        const defaultPath = join(app.getPath('downloads'), filename)
        const saveResult = await dialog.showSaveDialog({
          title: 'Save PDF',
          defaultPath,
          filters: [{ name: 'PDF document', extensions: ['pdf'] }],
        })

        if (saveResult.canceled || !saveResult.filePath) {
          return { success: false, canceled: true }
        }

        await mkdir(dirname(saveResult.filePath), { recursive: true })
        await writeFile(saveResult.filePath, pdfBuffer)

        return {
          success: true,
          path: saveResult.filePath,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )

  ipcMain.handle(
    'document:render-pdf',
    async (_event, payload: ExportPdfPayload | undefined): Promise<RenderPdfResult> => {
      try {
        const printableHtml = payload?.html?.trim()
        if (!printableHtml) throw new Error('Document HTML is missing.')
        const pdfBuffer = await renderHtmlToPdfBuffer(printableHtml)
        return { success: true, buffer: Array.from(pdfBuffer) }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle(
    'document:export-file',
    async (_event, payload: ExportFilePayload | undefined): Promise<ExportPdfResult> => {
      try {
        const content = payload?.content
        if (typeof content !== 'string' || content.length === 0) {
          throw new Error('Document content is missing.')
        }

        const filters = sanitizeDialogFilters(payload?.filters)
        const fallbackExtension = filters[0]?.extensions[0] ?? 'txt'
        const filename = sanitizeFileName(payload?.filename ?? `document.${fallbackExtension}`)
        const defaultPath = join(app.getPath('downloads'), filename)
        const saveResult = await dialog.showSaveDialog({
          title: 'Save file',
          defaultPath,
          filters: filters.length > 0 ? filters : undefined,
        })

        if (saveResult.canceled || !saveResult.filePath) {
          return { success: false, canceled: true }
        }

        await mkdir(dirname(saveResult.filePath), { recursive: true })
        await writeFile(saveResult.filePath, content, 'utf8')

        return {
          success: true,
          path: saveResult.filePath,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )
}

function sanitizePdfFileName(filename: string) {
  const cleaned = sanitizeBaseFileName(filename || 'document.pdf')

  const safeName = cleaned || 'document.pdf'
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`
}

function sanitizeFileName(filename: string) {
  const cleaned = sanitizeBaseFileName(filename || 'document.txt')

  return cleaned || 'document.txt'
}

function sanitizeBaseFileName(filename: string) {
  const withoutControlChars = Array.from(basename(filename)).map((char) =>
    char.charCodeAt(0) < 32 ? '-' : char,
  ).join('')

  return withoutControlChars
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function sanitizeDialogFilters(filters: ExportFilePayload['filters']) {
  if (!Array.isArray(filters)) {
    return []
  }

  return filters
    .map((filter) => ({
      name: String(filter?.name ?? '').trim(),
      extensions: Array.isArray(filter?.extensions)
        ? filter.extensions
            .map((extension) => String(extension ?? '').trim().replace(/^\./, ''))
            .filter(Boolean)
        : [],
    }))
    .filter((filter) => filter.name && filter.extensions.length > 0)
}

function createDocumentWindow() {
  const parentWindow =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())

  return new BrowserWindow({
    show: false,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#ffffff',
    width: 1400,
    height: 1000,
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

async function renderHtmlToPdfBuffer(html: string) {
  const exportWindow = createDocumentWindow()

  try {
    await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await waitForLayout(exportWindow)

    return await exportWindow.webContents.printToPDF({
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    })
  } finally {
    if (!exportWindow.isDestroyed()) {
      exportWindow.close()
    }
  }
}

async function waitForLayout(window: BrowserWindow) {
  await window.webContents.executeJavaScript(`
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
