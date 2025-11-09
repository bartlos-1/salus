// components/Layout.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  Utensils,
  Package,
  ChevronLeft,
} from "lucide-react";

type LayoutProps = { children: React.ReactNode };

// элемент навигации
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const NAV: NavItem[] = [
  { href: "/provider", label: "Menu", icon: Utensils },
  { href: "/provider/products", label: "Products", icon: Package },
];

export default function Layout({ children }: LayoutProps) {
  // безопасная инициализация (сохранение состояния панели)
  const [open, setOpen] = React.useState<boolean>(true);
  React.useEffect(() => {
    const saved = localStorage.getItem("sb-open");
    if (saved === "0" || saved === "1") setOpen(saved === "1");
  }, []);
  React.useEffect(() => {
    localStorage.setItem("sb-open", open ? "1" : "0");
  }, [open]);

  const pathname = usePathname();

  // простые "хлебные крошки" из url
  const crumbs = React.useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const acc: { href: string; label: string }[] = [];
    parts.reduce((prev, cur) => {
      const href = `/${[...prev, cur].join("/")}`;
      acc.push({ href, label: decodeURIComponent(cur) });
      return [...prev, cur];
    }, [] as string[]);
    return acc;
  }, [pathname]);

  return (
    <div className="min-h-screen flex bg-gray-50 text-gray-900">
      {/* Мобильный фон */}
      <div
        className={`fixed inset-0 bg-black/40 lg:hidden transition-opacity ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Сайдбар */}
      <aside
        className={[
          "z-20 flex flex-col bg-white border-r border-gray-200 shadow-sm",
          "transition-[width,transform] duration-200 ease-out",
          open ? "w-64" : "w-16",
          open ? "translate-x-0" : "-translate-x-full",
          "fixed inset-y-0 left-0 lg:translate-x-0 lg:static",
        ].join(" ")}
        aria-label="Sidebar"
      >
        {/* Шапка сайдбара */}
        <div className="h-14 flex items-center justify-between px-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <Image
                src="/salus_shield_barcode.png"
                alt="Salus logo"
                width={24}
                height={24}
                priority
                className="h-6 w-6 flex-none"
            />

            <span
              className={`font-semibold transition-opacity ${open ? "opacity-100" : "opacity-0 lg:opacity-0"}`}
            >
              SALUS
            </span>
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
            aria-expanded={open}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            className="inline-flex items-center justify-center size-8 rounded-md hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-600"
            >
            <svg
                viewBox="0 0 24 24"
                className={`w-4 h-4 transition-transform ${open ? "" : "rotate-180"}`}
            >
                {/* треугольник, окрашивается в currentColor = text-indigo-600 */}
                <polygon points="15,12 9,6 9,18" fill="currentColor" />
            </svg>
            </button>

        </div>

        {/* Навигация */}
        <nav className="mt-2 flex-1 overflow-y-auto">
          <ul className="px-2 space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href || (href !== "/provider" && pathname.startsWith(href));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={!open ? label : undefined}
                    className={[
                      "group relative flex items-center gap-3 rounded-md px-2 py-2",
                      active
                        ? "bg-indigo-50 text-indigo-700"
                        : "hover:bg-gray-100 text-gray-700",
                    ].join(" ")}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span
                      className={`truncate transition-opacity duration-150 ${open ? "opacity-100" : "opacity-0 lg:opacity-0"}`}
                      aria-hidden={!open}
                    >
                      {label}
                    </span>

                    {/* Тултип при свёрнутой панели */}
                    {!open && (
                      <span className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 hidden rounded bg-gray-800 px-2 py-1 text-xs text-white group-hover:block">
                        {label}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

       
      </aside>

      {/* Основная область */}
      <div className="flex-1 lg:pl-0">
        <header className="h-14 flex items-center justify-between gap-3 px-3 border-b bg-white sticky top-0 z-10">
          {/* Кнопка открытия на мобильном */}
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden inline-flex items-center justify-center size-9 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Open sidebar"
          >
            <div className="w-4 h-0.5 bg-gray-800 relative before:content-[''] before:block before:w-4 before:h-0.5 before:bg-gray-800 before:absolute before:-translate-y-2 after:content-[''] after:block after:w-4 after:h-0.5 after:bg-gray-800 after:absolute after:translate-y-2" />
          </button>

          {/* Хлебные крошки */}
          <nav className="flex items-center gap-1 text-sm text-gray-600">
            <Link href="/" className="hover:underline">
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
          </nav>
        </header>

        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}
