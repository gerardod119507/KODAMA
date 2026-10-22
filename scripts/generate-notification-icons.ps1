Add-Type -AssemblyName System.Drawing

$repoRoot = "C:\Users\Admin\.gemini\antigravity\scratch\KODAMA_APP\KODAMA"
$srcPath = Join-Path $repoRoot "icons\icono-512.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

$silueta = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

$bgY = 0.299 * 7 + 0.587 * 23 + 0.114 * 67
$fgY = 0.299 * 245 + 0.587 * 241 + 0.114 * 232

for ($y = 0; $y -lt $src.Height; $y++) {
    for ($x = 0; $x -lt $src.Width; $x++) {
        $pixel = $src.GetPixel($x, $y)
        $lum = 0.299 * $pixel.R + 0.587 * $pixel.G + 0.114 * $pixel.B
        $t = ($lum - $bgY) / ($fgY - $bgY)
        if ($t -lt 0.08) {
            $silueta.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
        } elseif ($t -gt 0.95) {
            $silueta.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 255, 255, 255))
        } else {
            $alpha = [int][Math]::Round(255 * $t)
            if ($alpha -gt 255) { $alpha = 255 }
            if ($alpha -lt 0) { $alpha = 0 }
            $silueta.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
        }
    }
}

$densidades = @{
    "drawable-mdpi" = 24
    "drawable-hdpi" = 36
    "drawable-xhdpi" = 48
    "drawable-xxhdpi" = 72
    "drawable-xxxhdpi" = 96
    "drawable" = 96
}

$baseRes = Join-Path $repoRoot "resources\android\res"

foreach ($entry in $densidades.GetEnumerator()) {
    $dir = Join-Path $baseRes $entry.Key
    if (-not (Test-Path $dir)) { 
        New-Item -ItemType Directory -Path $dir -Force | Out-Null 
    }
    $destFile = Join-Path $dir "ic_stat_kodama.png"
    
    $size = $entry.Value
    $resized = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($silueta, 0, 0, $size, $size)
    $g.Dispose()
    
    $resized.Save($destFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
    Write-Output "Generado: $destFile ($size x $size)"
}

$silueta.Dispose()
$src.Dispose()
Write-Output "Completado exitosamente"
