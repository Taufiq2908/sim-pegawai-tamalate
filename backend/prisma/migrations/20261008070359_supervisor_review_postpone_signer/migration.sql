-- AlterEnum
ALTER TYPE "RoleCode" ADD VALUE 'SUPERVISOR';

-- AlterTable
ALTER TABLE "leave_approvals" ADD COLUMN     "actor_name" VARCHAR(150),
ADD COLUMN     "actor_nip" VARCHAR(30);
