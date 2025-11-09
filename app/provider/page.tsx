// app/provider/page.tsx
"use client";

import * as React from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { useRouter } from "next/navigation";
import { Download, Edit3, LogOut, Search, Filter as FilterIcon, Plus } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

type Category = "All" | "Breakfast" | "Lunch" | "Dinner" | "Snacks";

type MenuItem = {
  id: string;
  name: string;
  lastEdited: string;
  thumbnail?: string | null;
  description?: string | null;
  category: Exclude<Category, "All">;
};

type ApiMenuItem = Record<string, unknown>;

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: string }).message;
    if (typeof m === "string") return m;
  }
  return "Failed to load menu.";
}

function coerceMenuItem(r: ApiMenuItem): MenuItem {
  const id = String(r.id ?? "");
  const name = String(r.name ?? "");

  const catRaw = typeof r.category === "string" ? r.category : "";
  let category: Exclude<Category, "All"> = "Lunch";
  if (catRaw === "Breakfast" || catRaw === "Lunch" || catRaw === "Dinner" || catRaw === "Snacks") {
    category = catRaw;
  }

  const thumbnail =
    typeof r.thumbnail === "string" ? r.thumbnail : r.thumbnail == null ? null : String(r.thumbnail);

  const description =
    typeof r.description === "string" ? r.description : r.description == null ? null : String(r.description);

  const lastEditedSrc =
    typeof r.lastEdited === "string"
      ? r.lastEdited
      : typeof r.updated_at === "string"
      ? r.updated_at
      : new Date().toISOString();

  return {
    id,
    name,
    category,
    thumbnail,
    description,
    lastEdited: String(lastEditedSrc),
  };
}

export default function ProviderPage() {
  const router = useRouter();

  const [query, setQuery] = React.useState<string>("");
  const [category, setCategory] = React.useState<Category>("All");
  const [selectMode, setSelectMode] = React.useState<boolean>(false);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Add Meal modal state
  const [addOpen, setAddOpen] = React.useState(false);
  const [addSubmitting, setAddSubmitting] = React.useState(false);
  const [addErr, setAddErr] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<{
    name: string;
    category: Exclude<Category, "All"> | "";
    description: string;
    thumbnail: string;
  }>({ name: "", category: "", description: "", thumbnail: "" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/menu-items", { cache: "no-store" });
        const json = (await res.json()) as unknown;

        if (cancelled) return;

        if (!json || typeof json !== "object" || !("items" in json)) {
          throw new Error("Invalid response.");
        }

        const j = json as { items?: unknown; error?: unknown };

        if (j.error) throw new Error(String(j.error));

        const rawArr: ApiMenuItem[] = Array.isArray(j.items) ? (j.items as ApiMenuItem[]) : [];
        const mapped: MenuItem[] = rawArr.map((r: ApiMenuItem) => coerceMenuItem(r));
        setItems(mapped);
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories: Category[] = React.useMemo(() => {
    const uniq = Array.from(new Set(items.map((i) => i.category))) as Exclude<Category, "All">[];
    return ["All", ...uniq];
  }, [items]);

  const filtered: MenuItem[] = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      const matchesQ =
        !q || it.name.toLowerCase().includes(q) || (it.description ?? "").toLowerCase().includes(q);
      const matchesC = category === "All" || it.category === category;
      return matchesQ && matchesC;
    });
  }, [items, query, category]);

  const selectedIds = React.useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  const anySelected = selectedIds.length > 0;
  const allOnPageSelected = filtered.length > 0 && filtered.every((it) => selected[it.id]);

  const toggleSelectAllOnPage = () => {
    const next = { ...selected };
    if (allOnPageSelected) {
      filtered.forEach((it) => {
        next[it.id] = false;
      });
    } else {
      filtered.forEach((it) => {
        next[it.id] = true;
      });
    }
    setSelected(next);
  };

  const toggleOne = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleEdit = (id: string, name: string) => {
    router.push(`/provider/item_details?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`);
  };

  const handleDownloadOne = (id: string) => console.log("download one", id);
  const handleDownloadSelected = () => console.log("bulk download", selectedIds);
  const handleLogout = () => console.log("logout");

  // ----- Add Meal handlers -----
  const resetForm = () =>
    setForm({ name: "", category: "", description: "", thumbnail: "" });

  const submitAdd = async () => {
    try {
      setAddErr(null);
      if (!form.name.trim()) {
        setAddErr("Name is required.");
        return;
      }
      if (!form.category) {
        setAddErr("Category is required.");
        return;
      }

      setAddSubmitting(true);

      // POST to your existing API
      const res = await fetch("/api/menu-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim() || null,
          thumbnail: form.thumbnail.trim() || null,
        }),
      });

      const data = (await res.json()) as unknown;

      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data
            ? String((data as any).error)
            : "Failed to create meal.";
        throw new Error(msg);
      }

      // Expect either the created item in `item` or the whole row back.
      let created: ApiMenuItem | null = null;
      if (data && typeof data === "object" && "item" in data) {
        created = (data as any).item as ApiMenuItem;
      } else if (data && typeof data === "object") {
        // some backends return the row directly
        created = data as ApiMenuItem;
      }

      if (!created) {
        // Fallback: refetch list
        const ref = await fetch("/api/menu-items", { cache: "no-store" });
        const j = await ref.json();
        const rawArr: ApiMenuItem[] = Array.isArray(j.items) ? (j.items as ApiMenuItem[]) : [];
        setItems(rawArr.map(coerceMenuItem));
      } else {
        // Optimistic append
        setItems((prev) => [coerceMenuItem(created as ApiMenuItem), ...prev]);
      }

      resetForm();
      setAddOpen(false);
    } catch (e: unknown) {
      setAddErr(getErrorMessage(e));
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 p-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Restaurant Name</h1>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b pb-4">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder="Search menu items…"
              className="pl-8 w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <FilterIcon className="w-4 h-4 text-muted-foreground" />
            <Select value={category} onValueChange={(value: Category) => setCategory(value)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add meal button */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
            <Button
                size="sm"
                className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
                <Plus className="w-4 h-4 mr-2" />
                Add meal
            </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a new meal</DialogTitle>
                <DialogDescription>Provide basic info to create a menu item.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="meal-name">Name *</Label>
                  <Input
                    id="meal-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Chicken Caesar Wrap"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Category *</Label>
                  <Select
                    value={form.category || undefined}
                    onValueChange={(v: Exclude<Category, "All">) =>
                      setForm((f) => ({ ...f, category: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Breakfast">Breakfast</SelectItem>
                      <SelectItem value="Lunch">Lunch</SelectItem>
                      <SelectItem value="Dinner">Dinner</SelectItem>
                      <SelectItem value="Snacks">Snacks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="meal-desc">Description</Label>
                  <Textarea
                    id="meal-desc"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Short summary, highlights, etc."
                    rows={3}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="thumb-url">Thumbnail URL</Label>
                  <Input
                    id="thumb-url"
                    value={form.thumbnail}
                    onChange={(e) => setForm((f) => ({ ...f, thumbnail: e.target.value }))}
                    placeholder="https://…"
                  />
                  {form.thumbnail && (
                    <div className="mt-2">
                      <div className="w-32 h-20 rounded border overflow-hidden bg-muted flex items-center justify-center">
                        {/* Safe preview */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={form.thumbnail}
                          alt="preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {addErr && <p className="text-sm text-red-600">{addErr}</p>}
              </div>

              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={addSubmitting} onClick={resetForm}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button onClick={submitAdd} disabled={addSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {addSubmitting ? "Saving…" : "Save meal"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Download & Select toggles */}
          <Button
            variant="outline"
            size="sm"
            disabled={!anySelected}
            onClick={handleDownloadSelected}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={selectMode} onCheckedChange={(v: CheckedState) => setSelectMode(v === true)} />
            Select
          </label>
        </div>

        {loading && <div className="text-sm text-muted-foreground">Loading menu…</div>}
        {error && <div className="text-sm text-red-600">Error: {error}</div>}

        {selectMode && !loading && filtered.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox checked={allOnPageSelected} onCheckedChange={() => toggleSelectAllOnPage()} />
            <span className="text-sm text-muted-foreground">Select all on page</span>
            {anySelected && <span className="text-sm text-muted-foreground">({selectedIds.length} selected)</span>}
          </div>
        )}

        {/* Grid */}
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {!loading &&
            filtered.map((it) => (
              <Card key={it.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-semibold">
                      {it.name}
                      <div className="text-xs font-normal text-muted-foreground">
                        last edited {new Date(it.lastEdited).toLocaleDateString()}
                      </div>
                    </CardTitle>
                    <div className="w-20 h-16 bg-muted rounded border overflow-hidden flex items-center justify-center">
                      {it.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.thumbnail} alt={`${it.name} photo`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">PIC</span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-2">
                  {it.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{it.description}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                        onClick={() => handleEdit(it.id, it.name)}
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit
                      </Button>

                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleDownloadOne(it.id)}
                        aria-label="Download item"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>

                    <span className="text-xs px-2 py-1 rounded border text-muted-foreground">{it.category}</span>

                    {selectMode && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={!!selected[it.id]} onCheckedChange={() => toggleOne(it.id)} />
                        <span className="hidden sm:inline">Select</span>
                      </label>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        {!loading && filtered.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-16 border rounded-lg">
            No items match your filters.
          </div>
        )}
      </div>
    </Layout>
  );
}
