// app/api/meal-details/recipe-add/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ===================== ENV & CLIENT ===================== **/
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const QR_BUCKET = process.env.SUPABASE_QR_BUCKET || "qr-codes"; // e.g. "qr-codes"

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.warn(
    "[recipe-add] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local"
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

/** ===================== TYPES ===================== **/
type ApiBody = {
  menuName: string;
  productId: string;
};

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  ingredients: string | null;
};

type MenuItemRow = { id: string };

/** ===================== HELPERS ===================== **/

// Normalize recipe lines: keep unique, newline-delimited, strip leading "- " and trailing "(Brand)"
function normalizeRecipe(recipe: string): string {
  const lines = String(recipe)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^-\s*/, "")); // strip leading dash if present

  // unique, case-insensitive
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    const k = l.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(l);
    }
  }
  return out.join("\n");
}

// Given final recipe text, query products by name and build a unique ingredients[] list
async function computeIngredientsFromRecipe(recipe: string): Promise<string[]> {
  const lines = String(recipe)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  // strip "(Brand)" suffix for name matching
  const names = lines.map((l) => l.replace(/\s*\([^)]*\)\s*$/, ""));

  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("id,name,brand,ingredients")
    .in("name", names);

  if (error) throw new Error(error.message);

  const all: string[] = [];
  for (const p of (products || []) as ProductRow[]) {
    const raw = p.ingredients ?? "";
    if (!raw) continue;
    // support both newline- and comma-delimited ingredients
    const parts = String(raw)
      .split(/\r?\n|,/g)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const x of parts) {
      if (!all.includes(x)) all.push(x);
    }
  }
  return all;
}

// Generate a PNG buffer for the QR containing JSON-encoded ingredients[]
async function makeQrPng(ingredients: string[]): Promise<Buffer> {
  // Dynamic import to avoid TS type complaints if @types/qrcode isn't installed
  const QRCode = (await import("qrcode")).default;
  const payload = JSON.stringify(ingredients); // <- your site expects ['a','b','c'] format
  return QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
}

// Upload PNG with upsert and return a final URL (public or signed)
async function uploadQrAndGetUrl(menuItemId: string, png: Buffer): Promise<string> {
  const filePath = `generated/${menuItemId}.png`; // stable path → upsert overwrites
  const up = await supabaseAdmin.storage.from(QR_BUCKET).upload(filePath, png, {
    cacheControl: "60",
    upsert: true,
    contentType: "image/png",
  });
  if (up.error) throw up.error;

  // If bucket is PUBLIC: getPublicUrl gives a permanent URL.
  const { data: pub } = supabaseAdmin.storage.from(QR_BUCKET).getPublicUrl(filePath);
  if (pub?.publicUrl) return pub.publicUrl;

  // Else, create a signed URL (expires in 1 hour)
  const { data: signed, error: signErr } = await supabaseAdmin
    .storage.from(QR_BUCKET)
    .createSignedUrl(filePath, 60 * 60);
  if (signErr) throw signErr;
  return signed.signedUrl;
}

/** ===================== ROUTE ===================== **/

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ApiBody>;
    const menuName = String(body.menuName || "").trim();
    const productId = String(body.productId || "").trim();

    if (!menuName || !productId) {
      return NextResponse.json(
        { error: "menuName and productId are required" },
        { status: 400 }
      );
    }

    // 1) Validate product
    const prodRes = await supabaseAdmin
      .from("products")
      .select("id,name,brand")
      .eq("id", productId)
      .maybeSingle();
    if (prodRes.error) {
      return NextResponse.json({ error: prodRes.error.message }, { status: 500 });
    }
    if (!prodRes.data) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const prod = prodRes.data as { id: string; name: string; brand: string | null };

    // 2) Find menu item by name
    const miRes = await supabaseAdmin
      .from("menu_items")
      .select("id")
      .eq("name", menuName)
      .maybeSingle<MenuItemRow>();
    if (miRes.error) {
      return NextResponse.json({ error: miRes.error.message }, { status: 500 });
    }
    if (!miRes.data) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }
    const menuItemId = miRes.data.id;

    // 3) Load current details row (create if missing)
    const detRes = await supabaseAdmin
      .from("meal_details")
      .select("id,menu_item_id,recipe,qr_url,ingredients")
      .eq("menu_item_id", menuItemId)
      .maybeSingle();
    if (detRes.error) {
      return NextResponse.json({ error: detRes.error.message }, { status: 500 });
    }

    // 4) Append this product to recipe
    const newLine = `- ${prod.name}${prod.brand ? ` (${prod.brand})` : ""}`;
    const current = (detRes.data?.recipe ?? "").toString();
    const appended = current ? `${current}\n${newLine}` : newLine;
    const nextRecipe = normalizeRecipe(appended);

    // 5) Upsert recipe text
    if (!detRes.data) {
      const ins = await supabaseAdmin
        .from("meal_details")
        .insert({ menu_item_id: menuItemId, recipe: nextRecipe })
        .select("id,menu_item_id,recipe")
        .maybeSingle();
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
    } else {
      const upd = await supabaseAdmin
        .from("meal_details")
        .update({ recipe: nextRecipe })
        .eq("menu_item_id", menuItemId);
      if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }

    // 6) Recompute ingredients from final recipe
    const ingredients = await computeIngredientsFromRecipe(nextRecipe);

    // 7) Save ingredients JSON into meal_details
    const updIng = await supabaseAdmin
      .from("meal_details")
      .update({ ingredients })
      .eq("menu_item_id", menuItemId);
    if (updIng.error) return NextResponse.json({ error: updIng.error.message }, { status: 500 });

    // 8) Regenerate QR from ingredients[] and upload (overwrite)
    const png = await makeQrPng(ingredients);
    const qrUrl = await uploadQrAndGetUrl(menuItemId, png);

    // 9) Persist qr_url (you already have this column)
    const updQr = await supabaseAdmin
      .from("meal_details")
      .update({ qr_url: qrUrl })
      .eq("menu_item_id", menuItemId);
    if (updQr.error) return NextResponse.json({ error: updQr.error.message }, { status: 500 });

    // 10) Respond with fresh data
    return NextResponse.json(
      {
        recipe: nextRecipe,
        ingredients, // json array
        qrUrl,       // final image URL (public or signed)
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
