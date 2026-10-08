$base = 'http://localhost:3000/api/v1'
function Get-Tok($u, $p) {
  $body = @{ username = $u; password = $p } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Uri ($base + '/auth/login') -ContentType 'application/json' -Body $body).data.accessToken
}
function Get-H($t) { @{ Authorization = ('Bearer ' + $t) } }
function Post-Json($uri, $headers, $obj) {
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($obj | ConvertTo-Json)
}
$tPeg = Get-Tok 'pegawai1' 'Pegawai123!'
$tVer = Get-Tok 'verifier1' 'Verifier123!'
$tSek = Get-Tok 'sekcam1' 'Sekcam123!'
$tCam = Get-Tok 'camat1' 'Camat123!'
$c = Post-Json ($base + '/leave-requests') (Get-H $tPeg) @{ leaveTypeCode = 'TAHUNAN'; startDate = '2026-10-20'; endDate = '2026-10-22'; reason = 'Acara keluarga penting' }
$id = $c.data.id
'CREATE: ' + $c.data.status + ' ' + $c.data.requestNumber
# berkas wajib: SK_TERAKHIR + 1 pendamping sebelum submit
'SK dummy' | Out-File -Encoding ascii tmp-sk.pdf
'Form cuti' | Out-File -Encoding ascii tmp-form.pdf
curl.exe -s -X POST -H ('Authorization: Bearer ' + $tPeg) -F 'file=@tmp-sk.pdf;type=application/pdf' -F 'docType=SK_TERAKHIR' ($base + '/leave-requests/' + $id + '/documents') | Out-Null
curl.exe -s -X POST -H ('Authorization: Bearer ' + $tPeg) -F 'file=@tmp-form.pdf;type=application/pdf' -F 'docType=FORM_CUTI' ($base + '/leave-requests/' + $id + '/documents') | Out-Null
Remove-Item tmp-sk.pdf, tmp-form.pdf
'DOCS: 2 berkas diupload'
$steps = @(
  @{ t = $tPeg; act = 'submit' },
  @{ t = $tVer; act = 'verify' },
  @{ t = $tSek; act = 'paraf' },
  @{ t = $tCam; act = 'approve' },
  @{ t = $tCam; act = 'sign' },
  @{ t = $tCam; act = 'complete' }
)
foreach ($s in $steps) {
  $r = Post-Json ($base + '/leave-requests/' + $id + '/' + $s.act) (Get-H $s.t) @{ note = 'ok' }
  $s.act.ToUpper() + ': ' + $r.data.status
}
$d = Invoke-RestMethod -Uri ($base + '/leave-requests/' + $id) -Headers (Get-H $tCam)
'TIMELINE events: ' + $d.data.timeline.Count
# negative test: pegawai coba approve (harus 403)
try {
  Post-Json ($base + '/leave-requests/' + $id + '/approve') (Get-H $tPeg) @{ note = 'x' } | Out-Null
  'NEGATIVE FAIL: pegawai bisa approve'
} catch {
  'NEGATIVE OK: ' + $_.Exception.Response.StatusCode.value__
}
