/**
 * Seed DÉMO local UNIQUEMENT — Docker Postgres Israel (127.0.0.1:5433 / pos_israel).
 *
 * Ne jamais pointer vers GCP / Frères / autre machine.
 *
 * Usage :
 *   cd apps/backend
 *   npx ts-node prisma/seed-demo-dev.ts
 *
 * Compte admin : +50937000001 / admin1234
 */
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { resolve } from 'path';
import {
  FinanceType,
  GoodsReceiptStatus,
  JournalCode,
  JournalEntryStatus,
  MovementType,
  PaymentMethod,
  PrismaClient,
  PurchaseOrderStatus,
} from '@prisma/client';
import {
  DEFAULT_ROLE_PERMISSIONS,
  SYSTEM_ROLE_LABELS,
} from '../src/common/permissions';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../src/modules/accounting/chart-of-accounts';

config({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const ADMIN_PHONE = '+50937000001';
const ADMIN_PASSWORD = 'admin1234';
const CASHIER_PHONE = '+50937000002';
const ACCOUNTANT_PHONE = '+50937000003';
const DEMO_TAX_ID = 'DEMO-NIF-LOCAL-001';

function assertLocalDevDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  const u = url.toLowerCase();

  const isLocalPort =
    u.includes('127.0.0.1:5433') ||
    u.includes('localhost:5433') ||
    u.includes('host.docker.internal:5433');

  if (!isLocalPort) {
    throw new Error(
      `REFUSÉ — seed démo uniquement sur Postgres Docker local :5433.\nURL actuelle: ${url.replace(/:[^:@/]+@/, ':***@')}`,
    );
  }
  if (!u.includes('/pos_israel')) {
    throw new Error('REFUSÉ — la base doit s’appeler pos_israel (projet Israel local).');
  }

  const forbidden = [
    'cloudsql',
    'googleapis',
    'gcp.',
    'amazonaws',
    'neon.tech',
    'supabase',
    'freres',
    'bazile',
    'baziles',
    '34.',
    '35.',
  ];
  for (const f of forbidden) {
    if (u.includes(f)) {
      throw new Error(`REFUSÉ — URL base suspecte (mot-clé « ${f} »). Aucun seed hors machine locale.`);
    }
  }

  console.log('✓ Garde locale OK — DATABASE_URL pointe vers Docker 127.0.0.1:5433 / pos_israel');
}

async function ensureRoles() {
  for (const [code, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const existing = await prisma.appRole.findFirst({ where: { code } });
    if (!existing) {
      await prisma.appRole.create({
        data: {
          code,
          label: SYSTEM_ROLE_LABELS[code] ?? code,
          permissions: perms,
          isSystem: true,
          isActive: true,
        },
      });
    } else if (!existing.permissions.includes('*')) {
      const merged = Array.from(new Set([...existing.permissions, ...perms]));
      await prisma.appRole.update({
        where: { id: existing.id },
        data: { permissions: merged, isActive: true, deletedAt: null },
      });
    }
  }
}

async function wipeLocalDemoData() {
  console.log('… Nettoyage des données métier locales (TRUNCATE CASCADE)…');
  // Ordre sûr : tout ce qui est métier. Pas de sync vers l’extérieur.
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('_prisma_migrations')
      ) LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
  console.log('✓ Base locale vidée (tables métier)');
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function utcDate(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

async function main() {
  assertLocalDevDatabase();

  // Vérifie réellement le serveur (pas juste l’URL du .env)
  const info = await prisma.$queryRaw<Array<{ db: string; addr: string | null; port: number | null }>>`
    SELECT current_database() AS db,
           inet_server_addr()::text AS addr,
           inet_server_port() AS port
  `;
  const row = info[0];
  console.log(`✓ Connecté à db=${row?.db} addr=${row?.addr ?? 'local'} port=${row?.port ?? '?'}`);
  if (row?.db !== 'pos_israel') {
    throw new Error(`REFUSÉ — database courante = ${row?.db}, attendu pos_israel`);
  }

  const companyCount = await prisma.company.count();
  if (companyCount > 0 && process.env.SEED_DEMO_RESET !== '1') {
    console.log(
      `Base non vide (${companyCount} entreprise(s)). Relance avec SEED_DEMO_RESET=1 pour écraser UNIQUEMENT cette base locale.`,
    );
    process.exit(0);
  }

  if (process.env.SEED_DEMO_RESET === '1' || companyCount > 0) {
    await wipeLocalDemoData();
  }

  await ensureRoles();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const cashierHash = await bcrypt.hash('caissier123', 10);
  const accountantHash = await bcrypt.hash('compta123', 10);

  const company = await prisma.company.create({
    data: {
      name: 'Entreprises Israel DEMO',
      legalName: 'Entreprises Israel S.A. (Démo locale)',
      address: '12 Rue Capois, Port-au-Prince',
      city: 'Port-au-Prince',
      country: 'Haïti',
      phone: '+50928112233',
      email: 'demo@entreprises-israel.local',
      taxId: DEMO_TAX_ID,
      headerText: 'Entreprise de démonstration — environnement local Docker',
      currency: 'HTG',
      vatRatePercent: 0,
    },
  });

  const dept = await prisma.department.create({
    data: {
      companyId: company.id,
      name: 'Commerce général',
      description: 'Département démo',
    },
  });

  await prisma.departmentPrinterProfile.create({
    data: {
      departmentId: dept.id,
      receiptHeaderText: 'Entreprises Israel DEMO\nMerci de votre achat',
      receiptFooterText: 'Bon retour parmi nous',
      disbursementHeaderText: 'Ordre de décaissement — DEMO',
    },
  });

  const store = await prisma.store.create({
    data: {
      companyId: company.id,
      name: 'Magasin Delmas',
      address: 'Delmas 33, Port-au-Prince',
    },
  });

  const register = await prisma.register.create({
    data: {
      code: 'CAISSE-DEMO-1',
      storeId: store.id,
      departmentId: dept.id,
    },
  });

  const admin = await prisma.user.create({
    data: {
      phone: ADMIN_PHONE,
      email: 'admin@demo.local',
      password: passwordHash,
      role: 'ADMIN',
      fullName: 'Admin Démo',
      companyId: company.id,
      departmentId: dept.id,
      isActive: true,
    },
  });

  const cashier = await prisma.user.create({
    data: {
      phone: CASHIER_PHONE,
      email: 'caissier@demo.local',
      password: cashierHash,
      role: 'CASHIER',
      fullName: 'Marie Caissière',
      companyId: company.id,
      departmentId: dept.id,
      isActive: true,
    },
  });

  const accountant = await prisma.user.create({
    data: {
      phone: ACCOUNTANT_PHONE,
      email: 'comptable@demo.local',
      password: accountantHash,
      role: 'ACCOUNTANT',
      fullName: 'Jean Comptable',
      companyId: company.id,
      departmentId: dept.id,
      isActive: true,
    },
  });

  const unitPiece = await prisma.packagingUnit.create({
    data: { departmentId: dept.id, code: 'PCE', label: 'Pièce', sortOrder: 1 },
  });
  const unitSac = await prisma.packagingUnit.create({
    data: { departmentId: dept.id, code: 'SAC', label: 'Sac', sortOrder: 2 },
  });

  const pRiz = await prisma.product.create({
    data: {
      companyId: company.id,
      departmentId: dept.id,
      name: 'Riz Tchako 25lb',
      sku: 'RIZ-25',
      cost: 1200,
      stock: 80,
      stockMin: 10,
      trackStock: true,
      createdById: admin.id,
      saleUnits: {
        create: {
          packagingUnitId: unitSac.id,
          salePrice: 1750,
          isDefault: true,
          unitsPerPackage: 1,
        },
      },
    },
    include: { saleUnits: true },
  });

  const pHuile = await prisma.product.create({
    data: {
      companyId: company.id,
      departmentId: dept.id,
      name: 'Huile végétale 1L',
      sku: 'HUILE-1L',
      cost: 280,
      stock: 120,
      stockMin: 20,
      trackStock: true,
      createdById: admin.id,
      saleUnits: {
        create: {
          packagingUnitId: unitPiece.id,
          salePrice: 450,
          isDefault: true,
          unitsPerPackage: 1,
        },
      },
    },
    include: { saleUnits: true },
  });

  const pSucre = await prisma.product.create({
    data: {
      companyId: company.id,
      departmentId: dept.id,
      name: 'Sucre blanc 5lb',
      sku: 'SUCRE-5',
      cost: 350,
      stock: 60,
      stockMin: 15,
      trackStock: true,
      createdById: admin.id,
      saleUnits: {
        create: {
          packagingUnitId: unitPiece.id,
          salePrice: 550,
          isDefault: true,
          unitsPerPackage: 1,
        },
      },
    },
    include: { saleUnits: true },
  });

  const bank = await prisma.bank.create({
    data: {
      companyId: company.id,
      name: 'Unibank DEMO',
      note: 'Compte démo local',
      accounts: {
        create: {
          companyId: company.id,
          name: 'Compte courant HTG',
          accountNumber: '001-DEMO-8899',
          openingBalance: 50000,
        },
      },
    },
    include: { accounts: true },
  });
  const bankAccount = bank.accounts[0]!;

  const clientCredit = await prisma.creditCustomer.create({
    data: {
      companyId: company.id,
      departmentId: dept.id,
      name: 'Hotel Caribe DEMO',
      phone: '+50931112222',
      address: 'Pétion-Ville',
      creditLimit: 100000,
      isActive: true,
    },
  });

  const expenseCat = await prisma.expenseCategory.create({
    data: { companyId: company.id, name: 'Dépenses manuelles' },
  });
  const salesCat = await prisma.expenseCategory.create({
    data: { companyId: company.id, name: 'Ventes POS' },
  });

  // ——— Achat + réception ———
  const po = await prisma.purchaseOrder.create({
    data: {
      companyId: company.id,
      departmentId: dept.id,
      supplierName: 'Distributeur National DEMO',
      status: PurchaseOrderStatus.CLOSED,
      reference: 'PO-DEMO-001',
      createdById: admin.id,
      lines: {
        create: [
          { productId: pRiz.id, quantityOrdered: 40, unitPriceEst: 1150 },
          { productId: pHuile.id, quantityOrdered: 50, unitPriceEst: 260 },
        ],
      },
    },
  });

  const gr = await prisma.goodsReceipt.create({
    data: {
      purchaseOrderId: po.id,
      departmentId: dept.id,
      status: GoodsReceiptStatus.POSTED,
      receivedAt: daysAgo(20),
      createdById: admin.id,
      note: 'Réception démo',
      lines: {
        create: [
          { productId: pRiz.id, quantity: 40, unitCost: 1150 },
          { productId: pHuile.id, quantity: 50, unitCost: 260 },
        ],
      },
    },
  });

  await prisma.stockMovement.createMany({
    data: [
      {
        productId: pRiz.id,
        quantity: 40,
        type: MovementType.IN,
        reason: `Réception achat #${gr.id}`,
        createdById: admin.id,
        goodsReceiptId: gr.id,
        createdAt: daysAgo(20),
      },
      {
        productId: pHuile.id,
        quantity: 50,
        type: MovementType.IN,
        reason: `Réception achat #${gr.id}`,
        createdById: admin.id,
        goodsReceiptId: gr.id,
        createdAt: daysAgo(20),
      },
    ],
  });

  // ——— Ventes caisse ———
  async function createCashSale(opts: {
    days: number;
    items: Array<{ productId: number; psuId: number; qty: number; unitPrice: number; cost: number }>;
    method?: PaymentMethod;
    bankAccountId?: number;
    delivered?: boolean;
  }) {
    const total = opts.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const createdAt = daysAgo(opts.days);
    const method = opts.method ?? PaymentMethod.CASH;
    const sale = await prisma.sale.create({
      data: {
        total,
        subtotal: total,
        tax: 0,
        status: 'COMPLETED',
        cashier: cashier.fullName,
        amountPaid: total,
        amountReceived: method === PaymentMethod.CASH ? total : 0,
        changeDue: 0,
        userId: cashier.id,
        storeId: store.id,
        registerId: register.id,
        createdAt,
        items: {
          create: opts.items.map((it) => ({
            productId: it.productId,
            productSaleUnitId: it.psuId,
            quantity: it.qty,
            baseQuantity: it.qty,
            unitPrice: it.unitPrice,
            subtotal: it.qty * it.unitPrice,
            createdAt,
          })),
        },
        payments: {
          create: {
            amount: total,
            method,
            bankAccountId: method === PaymentMethod.BANK ? opts.bankAccountId : null,
            createdAt,
          },
        },
      },
      include: { items: true },
    });
    await prisma.sale.update({
      where: { id: sale.id },
      data: { txnNumber: sale.id },
    });

    await prisma.financeEntry.create({
      data: {
        type: FinanceType.INCOME,
        amount: total,
        description: `Encaissement vente #${sale.id}`,
        userId: cashier.id,
        categoryId: salesCat.id,
        saleId: sale.id,
        createdAt,
      },
    });

    const delivery = await prisma.delivery.create({
      data: {
        saleId: sale.id,
        companyId: company.id,
        departmentId: dept.id,
        status: opts.delivered === false ? 'PENDING' : 'DELIVERED',
        deliveredAt: opts.delivered === false ? null : createdAt,
        deliveredById: opts.delivered === false ? null : cashier.id,
        createdAt,
        items: {
          create: sale.items.map((si) => ({
            saleItemId: si.id,
            quantityOrdered: Number(si.quantity),
            quantityDelivered: opts.delivered === false ? 0 : Number(si.quantity),
          })),
        },
      },
    });

    if (opts.delivered !== false) {
      for (const it of opts.items) {
        await prisma.product.update({
          where: { id: it.productId },
          data: { stock: { decrement: it.qty } },
        });
        await prisma.stockMovement.create({
          data: {
            productId: it.productId,
            quantity: it.qty,
            type: MovementType.OUT,
            reason: `Livraison vente #${sale.id}`,
            createdById: cashier.id,
            createdAt,
          },
        });
      }
    }

    if (method === PaymentMethod.BANK && opts.bankAccountId) {
      await prisma.bankTransaction.create({
        data: {
          bankAccountId: opts.bankAccountId,
          type: 'DEPOSIT',
          amount: total,
          description: `Vente #${sale.id}`,
          reference: `saleTxn:${sale.id}`,
          occurredAt: createdAt,
          userId: cashier.id,
        },
      });
    }

    return { sale, delivery };
  }

  await createCashSale({
    days: 5,
    items: [
      {
        productId: pRiz.id,
        psuId: pRiz.saleUnits[0]!.id,
        qty: 2,
        unitPrice: 1750,
        cost: 1200,
      },
      {
        productId: pHuile.id,
        psuId: pHuile.saleUnits[0]!.id,
        qty: 3,
        unitPrice: 450,
        cost: 280,
      },
    ],
  });

  await createCashSale({
    days: 3,
    items: [
      {
        productId: pSucre.id,
        psuId: pSucre.saleUnits[0]!.id,
        qty: 4,
        unitPrice: 550,
        cost: 350,
      },
    ],
    method: PaymentMethod.BANK,
    bankAccountId: bankAccount.id,
  });

  await createCashSale({
    days: 1,
    items: [
      {
        productId: pHuile.id,
        psuId: pHuile.saleUnits[0]!.id,
        qty: 2,
        unitPrice: 450,
        cost: 280,
      },
    ],
    delivered: false,
  });

  // ——— Vente crédit + acompte + remboursement ———
  const creditTotal = 1750 * 5;
  const down = 2000;
  const creditCreated = daysAgo(10);
  const creditSale = await prisma.sale.create({
    data: {
      total: creditTotal,
      subtotal: creditTotal,
      tax: 0,
      status: 'COMPLETED',
      cashier: cashier.fullName,
      creditCustomerId: clientCredit.id,
      amountPaid: down,
      amountReceived: 0,
      changeDue: 0,
      userId: cashier.id,
      storeId: store.id,
      registerId: register.id,
      createdAt: creditCreated,
      items: {
        create: [
          {
            productId: pRiz.id,
            productSaleUnitId: pRiz.saleUnits[0]!.id,
            quantity: 5,
            baseQuantity: 5,
            unitPrice: 1750,
            subtotal: creditTotal,
            createdAt: creditCreated,
          },
        ],
      },
      payments: {
        create: {
          amount: creditTotal,
          method: PaymentMethod.CREDIT,
          reference: 'Vente à crédit',
          createdAt: creditCreated,
        },
      },
    },
    include: { items: true },
  });
  await prisma.sale.update({
    where: { id: creditSale.id },
    data: { txnNumber: creditSale.id },
  });

  const feDown = await prisma.financeEntry.create({
    data: {
      type: FinanceType.INCOME,
      amount: down,
      description: `Acompte crédit — ${clientCredit.name} — vente #${creditSale.id}`,
      userId: cashier.id,
      categoryId: salesCat.id,
      createdAt: creditCreated,
    },
  });
  await prisma.creditPayment.create({
    data: {
      creditCustomerId: clientCredit.id,
      saleId: creditSale.id,
      amount: down,
      method: PaymentMethod.CASH,
      note: 'Acompte à l’achat',
      userId: cashier.id,
      financeEntryId: feDown.id,
      createdAt: creditCreated,
    },
  });

  await prisma.delivery.create({
    data: {
      saleId: creditSale.id,
      companyId: company.id,
      departmentId: dept.id,
      status: 'DELIVERED',
      deliveredAt: creditCreated,
      deliveredById: cashier.id,
      createdAt: creditCreated,
      items: {
        create: creditSale.items.map((si) => ({
          saleItemId: si.id,
          quantityOrdered: Number(si.quantity),
          quantityDelivered: Number(si.quantity),
        })),
      },
    },
  });
  await prisma.product.update({
    where: { id: pRiz.id },
    data: { stock: { decrement: 5 } },
  });

  const repayAt = daysAgo(2);
  const repayAmount = 3000;
  const feRepay = await prisma.financeEntry.create({
    data: {
      type: FinanceType.INCOME,
      amount: repayAmount,
      description: `Remboursement crédit — ${clientCredit.name}`,
      userId: cashier.id,
      categoryId: salesCat.id,
      createdAt: repayAt,
    },
  });
  await prisma.creditPayment.create({
    data: {
      creditCustomerId: clientCredit.id,
      saleId: creditSale.id,
      amount: repayAmount,
      method: PaymentMethod.BANK,
      bankAccountId: bankAccount.id,
      userId: cashier.id,
      financeEntryId: feRepay.id,
      createdAt: repayAt,
    },
  });
  await prisma.sale.update({
    where: { id: creditSale.id },
    data: { amountPaid: down + repayAmount },
  });
  await prisma.bankTransaction.create({
    data: {
      bankAccountId: bankAccount.id,
      type: 'DEPOSIT',
      amount: repayAmount,
      description: `Remboursement crédit — ${clientCredit.name}`,
      reference: `creditPayment:demo`,
      occurredAt: repayAt,
      userId: cashier.id,
    },
  });

  // ——— Dépenses ———
  for (const [label, amount, d] of [
    ['LOYER', 25000, 15],
    ['SALAIRE', 18000, 7],
    ['CARBURANT', 4500, 4],
    ['EAU DINEPA', 1200, 2],
  ] as const) {
    await prisma.financeEntry.create({
      data: {
        type: FinanceType.EXPENSE,
        amount,
        description: label,
        detail: `Dépense démo ${label}`,
        categoryId: expenseCat.id,
        userId: admin.id,
        createdAt: daysAgo(d),
      },
    });
  }

  // ——— Banque manuelle ———
  await prisma.bankTransaction.create({
    data: {
      bankAccountId: bankAccount.id,
      type: 'DEPOSIT',
      amount: 10000,
      description: 'Dépôt caisse → banque (démo)',
      reference: 'MANUAL-DEMO-1',
      occurredAt: daysAgo(6),
      userId: admin.id,
    },
  });

  // ——— Plan comptable + exercice + écritures de base ———
  await prisma.account.createMany({
    data: DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
      companyId: company.id,
      code: a.code,
      name: a.name,
      classNumber: a.classNumber,
      nature: a.nature,
      isDebitNormal: a.isDebitNormal,
      systemKey: a.systemKey ?? null,
      isSystem: Boolean(a.systemKey),
    })),
  });

  const year = new Date().getFullYear();
  const fy = await prisma.fiscalYear.create({
    data: {
      companyId: company.id,
      label: String(year),
      startDate: utcDate(year, 1, 1),
      endDate: utcDate(year, 12, 31),
      status: 'OPEN',
    },
  });

  // Immobilisation démo
  const asset = await prisma.fixedAsset.create({
    data: {
      companyId: company.id,
      name: 'Réfrigérateur commercial DEMO',
      acquisitionDate: utcDate(year, 1, 15),
      acquisitionCost: 85000,
      residualValue: 5000,
      usefulLifeMonths: 60,
      createdById: admin.id,
    },
  });

  const accByKey = async (key: string) => {
    const a = await prisma.account.findFirst({
      where: { companyId: company.id, systemKey: key },
    });
    if (!a) throw new Error(`Compte système ${key} manquant`);
    return a;
  };
  const accByCode = async (code: string) => {
    const a = await prisma.account.findFirst({
      where: { companyId: company.id, code },
    });
    if (!a) throw new Error(`Compte ${code} manquant`);
    return a;
  };

  const cash = await accByKey('CASH');
  const bankAcc = await accByKey('BANK');
  const sales = await accByKey('SALES');
  const customers = await accByKey('CUSTOMERS');
  const suppliers = await accByKey('SUPPLIERS');
  const inventory = await accByKey('INVENTORY');
  const fixed = await accByKey('FIXED_ASSETS');
  const rent = await accByCode('613');
  const salary = await accByCode('641');

  let entryNumber = 0;
  async function post(
    source: string,
    sourceId: string,
    description: string,
    entryDate: Date,
    journalCode: JournalCode,
    lines: Array<{ accountId: number; debit?: number; credit?: number; label?: string }>,
  ) {
    entryNumber += 1;
    await prisma.journalEntry.create({
      data: {
        companyId: company.id,
        fiscalYearId: fy.id,
        entryDate,
        journalCode,
        entryNumber,
        description,
        source,
        sourceId,
        status: JournalEntryStatus.POSTED,
        createdById: admin.id,
        lines: {
          create: lines.map((l, i) => ({
            accountId: l.accountId,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            label: l.label ?? null,
            sortOrder: i,
          })),
        },
      },
    });
  }

  // Échantillon d’écritures pour bilans immédiatement visibles
  await post(
    'FIXED_ASSET',
    String(asset.id),
    'Acquisition immobilisation — Réfrigérateur commercial DEMO',
    utcDate(year, 1, 15),
    JournalCode.OD,
    [
      { accountId: fixed.id, debit: 85000 },
      { accountId: bankAcc.id, credit: 85000 },
    ],
  );
  await post(
    'PURCHASE',
    String(gr.id),
    'Achat stock — Distributeur National DEMO',
    daysAgo(20),
    JournalCode.AC,
    [
      { accountId: inventory.id, debit: 40 * 1150 + 50 * 260 },
      { accountId: suppliers.id, credit: 40 * 1150 + 50 * 260 },
    ],
  );
  await post(
    'SUPPLIER_PAYMENT',
    'demo-1',
    'Paiement fournisseur — Distributeur National DEMO',
    daysAgo(18),
    JournalCode.BQ,
    [
      { accountId: suppliers.id, debit: 30000 },
      { accountId: bankAcc.id, credit: 30000 },
    ],
  );
  await prisma.supplierPayment.create({
    data: {
      companyId: company.id,
      supplierName: 'Distributeur National DEMO',
      amount: 30000,
      method: PaymentMethod.BANK,
      bankAccountId: bankAccount.id,
      paidAt: daysAgo(18),
      userId: admin.id,
      note: 'Acompte fournisseur démo',
    },
  });

  await post(
    'SALE',
    'demo-cash-1',
    'Vente POS démo',
    daysAgo(5),
    JournalCode.CA,
    [
      { accountId: cash.id, debit: 4850 },
      { accountId: sales.id, credit: 4850 },
    ],
  );
  await post(
    'CREDIT_SALE',
    String(creditSale.id),
    'Vente à crédit — Hotel Caribe DEMO',
    creditCreated,
    JournalCode.VE,
    [
      { accountId: customers.id, debit: creditTotal },
      { accountId: sales.id, credit: creditTotal },
    ],
  );
  await post(
    'CREDIT_PAYMENT',
    'demo-repay',
    'Encaissement créance client',
    repayAt,
    JournalCode.BQ,
    [
      { accountId: bankAcc.id, debit: repayAmount },
      { accountId: customers.id, credit: repayAmount },
    ],
  );
  await post(
    'EXPENSE',
    'demo-loyer',
    'Dépense — LOYER',
    daysAgo(15),
    JournalCode.CA,
    [
      { accountId: rent.id, debit: 25000 },
      { accountId: cash.id, credit: 25000 },
    ],
  );
  await post(
    'EXPENSE',
    'demo-salaire',
    'Dépense — SALAIRE',
    daysAgo(7),
    JournalCode.CA,
    [
      { accountId: salary.id, debit: 18000 },
      { accountId: cash.id, credit: 18000 },
    ],
  );

  console.log('\n========== SEED DÉMO LOCAL TERMINÉ ==========');
  console.log('Machine : Docker pos_israel_postgres @ 127.0.0.1:5433');
  console.log('Aucune synchro cloud — données fictives locales uniquement.');
  console.log('');
  console.log('Entreprise :', company.name, `| NIF: ${DEMO_TAX_ID}`);
  console.log('Exercice comptable ouvert :', fy.label);
  console.log('');
  console.log('Connexions :');
  console.log(`  Admin      ${ADMIN_PHONE} / ${ADMIN_PASSWORD}`);
  console.log(`  Caissier   ${CASHIER_PHONE} / caissier123`);
  console.log(`  Comptable  ${ACCOUNTANT_PHONE} / compta123`);
  console.log('');
  console.log('À tester : Caisse, Crédit, Stocks/Achats, Livraisons, Comptabilité (bilan, journal, reprise).');
  console.log('=============================================\n');
}

main()
  .catch((error) => {
    console.error('Seed démo échoué:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
