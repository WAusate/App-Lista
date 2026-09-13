import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { purchaseHistoryTable, receiptsTable } from "@workspace/db";
import {
  ResolveReceiptBody,
  ResolveReceiptHeader,
  ResolveReceiptResponse,
} from "@workspace/api-zod";
import { buildHouseholdState, findHousehold } from "../lib/household-state";

const router: IRouter = Router();

type ParsedReceipt = {
  supermarket?: string;
  issuedAt?: Date;
  totalCents?: number;
  products: Array<{ name: string; priceCents?: number; quantity?: number }>;
};

const decodeHtml = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const moneyToCents = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
};

function parseReceiptHtml(html: string): ParsedReceipt {
  const siteName =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1] ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const totalMatch = html.match(
    /(?:valor\s+total|total\s+a\s+pagar|total\s+da\s+nota|valor\s+a\s+pagar)[^R$0-9]{0,80}(?:R\$\s*)?([\d.]+,\d{2})/i,
  );
  const dateMatch = html.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/(20\d{2})\b/);
  const products: ParsedReceipt["products"] = [];
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts.slice(0, 10)) {
    try {
      const data = JSON.parse(script[1]);
      const candidates = Array.isArray(data)
        ? data
        : [data, ...(Array.isArray(data?.["@graph"]) ? data["@graph"] : [])];
      for (const candidate of candidates) {
        const elements = Array.isArray(candidate?.itemListElement)
          ? candidate.itemListElement
          : candidate?.name && candidate?.offers
            ? [candidate]
            : [];
        for (const entry of elements.slice(0, 200)) {
          const product = entry?.item ?? entry;
          if (typeof product?.name !== "string") continue;
          const price = product.offers?.price ?? product.price;
          products.push({
            name: product.name.trim(),
            priceCents: price == null ? undefined : moneyToCents(String(price)),
            quantity: 1,
          });
        }
      }
    } catch {
      // Fiscal pages often include malformed JSON-LD; other heuristics still apply.
    }
  }
  return {
    supermarket: siteName ? decodeHtml(siteName).slice(0, 160) : undefined,
    issuedAt: dateMatch
      ? new Date(`${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}T12:00:00.000Z`)
      : undefined,
    totalCents: totalMatch ? moneyToCents(totalMatch[1]) : undefined,
    products,
  };
}

router.post("/receipts/resolve", async (req, res): Promise<void> => {
  const header = ResolveReceiptHeader.safeParse({ "X-House-Code": String(req.headers["x-house-code"] ?? "") });
  const body = ResolveReceiptBody.safeParse(req.body);
  if (!header.success || !body.success) {
    res.status(400).json({ error: "Informe uma URL válida e o código da casa." });
    return;
  }
  const code = header.data["X-House-Code"];
  const parsedUrl = new URL(body.data.qrUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol) || !/(sefaz|fazenda|nfce|nfe|nota|fiscal)/i.test(parsedUrl.hostname)) {
    res.status(400).json({ error: "O endereço não parece ser uma página fiscal válida." });
    return;
  }
  const household = await findHousehold(code);
  if (!household) {
    res.status(404).json({ error: "Casa não encontrada." });
    return;
  }

  const receiptId = crypto.randomUUID();
  let parsed: ParsedReceipt = { products: [] };
  let message = "Nota salva, mas não foi possível ler os dados detalhados.";
  try {
    const response = await fetch(parsedUrl, {
      headers: { "user-agent": "Compra-em-Casa/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    parsed = parseReceiptHtml(await response.text());
    if (parsed.supermarket || parsed.issuedAt || parsed.totalCents || parsed.products.length) {
      message = parsed.products.length
        ? "Nota importada com produtos e preços."
        : "Nota importada parcialmente; alguns detalhes não estavam disponíveis.";
    }
  } catch (error) {
    req.log.warn({ err: error, url: parsedUrl.hostname }, "Could not resolve fiscal receipt");
  }

  await db.insert(receiptsTable).values({
    id: receiptId,
    householdId: household.id,
    qrUrl: body.data.qrUrl,
    supermarket: parsed.supermarket ?? null,
    issuedAt: parsed.issuedAt ?? null,
    totalCents: parsed.totalCents ?? null,
    resolved: Boolean(parsed.supermarket || parsed.issuedAt || parsed.totalCents || parsed.products.length),
  });
  if (parsed.products.length) {
    await db.insert(purchaseHistoryTable).values(
      parsed.products.map((product) => ({
        householdId: household.id,
        itemName: product.name,
        emoji: "🛒",
        purchasedAt: parsed.issuedAt ?? new Date(),
        priceCents: product.priceCents ?? null,
        quantity: product.quantity ?? 1,
        supermarket: parsed.supermarket ?? null,
        source: "nota_fiscal",
        receiptId,
      })),
    );
  }
  const state = await buildHouseholdState(code);
  const receipt = state?.receipts.find((item) => item.id === receiptId);
  res.json(
    ResolveReceiptResponse.parse({
      receipt,
      message,
      state,
    }),
  );
});

export default router;