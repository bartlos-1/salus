import time
import cv2
from pyzbar.pyzbar import decode, ZBarSymbol
from collections import deque
import openfoodfacts
def normalize_barcode(code):
    dq = deque()
    dq.append(code)

    if len(code) < 8:
        while len(dq) <8 :
            dq.appendleft("0")   

    elif len(code) > 8 and len(code) < 13:
        while len(dq) <8 :
            dq.appendleft("0")  
    s = "".join(dq)
    return s

def get_data(api, code):
    # ask the API to include attribute groups (and attributes if available)
    fields = [
        "code", "product_name", "ingredients_text", "brands",
        "environment_impact_level", "allergens", "ingredients_analysis",
        "packaging", "additives",
        "attribute_groups_en",   # localized groups (common)
        "attribute_groups",      # fallback name some products use
        "attributes",
        "nova_groups_tags",           # flat attributes (some endpoints/clients expose this)
    ]
    return api.product.get(code, fields=fields)

def get_ingredients(data):
    if "ingredients_text" not in data:
        cleaned = data["product_name"]
    else:
        raw = data["ingredients_text"]
        cleaned = [x.strip() for x in raw.split(",")]
    return cleaned

def organize_data(data):
    ingredients = get_ingredients(data)
    name = data["product_name"]
    brand = data["brands"]
    nova_tag = humanize_tags(data["nova_groups_tags"])
    product = {"ingredients" : ingredients, "name" : name, "brand" : brand, "nova" : nova_tag}
    return product 

def humanize_tags(tags):

    if tags is None:
        return ""
    if isinstance(tags, str):
        tags = [tags]

    SMALL = {"and", "or", "of", "the", "in", "to", "for", "a", "an"}

    def title_case(s: str) -> str:
        words = s.split()
        return " ".join(w.capitalize() if w not in SMALL else w for w in words)

    def format_one(tag: str) -> str:
        # drop language prefix like "en:"
        if ":" in tag:
            _, tag = tag.split(":", 1)
        tag = tag.strip()

        # if starts with a number, treat as NOVA level
        parts = tag.split("-", 1)
        if parts and parts[0].isdigit():
            num = parts[0]
            rest = parts[1] if len(parts) > 1 else ""
            label = rest.replace("-", " ").strip()
            return f"NOVA {num} — {title_case(label)}" if rest else f"NOVA {num}"
        # fallback: just prettify hyphenated text
        return title_case(tag.replace("-", " "))

    return ", ".join(format_one(t) for t in tags if t)

def scan_loop(
    camera_index: int = 0,
    wanted: list[ZBarSymbol] | None = None,  # e.g. [ZBarSymbol.EAN13, ZBarSymbol.UPCA, ZBarSymbol.QRCODE]
    timeout_sec: float | None = 15.0,        # None = no timeout
    show_window: bool = True,
    normalize_upc_to_ean13: bool = True,     # prefix 0 for UPC-A (12→13 digits)
):
    """
    Opens the webcam, returns (code_text, code_type) on first successful read.
    Returns None on timeout or if user presses 'q'.
    """
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera {camera_index}")

    # (Optional) make barcodes easier to read
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    start = time.time()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                if show_window:
                    cv2.waitKey(1)
                continue

            results = decode(frame, symbols=wanted) if wanted else decode(frame)
            if results:
                r = results[0]  # take the first detection
                text = r.data.decode("utf-8", "ignore")
                typ  = r.type  # e.g., 'EAN13', 'UPCA', 'QRCODE'

                if normalize_upc_to_ean13 and typ == "UPCA" and len(text) == 12:
                    text = text.zfill(13)  # UPC-A => EAN-13 with leading zero

                if show_window:
                    x, y, w, h = r.rect
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (0,255,0), 2)
                    cv2.putText(frame, f"{typ}: {text}", (x, max(0, y-8)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
                    cv2.imshow("scan_once (press q to cancel)", frame)
                    # brief pause to show the read, then return
                    cv2.waitKey(300)

                return text, typ

            if show_window:
                cv2.imshow("scan_once (press q to cancel)", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    return None

            if timeout_sec is not None and (time.time() - start) > timeout_sec:
                return None
    finally:
        cap.release()
        if show_window:
            cv2.destroyAllWindows()

def run_scanner():
    api = openfoodfacts.API(user_agent="MyAwesomeApp/1.0")
    wanted = [ZBarSymbol.EAN13, ZBarSymbol.UPCA, ZBarSymbol.UPCE, ZBarSymbol.CODE128, ZBarSymbol.QRCODE]
    result = scan_loop(camera_index=0, wanted=wanted, timeout_sec=20)

    if result:
        code_text, code_type = result
        print("Scanned:", code_type, code_text)
        data_scanned = get_data(api, normalize_barcode(code_text))
        product = organize_data(data_scanned)
    else:
        print("No code read (timeout or canceled).")
    
    return product

