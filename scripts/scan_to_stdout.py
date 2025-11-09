# scripts/scan_to_stdout.py
import json
import sys
import os
import importlib.util
import io
import contextlib

def _import_scanner():
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "scanner.py"),
        os.path.join(here, "..", "scripts", "scanner.py"),
        os.path.join(here, "..", "python", "scanner.py"),
        os.path.join(here, "..", "scanner.py"),
    ]
    for path in candidates:
        path = os.path.abspath(path)
        if os.path.isfile(path):
            spec = importlib.util.spec_from_file_location("scanner", path)
            mod = importlib.util.module_from_spec(spec)
            assert spec.loader is not None
            spec.loader.exec_module(mod)
            return mod

    # fallback на обычные импорты
    try:
        import scanner  # type: ignore
        return scanner
    except Exception:
        pass
    try:
        from scripts import scanner as scanner_pkg  # type: ignore
        return scanner_pkg
    except Exception:
        pass

    raise ModuleNotFoundError("scanner.py not found near scripts/ or project root")

try:
    scanner = _import_scanner()
except Exception as e:
    # В stdout — только JSON!
    print(json.dumps({"error": f"cannot import scanner.py: {e}"}), end="")
    sys.exit(1)


def to_str_ingredients(ing):
    if ing is None:
        return None
    if isinstance(ing, list):
        return ", ".join([str(x) for x in ing if x is not None])
    return str(ing)


def main():
    # Перехватываем любые print из scanner.run_scanner()
    captured_out = io.StringIO()
    product = None
    try:
        with contextlib.redirect_stdout(captured_out):
            product = scanner.run_scanner()  # ожидается dict: name/brand/ingredients
    except Exception as e:
        # Логи — в stderr, чтобы не ломать парсинг stdout
        print(f"[scan_to_stdout] scanner.run_scanner() error: {e}", file=sys.stderr)
        print(json.dumps({"error": str(e)}), end="")
        return

    # Если scanner что-то напечатал — отправим это в stderr, не в stdout
    logs = captured_out.getvalue()
    if logs.strip():
        print(f"[scanner logs]\n{logs}", file=sys.stderr)

    try:
        if not product:
            # Пользователь отменил или таймаут — отдаем чистый JSON без лишних строк
            print(json.dumps({"cancelled": True}, ensure_ascii=False), end="")
            return

        name = (product.get("name") or "").strip()
        brand = (product.get("brand") or "").strip()
        ingredients_raw = to_str_ingredients(product.get("ingredients"))

        out = {
            "name": name,
            "brand": brand,
            "ingredients": ingredients_raw,  # строка для textarea
            "image_url": product.get("image_url") if isinstance(product, dict) else None,
        }
        # В stdout — только JSON, без \n в конце (на всякий случай)
        print(json.dumps(out, ensure_ascii=False), end="")
    except Exception as e:
        print(json.dumps({"error": str(e)}), end="")


if __name__ == "__main__":
    main()
