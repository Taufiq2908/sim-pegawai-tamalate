$base = 'http://localhost:3000/api/v1'
function Get-Login($u, $p) {
  $body = @{ username = $u; password = $p } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Uri ($base + '/auth/login') -ContentType 'application/json' -Body $body).data
}
function Get-H($t) { @{ Authorization = ('Bearer ' + $t) } }
function Post-Json($uri, $headers, $obj) {
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($obj | ConvertTo-Json)
}
function CodeOf($e) { try { [int]$e.Exception.Response.StatusCode.value__ } catch { -1 } }
$ver = Get-Login 'verifier1' 'Verifier123!'
$kas = Get-Login 'kasubag1' 'Kasubag123!'
$sek = Get-Login 'sekcam1' 'Sekcam123!'
$cam = Get-Login 'camat1' 'Camat123!'
$peg = Get-Login 'pegawai1' 'Pegawai123!'

# 1. status DL (Dinas Luar) memaafkan kedua sesi
$me = (Invoke-RestMethod -Uri ($base + '/auth/me') -Headers (Get-H $peg.accessToken)).data
$dl = Post-Json ($base + '/attendances') (Get-H $kas.accessToken) @{ employeeId = $me.employee.id; date = '2026-09-30'; status = 'DL'; note = 'Tugas luar' }
'DL input: ' + $dl.data.status
$rc = Invoke-RestMethod -Uri ($base + '/attendances/weekly-recap?weekStart=2026-09-28') -Headers (Get-H $kas.accessToken)
$mine = $rc.data | Where-Object { $_.employee.id -eq $me.employee.id }
'D3 DL-dimaafkan: ' + (($mine.days | Where-Object { $_.date -eq '2026-09-30' } | ForEach-Object { $_.pagi + '/' + $_.sore }) -join ',')
try { Invoke-RestMethod -Uri ($base + '/attendances/weekly-recap?weekStart=2026-09-30') -Headers (Get-H $kas.accessToken) | Out-Null; 'D4 FAIL' } catch { 'D4 bukan-senin: ' + (CodeOf $_) }

# 2. kunci harian 2026-10-02 (Jumat): tanpa foto -> 422; staf mengunci -> 403
try { Post-Json ($base + '/attendances/lock') (Get-H $kas.accessToken) @{ date = '2026-10-02' } | Out-Null; 'L1 FAIL' } catch { 'L1 tanpa-foto: ' + (CodeOf $_) }
'foto' | Out-File -Encoding ascii tmp-pagi.jpg
'foto' | Out-File -Encoding ascii tmp-sore.jpg
curl.exe -s -X POST -H ('Authorization: Bearer ' + $kas.accessToken) -F 'date=2026-10-02' -F 'session=PAGI' -F 'file=@tmp-pagi.jpg;type=image/jpeg' ($base + '/attendances/session-photos') | Out-Null
curl.exe -s -X POST -H ('Authorization: Bearer ' + $kas.accessToken) -F 'date=2026-10-02' -F 'session=SORE' -F 'file=@tmp-sore.jpg;type=image/jpeg' ($base + '/attendances/session-photos') | Out-Null
Remove-Item tmp-pagi.jpg, tmp-sore.jpg
'FOTO kasubag: ok (manage grant terbukti)'
try { Post-Json ($base + '/attendances/lock') (Get-H $ver.accessToken) @{ date = '2026-10-02' } | Out-Null; 'L2 FAIL' } catch { 'L2 staf-kunci: ' + (CodeOf $_) }
$emps = (Invoke-RestMethod -Uri ($base + '/employees?limit=100') -Headers (Get-H $kas.accessToken)).meta.total
$rec = (Invoke-RestMethod -Uri ($base + '/attendances?from=2026-10-02&to=2026-10-02&limit=100') -Headers (Get-H $kas.accessToken)).data.Count
$lock = Post-Json ($base + '/attendances/lock') (Get-H $kas.accessToken) @{ date = '2026-10-02'; note = 'Apel terkendali' }
'L3 kunci: ' + $lock.data.locked + ' TK-termaterialisasi=' + $lock.data.materializedTK + ' (harap=' + ($emps - $rec) + ')'
try { Post-Json ($base + '/attendances/lock') (Get-H $kas.accessToken) @{ date = '2026-10-02' } | Out-Null; 'L4 FAIL' } catch { 'L4 kunci-ganda: ' + (CodeOf $_) }
$rep = Invoke-RestMethod -Uri ($base + '/attendances/report?date=2026-10-02') -Headers (Get-H $kas.accessToken)
'L5 report locked=' + $rep.meta.locked + ' baris=' + $rep.data.Count
try { Post-Json ($base + '/attendances') (Get-H $kas.accessToken) @{ employeeId = $me.employee.id; date = '2026-10-02'; status = 'IZIN' } | Out-Null; 'L6 FAIL' } catch { 'L6 input-terkunci: ' + (CodeOf $_) }

# 3. generate pekan 2026-10-05 -> notifikasi Sekcam + pegawai saat summon
$ns0 = (Invoke-RestMethod -Uri ($base + '/notifications/unread-count') -Headers (Get-H $sek.accessToken)).data.unread
$g = Post-Json ($base + '/attendances/warning-letters/generate') (Get-H $kas.accessToken) @{ weekStart = '2026-10-05' }
'G1 generate: ' + $g.message
$ns1 = (Invoke-RestMethod -Uri ($base + '/notifications/unread-count') -Headers (Get-H $sek.accessToken)).data.unread
'G2 notif-sekcam-naik: ' + ($ns1 - $ns0)
$wid = ($g.data | Where-Object { $_.created -eq $true } | Select-Object -First 1).id
if (-not $wid) { $wid = $g.data[0].id }
Post-Json ($base + '/attendances/warning-letters/' + $wid + '/summon') (Get-H $kas.accessToken) @{ scheduledAt = '2026-10-12T02:00:00Z'; note = 'Ruang kasubag' } | Out-Null
'G3 summon: ok'

# 4. eskalasi: Sekcam forward -> Camat; Camat instruct -> pelaksana
$nc0 = (Invoke-RestMethod -Uri ($base + '/notifications/unread-count') -Headers (Get-H $cam.accessToken)).data.unread
Post-Json ($base + '/attendances/warning-letters/' + $wid + '/forward') (Get-H $sek.accessToken) @{ note = 'Mohon arahan' } | Out-Null
$nc1 = (Invoke-RestMethod -Uri ($base + '/notifications/unread-count') -Headers (Get-H $cam.accessToken)).data.unread
'E1 forward: ok notif-camat-naik=' + ($nc1 - $nc0)
try { Post-Json ($base + '/attendances/warning-letters/' + $wid + '/forward') (Get-H $cam.accessToken) @{} | Out-Null; 'E2 FAIL' } catch { 'E2 camat-forward: ' + (CodeOf $_) }
try { Post-Json ($base + '/attendances/warning-letters/' + $wid + '/instruct') (Get-H $sek.accessToken) @{ instruction = 'x'*20 } | Out-Null; 'E3 FAIL' } catch { 'E3 sekcam-instruct: ' + (CodeOf $_) }
Post-Json ($base + '/attendances/warning-letters/' + $wid + '/instruct') (Get-H $cam.accessToken) @{ instruction = 'Terbitkan surat teguran dan bina' } | Out-Null
'E4 instruct: ok'
$pr = Invoke-RestMethod -Uri ($base + '/attendances/warning-letters/' + $wid + '/print') -Headers (Get-H $kas.accessToken)
'PRINT: nip=' + $pr.data.employee.nip + ' pembinaan=' + $pr.data.statusPembinaan + ' camat=' + $pr.data.officials.camat.name
