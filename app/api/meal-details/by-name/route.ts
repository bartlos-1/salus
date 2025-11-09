// app/api/meal-details/by-name/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Используем серверный ключ для чтения meal_details.
 * URL берем из SUPABASE_URL (если задан) либо из NEXT_PUBLIC_SUPABASE_URL.
 */
const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
);

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: string }).message;
    if (typeof m === "string") return m;
  }
  return "Server error";
}

async function signIfNeeded(row: any): Promise<string | null> {
  // Если уже есть публичный URL — отдаем его.
  const direct =
    typeof row?.qr_url === "string" && row.qr_url ? row.qr_url : null;
  if (direct) return direct;

  // Иначе попробуем подписать приватный путь, если задан бакет.
  const bucket = process.env.SUPABASE_QR_BUCKET; // напр. "qr-bucket"
  const path =
    typeof row?.qr_path === "string" && row.qr_path ? row.qr_path : null;

  if (bucket && path) {
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60); // 1 час
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    const name = (searchParams.get("name") || "").trim();

    if (!id && !name) {
      return NextResponse.json(
        { error: "`id` or `name` is required" },
        { status: 400 }
      );
    }

    // 1) menu_items по id/имени
    let item: { id: string; name: string } | null = null;

    if (id) {
      const r = await supabase
        .from("menu_items")
        .select("id,name,updated_at")
        .eq("id", id)
        .maybeSingle();
      if (r.error) {
        return NextResponse.json({ error: r.error.message }, { status: 500 });
      }
      item = (r.data as any) ?? null;
    }

    if (!item && name) {
      const r = await supabase
        .from("menu_items")
        .select("id,name,updated_at")
        .eq("name", name)
        .maybeSingle();
      if (r.error) {
        return NextResponse.json({ error: r.error.message }, { status: 500 });
      }
      item = (r.data as any) ?? null;
    }

    if (!item) {
      return NextResponse.json(
        { error: `Meal "${name || id}" not found` },
        { status: 404 }
      );
    }

    // 2) meal_details по menu_item_id
    // Берем "*" — чтобы не падать, если в схеме пока нет qr_url/qr_path.
    const det = await supabase
      .from("meal_details")
      .select("*")
      .eq("menu_item_id", item.id)
      .maybeSingle();

    if (det.error) {
      return NextResponse.json({ error: det.error.message }, { status: 500 });
    }

    let details: {
      id: string;
      menu_item_id: string;
      recipe: string | null;
      ingredients: unknown;
      updated_at: string | null;
      qr_url: string | null;
    } | null = null;

    if (det.data) {
      const qr_url = await signIfNeeded(det.data);
      details = {
        id: det.data.id,
        menu_item_id: det.data.menu_item_id,
        recipe: det.data.recipe ?? null,
        ingredients: det.data.ingredients ?? null,
        updated_at: det.data.updated_at ?? null,
        qr_url, // всегда возвращаем поле (или null)
      };
    }

    return NextResponse.json(
      {
        menuName: item.name,
        menuItemId: item.id,
        details,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
