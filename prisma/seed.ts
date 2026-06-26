import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const roles = ["OWNER", "MANAGER", "STOREKEEPER", "SALESPERSON", "HR_ADMIN"] as const;

  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { name: "OWNER" } });
  const hrRole = await prisma.role.findUniqueOrThrow({ where: { name: "HR_ADMIN" } });
  const salespersonRole = await prisma.role.findUniqueOrThrow({ where: { name: "SALESPERSON" } });

  const passwordHash = await bcrypt.hash("Password123!", 12);

  const managerEmployee = await prisma.employee.upsert({
    where: { employeeCode: "LGM-EMP-0001" },
    update: {},
    create: {
      employeeCode: "LGM-EMP-0001",
      fullName: "Miriam Bekele",
      phoneNumber: "+251911000101",
      email: "miriam@lightgarment.example",
      address: "Addis Ababa, Ethiopia",
      gender: "FEMALE",
      dateOfBirth: new Date("1990-03-11"),
      position: "Operations Manager",
      department: "ADMIN",
      salary: 35000,
      employmentType: "FULL_TIME",
      hireDate: new Date("2021-04-01"),
      status: "ACTIVE"
    }
  });

  await prisma.user.upsert({
    where: { email: "owner@lightgarment.example" },
    update: {},
    create: {
      name: "Light Garment Owner",
      email: "owner@lightgarment.example",
      passwordHash,
      roleId: ownerRole.id,
      employeeId: managerEmployee.id
    }
  });

  await prisma.user.upsert({
    where: { email: "hr@lightgarment.example" },
    update: {},
    create: {
      name: "HR Administrator",
      email: "hr@lightgarment.example",
      passwordHash,
      roleId: hrRole.id
    }
  });

  await prisma.user.upsert({
    where: { email: "sales@lightgarment.example" },
    update: {},
    create: {
      name: "POS Cashier",
      email: "sales@lightgarment.example",
      passwordHash,
      roleId: salespersonRole.id
    }
  });

  const supplier = await prisma.supplier.upsert({
    where: { id: "seed-supplier-light-textiles" },
    update: {},
    create: {
      id: "seed-supplier-light-textiles",
      name: "Light Textiles Supplier",
      contactName: "Dawit Tesfaye",
      phone: "+251911000202",
      email: "supplier@example.com",
      address: "Merkato, Addis Ababa"
    }
  });

  await prisma.employee.upsert({
    where: { employeeCode: "LGM-EMP-0002" },
    update: {},
    create: {
      employeeCode: "LGM-EMP-0002",
      fullName: "Yonas Alemu",
      phoneNumber: "+251911000303",
      address: "Bole, Addis Ababa",
      gender: "MALE",
      dateOfBirth: new Date("1994-06-24"),
      position: "Senior Tailor",
      department: "PRODUCTION",
      salary: 18000,
      employmentType: "FULL_TIME",
      hireDate: new Date("2022-01-15"),
      status: "ACTIVE"
    }
  });

  const product = await prisma.product.upsert({
    where: { sku: "LGM-SH-0001" },
    update: {},
    create: {
      sku: "LGM-SH-0001",
      productName: "Classic Oxford Shirt",
      model: "Oxford 2026",
      color: "White",
      size: "M",
      quantity: 120,
      costPrice: 420,
      sellingPrice: 850,
      images: [],
      barcode: "890100000001",
      qrCode: "LGM-SH-0001",
      supplierId: supplier.id
    }
  });

  await prisma.rawMaterial.createMany({
    data: [
      { name: "Cotton Fabric Roll", category: "FABRIC", unit: "meter", quantity: 520, reorderLevel: 120, unitCost: 95, supplierId: supplier.id },
      { name: "White Thread", category: "THREAD", unit: "spool", quantity: 240, reorderLevel: 60, unitCost: 18, supplierId: supplier.id },
      { name: "Pearl Buttons", category: "BUTTONS", unit: "piece", quantity: 3000, reorderLevel: 800, unitCost: 1.5, supplierId: supplier.id }
    ],
    skipDuplicates: true
  });

  await prisma.productionStage.createMany({
    data: ["FABRIC", "CUTTING", "SEWING", "PRINTING", "IRONING", "PACKAGING", "FINISHED_GOODS"].map((stage, index) => ({
      productId: product.id,
      stage: stage as never,
      status: index < 3 ? "COMPLETED" : index === 3 ? "IN_PROGRESS" : "PENDING"
    })),
    skipDuplicates: true
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
