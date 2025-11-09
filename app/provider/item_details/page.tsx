// app/provider/item_details/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Search, Info, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@supabase/supabase-js";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

/* ===================== Types ===================== */

type MealDetailsApi = {
  menuName: string;
  details: {
    recipe?: string | null;
    ingredients?: unknown;
    updated_at?: string | null;
    qr_url?: string | null;
  } | null;
};

type ProductLite = {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
};

type MatchItem = { ingredient: string; match: string; score: number };
type ScanResult = {
  raw?: string;
  ingredients?: string[];
  matches?: MatchItem[];
} | null;

/* ===================== Utils ===================== */

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: string }).message;
    if (typeof m === "string") return m;
  }
  return "Failed to load meal details.";
}

function recipeToLines(recipe?: string | null): string[] {
  if (!recipe) return [];
  const parts = recipe
    .split(/\r?\n|(?<=[\.\!\?])\s+(?=[A-Z])/g)
    .map(s => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = p.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** Simple local matcher used as a fallback if the server didn’t compute `matches`. */
function computeMatchesLocal(ingredients: string[], allergies: string[], thresh = 0.25): MatchItem[] {
  const norm = (s: string) =>
    s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const ingN = ingredients.map(i => ({ raw: i, n: norm(i) }));
  const alN = allergies
    .map(a => a.trim())
    .filter(Boolean)
    .map(a => ({ raw: a, n: norm(a) }));

  // very simple: substring or token overlap; score is heuristic in [0..1]
  const hits: MatchItem[] = [];
  for (const i of ingN) {
    for (const a of alN) {
      if (!a.n) continue;
      let score = 0;
      if (i.n.includes(a.n)) score = Math.min(1, a.n.length / Math.max(1, i.n.length));
      else {
        // token overlap
        const it = new Set(i.n.split(/[^a-z0-9]+/).filter(Boolean));
        const at = new Set(a.n.split(/[^a-z0-9]+/).filter(Boolean));
        const inter = [...at].filter(x => it.has(x)).length;
        const denom = Math.max(1, Math.min(it.size, at.size));
        score = inter / denom;
      }
      if (score >= thresh) hits.push({ ingredient: i.raw, match: a.raw, score });
    }
  }
  // dedupe by ingredient+match (keep max score)
  const byKey = new Map<string, MatchItem>();
  for (const h of hits) {
    const k = `${h.ingredient}||${h.match}`;
    const prev = byKey.get(k);
    if (!prev || prev.score < h.score) byKey.set(k, h);
  }
  return [...byKey.values()].sort((a,b) => b.score - a.score);
}

/* ===================== Page ===================== */

export default function MealDetailsPage() {
  const params = useSearchParams();
  const nameFromQuery = params?.get("name") || undefined;

  // default to ?name=... if provided, else "Salad"
  const [mealName] = React.useState<string>(nameFromQuery ?? "Salad");

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [recipeLines, setRecipeLines] = React.useState<string[]>([]);
  const [ingredientsRaw, setIngredientsRaw] = React.useState<string>("");

  // QR URL state
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);

  // SEARCH state
  const [q, setQ] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<ProductLite[]>([]);
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [suggestError, setSuggestError] = React.useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = React.useState(false);
  const debounceRef = React.useRef<number | null>(null);

  // QR scan state (server spawns Python)
  const [scanBusy, setScanBusy] = React.useState(false);
  const [scanResult, setScanResult] = React.useState<ScanResult>(null);

  // Allergy input
  const [allergyText, setAllergyText] = React.useState("");
  const allergies = React.useMemo(
    () => allergyText.split(",").map(s => s.trim()).filter(Boolean),
    [allergyText]
  );

  // Collapsible “All scanned ingredients”
  const [showAllIngs, setShowAllIngs] = React.useState(false);

  const loadDetails = React.useCallback(async () => {
    const res = await fetch(
      `/api/meal-details/by-name?name=${encodeURIComponent(mealName)}`,
      { cache: "no-store" }
    );

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await res.text();
      throw new Error(`Unexpected response (not JSON). Status ${res.status}. First bytes: ${text.slice(0, 120)}`);
    }

    const data: MealDetailsApi | { error: string } = await res.json();
    if ("error" in data) throw new Error(data.error);

    const details = (data as MealDetailsApi).details || {};
    const recipe = details.recipe ?? "";
    const ing = details.ingredients;

    // recipe
    setRecipeLines(recipeToLines(recipe));

    // ingredients (raw display)
    let display = "";
    if (typeof ing === "string") display = ing;
    else if (ing != null) {
      try { display = JSON.stringify(ing); } catch { display = String(ing); }
    }
    setIngredientsRaw(display);

    // qr_url
    const url = (details as any).qr_url ?? null;
    setQrUrl(typeof url === "string" && url ? url : null);
  }, [mealName]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadDetails();
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadDetails]);

  // Realtime: reload on any meal_details UPDATE
  React.useEffect(() => {
    const s = supabase();
    const channel = s
      .channel("meal_details_watch")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meal_details" },
        async () => { await loadDetails(); }
      )
      .subscribe();
    return () => { s.removeChannel(channel); };
  }, [loadDetails]);

  // Debounced search to /api/products/search
  React.useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setSuggestions([]);
      setOpenDropdown(false);
      setSuggestError(null);
      return;
    }
    setSuggestLoading(true);
    setSuggestError(null);

    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q.trim())}&limit=8`, {
          cache: "no-store",
        });
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await res.text();
          throw new Error(`Bad response: ${text.slice(0, 60)}`);
        }
        const j = (await res.json()) as { items?: ProductLite[]; error?: string };
        if (j.error) throw new Error(j.error);
        setSuggestions(Array.isArray(j.items) ? j.items : []);
        setOpenDropdown(true);
      } catch (e: any) {
        setSuggestError(e?.message || "Search failed");
        setSuggestions([]);
        setOpenDropdown(false);
      } finally {
        setSuggestLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  const handlePick = async (prod: ProductLite) => {
    try {
      setSuggestError(null);
      const res = await fetch(`/api/meal-details/recipe-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ menuName: mealName, productId: prod.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to add to recipe");

      await loadDetails();

      // UI cleanup
      setQ("");
      setSuggestions([]);
      setOpenDropdown(false);
    } catch (e: any) {
      setSuggestError(e?.message || "Failed to add product");
    }
  };

  // close dropdown on outside click
  const dropdownRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) setOpenDropdown(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Scan QR (server will spawn Python; works on local dev/kiosk server with camera)
  async function handleScanQR() {
    try {
      setScanBusy(true);
      setScanResult(null);
      const res = await fetch("/api/scan-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cameraIndex: 0,
          timeoutSec: 20,
          allergies,   // ← send allergy list to server
          thresh: 0.25,
          show: true,  // show OpenCV window locally
        }),
      });
      const j = await res.json();

      // If server gave matches, use them; else compute locally
      const ingredients: string[] = Array.isArray(j.ingredients) ? j.ingredients : [];
      const matches: MatchItem[] =
        Array.isArray(j.matches) && j.matches.length
          ? j.matches
          : computeMatchesLocal(ingredients, allergies, 0.25);

      setScanResult({ raw: j.raw, ingredients, matches });
    } catch (e: any) {
      setScanResult({ raw: e?.message || "Scan failed" });
    } finally {
      setScanBusy(false);
    }
  }

  const allergyHits = scanResult?.matches ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" aria-label="Back">
          <Link href="/provider">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{mealName}</h1>

        {/* Scan QR */}
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={allergyText}
            onChange={(e) => setAllergyText(e.target.value)}
            placeholder="Allergies (comma separated, e.g., milk, almond, gluten)"
            className="w-96"
          />
          <Button size="sm" onClick={handleScanQR} disabled={scanBusy}>
            {scanBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Scan QR
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* LEFT: Recipe */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Recipe
              <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                <Info className="w-3 h-3" />
                Type to search products and click to add
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search with dropdown */}
            <div className="relative" ref={dropdownRef}>
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products…"
                className="pl-8"
                autoComplete="off"
              />
              {openDropdown && (suggestLoading || suggestions.length || suggestError) ? (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-background shadow">
                  {suggestLoading ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                      Searching…
                    </div>
                  ) : suggestError ? (
                    <div className="px-3 py-2 text-sm text-red-600">{suggestError}</div>
                  ) : suggestions.length ? (
                    <ul className="max-h-64 overflow-auto">
                      {suggestions.map((p) => (
                        <li
                          key={p.id}
                          className="px-3 py-2 text-sm hover:bg-muted cursor-pointer flex items-center gap-2"
                          onClick={() => handlePick(p)}
                        >
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="w-8 h-8 object-cover rounded border"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded border bg-muted" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {p.brand || "—"}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Steps table */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Steps / Directions</div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Instruction</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
                          <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                          Loading recipe…
                        </TableCell>
                      </TableRow>
                    ) : recipeLines.length ? (
                      recipeLines.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs align-top">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{line}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
                          No recipe found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* QR Scan Result — shows ALLERGY HITS first */}
            {scanResult ? (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>QR Scan Result</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm font-medium">Allergy hits</div>
                    {allergies.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Add allergies above and scan again to see hits.
                      </div>
                    ) : allergyHits.length ? (
                      <ul className="list-disc pl-5 text-sm">
                        {allergyHits.map((m, i) => (
                          <li key={i}>
                            <span className="font-medium">{m.ingredient}</span>{" "}
                            <span className="text-muted-foreground">
                              matched <span className="font-medium">{m.match}</span>
                              {" "}({(m.score * 100).toFixed(0)}%)
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-green-700">No allergy hits detected.</div>
                    )}
                  </div>

                  {/* Collapsible full list */}
                  <div className="border rounded-md">
                    <button
                      type="button"
                      onClick={() => setShowAllIngs(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span>All scanned ingredients ({scanResult.ingredients?.length || 0})</span>
                      {showAllIngs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showAllIngs && (
                      <div className="px-3 pb-3">
                        {scanResult.ingredients?.length ? (
                          <ul className="list-disc pl-5 text-sm">
                            {scanResult.ingredients.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        ) : (
                          <div className="text-sm text-muted-foreground">No ingredients decoded.</div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </CardContent>
        </Card>

        {/* RIGHT: Ingredients + QR */}
        <div className="space-y-6">
          {/* Ingredients — EXACTLY as stored */}
          <Card>
            <CardHeader>
              <CardTitle>Ingredients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                  Loading ingredients…
                </div>
              ) : ingredientsRaw ? (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed">{ingredientsRaw}</pre>
              ) : (
                <div className="text-sm text-muted-foreground">No ingredients available.</div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                * Shown exactly as stored (no cleaning, no parsing).
              </div>
            </CardContent>
          </Card>

          {/* QR Code image */}
          <Card>
            <CardHeader>
              <CardTitle>QR Code</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                  Loading QR…
                </div>
              ) : qrUrl ? (
                <div className="flex flex-col items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${qrUrl}${qrUrl.includes("?") ? "&" : "?"}v=${Date.now()}`}
                    alt="QR"
                    className="w-48 h-48 object-contain border rounded-lg bg-white"
                  />
                  <Link
                    href={qrUrl}
                    target="_blank"
                    className="text-xs underline text-blue-600 truncate max-w-full"
                  >
                    Open image
                  </Link>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No QR generated yet.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
