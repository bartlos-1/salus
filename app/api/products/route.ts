// app/api/products/route.ts
import { NextResponse } from "next/server";
import { createClient, PostgrestError } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: string }).message;
    if (typeof m === "string") return m;
  }
  return "Server error";
}

export async function GET() {
  try {
    const r = await supabase
      .from("products")
      .select("id,name,brand,image_url,ingredients,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (r.error) throw r.error as PostgrestError;

    return NextResponse.json({ items: r.data }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      brand?: string | null;
      image_url?: string | null;
      ingredients?: string | null;
    };

    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const insert = {
      name,
      brand: body.brand ?? null,
      image_url: body.image_url ?? null,
      ingredients: body.ingredients ?? null,
      updated_at: new Date().toISOString(),
    };

    const r = await supabase
      .from("products")
      .insert(insert)
      .select("id,name,brand,image_url,ingredients,created_at,updated_at")
      .single();

    if (r.error) throw r.error as PostgrestError;

    return NextResponse.json(r.data, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}