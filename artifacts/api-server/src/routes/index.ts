import { Router, type IRouter } from "express";
import healthRouter from "./health";
import householdsRouter from "./households";
import itemsRouter from "./items";
import receiptsRouter from "./receipts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(householdsRouter);
router.use(itemsRouter);
router.use(receiptsRouter);

export default router;
