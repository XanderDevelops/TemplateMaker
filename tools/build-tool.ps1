$ErrorActionPreference = 'Stop'

$componentDir = Join-Path $PSScriptRoot 'components'
$outputPath = Join-Path $PSScriptRoot 'tool.js'

$components = @(
    '00-google-fonts-list.js',
    '01-core-setup.js',
    '02-auth-and-session.js',
    '03-canvas-and-elements.js',
    '04-settings-inspector-binding.js',
    '05-export-engine.js',
    '06-ai-assistant.js',
    '07-panels-tour-bootstrap.js'
)

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("import { supabase as importedSupabase } from '../assets/js/supabase-client.js';")
[void]$sb.AppendLine()
[void]$sb.AppendLine("globalThis.__csvlink_supabase = importedSupabase;")
[void]$sb.AppendLine()

foreach ($component in $components) {
    $path = Join-Path $componentDir $component
    if (-not (Test-Path $path)) {
        throw "Missing component file: $path"
    }

    [void]$sb.AppendLine("// components/$component")
    [void]$sb.AppendLine((Get-Content -Path $path -Raw))
    [void]$sb.AppendLine()
}

[void]$sb.AppendLine('delete globalThis.__csvlink_supabase;')

Set-Content -Path $outputPath -Value $sb.ToString() -Encoding UTF8
Write-Host "Built $outputPath"
