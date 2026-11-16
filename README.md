# Salus: Food Ingredient Checker

Built at Hack the Change 2025 ([Devpost](https://devpost.com/software/salus-0bchx9)). Salus helps people with allergies or dietary restrictions check food before they eat it.

- **Users** save their allergens and ingredients they want to avoid, then scan a product barcode or a menu item's QR code. The app looks up the ingredients and flags anything on their list, along with whether the item is vegan or vegetarian.
- **Food facilities** add their menu items and recipes, and the app generates a QR code for each item that customers can scan.

## How it works

- **Front end:** Next.js (App Router) + TypeScript, Tailwind CSS and shadcn/ui components. Separate views for users (`/user`) and facilities (`/provider`).
- **API routes** (`app/api/*`) handle scanning, product search, menu items and user preferences.
- **Scanning:** the API calls Python scripts in `scripts/` that read barcodes and QR codes from the camera with OpenCV and pyzbar.
- **Product data:** barcodes are looked up in the [Open Food Facts](https://world.openfoodfacts.org/) database. Ingredients are matched against the user's list with TF-IDF similarity (scikit-learn), so near-matches such as "whey protein" vs. "milk" can still be flagged.
- **Storage:** Supabase (Postgres + storage bucket for QR codes).

## Running locally

Requirements: Node.js 20+, Python 3.12, a webcam, and a Supabase project.

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python pyzbar numpy scikit-learn openfoodfacts supabase qrcode
```

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_QR_BUCKET=...
PYTHON_BIN=.venv/bin/python   # optional
```

Then run `npm run dev` and open http://localhost:3000.
