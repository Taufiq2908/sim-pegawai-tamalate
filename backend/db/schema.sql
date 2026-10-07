-- SIMPEG-TAMALATE schema v1: Foundation + Cuti (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ MASTER / FOUNDATION ============
CREATE TABLE organizational_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('KECAMATAN','KELURAHAN','SEKSI','SUBBAG')),
  parent_id UUID REFERENCES organizational_units(id) ON DELETE RESTRICT,
  leader_user_id UUID, -- di-ALTER setelah tabel users ada (circular)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON organizational_units(parent_id);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL CHECK (code IN ('SUPER_ADMIN','VERIFIER','LEADER','EMPLOYEE')),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(60) UNIQUE NOT NULL,
  resource VARCHAR(30) NOT NULL,
  action VARCHAR(30) NOT NULL,
  description TEXT
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip VARCHAR(30) UNIQUE,
  employee_number VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  gender CHAR(1) NOT NULL CHECK (gender IN ('L','P')),
  birth_place VARCHAR(100),
  birth_date DATE,
  employment_status VARCHAR(20) NOT NULL CHECK (employment_status IN ('PNS','PPPK','PPPK_PARUH_WAKTU','HONORER')),
  position VARCHAR(50) NOT NULL,
  rank VARCHAR(20),
  org_unit_id UUID NOT NULL REFERENCES organizational_units(id) ON DELETE RESTRICT,
  phone VARCHAR(20),
  address TEXT,
  join_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON employees(org_unit_id);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  employee_id UUID UNIQUE REFERENCES employees(id) ON DELETE RESTRICT,
  role VARCHAR(20) NOT NULL CHECK (role IN ('SUPER_ADMIN','VERIFIER','LEADER','EMPLOYEE')),
  position VARCHAR(50),
  org_unit_id UUID REFERENCES organizational_units(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON users(role);

ALTER TABLE organizational_units
  ADD CONSTRAINT fk_org_leader FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  effect VARCHAR(10) NOT NULL CHECK (effect IN ('GRANT','DENY')),
  reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_id)
);

-- ============ CUTI ============
CREATE TABLE leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  max_days INT,
  requires_document BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(40) UNIQUE NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  total_days INT NOT NULL CHECK (total_days > 0),
  reason TEXT NOT NULL,
  address_during_leave VARCHAR(255),
  contact_during_leave VARCHAR(30),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','REVISION','VERIFIED','PARAF','APPROVED','SIGNED','COMPLETED','REJECTED')),
  submitted_at TIMESTAMPTZ,
  current_holder_role VARCHAR(20),
  rejection_reason TEXT,
  revision_note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON leave_requests(employee_id, status);
CREATE INDEX ON leave_requests(status);

CREATE TABLE leave_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  doc_type VARCHAR(50) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5000000),
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leave_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role VARCHAR(20) NOT NULL,
  actor_position VARCHAR(50),
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  action VARCHAR(20) NOT NULL
    CHECK (action IN ('CREATE','SUBMIT','VERIFY','REVISE','PARAF','APPROVE','REJECT','SIGN','COMPLETE')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON leave_approvals(leave_request_id);
