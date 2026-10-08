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
$tCam = Get-Tok 'camat1' 'Camat123!'
$tVer = Get-Tok 'verifier1' 'Verifier123!'
$tKas = Get-Tok 'kasubag1' 'Kasubag123!'
$tAdm = Get-Tok 'superadmin' 'Admin123!'
$tPeg = Get-Tok 'pegawai1' 'Pegawai123!'

# 1. submit tanpa berkas -> 422
$c0 = Post-Json ($base + '/leave-requests') (Get-H $tPeg) @{ leaveTypeCode = 'TAHUNAN'; startDate = '2026-11-10'; endDate = '2026-11-11'; reason = 'Tanpa berkas' }
try { Post-Json ($base + '/leave-requests/' + $c0.data.id + '/submit') (Get-H $tPeg) @{} | Out-Null; 'G1 FAIL' } catch { 'G1 submit-tanpa-berkas: ' + (CodeOf $_) }

# 2. alur cuti Camat: create -> berkas -> submit -> verify -> forward(Sekda) -> complete(Super Admin)
$c = Post-Json ($base + '/leave-requests') (Get-H $tCam) @{ leaveTypeCode = 'TAHUNAN'; startDate = '2026-11-20'; endDate = '2026-11-22'; reason = 'Cuti camat' }
$id = $c.data.id
'CREATE camat: ' + $c.data.requestNumber
'SK camat' | Out-File -Encoding ascii tmp-skc.pdf
'Cuti sebelumnya' | Out-File -Encoding ascii tmp-prev.pdf
curl.exe -s -X POST -H ('Authorization: Bearer ' + $tCam) -F 'file=@tmp-skc.pdf;type=application/pdf' -F 'docType=SK_TERAKHIR' ($base + '/leave-requests/' + $id + '/documents') | Out-Null
curl.exe -s -X POST -H ('Authorization: Bearer ' + $tCam) -F 'file=@tmp-prev.pdf;type=application/pdf' -F 'docType=SURAT_CUTI_SEBELUMNYA' ($base + '/leave-requests/' + $id + '/documents') | Out-Null
Remove-Item tmp-skc.pdf, tmp-prev.pdf
Post-Json ($base + '/leave-requests/' + $id + '/submit') (Get-H $tCam) @{} | Out-Null
'CAMAT SUBMIT: SUBMITTED'
Post-Json ($base + '/leave-requests/' + $id + '/verify') (Get-H $tKas) @{ note = 'Berkas lengkap' } | Out-Null
'CAMAT VERIFY: VERIFIED'
$f = Post-Json ($base + '/leave-requests/' + $id + '/forward') (Get-H $tKas) @{ note = 'Diteruskan ke Sekda via BKD 21 Nov 2026' }
'CAMAT FORWARD: ' + $f.data.status + ' holder=' + $f.data.currentHolderRole
$done = Post-Json ($base + '/leave-requests/' + $id + '/complete') (Get-H $tAdm) @{ note = 'Persetujuan Sekda diterima' }
'CAMAT COMPLETE: ' + $done.data.status

# 3. negatif: camat tidak boleh memproses sendiri + forward khusus camat
try { Post-Json ($base + '/leave-requests/' + $id + '/complete') (Get-H $tCam) @{} | Out-Null; 'N1 FAIL' } catch { 'N1 camat-proses-sendiri: ' + (CodeOf $_) }
'SK pg' | Out-File -Encoding ascii tmp-skg.pdf
'Form pg' | Out-File -Encoding ascii tmp-fmg.pdf
curl.exe -s -X POST -H ('Authorization: Bearer ' + $tPeg) -F 'file=@tmp-skg.pdf;type=application/pdf' -F 'docType=SK_TERAKHIR' ($base + '/leave-requests/' + $c0.data.id + '/documents') | Out-Null
curl.exe -s -X POST -H ('Authorization: Bearer ' + $tPeg) -F 'file=@tmp-fmg.pdf;type=application/pdf' -F 'docType=FORM_CUTI' ($base + '/leave-requests/' + $c0.data.id + '/documents') | Out-Null
Remove-Item tmp-skg.pdf, tmp-fmg.pdf
Post-Json ($base + '/leave-requests/' + $c0.data.id + '/submit') (Get-H $tPeg) @{} | Out-Null
Post-Json ($base + '/leave-requests/' + $c0.data.id + '/verify') (Get-H $tKas) @{ note = 'ok' } | Out-Null
try { Post-Json ($base + '/leave-requests/' + $c0.data.id + '/forward') (Get-H $tKas) @{ note = 'x'*10 } | Out-Null; 'N2 FAIL' } catch { 'N2 forward-non-camat: ' + (CodeOf $_) }
