import { execFile } from 'child_process'
import { app, ipcMain } from 'electron'
import { basename, join, parse } from 'path'
import { promisify } from 'util'
import { copyFile, mkdir, writeFile } from 'fs/promises'

type ShareFilePayload = {
  buffer: number[] | ArrayBuffer | Uint8Array
  filename: string
  mimeType?: string
}

type ShareFileResult = {
  success: boolean
  shared: boolean
  path?: string
  fallback?: 'downloads'
  error?: string
}

const execFileAsync = promisify(execFile)

export function registerShareIpc() {
  ipcMain.handle('share:file', async (_event, payload: ShareFilePayload): Promise<ShareFileResult> => {
    const filename = sanitizeFileName(payload.filename)
    const tempPath = await writeTempFile(payload.buffer, filename)

    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      const downloadPath = await saveToDownloads(tempPath, filename)
      return { success: true, shared: false, fallback: 'downloads', path: downloadPath }
    }

    try {
      if (process.platform === 'darwin') {
        await shareWithMacOs(tempPath)
      } else {
        await shareWithWindows(tempPath, filename)
      }

      return { success: true, shared: true, path: tempPath }
    } catch (error) {
      const downloadPath = await saveToDownloads(tempPath, filename)

      return {
        success: true,
        shared: false,
        fallback: 'downloads',
        path: downloadPath,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
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

function toBuffer(buffer: ShareFilePayload['buffer']) {
  if (Array.isArray(buffer)) {
    return Buffer.from(buffer)
  }

  if (buffer instanceof Uint8Array) {
    return Buffer.from(buffer)
  }

  if (buffer instanceof ArrayBuffer) {
    return Buffer.from(buffer)
  }

  throw new Error('Unsupported share buffer payload.')
}

async function writeTempFile(buffer: ShareFilePayload['buffer'], filename: string) {
  const tempDir = join(app.getPath('temp'), 'biztrack-receipts')
  await mkdir(tempDir, { recursive: true })

  const tempPath = await uniqueFilePath(tempDir, filename)
  await writeFile(tempPath, toBuffer(buffer))

  return tempPath
}

async function saveToDownloads(sourcePath: string, filename: string) {
  const downloadsDir = app.getPath('downloads')
  await mkdir(downloadsDir, { recursive: true })

  const downloadPath = await uniqueFilePath(downloadsDir, filename)
  await copyFile(sourcePath, downloadPath)

  return downloadPath
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

  throw new Error('Unable to create a unique receipt file name.')
}

function isFileAlreadyExistsError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
}

async function shareWithMacOs(filePath: string) {
  const script = `
ObjC.import('AppKit')
const filePath = $.NSString.alloc.initWithUTF8String(${JSON.stringify(filePath)})
const fileUrl = $.NSURL.fileURLWithPath(filePath)
const picker = $.NSSharingServicePicker.alloc.initWithItems([fileUrl])
const app = $.NSApplication.sharedApplication
app.activateIgnoringOtherApps(true)
const rect = $.NSMakeRect(0, 0, 1, 1)
const window = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
  rect,
  $.NSWindowStyleMaskBorderless,
  $.NSBackingStoreBuffered,
  false
)
window.makeKeyAndOrderFront(null)
picker.showRelativeToRectOfViewPreferredEdge(rect, window.contentView, $.NSMinYEdge)
$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(2))
`

  await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5_000 })
}

async function shareWithWindows(filePath: string, filename: string) {
  const script = `
$filePath = ${toPowerShellString(filePath)}
$title = ${toPowerShellString(filename)}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.ApplicationModel.DataTransfer.DataTransferManager, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime] | Out-Null
$file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($filePath).GetAwaiter().GetResult()
$manager = [Windows.ApplicationModel.DataTransfer.DataTransferManager]::GetForCurrentView()
$registration = $manager.add_DataRequested({
  param($sender, $args)
  $args.Request.Data.Properties.Title = $title
  $args.Request.Data.SetStorageItems(@($file))
})
[Windows.ApplicationModel.DataTransfer.DataTransferManager]::ShowShareUI()
Start-Sleep -Milliseconds 750
$manager.remove_DataRequested($registration)
`

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      timeout: 6_000,
      windowsHide: true,
    },
  )
}

function toPowerShellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}
