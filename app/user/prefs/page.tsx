// app/user/prefs/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BottomNav from "@/components/BottomNav";
import { Plus, Pencil, X, Loader2 } from "lucide-react";

type PrefData = {
  allergens: string[];
  undesired: string[];
};

function splitCSV(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function joinCSV(arr: string[]): string {
  return arr.join(", ");
}

export default function UserPrefsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  const [data, setData] = React.useState<PrefData>({
    allergens: [],
    undesired: [],
  });

  const [addingBox, setAddingBox] =
    React.useState<"allergens" | "undesired" | null>(null);
  const [addValue, setAddValue] = React.useState("");
  const [editing, setEditing] = React.useState<{
    allergens: boolean;
    undesired: boolean;
  }>({
    allergens: false,
    undesired: false,
  });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/user-prefs", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!json?.ok) throw new Error(json?.error || "Failed to load");
        const row = (json.data ?? {}) as {
          allergens?: string | null;
          undesired?: string | null;
          updated_at?: string | null;
        };

        setData({
          allergens: splitCSV(row.allergens),
          undesired: splitCSV(row.undesired),
        });
        setSavedAt(row.updated_at ?? null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveToDB(next: PrefData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allergens: joinCSV(next.allergens),
          undesired: joinCSV(next.undesired),
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Failed to save");
      setSavedAt(json?.data?.updated_at ?? new Date().toISOString());
      setData(next);
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(kind: "allergens" | "undesired") {
    const raw = addValue.trim();
    if (!raw) return;

    const current = data[kind];
    const exists = current.some((v) => v.toLowerCase() === raw.toLowerCase());
    if (exists) {
      setAddValue("");
      setAddingBox(null);
      return;
    }

    const next: PrefData = { ...data, [kind]: [...current, raw] };
    await saveToDB(next);
    setAddValue("");
    setAddingBox(null);
  }

  async function handleRemove(kind: "allergens" | "undesired", value: string) {
    const nextList = data[kind].filter((v) => v !== value);
    const next: PrefData = { ...data, [kind]: nextList };
    await saveToDB(next);
  }

  const Box = ({
    title,
    kind,
  }: {
    title: string;
    kind: "allergens" | "undesired";
  }) => {
    const items = data[kind];
    const isEditing = editing[kind];

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddingBox((cur) => (cur === kind ? null : kind));
                  setAddValue("");
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
              <Button
                size="sm"
                variant={isEditing ? "default" : "outline"}
                onClick={() =>
                  setEditing((e) => ({ ...e, [kind]: !e[kind] }))
                }
              >
                <Pencil className="mr-2 h-4 w-4" />
                {isEditing ? "Done" : "Edit"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {addingBox === kind && (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                placeholder="Type a name and press Save"
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd(kind);
                }}
              />
              <Button onClick={() => handleAdd(kind)} disabled={!addValue.trim()}>
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setAddValue("");
                  setAddingBox(null);
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items yet.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {items.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
                >
                  {v}
                  {isEditing && (
                    <button
                      aria-label={`Remove ${v}`}
                      className="ml-1 rounded-full p-0.5 hover:bg-gray-100"
                      onClick={() => void handleRemove(kind, v)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="relative min-h-screen bg-gray-50 pb-20">
      {/* Шапка сверху — кликабельная и поверх всего */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b">
        <nav className="mx-auto flex h-14 items-center gap-1 px-3 text-sm">
          <Link href="/" className="hover:underline font-medium text-gray-900">
            Home
          </Link>
          <span className="px-1 text-gray-400">/</span>
          <span className="font-medium text-gray-900">Preferences</span>
          {saving && (
            <span className="ml-auto inline-flex items-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-md p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Add or remove items. Changes are saved immediately. Stored as comma-separated values.
        </p>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {savedAt && !error && (
          <div className="text-xs text-muted-foreground">
            Last saved: {new Date(savedAt).toLocaleString()}
          </div>
        )}

        <Box title="Allergens" kind="allergens" />
        <Box title="Undesired ingredients" kind="undesired" />

        {loading && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
      </main>

      {/* Нижняя навигация — не перекрывает шапку */}
      <BottomNav active="prefs" />
    </div>
  );
}
