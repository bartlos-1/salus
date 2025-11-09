// app/provider/products/page.tsx
"use client";
import * as React from "react";
import { Plus, Loader2, Camera, Barcode } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  ingredients: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ApiListResponse = { items: Product[] };
type ApiError = { error: string };

type ScanResponse = {
  ok?: boolean;
  cancelled?: boolean;
  name?: string;
  brand?: string;
  image_url?: string | null;
  ingredients?: string | string[];
  logs?: string; // from wrapper for debugging/cancel case
};

/* ---------- Type guards & utils ---------- */

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

function isApiListResponse(x: unknown): x is ApiListResponse {
  return isRecord(x) && Array.isArray((x as any).items);
}

function isApiError(x: unknown): x is ApiError {
  return isRecord(x) && typeof (x as any).error === "string";
}

function isScanResponse(x: unknown): x is ScanResponse {
  if (!isRecord(x)) return false;
  const f = x as Record<string, unknown>;
  const ok =
    (f.ok === undefined || typeof f.ok === "boolean") &&
    (f.cancelled === undefined || typeof f.cancelled === "boolean") &&
    (f.name === undefined || typeof f.name === "string") &&
    (f.brand === undefined || typeof f.brand === "string") &&
    (f.image_url === undefined || typeof f.image_url === "string" || f.image_url === null) &&
    (f.logs === undefined || typeof f.logs === "string") &&
    (
      f.ingredients === undefined ||
      typeof f.ingredients === "string" ||
      Array.isArray(f.ingredients)
    );
  return ok;
}

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && typeof err.message === "string") return err.message;
  if (isRecord(err) && typeof (err as any).message === "string") return (err as any).message;
  return "Unexpected error";
}

function normalizeIngredients(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean).join(", ");
  }
  return "";
}

/* ---------- Page ---------- */

export default function ProductsPage() {
  /* Data state */
  const [items, setItems] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  /* Modal state */
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  /* Scan/lookup state */
  const [scanning, setScanning] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [barcode, setBarcode] = React.useState<string>(""); // manual barcode

  /* Form state */
  const [name, setName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [ingredients, setIngredients] = React.useState("");

  /* Fetch list */
  const fetchProducts = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/products", { cache: "no-store" });
      const json: unknown = await res.json();
      if (!isApiListResponse(json)) {
        const msg = isApiError(json) ? json.error : "Invalid response from /api/products";
        throw new Error(msg);
      }
      setItems(json.items);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  /* Helpers */
  const resetForm = () => {
    setName("");
    setBrand("");
    setImageUrl("");
    setIngredients("");
    setBarcode("");
    setScanError(null);
    setScanning(false);
  };

  // Robust scan that surfaces wrapper logs/errors and normalizes fields
  const handleScan = async (code?: string) => {
    try {
      setScanning(true);
      setScanError(null);

      const hasBarcode = typeof code === "string" && code.trim().length > 0;
      const init: RequestInit = hasBarcode
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcode: code.trim() }),
          }
        : { method: "POST" };

      const res = await fetch("/api/scan", init);
      const raw: unknown = await res.json().catch(() => ({}));
      console.log("scan result:", raw); // <-- keep for visibility

      if (!isScanResponse(raw)) {
        const msg = isApiError(raw) ? raw.error : "Invalid scan response";
        throw new Error(msg);
      }

      if (!res.ok || raw.ok === false) {
        // show server error or wrapper logs if present
        const msg = (raw as any).error || raw.logs || (hasBarcode ? "Lookup failed" : "Scan failed");
        throw new Error(String(msg));
      }

      if (raw.cancelled) {
        // Make cancel visible so "nothing happens" never occurs again
        setScanError(raw.logs ? `Scan cancelled. Logs: ${raw.logs}` : "Scan cancelled.");
        return;
      }

      if (typeof raw.name === "string") setName(raw.name);
      if (typeof raw.brand === "string") setBrand(raw.brand);
      if (typeof raw.image_url === "string") setImageUrl(raw.image_url || "");
      setIngredients(normalizeIngredients(raw.ingredients));
    } catch (e: unknown) {
      setScanError(getErrorMessage(e));
    } finally {
      setScanning(false);
    }
  };

  const handleCreate = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const body = {
        name: name.trim(),
        brand: brand.trim() || null,
        image_url: imageUrl.trim() || null,
        ingredients, // keep raw text
      };
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw: unknown = await res.json().catch(() => ({}));
      if (res.status >= 400) {
        const msg = isApiError(raw) ? raw.error : "Failed to create product";
        throw new Error(msg);
      }

      setOpen(false);
      resetForm();
      await fetchProducts();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // Enter triggers manual lookup
  const onBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && barcode.trim()) {
      e.preventDefault();
      void handleScan(barcode.trim());
    }
  };

  /* View */

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Restaurant Products</h1>

          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm focus-visible:ring-indigo-500"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add product
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add product</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3">
                {/* scan/lookup row */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => handleScan()}
                      disabled={scanning}
                    >
                      {scanning ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4 mr-2" />
                      )}
                      {scanning ? "Scanning…" : "Scan with camera"}
                    </Button>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Barcode className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" />
                        <Input
                          value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          onKeyDown={onBarcodeKeyDown}
                          placeholder="Enter barcode (UPC/EAN)"
                          className="pl-8 w-56"
                          inputMode="numeric"
                          autoCapitalize="off"
                          autoCorrect="off"
                        />
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => handleScan(barcode)}
                        disabled={scanning || barcode.trim().length === 0}
                      >
                        {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Lookup
                      </Button>
                    </div>
                  </div>

                  {scanError ? (
                    <span className="text-xs text-red-600">
                      {scanError}
                    </span>
                  ) : null}
                </div>

                {/* FORM FIELDS */}
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Product name"
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium">Brand</label>
                  <Input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g., Heinz"
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium">Picture URL</label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium">Ingredients (raw text)</label>
                  <Textarea
                    value={ingredients}
                    onChange={(e) => setIngredients(e.target.value)}
                    placeholder="Paste ingredients exactly as printed on the product"
                    rows={5}
                  />
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={submitting || scanning}
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleCreate}
                  disabled={submitting || scanning || name.trim().length === 0}
                  className="
                    bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm
                    focus-visible:ring-indigo-500
                    disabled:bg-indigo-300 disabled:hover:bg-indigo-300 disabled:text-white disabled:opacity-70
                  "
                >
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* List label */}
        <div className="text-sm text-muted-foreground">List of products</div>

        {/* Loading / Error */}
        {loading && (
          <div className="text-sm text-muted-foreground">
            <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
            Loading products…
          </div>
        )}

        {error && <div className="text-sm text-red-600">Error: {error}</div>}

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]">Name</TableHead>
                <TableHead className="w-[18%]">Brand</TableHead>
                <TableHead className="w-[20%]">Picture</TableHead>
                <TableHead>Ingredients</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {!loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No products yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.updated_at ? new Date(p.updated_at).toLocaleString() : ""}
                      </div>
                    </TableCell>

                    <TableCell className="align-top">{p.brand ?? "-"}</TableCell>

                    <TableCell className="align-top">
                      {p.image_url ? (
                        <div className="w-28 h-20 rounded border overflow-hidden bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No image</span>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      {p.ingredients ? (
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
                          {p.ingredients}
                        </pre>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
