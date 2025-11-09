// app/api/menu-items/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const runtime = "nodejs";

type MenuItemRow = {id: string; name: string;category: string | null;thumbnail: string | null;description: string | null;updated_at: string | null;};

type CreateBody = {name?: string; category?: string; description?: string | null; thumbnail?: string | null;};

const ALLOWED_CATEGORIES = new Set(["Breakfast", "Lunch", "Dinner", "Snacks"]);

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, category, thumbnail, description, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {return NextResponse.json({ error: error.message }, { status: 500 });}

  const items = (data ?? []).map((r: MenuItemRow) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    thumbnail: r.thumbnail,
    description: r.description,
    lastEdited: r.updated_at,
  }));
  return NextResponse.json({ items });
}

/* adding meal */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateBody;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const description =
      typeof body?.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    const thumbnail =
      typeof body?.thumbnail === "string" && body.thumbnail?.trim()
        ? body.thumbnail.trim()
        : null;

    //validation
    if (!name) {return NextResponse.json({ error: "name is required" }, { status: 400 });}
    if (!ALLOWED_CATEGORIES.has(category)) {return NextResponse.json({ error: "invalid category" }, { status: 400 });}

    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .insert({ name, category, description, thumbnail })
      .select("id, name, category, thumbnail, description, updated_at")
      .single<MenuItemRow>();

    if (error) {return NextResponse.json({ error: error.message }, { status: 500 });}

    return NextResponse.json(
      {
        item: {
          id: data!.id,
          name: data!.name,
          category: data!.category,
          thumbnail: data!.thumbnail,
          description: data!.description,
          lastEdited: data!.updated_at,
        },
      },
      { status: 201 }
    );
  } catch (e: unknown) {const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
