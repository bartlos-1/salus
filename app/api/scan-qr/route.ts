import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { runPython } from "@/lib/runPython";

export const runtime = "nodejs"; // must be node

function resolveQrScannerPath(): string {
  // 1) Allow override via env if you move the script
  const pEnv = process.env.QR_SCANNER_PATH;
  if (pEnv && fs.existsSync(pEnv)) return pEnv;

  // 2) Try common locations relative to repo root
  const candidates = [
    path.join(process.cwd(), "project", "scripts", "qr_scanner.py"), // if your scripts/ is inside /project
    path.join(process.cwd(), "scripts", "qr_scanner.py"),             // if you moved scripts/ to repo root
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `qr_scanner.py not found. Tried:\n` +
    candidates.map(c => ` - ${c}`).join("\n") +
    `\nSet QR_SCANNER_PATH env var to the absolute path if needed.`
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      cameraIndex = 0,
      timeoutSec = 20,
      allergies = [],   // array of strings
      thresh = 0.25,
      show = false,
    } = body || {};

    const scriptPath = resolveQrScannerPath();

    const args = [
      scriptPath,
      "--camera", String(cameraIndex),
      "--timeout", String(timeoutSec),
      "--thresh", String(thresh),
      "--allergies", JSON.stringify(allergies),
    ];
    if (show) args.push("--show");

    const { code, stdout, stderr } = await runPython(args, process.cwd());

    let jsonOut: any = {};
    try {
      jsonOut = JSON.parse(stdout || "{}");
    } catch {
      jsonOut = { ok: false, error: "Bad scanner output", stdout, stderr };
    }

    if (code !== 0 || jsonOut?.ok === false) {
      return NextResponse.json(
        { ok: false, error: jsonOut?.error || stderr || "Scanner error", stdout },
        { status: 500 }
      );
    }
    return NextResponse.json(jsonOut, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
