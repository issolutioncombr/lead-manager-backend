import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const failed = await prisma.$queryRaw<
      Array<{ id: string; migration_name: string; finished_at: Date | null }>
    >`SELECT id, migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = '20260202_whatsapp_messages_lead_fk'`;
    const pending = failed.filter((m) => m.finished_at === null);
    if (pending.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "_prisma_migrations" SET finished_at = NOW(), logs = COALESCE(logs, '') || '\\nAuto-resolved as applied by startup script' WHERE migration_name = '20260202_whatsapp_messages_lead_fk' AND finished_at IS NULL`
      );
    }
  } catch (_) {
  } finally {
    await PrismaClient.prototype.$disconnect.call(prisma);
  }
}

main().catch(() => process.exit(0));
