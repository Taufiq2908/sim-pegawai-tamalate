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
function New-Docs($t, $id, $types) {
  foreach ($dt in $types) {
    $f = 'tmp-' + $dt + '.pdf'
    $dt | Out-File -Encoding ascii $f
    curl.exe -s -X POST -H ('Authorization: Bearer ' + $t) -F ('file=@' + $f + ';type=application/pdf') -F ('docType=' + $dt) ($base + '/leave-requests/' + $id + '/documents') | Out-Null
    Remove-Item $f
  }
}
$tPeg = Get-Tok 'pegawai1' 'Pegawai123!'
$tVer = Get-Tok 'verifier1' 'Verifier123!'
$tKas = Get-Tok 'kasubag1' 'Kasubag123!'
$tKasi = Get-Tok 'kasi1' 'Kasi123!'
$tSek = Get-Tok 'sekcam1' 'Sekcam123!'
$tCam = Get-Tok 'camat1' 'Camat123!'

# --- 1. alur normal: submit -> review(kasi) -> verify(kasubag) -> paraf -> approve -> answer -> sign -> ekor BKPSDM -> arsip
$c = Post-Json ($base + '/leave-requests') (Get-H $tPeg) @{ leaveTypeCode = 'TAHUNAN'; startDate = '2026-10-20'; endDate = '2026-10-22'; reason = 'Acara keluarga penting' }
$id = $c.data.id
'CREATE: ' + $c.data.status + ' ' + $c.data.requestNumber
New-Docs $tPeg $id @('SK_TERAKHIR', 'FORM_CUTI')
Post-Json ($base + '/leave-requests/' + $id + '/submit') (Get-H $tPeg) @{} | Out-Null
'SUBMIT: SUBMITTED'
try { Post-Json ($base + '/leave-requests/' + $id + '/review') (Get-H $tKas) @{ note = 'x' } | Out-Null; 'S1 FAIL' } catch { 'S1 atasan-bukan-langsung: ' + (CodeOf $_) }
try { Post-Json ($base + '/leave-requests/' + $id + '/verify') (Get-H $tKas) @{ note = 'x' } | Out-Null; 'S2 FAIL' } catch { 'S2 verify-sebelum-review: ' + (CodeOf $_) }
$r = Post-Json ($base + '/leave-requests/' + $id + '/review') (Get-H $tKasi) @{ note = 'Pertimbangan: disetujui' }
'REVIEW: ' + $r.data.status
Post-Json ($base + '/leave-requests/' + $id + '/verify') (Get-H $tKas) @{ note = 'Berkas lengkap' } | Out-Null
'VERIFY: VERIFIED'
Post-Json ($base + '/leave-requests/' + $id + '/paraf') (Get-H $tSek) @{ note = 'ok' } | Out-Null
'PARAF: PARAF'
Post-Json ($base + '/leave-requests/' + $id + '/approve') (Get-H $tCam) @{ note = 'Setuju' } | Out-Null
'APPROVE: APPROVED'
Post-Json ($base + '/leave-requests/' + $id + '/register') (Get-H $tVer) @{ note = 'ok' } | Out-Null
'REGISTER: REGISTERED'
Post-Json ($base + '/leave-requests/' + $id + '/tobkpsdm') (Get-H $tVer) @{ note = 'ok' } | Out-Null
'TOBKPSDM: SUBMITTED_BKPSDMD'
try { Post-Json ($base + '/leave-requests/' + $id + '/receiveresult') (Get-H $tVer) @{ note = 'x' } | Out-Null; 'S3 FAIL' } catch { 'S3 result-tanpa-jawaban: ' + (CodeOf $_) }
'jawaban' | Out-File -Encoding ascii tmp-jawab.pdf
$ans = curl.exe -s -X POST -H ('Authorization: Bearer ' + $tVer) -F 'file=@tmp-jawab.pdf;type=application/pdf' ($base + '/leave-requests/' + $id + '/answer-letter')
Remove-Item tmp-jawab.pdf
'ANSWER: ' + (($ans | ConvertFrom-Json).data.docType)
Post-Json ($base + '/leave-requests/' + $id + '/receiveresult') (Get-H $tVer) @{ note = 'Hasil diterima & diserahkan' } | Out-Null
'RECEIVERESULT: COMPLETED'
Post-Json ($base + '/leave-requests/' + $id + '/archive') (Get-H $tVer) @{} | Out-Null
'ARCHIVE: ARCHIVED'
$d = Invoke-RestMethod -Uri ($base + '/leave-requests/' + $id) -Headers (Get-H $tCam)
'TIMELINE events: ' + $d.data.timeline.Count + ' signer0=' + $d.data.timeline[1].actorName + '/' + $d.data.timeline[1].actorNip
'SUPERVISOR direct: ' + $d.data.supervisor.direct.name + ' note=' + $d.data.supervisor.note

# --- 2. B6/B8: riwayat + saldo + notifikasi
$me = (Invoke-RestMethod -Uri ($base + '/auth/me') -Headers (Get-H $tPeg)).data
$eid = $me.employee.id
$h = Invoke-RestMethod -Uri ($base + '/employees/' + $eid + '/leave-history?year=2026') -Headers (Get-H $tPeg)
'HISTORY: ' + $h.data.Count + ' baris'
$b = Invoke-RestMethod -Uri ($base + '/employees/' + $eid + '/leave-balance?year=2026') -Headers (Get-H $tPeg)
'BALANCE: hak=' + $b.data.entitlement + ' pakai=' + $b.data.used + ' sisa=' + $b.data.remaining
$n = Invoke-RestMethod -Uri ($base + '/notifications?unread=true') -Headers (Get-H $tPeg)
'NOTIF pegawai unread: ' + $n.data.Count

# --- 3. postpone + ajukan ulang
$c2 = Post-Json ($base + '/leave-requests') (Get-H $tPeg) @{ leaveTypeCode = 'TAHUNAN'; startDate = '2026-11-05'; endDate = '2026-11-06'; reason = 'Uji tunda' }
$id2 = $c2.data.id
New-Docs $tPeg $id2 @('SK_TERAKHIR', 'FORM_CUTI')
Post-Json ($base + '/leave-requests/' + $id2 + '/submit') (Get-H $tPeg) @{} | Out-Null
Post-Json ($base + '/leave-requests/' + $id2 + '/postpone') (Get-H $tKasi) @{ note = 'Tunda: beban kerja' } | Out-Null
'POSTPONE: POSTPONED'
Post-Json ($base + '/leave-requests/' + $id2 + '/submit') (Get-H $tPeg) @{} | Out-Null
'RESUBMIT: SUBMITTED'

# --- 4. SAKIT wajib surat dokter + DELETE draft
$c3 = Post-Json ($base + '/leave-requests') (Get-H $tPeg) @{ leaveTypeCode = 'SAKIT'; startDate = '2026-11-10'; endDate = '2026-11-11'; reason = 'Demam berdarah' }
$id3 = $c3.data.id
New-Docs $tPeg $id3 @('SK_TERAKHIR', 'FORM_CUTI')
try { Post-Json ($base + '/leave-requests/' + $id3 + '/submit') (Get-H $tPeg) @{} | Out-Null; 'S4 FAIL' } catch { 'S4 sakit-tanpa-dokter: ' + (CodeOf $_) }
$del = Invoke-RestMethod -Method Delete -Uri ($base + '/leave-requests/' + $id3) -Headers (Get-H $tPeg)
'DELETE draft: ' + $del.message
try { Invoke-RestMethod -Method Delete -Uri ($base + '/leave-requests/' + $id) -Headers (Get-H $tPeg) | Out-Null; 'S5 FAIL' } catch { 'S5 hapus-arsip: ' + (CodeOf $_) }

# --- 5. negatif: pegawai coba approve (harus 403)
try {
  Post-Json ($base + '/leave-requests/' + $id2 + '/approve') (Get-H $tPeg) @{ note = 'x' } | Out-Null
  'NEGATIVE FAIL: pegawai bisa approve'
} catch {
  'NEGATIVE OK: ' + $_.Exception.Response.StatusCode.value__
}

# --- 6. pengecualian: Sekcam (tanpa review+paraf) & kelurahan (tanpa review)
$tPeg2 = Get-Tok 'pegawai2' 'Pegawai123!'
$cs = Post-Json ($base + '/leave-requests') (Get-H $tSek) @{ leaveTypeCode = 'TAHUNAN'; startDate = '2026-12-01'; endDate = '2026-12-02'; reason = 'Cuti sekcam' }
$ids = $cs.data.id
New-Docs $tSek $ids @('SK_TERAKHIR', 'FORM_CUTI')
Post-Json ($base + '/leave-requests/' + $ids + '/submit') (Get-H $tSek) @{} | Out-Null
try { Post-Json ($base + '/leave-requests/' + $ids + '/review') (Get-H $tKasi) @{ note = 'x' } | Out-Null; 'X1 FAIL' } catch { 'X1 review-sekcam: ' + (CodeOf $_) }
Post-Json ($base + '/leave-requests/' + $ids + '/verify') (Get-H $tKas) @{ note = 'ok' } | Out-Null
'X2 sekcam-verify-langsung: VERIFIED'
Post-Json ($base + '/leave-requests/' + $ids + '/approve') (Get-H $tCam) @{ note = 'Setuju' } | Out-Null
'X3 sekcam-approve-tanpa-paraf: APPROVED'
$ck = Post-Json ($base + '/leave-requests') (Get-H $tPeg2) @{ leaveTypeCode = 'TAHUNAN'; startDate = '2026-12-03'; endDate = '2026-12-04'; reason = 'Cuti kelurahan' }
$idk = $ck.data.id
New-Docs $tPeg2 $idk @('SK_TERAKHIR', 'FORM_CUTI')
Post-Json ($base + '/leave-requests/' + $idk + '/submit') (Get-H $tPeg2) @{} | Out-Null
Post-Json ($base + '/leave-requests/' + $idk + '/verify') (Get-H $tKas) @{ note = 'ok' } | Out-Null
'X4 kelurahan-verify-langsung: VERIFIED'
$sv = Invoke-RestMethod -Uri ($base + '/employees/' + $me.employee.id + '/supervisor') -Headers (Get-H $tPeg)
'X5 supervisor-pegawai: direct=' + $sv.data.direct.name + ' rantai=' + $sv.data.chain.Count
