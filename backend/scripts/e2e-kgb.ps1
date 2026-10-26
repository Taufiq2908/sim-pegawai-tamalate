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
'CREATE: ' + $c.data.status + ' ' + $c.data.requestNumber
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
# monitoring
$mon = Invoke-RestMethod -Uri ($base + '/kgb-requests/monitoring') -Headers (Get-H $tKas)
'MONITORING: ' + $mon.meta.total + ' pegawai'
try { Post-Json ($base + '/kgb-requests/' + $id + '/approve') (Get-H $tPeg) @{ note = 'x' } | Out-Null; 'NEG1 FAIL' } catch { 'NEG1 pegawai-approve: ' + (CodeOf $_) }
try { Post-Json ($base + '/kgb-requests/' + $id + '/archive') (Get-H $tKas) @{} | Out-Null; 'NEG2 FAIL' } catch { 'NEG2 double-archive: ' + (CodeOf $_) }
