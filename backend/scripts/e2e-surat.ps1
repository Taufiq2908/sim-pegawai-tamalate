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
$cam = Get-Login 'camat1' 'Camat123!'
$sek = Get-Login 'sekcam1' 'Sekcam123!'
$peg = Get-Login 'pegawai1' 'Pegawai123!'
'PERMS camat: ' + ($cam.user.permissions -join ',')

# 1. catat surat
$L = Post-Json ($base + '/letters') (Get-H $ver.accessToken) @{
  letterNumber = '800/123/TML/X/2026'; sender = 'Kelurahan Mannuruki'
  subject = 'Permohonan perbaikan drainase Jl. Poros'; letterDate = '2026-10-06'; priority = 'SEGERA'
}
$id = $L.data.id
'CREATE: ' + $L.data.status + ' ' + $L.data.agendaNumber
# 2. upload lampiran via curl (multipart + mime eksplisit)
'%PDF-1.4 test' | Out-File -Encoding ascii tmp-surat.pdf
$up = curl.exe -s -X POST -H ('Authorization: Bearer ' + $ver.accessToken) -F 'file=@tmp-surat.pdf;type=application/pdf' ($base + '/letters/' + $id + '/documents') | ConvertFrom-Json
'UPLOAD: ' + $up.data.originalName
Remove-Item tmp-surat.pdf
# 3. camat disposisi ke sekcam, sekcam tindak lanjut + teruskan ke pegawai, pegawai tindak lanjut
$d1 = Post-Json ($base + '/letters/' + $id + '/dispose') (Get-H $cam.accessToken) @{ toUserId = $sek.user.id; instruction = 'Pelajari dan tindak lanjuti' }
'DISPOSE1: ' + $d1.data.letter.status
$f1 = Post-Json ($base + '/letters/dispositions/' + $d1.data.disposition.id + '/followup') (Get-H $sek.accessToken) @{ note = 'Siap, diteruskan ke staf' }
'FOLLOWUP1: ' + $f1.data.status
$d2 = Post-Json ($base + '/letters/' + $id + '/dispose') (Get-H $sek.accessToken) @{ toUserId = $peg.user.id; instruction = 'Survei lokasi dan laporkan' }
'DISPOSE2: ' + $d2.data.letter.status
$f2 = Post-Json ($base + '/letters/dispositions/' + $d2.data.disposition.id + '/followup') (Get-H $peg.accessToken) @{ note = 'Sudah survei, drainase tersumbat' }
'FOLLOWUP2: ' + $f2.data.status
# 4. complete + arsip
$ok = Post-Json ($base + '/letters/' + $id + '/complete') (Get-H $cam.accessToken) @{ note = 'Diteruskan ke dinas PU' }
'COMPLETE: ' + $ok.data.status
$ar = Post-Json ($base + '/letters/' + $id + '/archive') (Get-H $ver.accessToken) @{}
'ARCHIVE: ' + $ar.data.status
# 5. complete tertahan bila masih ada PENDING
$L2 = Post-Json ($base + '/letters') (Get-H $ver.accessToken) @{
  letterNumber = '800/124/TML/X/2026'; sender = 'Kelurahan Barombong'
  subject = 'Undangan musyawarah warga'; letterDate = '2026-10-07'
}
$id2 = $L2.data.id
Post-Json ($base + '/letters/' + $id2 + '/dispose') (Get-H $cam.accessToken) @{ toUserId = $sek.user.id; instruction = 'Hadiri mewakili camat' } | Out-Null
try { Post-Json ($base + '/letters/' + $id2 + '/complete') (Get-H $cam.accessToken) @{} | Out-Null; 'GUARD FAIL' } catch { 'GUARD pending-block: ' + (CodeOf $_) }
# 6. negatif: pegawai disposisi (403), disposisi ke arsip (409), pegawai intip surat orang lain
try { Post-Json ($base + '/letters/' + $id + '/dispose') (Get-H $peg.accessToken) @{ toUserId = $sek.user.id; instruction = 'x'*10 } | Out-Null; 'NEG1 FAIL' } catch { 'NEG1 pegawai-dispose: ' + (CodeOf $_) }
try { Post-Json ($base + '/letters/' + $id + '/dispose') (Get-H $cam.accessToken) @{ toUserId = $sek.user.id; instruction = 'x'*10 } | Out-Null; 'NEG2 FAIL' } catch { 'NEG2 dispose-arsip: ' + (CodeOf $_) }
try { Invoke-RestMethod -Uri ($base + '/letters/' + $id2) -Headers (Get-H $peg.accessToken) | Out-Null; 'NEG3 FAIL: intip lolos' } catch { 'NEG3 intip-surat: ' + (CodeOf $_) }
