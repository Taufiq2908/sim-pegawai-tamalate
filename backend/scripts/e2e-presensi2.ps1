$base = 'http://localhost:3000/api/v1'
function Get-Tok($u, $p) {
  $body = @{ username = $u; password = $p } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Uri ($base + '/auth/login') -ContentType 'application/json' -Body $body).data.accessToken
}
function Get-H($t) { @{ Authorization = ('Bearer ' + $t) } }
function Post-Json($uri, $headers, $obj) {
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($obj | ConvertTo-Json)
}
function CodeOf($e) { try { [int]$e.Exception.Response.StatusCode.value__ } catch { -1 } }
$tPeg = Get-Tok 'pegawai1' 'Pegawai123!'
$tVer = Get-Tok 'verifier1' 'Verifier123!'
$tKas = Get-Tok 'kasubag1' 'Kasubag123!'

# 1. check-out hari ini (sudah check-in via e2e sebelumnya)
try {
  $o = Post-Json ($base + '/attendances/check-out') (Get-H $tPeg) @{}
  'CHECKOUT: ' + $o.data.record.checkOutAt + ' early=' + $o.data.early + ' batas=' + $o.data.requiredCheckout
} catch { 'CHECKOUT: ' + (CodeOf $_) }
try { Post-Json ($base + '/attendances/check-out') (Get-H $tPeg) @{} | Out-Null; 'DUPLIKAT FAIL' } catch { 'DUPLIKAT checkout: ' + (CodeOf $_) }

# 2. laporan format tabel hari ini
$r = Invoke-RestMethod -Uri ($base + '/attendances/report') -Headers (Get-H $tVer)
'REPORT baris=' + $r.data.Count + ' contoh=' + ($r.data[0] | ConvertTo-Json -Compress)

# 3. pekan kosong (2026-09-28 Senin) -> semua 5 pegawai bermasalah (dicek Kasubag)
$p = Invoke-RestMethod -Uri ($base + '/attendances/problematic?weekStart=2026-09-28') -Headers (Get-H $tKas)
'PROBLEMATIC: ' + $p.data.Count + ' pegawai, absen=' + $p.data[0].absenceCount
try { Invoke-RestMethod -Uri ($base + '/attendances/problematic?weekStart=2026-09-30') -Headers (Get-H $tKas) | Out-Null; 'SENIN FAIL' } catch { 'SENIN guard: ' + (CodeOf $_) }

# 4. generate teguran (idempoten) + daftar + detail
$g = Post-Json ($base + '/attendances/warning-letters/generate') (Get-H $tVer) @{ weekStart = '2026-09-28' }
'GENERATE: ' + $g.message
$g2 = Post-Json ($base + '/attendances/warning-letters/generate') (Get-H $tVer) @{ weekStart = '2026-09-28' }
'GENERATE ulang: ' + $g2.message
$w = Invoke-RestMethod -Uri ($base + '/attendances/warning-letters') -Headers (Get-H $tKas)
'LIST teguran: ' + $w.meta.total
$d = Invoke-RestMethod -Uri ($base + '/attendances/warning-letters/' + $w.data[0].id) -Headers (Get-H $tKas)
'DETAIL: ' + $d.data.letterNumber + ' | ' + ($d.data.content.Substring(0, 60)) + '...'
try { Post-Json ($base + '/attendances/warning-letters/generate') (Get-H $tPeg) @{ weekStart = '2026-09-28' } | Out-Null; 'NEG FAIL' } catch { 'NEG pegawai-generate: ' + (CodeOf $_) }
