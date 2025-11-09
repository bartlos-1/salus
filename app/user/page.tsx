// app/user/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, Check, X, Loader2 } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";

/* ===================== Types ===================== */

type MatchItem = { ingredient: string; match: string; score: number };

type ScanResult = {
  raw?: string;
  ingredients: string[];
  matches: MatchItem[];
} | null;

type DietFlags = {
  veganOk: boolean;
  vegetarianOk: boolean;
};

type PrefRow = {
  allergens?: string | null;
  undesired?: string | null;
};

function splitCSV(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/* ===================== Page ===================== */

const primaryBtn =
  "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20";

export default function UserScanPage() {
  // Optional preview (we stop it before scanning so Python can use the camera)
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [streamReady, setStreamReady] = React.useState(false);
  const [previewOn, setPreviewOn] = React.useState(false);

  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<ScanResult>(null);
  const [diet, setDiet] = React.useState<DietFlags>({ veganOk: true, vegetarianOk: true });

  // Loaded from DB
  const [allergensDB, setAllergensDB] = React.useState<string[]>([]);
  const [undesiredDB, setUndesiredDB] = React.useState<string[]>([]);
  const [prefsLoading, setPrefsLoading] = React.useState(true);
  const [prefsError, setPrefsError] = React.useState<string | null>(null);

  /* ---------- Load user prefs from DB ---------- */
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPrefsLoading(true);
        setPrefsError(null);
        const res = await fetch("/api/user-prefs", { cache: "no-store" });
        const j = await res.json();
        if (!j?.ok) throw new Error(j?.error || "Failed to load preferences");
        const row: PrefRow = j.data ?? {};
        if (!cancelled) {
          setAllergensDB(splitCSV(row.allergens));
          setUndesiredDB(splitCSV(row.undesired));
        }
      } catch (e: any) {
        if (!cancelled) setPrefsError(e?.message || "Failed to load preferences");
      } finally {
        if (!cancelled) setPrefsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---------- camera preview (optional) ---------- */
  async function startPreview() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play().catch(() => {});
        setStreamReady(true);
        setPreviewOn(true);
      }
    } catch {
      setStreamReady(false);
      setPreviewOn(false);
    }
  }
  function stopPreview() {
    const s = videoRef.current?.srcObject as MediaStream | undefined;
    s?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewOn(false);
  }
  React.useEffect(() => {
    startPreview();
    return () => stopPreview();
  }, []);

  /* ---------- helpers ---------- */

  function checkDiet(list: string[]): DietFlags {
    const L = list.map((s) => s.toLowerCase()).join(" ");
    const hasMeatOrFish =
      /\b(chicken|beef|pork|lamb|bacon|ham|fish|tuna|salmon|anchovy|shrimp|crab|gelatin)\b/.test(L);
    const hasDairyOrEggs = /\b(milk|butter|cream|cheese|casein|whey|yogurt|egg)\b/.test(L);
    const hasHoney = /\bhoney\b/.test(L);
    const vegetarianOk = !hasMeatOrFish;
    const veganOk = vegetarianOk && !hasDairyOrEggs && !hasHoney;
    return { veganOk, vegetarianOk };
  }

  function wordHit(text: string, needle: string) {
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${esc}\\b`, "i").test(text);
  }

  // Use DB "undesired" list
  function computeUndesired(list: string[], undesiredList: string[]): string[] {
    const lower = list.map((s) => s.toLowerCase());
    const out = new Set<string>();
    for (const item of lower) {
      for (const u of undesiredList) {
        if (wordHit(item, u.toLowerCase())) out.add(u);
      }
    }
    return [...out];
  }

  /* ---------- SCAN using existing Python route (/api/scan-qr) ---------- */
  async function onScan() {
    // Ensure browser preview releases the camera for Python
    stopPreview();

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/scan-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameraIndex: 0,
          timeoutSec: 20,
          allergies: allergensDB, // ← from DB
          thresh: 0.25,
          show: true,
        }),
      });

      const j = await res.json();
      if (!res.ok || j.ok === false) {
        throw new Error(j?.error || "Scan failed");
      }

      const ingredients: string[] = Array.isArray(j.ingredients) ? j.ingredients : [];
      const matches: MatchItem[] = Array.isArray(j.matches) ? j.matches : [];

      setResult({ ingredients, matches, raw: j.raw });
      setDiet(checkDiet(ingredients));
    } catch (e) {
      setResult({ ingredients: [], matches: [], raw: "Scan failed" });
    } finally {
      setLoading(false);
      // optional: restart preview
      startPreview();
    }
  }

  function resetScan() {
    setResult(null);
  }

  /* ---------- Derive UI lists from result + DB prefs ---------- */

  // Treat server matches as “definite” (already thresholded in Python)
  const definiteAllergens = React.useMemo(() => {
    if (!result?.matches?.length) return [];
    const set = new Set(result.matches.map((m) => m.match.toLowerCase()));
    return [...set];
  }, [result]);

  const possibleAllergens: string[] = []; // keep empty unless you implement a softer second-pass

  const undesired = React.useMemo(
    () => computeUndesired(result?.ingredients || [], undesiredDB),
    [result, undesiredDB]
  );

  /* ---------- UI ---------- */

  const crumbs = [{ href: "/user", label: "Scan" }];

  return (
    <div className="relative min-h-screen bg-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
        <nav className="mx-auto flex h-14 items-center gap-1 px-3 text-sm text-gray-600">
          <Link href="/" className="hover:underline font-medium text-gray-900">
            Home
          </Link>
          {crumbs.map((c, i) => (
            <React.Fragment key={c.href}>
              <span className="px-1 text-gray-400">/</span>
              {i === crumbs.length - 1 ? (
                <span className="font-medium text-gray-900">{c.label}</span>
              ) : (
                <Link href={c.href} className="hover:underline">
                  {c.label}
                </Link>
              )}
            </React.Fragment>
          ))}

          <div className="ml-auto flex items-center gap-3">
            {prefsLoading ? (
              <span className="text-xs text-muted-foreground flex items-center">
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Loading preferences…
              </span>
            ) : prefsError ? (
              <span className="text-xs text-red-600">{prefsError}</span>
            ) : (
              <Link href="/user/prefs" className="text-xs underline">
                Edit preferences
              </Link>
            )}

            <Button onClick={onScan} disabled={loading || prefsLoading} className={`px-6 ${primaryBtn}`}>
              {loading ? (
                <>
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Camera className="mr-3 h-5 w-5" />
                  Scan
                </>
              )}
            </Button>
          </div>
        </nav>
      </header>

      {/* Camera background with soft gradient overlay */}
      <div className="absolute inset-0 -z-10">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        {!streamReady && (
          <div className="absolute inset-0 grid place-items-center text-white/80 text-sm">
            Camera preview unavailable
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/40" />
      </div>

      {/* Pretty summary card */}
      {result && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/40 bg-white/70 backdrop-blur-xl shadow-2xl">
            <div className="px-6 pt-5 pb-3 border-b border-white/60">
              <h2 className="text-center text-lg font-semibold text-gray-900">Summary</h2>
              <p className="mt-1 text-center text-sm text-gray-600">
                Allergens detected: {definiteAllergens.length + possibleAllergens.length}
              </p>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <SectionBox
                title={`Definite allergens (${definiteAllergens.length})`}
                items={definiteAllergens}
                emptyText="None"
              />
              <SectionBox
                title={`Possible allergens (${possibleAllergens.length})`}
                items={possibleAllergens}
                emptyText="None"
              />
              <SectionBox
                title={`Undesired ingredients (${undesired.length})`}
                items={undesired}
                emptyText="None"
              />

              {/* Diet flags */}
              <div className="rounded-2xl border bg-white/80 px-4 py-3">
                <div className="text-sm font-medium text-gray-900 mb-2">Diet suitability</div>
                <div className="grid grid-cols-2 gap-3">
                  <DietBadge label="vegan" ok={diet.veganOk} />
                  <DietBadge label="vegetarian" ok={diet.vegetarianOk} />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={resetScan} className={`px-6 ${primaryBtn}`}>
                  Scan another
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomNav active="scan" />
    </div>
  );
}

/* ---------- Small UI components ---------- */

function SectionBox({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white/80 px-4 py-3 shadow-sm">
      <div className="text-sm font-medium text-gray-900">{title}</div>
      {items.length > 0 ? (
        <ul className="mt-2 grid grid-cols-1 gap-1">
          {items.map((s) => (
            <li
              key={s}
              className="text-sm text-gray-700 rounded-md bg-gray-50 px-2 py-1 border border-gray-100"
            >
              {s}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-gray-500">{emptyText ?? "—"}</p>
      )}
    </div>
  );
}

function DietBadge({ label, ok }: { label: "vegan" | "vegetarian"; ok: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${
        ok ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
      }`}
    >
      {ok ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
      <span className={`text-sm ${ok ? "text-green-700" : "text-red-700"}`}>{label}</span>
    </div>
  );
}
