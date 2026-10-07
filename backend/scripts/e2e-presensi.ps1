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
$mePeg = Invoke-RestMethod -Uri ($base + '/auth/me') -Headers (Get-H $tPeg)
'PERMS pegawai: ' + ($mePeg.data.permissions -join ',')
$empId = $mePeg.data.employee.id

# 1. check-in (bisa 409 bila sudah presensi — tetap valid)
$checkinOk = $false
try {
  $c = Post-Json ($base + '/attendances/check-in') (Get-H $tPeg) @{}
  'CHECKIN: ' + $c.data.record.status + ' late=' + $c.data.late
  $checkinOk = $true
} catch {
  'CHECKIN: ' + (CodeOf $_) + ' (diharapkan bila sudah presensi)'
}
# 2. duplikat harus 409 (jika langkah 1 sukses; jika 409 dari awal, ini juga 409)
try {
  Post-Json ($base + '/attendances/check-in') (Get-H $tPeg) @{} | Out-Null
  if ($checkinOk) { 'DUPLIKAT FAIL: check-in ganda lolos' } else { 'DUPLIKAT: -' }
} catch {
  'DUPLIKAT: ' + (CodeOf $_)
}
# 3. today
$t = Invoke-RestMethod -Uri ($base + '/attendances/today') -Headers (Get-H $tPeg)
'TODAY: ' + $t.data.record.status + ' deadline=' + $t.data.deadline
# 4. verifier input manual kemarin (SAKIT) lalu koreksi jadi IZIN (idempoten: pakai yang ada bila 409)
$yesterday = ([DateTimeOffset]::UtcNow + [TimeSpan]::FromHours(8)).AddDays(-1).ToString('yyyy-MM-dd')
try {
  $m = Post-Json ($base + '/attendances') (Get-H $tVer) @{ employeeId = $empId; date = $yesterday; status = 'SAKIT'; note = 'demam' }
} catch {
  $ex = Invoke-RestMethod -Uri ($base + '/attendances?from=' + $yesterday + '&to=' + $yesterday + '&employeeId=' + $empId) -Headers (Get-H $tVer)
  $m = @{ data = $ex.data[0] }
  'MANUAL: sudah ada, pakai catatan existing'
}
'MANUAL: ' + $m.data.status
$p = Invoke-RestMethod -Method Patch -Uri ($base + '/attendances/' + $m.data.id) -Headers (Get-H $tVer) -ContentType 'application/json' -Body (@{ status = 'IZIN'; note = 'izin tertulis' } | ConvertTo-Json)
'KOREKSI: ' + $p.data.status + ' note=' + $p.data.note
# 5. rekap bulan berjalan
$s = Invoke-RestMethod -Uri ($base + '/attendances/summary') -Headers (Get-H $tVer)
'SUMMARY: ' + $s.meta.totalEmployees + ' pegawai, ' + $s.data.Count + ' baris'
# 6. negatif: pegawai input manual (403), pegawai summary (403), masa depan (422)
try { Post-Json ($base + '/attendances') (Get-H $tPeg) @{ employeeId = $empId; date = $yesterday; status = 'IZIN' } | Out-Null; 'NEG1 FAIL' } catch { 'NEG1 pegawai-manual: ' + (CodeOf $_) }
try { Invoke-RestMethod -Uri ($base + '/attendances/summary') -Headers (Get-H $tPeg) | Out-Null; 'NEG2 FAIL' } catch { 'NEG2 pegawai-summary: ' + (CodeOf $_) }
$tomorrow = ([DateTimeOffset]::UtcNow + [TimeSpan]::FromHours(8)).AddDays(1).ToString('yyyy-MM-dd')
try { Post-Json ($base + '/attendances') (Get-H $tVer) @{ employeeId = $empId; date = $tomorrow; status = 'IZIN' } | Out-Null; 'NEG3 FAIL' } catch { 'NEG3 masa-depan: ' + (CodeOf $_) }
