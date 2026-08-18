# 一键让全局 `vibepm` 命令指向 TS CLI（跟 dsh 一样：`vibepm web` 直接启动）
# 用法：在 PowerShell 里运行本脚本（或右键"使用 PowerShell 运行"）
# 脚本做两件事：
#   1) 删除 anaconda 里废弃的旧 Python 版 vibepm.exe（已完全不用 Python 版，直接删）
#   2) npm link 挂载 TS CLI，在 AppData\Roaming\npm 生成 vibepm.cmd shim

$ErrorActionPreference = "Stop"

$exe = Join-Path $env:USERPROFILE "anaconda3\Scripts\vibepm.exe"
if (Test-Path $exe) {
    Remove-Item $exe -Force
    Write-Host "[1/2] 已删除旧 Python vibepm.exe"
} else {
    Write-Host "[1/2] 未发现旧 vibepm.exe，跳过"
}

# 顺带清理 pip 遗留的同名脚本入口（如有）
$script = Join-Path $env:USERPROFILE "anaconda3\Scripts\vibepm-script.py"
if (Test-Path $script) {
    Remove-Item $script -Force
    Write-Host "    已删除残留 vibepm-script.py"
}

$cliDir = Join-Path $PSScriptRoot "packages\cli"
Push-Location $cliDir
try {
    npm link
    Write-Host "[2/2] TS CLI 已全局链接"
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "完成！现在可直接运行: vibepm web"
Write-Host "验证: vibepm --version   /   vibepm status"
