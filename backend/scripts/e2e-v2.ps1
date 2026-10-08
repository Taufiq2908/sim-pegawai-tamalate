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
$cam = Get-Login 'camat1' 'Camat123!'
$sek = Get-Login 'sekcam1' 'Sekcam123!'
$peg = Get-Login 'pegawai1' 'Pegawai123!'

# 1. passwordHash tidak boleh bocor di mana pun
$lv = Invoke-RestMethod -Uri ($base + '/leave-requests?page=1&limit=1') -Headers (Get-H $ver.accessToken)
$ld = Invoke-RestMethod -Uri ($base + '/leave-requests/' + $lv.data[0].id) -Headers (Get-H $ver.accessToken)
$lt = Invoke-RestMethod -Uri ($base + '/letters?page=1&limit=1') -Headers (Get-H $ver.accessToken)
$us = Invoke-RestMethod -Uri ($base + '/users?page=1&limit=5') -Headers (Get-H $ver.accessToken)
$em = Invoke-RestMethod -Uri ($base + '/employees?limit=5') -Headers (Get-H $ver.accessToken)
$blob = ($ld | ConvertTo-Json -Depth 8 -Compress) + ($lt | ConvertTo-Json -Depth 8 -Compress) + ($us | ConvertTo-Json -Depth 6 -Compress) + ($em | ConvertTo-Json -Depth 6 -Compress)
if ($blob -match 'passwordHash') { 'LEAK FAIL: passwordHash ditemukan' } else { 'Noleak OK: cuti+surat+users+employees bersih' }
'EMPLOYEES: ' + $em.meta.total + ' | USERS: ' + $us.meta.total
try { Invoke-RestMethod -Uri ($base + '/users') -Headers (Get-H $peg.accessToken) | Out-Null; 'U1 FAIL' } catch { 'U1 pegawai-users: ' + (CodeOf $_) }

# 2. problematic per sesi (pekan kosong -> 10 sesi), dibaca Kasubag
$p = Invoke-RestMethod -Uri ($base + '/attendances/problematic?weekStart=2026-09-28') -Headers (Get-H $kas.accessToken)
'SESI: ' + $p.data.Count + ' bermasalah, cth absence=' + $p.data[0].absenceCount + ' hari=' + $p.data[0].days.Count + ' d1=' + ($p.data[0].days[0] | ConvertTo-Json -Compress)

# 3. foto sesi
'foto' | Out-File -Encoding ascii tmp-apel.jpg
$today = ([DateTimeOffset]::UtcNow + [TimeSpan]::FromHours(8)).ToString('yyyy-MM-dd')
$ph = curl.exe -s -X POST -H ('Authorization: Bearer ' + $ver.accessToken) -F ('date=' + $today) -F 'session=PAGI' -F 'file=@tmp-apel.jpg;type=image/jpeg' ($base + '/attendances/session-photos')
Remove-Item tmp-apel.jpg
if ($ph -match 'photoUrl') { 'FOTO: ok' } else { 'FOTO: ' + $ph }
try { curl.exe -s -X POST -H ('Authorization: Bearer ' + $ver.accessToken) -F ('date=' + $today) -F 'session=PAGI' -F 'file=@NUL;type=image/jpeg' ($base + '/attendances/session-photos') | Out-Null; 'F2 note: empty-file path' } catch { 'F2: ' + (CodeOf $_) }
$phl = Invoke-RestMethod -Uri ($base + '/attendances/session-photos') -Headers (Get-H $ver.accessToken)
'FOTO LIST: ' + $phl.data.Count + ' foto'

# 4. summon + coaching (daftar dibaca Kasubag, aksi oleh staf)
$wl = Invoke-RestMethod -Uri ($base + '/attendances/warning-letters?limit=5') -Headers (Get-H $kas.accessToken)
$wid = $wl.data[0].id
try { Invoke-RestMethod -Method Patch -Uri ($base + '/attendances/warning-letters/' + $wid + '/coaching') -Headers (Get-H $ver.accessToken) -ContentType 'application/json' -Body (@{ result = 'x'*10; followUp = 'BKPSDM' } | ConvertTo-Json) | Out-Null; 'C0 FAIL' } catch { 'C0 coaching-tanpa-summon: ' + (CodeOf $_) }
$sm = Post-Json ($base + '/attendances/warning-letters/' + $wid + '/summon') (Get-H $ver.accessToken) @{ scheduledAt = '2026-10-09T02:00:00Z'; note = 'Ruang sekcam' }
'SUMMON: ' + $sm.data.summonScheduledAt
$co = Invoke-RestMethod -Method Patch -Uri ($base + '/attendances/warning-letters/' + $wid + '/coaching') -Headers (Get-H $ver.accessToken) -ContentType 'application/json' -Body (@{ result = 'Tidak ada perbaikan, diteruskan'; followUp = 'BKPSDM' } | ConvertTo-Json)
'COACHING: followUp=' + $co.data.coachingFollowUp
$bk = Invoke-RestMethod -Uri ($base + '/attendances/warning-letters?followUp=BKPSDM') -Headers (Get-H $kas.accessToken)
'BKPSDM filter: ' + $bk.meta.total

# 5. paraf sekcam -> disposisi (distributedAt terisi)
$L = Post-Json ($base + '/letters') (Get-H $ver.accessToken) @{ letterNumber = '800/300/TML/X/2026'; sender = 'Kel. Jongaya'; subject = 'Laporan kegiatan'; letterDate = '2026-10-07' }
$pf = Post-Json ($base + '/letters/' + $L.data.id + '/paraf') (Get-H $sek.accessToken) @{ note = 'Sudah diperiksa, teruskan' }
'PARAF: ' + $pf.data.status
try { Post-Json ($base + '/letters/' + $L.data.id + '/paraf') (Get-H $sek.accessToken) @{} | Out-Null; 'P2 FAIL' } catch { 'P2 paraf-ganda: ' + (CodeOf $_) }
$dp = Post-Json ($base + '/letters/' + $L.data.id + '/dispose') (Get-H $cam.accessToken) @{ toUserId = $sek.user.id; instruction = 'Tindaklanjuti laporan'; targetCode = 'SEKCAM' }
'DISTRIBUSI: ' + $dp.data.letter.status + ' at=' + $dp.data.letter.distributedAt.Substring(0, 10)
$sh = Invoke-RestMethod -Uri ($base + '/letters/' + $L.data.id + '/disposition-sheet') -Headers (Get-H $cam.accessToken)
'SHEET distribusi: ' + $sh.data.tanggalDistribusi.Substring(0, 10)
