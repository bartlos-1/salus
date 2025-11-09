// app/api/products/search/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProductRow = {id: string;name: string; brand: string | null; image_url: string | null;};

/* utils */
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/* get */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = clamp(Number(searchParams.get("limit") || 8), 1, 25);

    if (!q) {return NextResponse.json({ items: [] }, { status: 200 });}

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, brand, image_url")
      .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {return NextResponse.json({ error: error.message }, { status: 500 });}

    return NextResponse.json({ items: (data ?? []) as ProductRow[] },{ status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "search error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
