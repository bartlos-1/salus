// app/api/scan/route.ts
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs";

/* Helpers */

function runScanner(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "scan_to_stdout.py");

    const proc = spawn("python3", ["-u", scriptPath], {
      cwd: process.cwd(),
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    const killTimer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, 60_000);

    proc.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
    proc.stderr.on("data", (d) => (stderr += d.toString("utf-8")));

    proc.on("error", (err) => {
      clearTimeout(killTimer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(killTimer);
      if (code !== 0 && !stdout) {
        return reject(new Error(stderr || `scanner exit code ${code}`));
      }
      try {
        const json = JSON.parse(stdout.trim());
        resolve(json);
      } catch {
        reject(new Error(`Cannot parse scanner output as JSON. stdout=${stdout}\nstderr=${stderr}`));
      }
    });
  });
}

function normalizeBarcode(code: string) {
  const c = code.replace(/\D+/g, "");
  if (c.length === 12) return "0" + c;
  return c;
}

function mapOFF(p: unknown) {
  const prod = (p ?? {}) as Record<string, unknown>;
  const brandsTags = Array.isArray(prod.brands_tags) ? (prod.brands_tags as unknown[]) : [];

  return {
    name:
      (prod.product_name_en as string) ||
      (prod.product_name as string) ||
      "",
    brand:
      (brandsTags.length ? (brandsTags[0] as string) : null) ||
      (prod.brands as string) ||
      "",
    image_url:
      (prod.image_front_url as string) ||
      (prod.image_url as string) ||
      null,
    ingredients:
      (prod.ingredients_text_en as string) ||
      (prod.ingredients_text as string) ||
      "",
  };
}

async function lookupByBarcode(raw: string) {
  const barcode = normalizeBarcode(raw);
  if (!barcode) throw new Error("Invalid barcode");

  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const ok = res.ok && (data as { status?: number }).status === 1 && (data as { product?: unknown }).product;

  if (!ok) {
    const msg =
      ((data as { status_verbose?: string }).status_verbose) ||
      "Product not found for this barcode";
    const err = new Error(msg) as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  return mapOFF((data as { product: unknown }).product);
}

/* Route */

export async function POST(req: Request) {
  try {
    //try to read JSON body
    let barcode = "";
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as { barcode?: unknown };
      if (body && typeof body.barcode === "string") {
        barcode = body.barcode.trim();
      }
    }

    //if barcode provided then manual lookup; else = camera scan
    if (barcode) {
      try {
        const product = await lookupByBarcode(barcode);
        return NextResponse.json(
          {
            name: (product as Record<string, unknown>).name ?? "",
            brand: (product as Record<string, unknown>).brand ?? "",
            ingredients: (product as Record<string, unknown>).ingredients ?? "",
            image_url: (product as Record<string, unknown>).image_url ?? null,
          },
          { status: 200 }
        );
      } catch (e: unknown) {
        const anyE = e as { status?: number; message?: string };
        const status = anyE?.status && Number.isInteger(anyE.status) ? (anyE.status as number) : 500;
        return NextResponse.json({ error: anyE?.message || "Lookup failed" }, { status });
      }
    }

    //camera flow 
    const data = await runScanner();
    const out = (data ?? {}) as Record<string, unknown>;

    if (out.cancelled === true) {return NextResponse.json({ cancelled: true }, { status: 200 });}
    if (typeof out.error === "string" && out.error) {return NextResponse.json({ error: out.error }, { status: 500 });}

    //expect { name, brand, ingredients, image_url }
    return NextResponse.json(
      {
        name: (out.name as string) ?? "",
        brand: (out.brand as string) ?? "",
        ingredients: (out.ingredients as string) ?? "",
        image_url: (out.image_url as string) ?? null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Scanner failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
