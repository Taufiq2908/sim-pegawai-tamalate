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

# 1. master klasifikasi + 9 tujuan
$cls = Invoke-RestMethod -Uri ($base + '/letters/classifications') -Headers (Get-H $ver.accessToken)
'KLASIFIKASI: ' + $cls.data.Count + ' kode'
$tg = Invoke-RestMethod -Uri ($base + '/letters/disposition-targets') -Headers (Get-H $cam.accessToken)
'TARGET: ' + $tg.data.Count + ' tujuan, pertama=' + $tg.data[0].code

# 2. surat masuk dengan atribut baru
$L = Post-Json ($base + '/letters') (Get-H $ver.accessToken) @{
  letterNumber = '800/200/TML/X/2026'; sender = 'Dinas PU Kota Makassar'
  subject = 'Koordinasi perbaikan drainase'; letterDate = '2026-10-05'
  secrecy = 'R'; summary = 'Minta jadwal survei bersama'; addressedTo = 'Camat Tamalate'
  pic = 'Kasubag Umum'; remarks = 'Segera'; classificationCode = '000.5.3.1'
}
$id = $L.data.id
'INCOMING: ' + $L.data.agendaNumber + ' sifat=' + $L.data.secrecy + ' klas=' + $L.data.classification.code
$rb = Invoke-RestMethod -Uri ($base + '/letters/register-book') -Headers (Get-H $ver.accessToken)
'BUKU AGENDA: ' + $rb.meta.total + ' baris, cth=' + ($rb.data[0] | ConvertTo-Json -Compress)

# 3. disposisi + notifikasi
$d = Post-Json ($base + '/letters/' + $id + '/dispose') (Get-H $cam.accessToken) @{ toUserId = $sek.user.id; instruction = 'Tindak lanjuti dan laporkan'; targetCode = 'SEKCAM' }
'DISPOSE: target=' + $d.data.disposition.targetName
$un = Invoke-RestMethod -Uri ($base + '/notifications/unread-count') -Headers (Get-H $sek.accessToken)
'NOTIF sekcam unread: ' + $un.data.unread
$nl = Invoke-RestMethod -Uri ($base + '/notifications') -Headers (Get-H $sek.accessToken)
$r = Invoke-RestMethod -Method Patch -Uri ($base + '/notifications/' + $nl.data[0].id + '/read') -Headers (Get-H $sek.accessToken)
'NOTIF dibaca: ' + $r.data.isRead
$sh = Invoke-RestMethod -Uri ($base + '/letters/' + $id + '/disposition-sheet') -Headers (Get-H $cam.accessToken)
'LEMBAR DISPOSISI: agenda=' + $sh.data.nomorAgenda + ' sifat=' + $sh.data.sifatSurat + ' tujuan=' + $sh.data.disposisi[0].kepada

# 4. ekspedisi
$e = Post-Json ($base + '/letters/' + $id + '/expedition') (Get-H $ver.accessToken) @{ receiverName = 'Staf Sekcam'; signatureName = 'Staf Sekcam' }
'EKSPEDISI: ' + $e.data.regNumber
$eb = Invoke-RestMethod -Uri ($base + '/letters/expedition-book') -Headers (Get-H $ver.accessToken)
'BUKU EKSPEDISI: ' + $eb.meta.total + ' baris'

# 5. surat keluar normal
$o1 = Post-Json ($base + '/outgoing-letters') (Get-H $ver.accessToken) @{
  classificationCode = '000.5.3.1'; subject = 'Undangan rapat koordinasi'; recipient = 'Para Lurah'; signerName = 'Camat Tamalate'
}
'OUT NORMAL: ' + $o1.data.letterNumber + ' status=' + $o1.data.status
# 6. reservasi (backdate) -> issue, nomor tetap
$past = ([DateTimeOffset]::UtcNow + [TimeSpan]::FromHours(8)).AddDays(-2).ToString('yyyy-MM-dd')
$rv = Post-Json ($base + '/outgoing-letters/reserve') (Get-H $ver.accessToken) @{ classificationCode = '000.1.5'; letterDate = $past; reason = 'Surat undangan mendesak sudah dikirim fisik'; signerName = 'Camat Tamalate' }
'RESERVE: ' + $rv.data.letterNumber + ' status=' + $rv.data.status
$is = Post-Json ($base + '/outgoing-letters/' + $rv.data.id + '/issue') (Get-H $ver.accessToken) @{ recipient = 'Para Kasi'; subject = 'Undangan rapat mendesak' }
'ISSUE: nomor=' + $is.data.letterNumber + ' tglSurat=' + $is.data.letterDate.Substring(0,10) + ' dicatat=' + $is.data.createdAt.Substring(0,10)
# 7. cancel -> nomor tidak dipakai ulang
$rv2 = Post-Json ($base + '/outgoing-letters/reserve') (Get-H $ver.accessToken) @{ classificationCode = '000.1.5'; letterDate = $past; reason = 'Cadangan yang ternyata batal'; }
$c = Post-Json ($base + '/outgoing-letters/' + $rv2.data.id + '/cancel') (Get-H $ver.accessToken) @{ reason = 'Surat batal diterbitkan' }
'CANCEL: seq=' + $c.data.sequenceNumber + ' status=' + $c.data.status
$o2 = Post-Json ($base + '/outgoing-letters') (Get-H $ver.accessToken) @{ classificationCode = '000.1.5'; subject = 'Surat berikutnya'; recipient = 'Arsip' }
'NEXT seq=' + $o2.data.sequenceNumber + ' (harus lompat nomor batal)'
$ob = Invoke-RestMethod -Uri ($base + '/outgoing-letters/register-book?year=2026') -Headers (Get-H $ver.accessToken)
'BUKU KELUAR: ' + $ob.meta.total + ' baris'

# 8. negatif
try { Post-Json ($base + '/outgoing-letters/reserve') (Get-H $ver.accessToken) @{ classificationCode = '000.1.5'; letterDate = $past } | Out-Null; 'N1 FAIL' } catch { 'N1 tanpa-alasan: ' + (CodeOf $_) }
try { Post-Json ($base + '/outgoing-letters') (Get-H $peg.accessToken) @{ classificationCode = '000.1.5'; subject = 'x'*10; recipient = 'y' } | Out-Null; 'N2 FAIL' } catch { 'N2 pegawai-buat: ' + (CodeOf $_) }
try { Post-Json ($base + '/outgoing-letters/' + $o1.data.id + '/issue') (Get-H $ver.accessToken) @{ recipient = 'z' } | Out-Null; 'N3 FAIL' } catch { 'N3 issue-issued: ' + (CodeOf $_) }
try { Post-Json ($base + '/outgoing-letters') (Get-H $ver.accessToken) @{ classificationCode = '000.1.5'; subject = 'x'*10; recipient = 'y'; letterDate = '2099-01-01' } | Out-Null; 'N4 FAIL' } catch { 'N4 masa-depan: ' + (CodeOf $_) }
