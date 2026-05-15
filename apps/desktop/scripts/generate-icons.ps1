$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktopRoot = Resolve-Path (Join-Path $scriptDir '..')
$repoRoot = Resolve-Path (Join-Path $desktopRoot '..\..')

$sourceIconPath = Join-Path $repoRoot 'apps\mobile\assets\images\icon.png'
$assetsDir = Join-Path $desktopRoot 'assets'
$desktopPngPath = Join-Path $assetsDir 'icon.png'
$desktopIcoPath = Join-Path $assetsDir 'icon.ico'

if (-not (Test-Path $sourceIconPath)) {
  throw "Source icon not found at $sourceIconPath"
}

New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
Copy-Item -Path $sourceIconPath -Destination $desktopPngPath -Force

$sourceImage = [System.Drawing.Image]::FromFile($sourceIconPath)

try {
  $sizes = @(256, 128, 64, 48, 32, 16)
  $iconFrames = New-Object System.Collections.Generic.List[object]

  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
      } finally {
        $graphics.Dispose()
      }

      $memory = New-Object System.IO.MemoryStream
      try {
        $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
        $iconFrames.Add([PSCustomObject]@{
            Size  = $size
            Bytes = $memory.ToArray()
          })
      } finally {
        $memory.Dispose()
      }
    } finally {
      $bitmap.Dispose()
    }
  }

  $fileStream = [System.IO.File]::Open($desktopIcoPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $writer = New-Object System.IO.BinaryWriter $fileStream
    try {
      $writer.Write([UInt16]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]$iconFrames.Count)

      $offset = 6 + (16 * $iconFrames.Count)

      foreach ($frame in $iconFrames) {
        $dimension = if ($frame.Size -ge 256) { 0 } else { [byte]$frame.Size }
        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$frame.Bytes.Length)
        $writer.Write([UInt32]$offset)
        $offset += $frame.Bytes.Length
      }

      foreach ($frame in $iconFrames) {
        $writer.Write($frame.Bytes)
      }
    } finally {
      $writer.Dispose()
    }
  } finally {
    $fileStream.Dispose()
  }
} finally {
  $sourceImage.Dispose()
}

Write-Host "Created installer icons in $assetsDir"
