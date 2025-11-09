# scripts/qr_gen.py
import os
import re
import io
import uuid
from typing import List
import qrcode
from supabase import create_client, Client
from storage3.exceptions import StorageApiError


SUPABASE_URL = "https://mrvegezhjtkfhstakflq.supabase.co/"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ydmVnZXpoanRrZmhzdGFrZmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2Mjk5MzYsImV4cCI6MjA3ODIwNTkzNn0.2HbeC89enstdvS53CAbQ7T--JyJMvBgTkL6BsZwv7ko"

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


BUCKET_NAME = "qr-codes"
BUCKET_FOLDER = "generated"
PUBLIC_BUCKET = True         


UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b"
)

def normalize_uuid(s: str) -> str:
    """Extract and normalize the first valid UUID from a string."""
    m = UUID_RE.search(str(s))
    if not m:
        raise ValueError(f"Invalid UUID: {s!r}")
    return str(uuid.UUID(m.group(0)))

def fetch_recipe(menu_item_id: str) -> List[str]:
    """
    Read meal_details.recipe by menu_item_id.
    Assumes 'recipe' is a newline-delimited TEXT with product names per line.
    """
    rid = normalize_uuid(menu_item_id)
    resp = (
        supabase.table("meal_details")
        .select("recipe")
        .eq("menu_item_id", rid)
        .limit(1)                 
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return []

    raw = (rows[0] or {}).get("recipe") or ""
    lines: List[str] = []
    for line in str(raw).splitlines():
        line = line.strip()
        if not line:
            continue
        cleaned = re.sub(r"^[-–\u2013]\s*|\s*\([^)]*\)\s*$", "", line).strip()
        if cleaned:
            lines.append(cleaned)
    return lines

def _split_ingredients_csv(s: str) -> List[str]:
    """Split comma-delimited ingredients stored as a plain CSV string."""
    if not s:
        return []
    return [p.strip() for p in str(s).split(",") if p.strip()]

def fetch_items(product_name: str) -> List[str]:
    """
    Get products.ingredients for exact name match.
    Table: products(name TEXT, ingredients TEXT(CSV))
    """
    resp = (
        supabase.table("products")
        .select("ingredients")
        .eq("name", product_name)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return []
    ing_str = (rows[0] or {}).get("ingredients") or ""
    return _split_ingredients_csv(ing_str)

def compute_recipe(menu_item_id: str) -> List[str]:
    """Expand recipe (product names) into a unique, ordered list of ingredient strings."""
    product_names = fetch_recipe(menu_item_id)
    out: List[str] = []
    seen = set()
    for name in product_names:
        for ing in fetch_items(name):
            if ing not in seen:
                seen.add(ing)
                out.append(ing)
    return out

def _make_qr_png_bytes(text: str) -> bytes:
    """Create a QR PNG (as bytes) from the given text."""
    qr = qrcode.QRCode(border=2, box_size=10)
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def upload_qr_to_supabase(png_bytes: bytes, filename: str) -> str:
    path = f"{BUCKET_FOLDER}/{filename}" if BUCKET_FOLDER else filename

    # Try overwrite (PUT). Needs UPDATE policy.
    try:
        supabase.storage.from_(BUCKET_NAME).update(
            path=path,
            file=png_bytes,
            file_options={
                "contentType": "image/png",
                "cacheControl": "3600",
            },
        )
    except StorageApiError as e:
        # If the object doesn't exist yet, do a fresh upload (POST). Needs INSERT policy.
        status = getattr(e, "status_code", None) or getattr(e, "status", None)
        if status in (404,):
            supabase.storage.from_(BUCKET_NAME).upload(
                path=path,
                file=png_bytes,
                file_options={
                    "contentType": "image/png",
                    "cacheControl": "3600",
                },
            )
        else:
            raise

    # Return URL
    if PUBLIC_BUCKET:
        return supabase.storage.from_(BUCKET_NAME).get_public_url(path)
    else:
        signed = supabase.storage.from_(BUCKET_NAME).create_signed_url(path, expires_in=3600)
        return signed["signed_url"]

def save_meal_ingredients_json(menu_item_id: str, ingredients: list[str]) -> None:
    """Upsert JSON array into meal_details.ingredients keyed by menu_item_id."""
    rid = normalize_uuid(menu_item_id)
    data = {"menu_item_id": rid, "ingredients": ingredients}
    # Upsert so it works whether the row exists or not
    supabase.table("meal_details").upsert(data, on_conflict="menu_item_id").execute()

def generate_qr_for_menu_item(menu_item_id: str) -> str:
    ingredients = compute_recipe(menu_item_id)

    # 1) save computed ingredients to DB (as JSON array)
    save_meal_ingredients_json(menu_item_id, ingredients)

    # 2) build QR payload in your preferred format
    payload = "[" + ", ".join(repr(s) for s in ingredients) + "]"  # looks like ['a','b','c']
    png = _make_qr_png_bytes(payload)

    fname = f"{normalize_uuid(menu_item_id)}.png"
    return upload_qr_to_supabase(png, filename=fname)

# project/scripts/qr_gen.py  (only show the bottom part)
if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 2:
        MENU_ITEM_ID = sys.argv[1]
        try:
            url = generate_qr_for_menu_item(MENU_ITEM_ID)
            # print only the URL for the Node API (no prefixes)
            print(url)
        except Exception as e:
            # print error to stdout so API can return it
            print(f"ERROR: {e}")
            sys.exit(1)
    else:
        # fallback for local testing
        MENU_ITEM_ID = "b80e4fc9-2889-4355-b109-990df7ec24e0"
        print(generate_qr_for_menu_item(MENU_ITEM_ID))







