import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const transportA = await prisma.department.upsert({
    where: { id: "seed-transport-a" },
    update: {},
    create: { id: "seed-transport-a", name: "運搬部署A", type: "TRANSPORT" },
  });
  const transportB = await prisma.department.upsert({
    where: { id: "seed-transport-b" },
    update: {},
    create: { id: "seed-transport-b", name: "運搬部署B", type: "TRANSPORT" },
  });
  const processing = await prisma.department.upsert({
    where: { id: "seed-processing" },
    update: {},
    create: { id: "seed-processing", name: "処理部署", type: "PROCESSING" },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      displayName: "管理者",
      role: "ADMIN",
    },
  });

  await prisma.operatorDepartment.upsert({
    where: { userId_departmentId: { userId: admin.id, departmentId: processing.id } },
    update: {},
    create: { userId: admin.id, departmentId: processing.id },
  });

  await prisma.itemType.upsert({
    where: { id: "seed-item-bilge" },
    update: {},
    create: { id: "seed-item-bilge", name: "ビルジ" },
  });
  await prisma.itemType.upsert({
    where: { id: "seed-item-waste-oil" },
    update: {},
    create: { id: "seed-item-waste-oil", name: "廃油" },
  });

  await prisma.ship.upsert({
    where: { id: "seed-ship-1" },
    update: {},
    create: { id: "seed-ship-1", name: "サンプル本船1号" },
  });

  await prisma.site.upsert({
    where: { id: "seed-site-1" },
    update: {},
    create: { id: "seed-site-1", name: "現場A", departmentId: transportA.id },
  });
  await prisma.site.upsert({
    where: { id: "seed-site-2" },
    update: {},
    create: { id: "seed-site-2", name: "現場B", departmentId: transportB.id },
  });

  await prisma.vessel.upsert({
    where: { id: "seed-vessel-1" },
    update: {},
    create: { id: "seed-vessel-1", name: "タンクA", maxCapacity: 50 },
  });
  await prisma.vessel.upsert({
    where: { id: "seed-vessel-2" },
    update: {},
    create: { id: "seed-vessel-2", name: "タンクB", maxCapacity: 80 },
  });

  console.log("シード完了:");
  console.log("- 部署:", transportA.name, transportB.name, processing.name);
  console.log("- 管理者ログイン:", adminEmail, "/ 初期パスワード:", adminPassword);
  console.log("  ※初回ログイン後、必ずパスワードを変更してください（変更機能は今後実装します）");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
