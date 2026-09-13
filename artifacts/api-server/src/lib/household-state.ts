import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  catalogItemsTable,
  householdsTable,
  purchaseHistoryTable,
  receiptsTable,
  shoppingItemsTable,
} from "@workspace/db";

export const DEFAULT_CATALOG = [
  ["arroz", "Arroz", "Despensa", "🍚", 1, "pct"],
  ["feijao", "Feijão", "Despensa", "🫘", 1, "pct"],
  ["cafe", "Café", "Despensa", "☕", 1, "pct"],
  ["macarrao", "Macarrão", "Despensa", "🍝", 1, "pct"],
  ["leite", "Leite", "Geladeira", "🥛", 2, "l"],
  ["ovos", "Ovos", "Geladeira", "🥚", 1, "dz"],
  ["manteiga", "Manteiga", "Geladeira", "🧈", 1, "un"],
  ["queijo", "Queijo", "Geladeira", "🧀", 1, "un"],
  ["banana", "Banana", "Hortifruti", "🍌", 1, "kg"],
  ["tomate", "Tomate", "Hortifruti", "🍅", 1, "kg"],
  ["folhas", "Folhas verdes", "Hortifruti", "🥬", 1, "un"],
  ["cebola", "Cebola", "Hortifruti", "🧅", 1, "kg"],
  ["detergente", "Detergente", "Limpeza", "🧴", 2, "un"],
  ["sabao", "Sabão em pó", "Limpeza", "🫧", 1, "pct"],
  ["esponja", "Esponja", "Limpeza", "🧽", 1, "un"],
  ["papel", "Papel higiênico", "Higiene", "🧻", 1, "pct"],
  ["shampoo", "Shampoo", "Higiene", "🧴", 1, "un"],
  ["saco", "Sacos para lixo", "Casa", "🗑️", 1, "pct"],
] as const;

export type CatalogInput = {
  id?: string;
  name: string;
  category: string;
  emoji: string;
  defaultQty: number;
  unit: string;
  note?: string;
};

export type ListInput = { itemId: string; quantity?: number };

const toIso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
const normalizeName = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export async function findHousehold(code: string) {
  const [household] = await db
    .select()
    .from(householdsTable)
    .where(eq(householdsTable.code, code));
  return household;
}

export async function buildHouseholdState(code: string) {
  const household = await findHousehold(code);
  if (!household) return null;

  const catalog = await db
    .select()
    .from(catalogItemsTable)
    .where(eq(catalogItemsTable.householdId, household.id))
    .orderBy(asc(catalogItemsTable.category), asc(catalogItemsTable.name));
  const shopping = await db
    .select()
    .from(shoppingItemsTable)
    .where(eq(shoppingItemsTable.householdId, household.id))
    .orderBy(asc(shoppingItemsTable.createdAt));
  const history = await db
    .select()
    .from(purchaseHistoryTable)
    .where(eq(purchaseHistoryTable.householdId, household.id))
    .orderBy(desc(purchaseHistoryTable.purchasedAt));
  const receipts = await db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.householdId, household.id))
    .orderBy(desc(receiptsTable.importedAt));
  const catalogById = new Map(catalog.map((item) => [item.id, item]));

  return {
    code,
    catalog: catalog.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      emoji: item.emoji,
      defaultQty: item.defaultQty,
      unit: item.unit,
      note: item.note || undefined,
      updatedAt: item.updatedAt.toISOString(),
    })),
    list: shopping.map((item) => {
      const catalogItem = catalogById.get(item.catalogId);
      return {
        id: item.id,
        itemId: item.catalogId,
        quantity: item.quantity,
        bought: item.bought,
        boughtAt: toIso(item.boughtAt),
        item: catalogItem
          ? {
              id: catalogItem.id,
              name: catalogItem.name,
              category: catalogItem.category,
              emoji: catalogItem.emoji,
              defaultQty: catalogItem.defaultQty,
              unit: catalogItem.unit,
              note: catalogItem.note || undefined,
              updatedAt: catalogItem.updatedAt.toISOString(),
            }
          : undefined,
      };
    }),
    history: history.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      emoji: item.emoji,
      purchasedAt: item.purchasedAt.toISOString(),
      priceCents: item.priceCents,
      quantity: item.quantity,
      unit: item.unit,
      supermarket: item.supermarket,
      source: item.source,
      receiptId: item.receiptId,
    })),
    receipts: receipts.map((item) => ({
      id: item.id,
      qrUrl: item.qrUrl,
      supermarket: item.supermarket,
      issuedAt: toIso(item.issuedAt),
      totalCents: item.totalCents,
      importedAt: item.importedAt.toISOString(),
      resolved: item.resolved,
    })),
  };
}

export async function createCatalogAndList(
  householdId: string,
  catalogInputs: CatalogInput[],
  listInputs?: ListInput[],
) {
  const now = new Date();
  const sourceToActualId = new Map<string, string>();
  const catalogRows = catalogInputs.map((input) => ({
    id: (() => {
      const actualId = `${householdId.slice(0, 8)}-${input.id || crypto.randomUUID()}`;
      if (input.id) sourceToActualId.set(input.id, actualId);
      return actualId;
    })(),
    householdId,
    name: input.name.trim(),
    category: input.category.trim(),
    emoji: input.emoji.trim(),
    defaultQty: input.defaultQty,
    unit: input.unit,
    note: input.note ?? "",
    createdAt: now,
    updatedAt: now,
  }));
  if (catalogRows.length) await db.insert(catalogItemsTable).values(catalogRows);

  const requested = new Map(
    (listInputs ?? catalogRows.map((item) => ({ itemId: item.id, quantity: item.defaultQty }))).map(
      (item) => [sourceToActualId.get(item.itemId) ?? item.itemId, item.quantity ?? 1],
    ),
  );
  const listRows = catalogRows
    .filter((item) => requested.has(item.id))
    .map((item) => ({
      id: crypto.randomUUID(),
      householdId,
      catalogId: item.id,
      quantity: requested.get(item.id) ?? item.defaultQty,
      bought: false,
      boughtAt: null,
      createdAt: now,
      updatedAt: now,
    }));
  if (listRows.length) await db.insert(shoppingItemsTable).values(listRows);
}

export async function catalogItemForHouse(code: string, id: string) {
  const household = await findHousehold(code);
  if (!household) return null;
  const [item] = await db
    .select()
    .from(catalogItemsTable)
    .where(and(eq(catalogItemsTable.householdId, household.id), eq(catalogItemsTable.id, id)));
  return item ? { household, item } : null;
}

export async function hasDuplicateCatalogName(householdId: string, name: string, exceptId?: string) {
  const items = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.name })
    .from(catalogItemsTable)
    .where(eq(catalogItemsTable.householdId, householdId));
  const normalized = normalizeName(name);
  return items.some((item) => item.id !== exceptId && normalizeName(item.name) === normalized);
}