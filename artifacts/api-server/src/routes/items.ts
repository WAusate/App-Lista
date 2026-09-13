import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  catalogItemsTable,
  purchaseHistoryTable,
  shoppingItemsTable,
} from "@workspace/db";
import {
  AddListItemBody,
  AddListItemHeader,
  AddListItemResponse,
  ClearBoughtHeader,
  ClearBoughtResponse,
  CreateItemBody,
  CreateItemHeader,
  CreateItemResponse,
  DeleteItemHeader,
  DeleteItemParams,
  DeleteItemResponse,
  DeleteListItemHeader,
  DeleteListItemParams,
  DeleteListItemResponse,
  ResetListHeader,
  ResetListResponse,
  UpdateItemBody,
  UpdateItemHeader,
  UpdateItemParams,
  UpdateItemResponse,
  UpdateListItemBody,
  UpdateListItemHeader,
  UpdateListItemParams,
  UpdateListItemResponse,
} from "@workspace/api-zod";
import {
  buildHouseholdState,
  catalogItemForHouse,
  findHousehold,
  hasDuplicateCatalogName,
} from "../lib/household-state";

const router: IRouter = Router();

function houseCode(req: Parameters<Parameters<IRouter["post"]>[1]>[0]) {
  return String(req.headers["x-house-code"] ?? "");
}

async function requireHouse(code: string) {
  return findHousehold(code);
}

router.post("/items", async (req, res): Promise<void> => {
  const header = CreateItemHeader.safeParse({ "X-House-Code": houseCode(req) });
  const body = CreateItemBody.safeParse(req.body);
  if (!header.success || !body.success) {
    res.status(400).json({ error: "Dados do item inválidos." });
    return;
  }
  const code = header.data["X-House-Code"];
  const household = await requireHouse(code);
  if (!household) {
    res.status(404).json({ error: "Casa não encontrada." });
    return;
  }
  if (await hasDuplicateCatalogName(household.id, body.data.name)) {
    res.status(409).json({ error: "Este item já está cadastrado." });
    return;
  }
  const id = body.data.id || crypto.randomUUID();
  const now = new Date();
  await db.insert(catalogItemsTable).values({
    id,
    householdId: household.id,
    name: body.data.name.trim(),
    category: body.data.category.trim(),
    emoji: body.data.emoji,
    defaultQty: body.data.defaultQty,
    unit: body.data.unit,
    note: body.data.note ?? "",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(shoppingItemsTable).values({
    id: crypto.randomUUID(),
    householdId: household.id,
    catalogId: id,
    quantity: body.data.defaultQty,
    bought: false,
    createdAt: now,
    updatedAt: now,
  });
  const state = await buildHouseholdState(code);
  res.status(201).json(CreateItemResponse.parse(state));
});

router.put("/items/:id", async (req, res): Promise<void> => {
  const params = UpdateItemParams.safeParse(req.params);
  const header = UpdateItemHeader.safeParse({ "X-House-Code": houseCode(req) });
  const body = UpdateItemBody.safeParse(req.body);
  if (!params.success || !header.success || !body.success) {
    res.status(400).json({ error: "Dados do item inválidos." });
    return;
  }
  const code = header.data["X-House-Code"];
  const found = await catalogItemForHouse(code, params.data.id);
  if (!found) {
    res.status(404).json({ error: "Item não encontrado." });
    return;
  }
  if (await hasDuplicateCatalogName(found.household.id, body.data.name, params.data.id)) {
    res.status(409).json({ error: "Este item já está cadastrado." });
    return;
  }
  const now = new Date();
  await db
    .update(catalogItemsTable)
    .set({
      name: body.data.name.trim(),
      category: body.data.category.trim(),
      emoji: body.data.emoji,
      defaultQty: body.data.defaultQty,
      unit: body.data.unit,
      note: body.data.note ?? "",
      updatedAt: now,
    })
    .where(and(eq(catalogItemsTable.id, params.data.id), eq(catalogItemsTable.householdId, found.household.id)));
  await db
    .update(shoppingItemsTable)
    .set({ quantity: body.data.defaultQty, updatedAt: now })
    .where(
      and(
        eq(shoppingItemsTable.catalogId, params.data.id),
        eq(shoppingItemsTable.householdId, found.household.id),
        eq(shoppingItemsTable.bought, false),
      ),
    );
  const state = await buildHouseholdState(code);
  res.json(UpdateItemResponse.parse(state));
});

router.delete("/items/:id", async (req, res): Promise<void> => {
  const params = DeleteItemParams.safeParse(req.params);
  const header = DeleteItemHeader.safeParse({ "X-House-Code": houseCode(req) });
  if (!params.success || !header.success) {
    res.status(400).json({ error: "Dados do item inválidos." });
    return;
  }
  const code = header.data["X-House-Code"];
  const found = await catalogItemForHouse(code, params.data.id);
  if (!found) {
    res.status(404).json({ error: "Item não encontrado." });
    return;
  }
  await db
    .delete(shoppingItemsTable)
    .where(and(eq(shoppingItemsTable.catalogId, params.data.id), eq(shoppingItemsTable.householdId, found.household.id)));
  await db
    .delete(catalogItemsTable)
    .where(and(eq(catalogItemsTable.id, params.data.id), eq(catalogItemsTable.householdId, found.household.id)));
  const state = await buildHouseholdState(code);
  res.json(DeleteItemResponse.parse(state));
});

router.post("/list/items", async (req, res): Promise<void> => {
  const header = AddListItemHeader.safeParse({ "X-House-Code": houseCode(req) });
  const body = AddListItemBody.safeParse(req.body);
  if (!header.success || !body.success) {
    res.status(400).json({ error: "Dados da lista inválidos." });
    return;
  }
  const code = header.data["X-House-Code"];
  const found = await catalogItemForHouse(code, body.data.itemId);
  if (!found) {
    res.status(404).json({ error: "Item não encontrado." });
    return;
  }
  const [existing] = await db
    .select()
    .from(shoppingItemsTable)
    .where(and(eq(shoppingItemsTable.householdId, found.household.id), eq(shoppingItemsTable.catalogId, body.data.itemId)));
  const now = new Date();
  if (existing) {
    await db
      .update(shoppingItemsTable)
      .set({
        quantity: body.data.quantity ?? found.item.defaultQty,
        bought: false,
        boughtAt: null,
        updatedAt: now,
      })
      .where(eq(shoppingItemsTable.id, existing.id));
  } else {
    await db.insert(shoppingItemsTable).values({
      id: crypto.randomUUID(),
      householdId: found.household.id,
      catalogId: found.item.id,
      quantity: body.data.quantity ?? found.item.defaultQty,
      bought: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  const state = await buildHouseholdState(code);
  res.json(AddListItemResponse.parse(state));
});

router.put("/list/items/:id", async (req, res): Promise<void> => {
  const params = UpdateListItemParams.safeParse(req.params);
  const header = UpdateListItemHeader.safeParse({ "X-House-Code": houseCode(req) });
  const body = UpdateListItemBody.safeParse(req.body);
  if (!params.success || !header.success || !body.success) {
    res.status(400).json({ error: "Dados da lista inválidos." });
    return;
  }
  const code = header.data["X-House-Code"];
  const household = await requireHouse(code);
  if (!household) {
    res.status(404).json({ error: "Casa não encontrada." });
    return;
  }
  const [existing] = await db
    .select()
    .from(shoppingItemsTable)
    .where(and(eq(shoppingItemsTable.id, params.data.id), eq(shoppingItemsTable.householdId, household.id)));
  if (!existing) {
    res.status(404).json({ error: "Item da lista não encontrado." });
    return;
  }
  const [catalog] = await db
    .select()
    .from(catalogItemsTable)
    .where(eq(catalogItemsTable.id, existing.catalogId));
  const nextBought = body.data.bought ?? existing.bought;
  const now = new Date();
  await db
    .update(shoppingItemsTable)
    .set({
      quantity: body.data.quantity ?? existing.quantity,
      bought: nextBought,
      boughtAt: nextBought ? existing.boughtAt ?? now : null,
      updatedAt: now,
    })
    .where(eq(shoppingItemsTable.id, existing.id));
  if (nextBought && !existing.bought && catalog) {
    await db.insert(purchaseHistoryTable).values({
      householdId: household.id,
      itemName: catalog.name,
      emoji: catalog.emoji,
      purchasedAt: now,
      quantity: body.data.quantity ?? existing.quantity,
      unit: catalog.unit,
      source: "lista",
    });
  }
  const state = await buildHouseholdState(code);
  res.json(UpdateListItemResponse.parse(state));
});

router.delete("/list/items/:id", async (req, res): Promise<void> => {
  const params = DeleteListItemParams.safeParse(req.params);
  const header = DeleteListItemHeader.safeParse({ "X-House-Code": houseCode(req) });
  if (!params.success || !header.success) {
    res.status(400).json({ error: "Dados da lista inválidos." });
    return;
  }
  const code = header.data["X-House-Code"];
  const household = await requireHouse(code);
  if (!household) {
    res.status(404).json({ error: "Casa não encontrada." });
    return;
  }
  await db
    .delete(shoppingItemsTable)
    .where(and(eq(shoppingItemsTable.id, params.data.id), eq(shoppingItemsTable.householdId, household.id)));
  const state = await buildHouseholdState(code);
  res.json(DeleteListItemResponse.parse(state));
});

router.post("/list/clear-bought", async (req, res): Promise<void> => {
  const header = ClearBoughtHeader.safeParse({ "X-House-Code": houseCode(req) });
  if (!header.success) {
    res.status(400).json({ error: "Código da casa inválido." });
    return;
  }
  const household = await requireHouse(header.data["X-House-Code"]);
  if (!household) {
    res.status(404).json({ error: "Casa não encontrada." });
    return;
  }
  await db
    .delete(shoppingItemsTable)
    .where(and(eq(shoppingItemsTable.householdId, household.id), eq(shoppingItemsTable.bought, true)));
  const state = await buildHouseholdState(header.data["X-House-Code"]);
  res.json(ClearBoughtResponse.parse(state));
});

router.post("/list/reset", async (req, res): Promise<void> => {
  const header = ResetListHeader.safeParse({ "X-House-Code": houseCode(req) });
  if (!header.success) {
    res.status(400).json({ error: "Código da casa inválido." });
    return;
  }
  const code = header.data["X-House-Code"];
  const household = await requireHouse(code);
  if (!household) {
    res.status(404).json({ error: "Casa não encontrada." });
    return;
  }
  const catalog = await db
    .select()
    .from(catalogItemsTable)
    .where(eq(catalogItemsTable.householdId, household.id));
  await db.delete(shoppingItemsTable).where(eq(shoppingItemsTable.householdId, household.id));
  const now = new Date();
  if (catalog.length) {
    await db.insert(shoppingItemsTable).values(
      catalog.map((item) => ({
        id: crypto.randomUUID(),
        householdId: household.id,
        catalogId: item.id,
        quantity: item.defaultQty,
        bought: false,
        boughtAt: null,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  const state = await buildHouseholdState(code);
  res.json(ResetListResponse.parse(state));
});

export default router;