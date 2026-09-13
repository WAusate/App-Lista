import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { householdsTable } from "@workspace/db";
import {
  CreateHouseholdBody,
  CreateHouseholdResponse,
  GetHouseholdParams,
  GetHouseholdResponse,
  JoinHouseholdBody,
  JoinHouseholdResponse,
} from "@workspace/api-zod";
import {
  DEFAULT_CATALOG,
  buildHouseholdState,
  createCatalogAndList,
  findHousehold,
  type CatalogInput,
  type ListInput,
} from "../lib/household-state";

const router: IRouter = Router();

const createCode = () =>
  `CASA-${crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;

router.post("/households", async (req, res): Promise<void> => {
  const parsed = CreateHouseholdBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let code = createCode();
  while (await findHousehold(code)) code = createCode();
  const id = crypto.randomUUID();
  await db.insert(householdsTable).values({ id, code });
  const catalog = (parsed.data.catalog?.length
    ? parsed.data.catalog
    : DEFAULT_CATALOG.map(([id, name, category, emoji, defaultQty, unit]) => ({
        id,
        name,
        category,
        emoji,
        defaultQty,
        unit,
      }))) as CatalogInput[];
  await createCatalogAndList(id, catalog, parsed.data.list as ListInput[] | undefined);
  const state = await buildHouseholdState(code);
  res.status(201).json(CreateHouseholdResponse.parse(state));
});

router.post("/households/join", async (req, res): Promise<void> => {
  const parsed = JoinHouseholdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const state = await buildHouseholdState(parsed.data.code);
  if (!state) {
    res.status(404).json({ error: "Casa não encontrada." });
    return;
  }
  res.json(JoinHouseholdResponse.parse(state));
});

router.get("/households/:code", async (req, res): Promise<void> => {
  const parsed = GetHouseholdParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const state = await buildHouseholdState(parsed.data.code);
  if (!state) {
    res.status(404).json({ error: "Casa não encontrada." });
    return;
  }
  res.json(GetHouseholdResponse.parse(state));
});

export default router;