import { execFile } from 'child_process'
import { app, ipcMain, ShareMenu, shell } from 'electron'
import { copyFile, mkdir, writeFile } from 'fs/promises'
import { basename, join, parse } from 'path'

type ShareFilePayload = {
  buffer: number[] | ArrayBuffer | Uint8Array
  filename: string
  mimeType?: string
}

type ShareFileResult = {
  success: boolean
  shared: boolean
  path?: string
  fallback?: 'downloads' | 'downloads-revealed'
  error?: string
}

type ShareUrlPayload = {
  url: string
  text?: string
  title?: string
}

type ShareUrlResult = {
  success: boolean
  shared: boolean
  error?: string
}

// C# bridge — all COM method calls happen inside C# so PowerShell never needs to
// dispatch COM interface methods.  No WinRT types referenced at compile time;
// they are loaded at runtime via Type.GetType("…ContentType=WindowsRuntime") which
// works on Windows 10/11 with no SDK or winmd files.
// Only non-BCL reference: System.Runtime.WindowsRuntime (always in the GAC on
// Windows 10/11 as part of .NET Framework 4.x).
const WIN_CS_BRIDGE = `
using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading.Tasks;

[ComImport, Guid("3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDataTransferManagerInterop {
    IntPtr GetForWindow([In] IntPtr appWindow, [In] ref Guid riid);
    void ShowShareUIForWindow(IntPtr appWindow);
}

public static class WinShareBridge {
    static readonly Guid _dtmIid =
        new Guid(0xa5caee9b,0x8708,0x49d1,0x8d,0x36,0x67,0xd2,0x5a,0x8d,0xa0,0x0c);

    static IDataTransferManagerInterop Interop() {
        var t = Type.GetType(
            "Windows.ApplicationModel.DataTransfer.DataTransferManager," +
            " Windows.ApplicationModel.DataTransfer, ContentType=WindowsRuntime");
        if (t == null) throw new InvalidOperationException("DTM WinRT type not found");
        return (IDataTransferManagerInterop)WindowsRuntimeMarshal.GetActivationFactory(t);
    }

    public static IntPtr GetDtmPtrForWindow(IntPtr hwnd) {
        var iid = _dtmIid;
        return Interop().GetForWindow(hwnd, ref iid);
    }

    public static void ShowShareUI(IntPtr hwnd) {
        Interop().ShowShareUIForWindow(hwnd);
    }

    // Load a StorageFile from a path entirely in C#.
    // Runs the WinRT async operation on a thread-pool thread to avoid STA deadlocks
    // (GetFileFromPathAsync would deadlock if awaited on the WinForms STA message thread).
    // AsTask is an extension method PowerShell cannot call via dot-notation, so we
    // find it via reflection instead.
    public static object LoadStorageFile(string filePath) {
        var outerTask = Task.Run(new Func<object>(() => {
            var sfType = Type.GetType(
                "Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime");
            if (sfType == null)
                throw new InvalidOperationException("StorageFile WinRT type unavailable");

            var getFile = sfType.GetMethod(
                "GetFileFromPathAsync",
                BindingFlags.Public | BindingFlags.Static,
                null, new Type[] { typeof(string) }, null);
            var asyncOp = getFile.Invoke(null, new object[] { filePath });

            // Find AsTask<TResult>(IAsyncOperation<TResult>) via reflection
            MethodInfo asTaskGeneric = null;
            foreach (var m in typeof(WindowsRuntimeSystemExtensions)
                .GetMethods(BindingFlags.Public | BindingFlags.Static)) {
                var ps = m.GetParameters();
                if (m.Name == "AsTask" && ps.Length == 1 && m.IsGenericMethod) {
                    asTaskGeneric = m;
                    break;
                }
            }
            if (asTaskGeneric == null)
                throw new InvalidOperationException("AsTask generic method not found");

            var innerTask = (Task)asTaskGeneric.MakeGenericMethod(sfType)
                .Invoke(null, new object[] { asyncOp });
            innerTask.Wait();
            return innerTask.GetType().GetProperty("Result").GetValue(innerTask);
        }));
        outerTask.Wait();
        return outerTask.Result;
    }
}
`

export function registerShareIpc() {
  ipcMain.handle('share:file', async (_event, payload: ShareFilePayload): Promise<ShareFileResult> => {
    const filename = sanitizeFileName(payload.filename)
    const tempPath = await writeTempFile(payload.buffer, filename)

    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      const downloadPath = await saveToDownloads(tempPath, filename)
      await revealSavedFile(downloadPath)
      return { success: true, shared: false, fallback: 'downloads-revealed', path: downloadPath }
    }

    try {
      if (process.platform === 'darwin') {
        await shareFileWithMacOs(tempPath)
      } else {
        await shareFileWithWindows(tempPath, filename)
      }
      return { success: true, shared: true, path: tempPath }
    } catch (error) {
      console.warn('[share:file] native share unavailable, falling back to downloads', {
        platform: process.platform,
        error: error instanceof Error ? error.message : String(error),
      })
      const downloadPath = await saveToDownloads(tempPath, filename)
      await revealSavedFile(downloadPath)
      return {
        success: true,
        shared: false,
        fallback: 'downloads-revealed',
        path: downloadPath,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle('share:url', async (_event, payload: ShareUrlPayload): Promise<ShareUrlResult> => {
    try {
      if (process.platform === 'darwin') {
        await shareUrlWithMacOs(payload.url, payload.text)
        return { success: true, shared: true }
      }

      if (process.platform === 'win32') {
        await shareUrlWithWindows(payload.url, payload.text ?? payload.url, payload.title ?? '')
        return { success: true, shared: true }
      }

      return { success: false, shared: false }
    } catch (error) {
      console.warn('[share:url] native share unavailable', {
        platform: process.platform,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        shared: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

// ─── macOS — Electron built-in ShareMenu ─────────────────────────────────────

function shareFileWithMacOs(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      new ShareMenu({ filePaths: [filePath] }).popup()
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

function shareUrlWithMacOs(url: string, text?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const items: ConstructorParameters<typeof ShareMenu>[0] = { urls: [url] }
      if (text) items.texts = [text]
      new ShareMenu(items).popup()
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

// ─── Windows — PowerShell WinRT projection, no SDK / winmd needed ────────────

function shareFileWithWindows(filePath: string, filename: string) {
  return spawnWindowsShare(buildWinFileScript(filePath, filename))
}

function shareUrlWithWindows(url: string, text: string, title: string) {
  return spawnWindowsShare(buildWinUrlScript(url, text, title))
}

// Spawns the PowerShell share script and resolves as soon as the share picker
// is visible (stdout emits "SHARE_OPENED").  The PS process keeps running in the
// background while the user interacts with the picker; we don't wait for it.
function spawnWindowsShare(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', [
      '-NoProfile', '-Sta', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ], { windowsHide: true })

    let settled = false
    let stderr = ''

    const settle = (err?: Error) => {
      if (settled) return
      settled = true
      err ? reject(err) : resolve()
    }

    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('SHARE_OPENED')) {
        child.unref()   // let it run in background; don't hold the event loop
        settle()
      }
    })

    child.on('error', (err) => settle(err))

    child.on('close', (code) => {
      settle(code !== 0 ? new Error(stderr.trim() || `PowerShell exited ${code}`) : undefined)
    })

    // If the picker never opened within 20s, give up and fall back
    setTimeout(() => settle(new Error('Share dialog did not open')), 20_000)
  })
}

// WIN_CS_BRIDGE is assigned to $script:_cs BEFORE any indented block so the
// here-string closing '@ stays at column 0 (required by PowerShell parser).
function buildWinPreamble(extraWinRtTypes: string): string {
  return `
Set-StrictMode -Off
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
${extraWinRtTypes}
$script:_cs = @'
${WIN_CS_BRIDGE}
'@
if (-not ('WinShareBridge' -as [type])) {
  Add-Type -TypeDefinition $script:_cs -ReferencedAssemblies 'System.Runtime.WindowsRuntime'
}
$script:_shareErr = $null
$script:_dataSet  = $false
$script:_f = New-Object System.Windows.Forms.Form
$script:_f.Size = New-Object System.Drawing.Size(1,1)
$script:_f.Opacity = 0.0
$script:_f.ShowInTaskbar = $false
$script:_f.TopMost = $true
$script:_f.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
`
}

function buildWinFileScript(filePath: string, filename: string): string {
  const psFilePath = psStr(filePath)
  const psFilename = psStr(filename)
  const preamble = buildWinPreamble(`
[void][Windows.ApplicationModel.DataTransfer.DataTransferManager,Windows.ApplicationModel.DataTransfer,ContentType=WindowsRuntime]
[void][Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
[void][Windows.Storage.IStorageItem,Windows.Storage,ContentType=WindowsRuntime]
`)

  return `${preamble}
$script:_f.add_Shown({
  try {
    # Load StorageFile on thread pool via C# to avoid STA deadlock
    $script:_storedFile = [WinShareBridge]::LoadStorageFile(${psFilePath})

    $dtmPtr = [WinShareBridge]::GetDtmPtrForWindow($script:_f.Handle)
    if ($dtmPtr -eq [IntPtr]::Zero) { throw 'GetDtmPtrForWindow returned null' }
    $dtm = [Windows.ApplicationModel.DataTransfer.DataTransferManager][System.Runtime.InteropServices.Marshal]::GetObjectForIUnknown($dtmPtr)

    $dtm.add_DataRequested({
      param($s,$e)
      if ($script:_dataSet) { return }
      $script:_dataSet = $true
      try {
        $e.Request.Data.Properties.Title = ${psFilename}
        $e.Request.Data.SetStorageItems([Windows.Storage.IStorageItem[]]@($script:_storedFile))
      } catch { $script:_shareErr = $_.Exception.Message }
    })

    [WinShareBridge]::ShowShareUI($script:_f.Handle)
    Write-Host 'SHARE_OPENED'

    $tout = New-Object System.Windows.Forms.Timer; $tout.Interval = 35000
    $tout.add_Tick({ $tout.Stop(); $tout.Dispose(); $script:_f.Close() })
    $tout.Start()
  } catch {
    $script:_shareErr = $_.Exception.Message
    $script:_f.Close()
  }
})
[System.Windows.Forms.Application]::Run($script:_f)
if ($script:_shareErr) { Write-Error $script:_shareErr; exit 1 }
`
}

function buildWinUrlScript(url: string, text: string, title: string): string {
  const psText  = psStr(text || url)
  const psTitle = psStr(title || 'Share')
  const preamble = buildWinPreamble(
    '[void][Windows.ApplicationModel.DataTransfer.DataTransferManager,Windows.ApplicationModel.DataTransfer,ContentType=WindowsRuntime]',
  )

  return `${preamble}
$script:_f.add_Shown({
  try {
    $dtmPtr = [WinShareBridge]::GetDtmPtrForWindow($script:_f.Handle)
    if ($dtmPtr -eq [IntPtr]::Zero) { throw 'GetDtmPtrForWindow returned null' }
    $dtm = [Windows.ApplicationModel.DataTransfer.DataTransferManager][System.Runtime.InteropServices.Marshal]::GetObjectForIUnknown($dtmPtr)

    $dtm.add_DataRequested({
      param($s,$e)
      if ($script:_dataSet) { return }
      $script:_dataSet = $true
      try {
        $e.Request.Data.Properties.Title = ${psTitle}
        $e.Request.Data.SetText(${psText})
      } catch { $script:_shareErr = $_.Exception.Message }
    })

    [WinShareBridge]::ShowShareUI($script:_f.Handle)
    Write-Host 'SHARE_OPENED'

    $tout = New-Object System.Windows.Forms.Timer; $tout.Interval = 35000
    $tout.add_Tick({ $tout.Stop(); $tout.Dispose(); $script:_f.Close() })
    $tout.Start()
  } catch {
    $script:_shareErr = $_.Exception.Message
    $script:_f.Close()
  }
})
[System.Windows.Forms.Application]::Run($script:_f)
if ($script:_shareErr) { Write-Error $script:_shareErr; exit 1 }
`
}

// ─── file helpers ─────────────────────────────────────────────────────────────

function sanitizeFileName(filename: string) {
  const withoutControlChars = Array.from(basename(filename || 'receipt.pdf'))
    .map((char) => (char.charCodeAt(0) < 32 ? '-' : char))
    .join('')
  const cleaned = withoutControlChars
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
  const safeName = cleaned || 'receipt.pdf'
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`
}

function toBuffer(buffer: ShareFilePayload['buffer']) {
  if (Array.isArray(buffer)) return Buffer.from(buffer)
  if (buffer instanceof Uint8Array) return Buffer.from(buffer)
  if (buffer instanceof ArrayBuffer) return Buffer.from(buffer)
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

async function revealSavedFile(filePath: string) {
  try {
    shell.showItemInFolder(filePath)
  } catch {
    await shell.openPath(filePath)
  }
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
      if (!isFileAlreadyExistsError(error)) throw error
    }
  }
  throw new Error('Unable to create a unique receipt file name.')
}

function isFileAlreadyExistsError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
}

// Escape a value as a PowerShell single-quoted string literal
function psStr(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}
