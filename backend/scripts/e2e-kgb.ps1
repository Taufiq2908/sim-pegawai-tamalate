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
$tKas = Get-Tok 'kasubag1' 'Kasubag123!'
$tSek = Get-Tok 'sekcam1' 'Sekcam123!'
$tCam = Get-Tok 'camat1' 'Camat123!'

# guard: gaji baru harus > gaji lama
try {
  Post-Json ($base + '/kgb-requests') (Get-H $tPeg) @{ oldRank = 'III/a'; newRank = 'III/a'; oldSalary = 3000000; newSalary = 3000000; effectiveDate = '2026-11-01' } | Out-Null
  'GUARD FAIL'
} catch { 'GUARD gaji: ' + (CodeOf $_) }

$c = Post-Json ($base + '/kgb-requests') (Get-H $tPeg) @{ oldRank = 'III/a'; newRank = 'III/b'; oldSalary = 3000000; newSalary = 3200000; effectiveDate = '2026-11-01'; note = 'KGB periode Nov 2026' }
$id = $c.data.id
$empId = $c.data.employee.id
'CREATE: ' + $c.data.status + ' ' + $c.data.requestNumber

# Draf dengan tanggal lama tidak boleh menggeser basis KGB final.
$draft = Post-Json ($base + '/kgb-requests') (Get-H $tPeg) @{ oldRank = 'III/a'; newRank = 'III/b'; oldSalary = 3000000; newSalary = 3100000; effectiveDate = '2024-01-01'; note = 'draf uji monitoring' }
$monDraft = Invoke-RestMethod -Uri ($base + '/kgb-requests/monitoring') -Headers (Get-H $tKas)
$rowDraft = $monDraft.data | Where-Object { $_.employee.id -eq $empId } | Select-Object -First 1
if ($rowDraft -and $rowDraft.lastKgb -and $rowDraft.lastKgb.id -eq $draft.data.id) {
  'MONITORING FAIL: draf dianggap KGB final'
}
Invoke-RestMethod -Method Delete -Uri ($base + '/kgb-requests/' + $draft.data.id) -Headers (Get-H $tPeg) | Out-Null

$steps = @(
  @{ t = $tPeg; act = 'submit' },
  @{ t = $tKas; act = 'verify' },
  @{ t = $tSek; act = 'paraf' },
  @{ t = $tCam; act = 'approve' },
  @{ t = $tKas; act = 'register'; note = 'Nomor surat keluar: 800/001/KT/XI/2026' },
  @{ t = $tKas; act = 'tobkpsdm'; note = 'Dikirim via caraka 1 Nov 2026' },
  @{ t = $tKas; act = 'complete'; note = 'Hasil diterima & diserahkan ke pegawai' },
  @{ t = $tKas; act = 'archive' }
)
foreach ($s in $steps) {
  $n = if ($s.note) { $s.note } else { 'ok' }
  $r = Post-Json ($base + '/kgb-requests/' + $id + '/' + $s.act) (Get-H $s.t) @{ note = $n }
  $s.act.ToUpper() + ': ' + $r.data.status
}
$d = Invoke-RestMethod -Uri ($base + '/kgb-requests/' + $id) -Headers (Get-H $tCam)
'TIMELINE events: ' + $d.data.timeline.Count
'totalDays (N/A for KGB)'
# monitoring: basis = KGB final terakhir, bukan draf; isOverdue selalu ada.
$mon = Invoke-RestMethod -Uri ($base + '/kgb-requests/monitoring') -Headers (Get-H $tKas)
'MONITORING: ' + $mon.meta.total + ' pegawai, dueSoon=' + $mon.meta.dueSoon + ', overdue=' + $mon.meta.overdue
$row = $mon.data | Where-Object { $_.employee.id -eq $empId } | Select-Object -First 1
if (-not $row) {
  'MONITORING FAIL: pegawai tidak ditemukan'
} else {
  'MONITORING pegawai: last=' + $row.lastKgb.id + ' next=' + $row.nextKgbDate + ' overdue=' + $row.isOverdue
  if ($row.lastKgb.id -ne $id) { 'MONITORING FAIL: lastKgb bukan KGB final terbaru' }
  if ($row.nextKgbDate -ne '2028-11-01') { 'MONITORING FAIL: nextKgbDate harus 2 tahun dari KGB final' }
  if ($row.isOverdue -ne $false) { 'MONITORING FAIL: isOverdue harus false' }
}
if (-not ($mon.data[0].PSObject.Properties.Name -contains 'isOverdue')) {
  'MONITORING FAIL: field isOverdue tidak ada'
}

# reminder: response harus konsisten dan menyertakan isOverdue.
$rem = Post-Json ($base + '/kgb-requests/reminders/generate') (Get-H $tKas) @{}
$remRows = @($rem.data)
'REMINDER: ' + $remRows.Count + ' baris'
if ($remRows.Count -gt 0 -and -not ($remRows[0].PSObject.Properties.Name -contains 'isOverdue')) {
  'REMINDER FAIL: field isOverdue tidak ada'
}

# notifikasi transisi KGB (submit..archive) harus terbentuk.
$notif = Invoke-RestMethod -Uri ($base + '/notifications?unread=true') -Headers (Get-H $tPeg)
$kgbNotif = @($notif.data) | Where-Object { $_.referenceType -eq 'kgb_request' -and $_.referenceId -eq $id }
'NOTIFIKASI KGB: ' + $kgbNotif.Count
if ($kgbNotif.Count -lt 1) { 'NOTIFIKASI FAIL: transisi KGB tidak mengirim notifikasi' }

try { Post-Json ($base + '/kgb-requests/' + $id + '/approve') (Get-H $tPeg) @{ note = 'x' } | Out-Null; 'NEG1 FAIL' } catch { 'NEG1 pegawai-approve: ' + (CodeOf $_) }
try { Post-Json ($base + '/kgb-requests/' + $id + '/archive') (Get-H $tKas) @{} | Out-Null; 'NEG2 FAIL' } catch { 'NEG2 double-archive: ' + (CodeOf $_) }
