-- SIMPEG-TAMALATE seed v1 — jalankan di Supabase SQL Editor SETELAH db/migration.sql
-- Idempotent (ON CONFLICT DO NOTHING). Password hash bcrypt dari kredensial demo.

-- ============ ORG UNIT ============
INSERT INTO organizational_units (id, code, name, type, is_active, created_at, updated_at)
VALUES ('478c859c-8354-49a5-8c75-626321ba500d','KEC-TAMALATE','Kecamatan Tamalate','KECAMATAN', true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ============ ROLES ============
INSERT INTO roles (id, code, name) VALUES
 ('ed1c93e0-5e17-4f8b-b9ac-6f69dbefd0f5','SUPER_ADMIN','SUPER_ADMIN'),
 ('476903d9-e99d-4422-b636-aa6715fae6cb','VERIFIER','VERIFIER'),
 ('ca58160c-cdf1-4a54-b928-829f6d10e138','LEADER','LEADER'),
 ('7ff86010-86a4-4209-a0a3-311532b1c6e0','EMPLOYEE','EMPLOYEE')
ON CONFLICT (id) DO NOTHING;

-- ============ PERMISSIONS ============
INSERT INTO permissions (id, code, resource, action) VALUES
 ('74f4d69a-3923-440c-91a2-0aedf6666cdc','auth.me','auth','me'),
 ('ee930ada-7546-4359-a590-f1992b3e6721','user.view','user','view'),
 ('75f9d1a2-e2d6-414f-9467-9a2fc65477b4','user.manage','user','manage'),
 ('817cc30b-3f2b-4828-8676-6121dbca8b65','employee.view','employee','view'),
 ('ad5a9005-f308-4ac9-aab2-d0f7138c3f13','employee.manage','employee','manage'),
 ('b9629f32-d783-463a-b6b4-f18e38debd89','master.view','master','view'),
 ('d4abb27b-a493-467c-b158-68439839d4f0','leave.view','leave','view'),
 ('9c22c9ca-3ebe-430a-8fc3-3ec05d2298be','leave.create','leave','create'),
 ('be0af445-e1f9-4a32-b2c9-5f31597e8f8a','leave.submit','leave','submit'),
 ('a506d522-0abd-47d2-af55-4446d383daf8','leave.verify','leave','verify'),
 ('76ec5231-2b3c-4679-b76f-4f59037a819b','leave.revise','leave','revise'),
 ('f87940cb-832b-431f-a500-0dfd32492caa','leave.paraf','leave','paraf'),
 ('895f8487-93bb-41aa-95b5-72d5d37eed6a','leave.approve','leave','approve'),
 ('b5a313da-116e-4716-93c4-25eb23cff95c','leave.reject','leave','reject'),
 ('e98cf681-3b5b-4a44-af69-9f3fd7b5a824','leave.sign','leave','sign'),
 ('49299489-4fec-4bc8-8506-014b5edc55ec','leave.document.upload','leave','document.upload')
ON CONFLICT (id) DO NOTHING;

-- ============ ROLE_PERMISSIONS ============
-- VERIFIER
INSERT INTO role_permissions (role_id, permission_id) VALUES
 ('476903d9-e99d-4422-b636-aa6715fae6cb','74f4d69a-3923-440c-91a2-0aedf6666cdc'),
 ('476903d9-e99d-4422-b636-aa6715fae6cb','817cc30b-3f2b-4828-8676-6121dbca8b65'),
 ('476903d9-e99d-4422-b636-aa6715fae6cb','d4abb27b-a493-467c-b158-68439839d4f0'),
 ('476903d9-e99d-4422-b636-aa6715fae6cb','a506d522-0abd-47d2-af55-4446d383daf8'),
 ('476903d9-e99d-4422-b636-aa6715fae6cb','76ec5231-2b3c-4679-b76f-4f59037a819b'),
 ('476903d9-e99d-4422-b636-aa6715fae6cb','49299489-4fec-4bc8-8506-014b5edc55ec'),
 ('476903d9-e99d-4422-b636-aa6715fae6cb','b5a313da-116e-4716-93c4-25eb23cff95c'),
-- LEADER
 ('ca58160c-cdf1-4a54-b928-829f6d10e138','74f4d69a-3923-440c-91a2-0aedf6666cdc'),
 ('ca58160c-cdf1-4a54-b928-829f6d10e138','817cc30b-3f2b-4828-8676-6121dbca8b65'),
 ('ca58160c-cdf1-4a54-b928-829f6d10e138','d4abb27b-a493-467c-b158-68439839d4f0'),
 ('ca58160c-cdf1-4a54-b928-829f6d10e138','f87940cb-832b-431f-a500-0dfd32492caa'),
 ('ca58160c-cdf1-4a54-b928-829f6d10e138','895f8487-93bb-41aa-95b5-72d5d37eed6a'),
 ('ca58160c-cdf1-4a54-b928-829f6d10e138','b5a313da-116e-4716-93c4-25eb23cff95c'),
 ('ca58160c-cdf1-4a54-b928-829f6d10e138','e98cf681-3b5b-4a44-af69-9f3fd7b5a824'),
-- EMPLOYEE
 ('7ff86010-86a4-4209-a0a3-311532b1c6e0','74f4d69a-3923-440c-91a2-0aedf6666cdc'),
 ('7ff86010-86a4-4209-a0a3-311532b1c6e0','d4abb27b-a493-467c-b158-68439839d4f0'),
 ('7ff86010-86a4-4209-a0a3-311532b1c6e0','9c22c9ca-3ebe-430a-8fc3-3ec05d2298be'),
 ('7ff86010-86a4-4209-a0a3-311532b1c6e0','be0af445-e1f9-4a32-b2c9-5f31597e8f8a'),
 ('7ff86010-86a4-4209-a0a3-311532b1c6e0','49299489-4fec-4bc8-8506-014b5edc55ec')
ON CONFLICT DO NOTHING;

-- SUPER_ADMIN = semua permission (eksplisit)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'ed1c93e0-5e17-4f8b-b9ac-6f69dbefd0f5', id FROM permissions
ON CONFLICT DO NOTHING;

-- ============ LEAVE TYPES ============
INSERT INTO leave_types (id, code, name, max_days, requires_document, is_active) VALUES
 ('a40b8d75-77fe-481d-ad54-b634c2427e04','TAHUNAN','Cuti Tahunan',12,false,true),
 ('d637ec8b-d188-4435-92ac-33bc70f4324d','SAKIT','Cuti Sakit',NULL,true,true),
 ('9f09255d-8d10-48cc-a27e-4e7b1551297b','MELAHIRKAN','Cuti Melahirkan',NULL,false,true),
 ('381efef8-c20c-48b5-a9c8-32ec4df7c4b3','ALASAN_PENTING','Cuti Alasan Penting',NULL,false,true)
ON CONFLICT (id) DO NOTHING;

-- ============ EMPLOYEES ============
INSERT INTO employees (id, employee_number, name, gender, employment_status, position, org_unit_id, is_active, created_at, updated_at) VALUES
 ('09d41941-aab1-4ed8-92da-a2ad2a6ca9c8','EMP-000','Super Admin','L','PNS','ADMIN','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now()),
 ('3ced41f4-e25b-4266-8a5e-c75b2bb72365','EMP-001','Verifier Satu','L','PNS','VERIFIKATOR','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now()),
 ('b0b23517-83f4-43e5-b3ab-727597febf6e','EMP-002','Sekcam Satu','L','PNS','SEKCAM','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now()),
 ('ce35747f-026b-44a0-9121-c49e300dddfb','EMP-003','Camat Satu','L','PNS','CAMAT','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now()),
 ('478aea25-75b3-4045-903d-563ef121ff72','EMP-004','Ahmad Pegawai','L','PNS','STAF','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now())
ON CONFLICT (id) DO NOTHING;

-- ============ USERS (password lihat daftar di bawah) ============
INSERT INTO users (id, username, password_hash, employee_id, role, position, org_unit_id, is_active, created_at, updated_at) VALUES
 ('f99e3378-6e6b-4e83-a6fa-e61d70edae2b','superadmin','$2a$10$FOJQ0PZOr3CJKtaiLjU8C.8SCWeu4Xnnb63Dqf8eB4Lsa7jfygQ1u','09d41941-aab1-4ed8-92da-a2ad2a6ca9c8','SUPER_ADMIN','ADMIN','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now()),
 ('f844e348-e2c9-4f74-8176-5adf06fbd74d','verifier1','$2a$10$snLPhHX6PHXzYYUVUBX/RutzuByRCMvHAoBDhZiwYbMcTSNgZnvzC','3ced41f4-e25b-4266-8a5e-c75b2bb72365','VERIFIER','VERIFIKATOR','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now()),
 ('caac3f47-ba59-4252-8788-a6d46da213cc','sekcam1','$2a$10$2mfF81D12PmE5J7pzoGwj.ntOFn/olaExFBFK0ApuEgReGvzxXKWO','b0b23517-83f4-43e5-b3ab-727597febf6e','LEADER','SEKCAM','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now()),
 ('371060fc-ea4a-4817-b7ea-6d88d0f87300','camat1','$2a$10$JEXoYkFB9KScJ0Ofkys2Mu7v4R0U5Qp4CYHCIIfmvAHBIYzTxU8b2','ce35747f-026b-44a0-9121-c49e300dddfb','LEADER','CAMAT','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now()),
 ('a5f60e3f-d64f-4ac6-abfa-e71617abed10','pegawai1','$2a$10$htljVVpebWMl6216oKNaT.XZW7eT07Z0nYbxUtSmQSW.DGAsacMdm','478aea25-75b3-4045-903d-563ef121ff72','EMPLOYEE','STAF','478c859c-8354-49a5-8c75-626321ba500d',true,now(),now())
ON CONFLICT (id) DO NOTHING;

-- ============ OVERRIDES (bedakan Sekcam vs Camat) ============
-- sekcam1: DENY approve + sign (hanya paraf)
INSERT INTO user_permission_overrides (user_id, permission_id, effect, reason)
VALUES
 ('caac3f47-ba59-4252-8788-a6d46da213cc','895f8487-93bb-41aa-95b5-72d5d37eed6a','DENY','seed'),
 ('caac3f47-ba59-4252-8788-a6d46da213cc','e98cf681-3b5b-4a44-af69-9f3fd7b5a824','DENY','seed')
ON CONFLICT (user_id, permission_id) DO NOTHING;

-- camat1: DENY verify (tidak verifikasi berkas), pastikan GRANT approve+sign
INSERT INTO user_permission_overrides (user_id, permission_id, effect, reason)
VALUES
 ('371060fc-ea4a-4817-b7ea-6d88d0f87300','a506d522-0abd-47d2-af55-4446d383daf8','DENY','seed'),
 ('371060fc-ea4a-4817-b7ea-6d88d0f87300','895f8487-93bb-41aa-95b5-72d5d37eed6a','GRANT','seed'),
 ('371060fc-ea4a-4817-b7ea-6d88d0f87300','e98cf681-3b5b-4a44-af69-9f3fd7b5a824','GRANT','seed')
ON CONFLICT (user_id, permission_id) DO NOTHING;

-- Kredensial demo: superadmin/Admin123! verifier1/Verifier123! sekcam1/Sekcam123! camat1/Camat123! pegawai1/Pegawai123!
