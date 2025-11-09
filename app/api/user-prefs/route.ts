export const runtime = "nodejs";
// app/api/user-prefs/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, PostgrestError } from "@supabase/supabase-js";

/* config*/
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/* supabase admin client */
function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/* utils */
function getErrMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: string }).message;
    if (typeof m === "string") return m;
  }
  return "Failed";
}

//returning device_id from cookie
async function resolveDeviceId() {
  const store = await cookies();
  let device = store.get("device_id")?.value;
  let needsSet = false;

  if (!device) {device = crypto.randomUUID();needsSet = true;}
  return { device: device!, needsSet };
}

/* get */
export async function GET() {
  try {
    const { device, needsSet } = await resolveDeviceId();
    const supabase = admin();

    const { data, error } = await supabase
      .from("user_prefs")
      .select("allergens, undesired, updated_at")
      .eq("device_id", device)
      .maybeSingle();

    if (error) throw error as PostgrestError;

    const res = NextResponse.json({ ok: true, data });

    if (needsSet) {
      res.cookies.set("device_id", device, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365, //1 year
      });
    }

    return res;
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(e) }, { status: 500 });
  }
}

/* post */
export async function POST(req: Request) {
  try {
    const { device, needsSet } = await resolveDeviceId();
    const body = (await req.json().catch(() => ({}))) as { allergens?: unknown; undesired?: unknown;};
    const allergens = typeof body.allergens === "string" ? body.allergens : null;
    const undesired = typeof body.undesired === "string" ? body.undesired : null;

    const supabase = admin();
    const { data, error } = await supabase
      .from("user_prefs")
      .upsert(
        {
          device_id: device,
          allergens,
          undesired,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id" }
      )
      .select("allergens, undesired, updated_at")
      .single();

    if (error) throw error as PostgrestError;

    const res = NextResponse.json({ ok: true, data });

    if (needsSet) {
      res.cookies.set("device_id", device, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }

    return res;
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrMsg(e) }, { status: 500 });
  }
}
