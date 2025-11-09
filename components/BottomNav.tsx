// components/BottomNav.tsx
"use client";

import Link from "next/link";
import { Camera, SlidersHorizontal } from "lucide-react";

type Props = { active?: "scan" | "prefs" };

export default function BottomNav({ active = "scan" }: Props) {
  const base =
    "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm transition-colors";
  const activeCls = "text-indigo-700 font-semibold";
  const idleCls = "text-gray-600 hover:text-gray-900";

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-md items-center px-2">
        <Link
          href="/user"
          aria-current={active === "scan" ? "page" : undefined}
          className={`${base} ${active === "scan" ? activeCls : idleCls}`}
        >
          <Camera className="h-4 w-4" />
          <span>scan</span>
        </Link>

        <Link
          href="/user/prefs"
          aria-current={active === "prefs" ? "page" : undefined}
          className={`${base} ${active === "prefs" ? activeCls : idleCls}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>pref</span>
        </Link>
      </div>
    </nav>
  );
}
