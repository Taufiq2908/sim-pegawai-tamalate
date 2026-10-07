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
  @{ t = $tVer; act = 'verify' },
  @{ t = $tSek; act = 'paraf' },
  @{ t = $tCam; act = 'approve' },
  @{ t = $tCam; act = 'complete' }
)
foreach ($s in $steps) {
  $r = Post-Json ($base + '/kgb-requests/' + $id + '/' + $s.act) (Get-H $s.t) @{ note = 'ok' }
  $s.act.ToUpper() + ': ' + $r.data.status
}
$d = Invoke-RestMethod -Uri ($base + '/kgb-requests/' + $id) -Headers (Get-H $tCam)
'TIMELINE events: ' + $d.data.timeline.Count
try { Post-Json ($base + '/kgb-requests/' + $id + '/approve') (Get-H $tPeg) @{ note = 'x' } | Out-Null; 'NEG1 FAIL' } catch { 'NEG1 pegawai-approve: ' + (CodeOf $_) }
try { Post-Json ($base + '/kgb-requests/' + $id + '/complete') (Get-H $tCam) @{} | Out-Null; 'NEG2 FAIL' } catch { 'NEG2 double-complete: ' + (CodeOf $_) }
