# project/scripts/qr_scanner.py
import time, json, ast, argparse
import cv2
from pyzbar.pyzbar import decode, ZBarSymbol
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

def scan_loop(
    camera_index: int = 0,
    wanted: list[ZBarSymbol] | None = None,
    timeout_sec: float | None = 15.0,
    show_window: bool = True,
    normalize_upc_to_ean13: bool = True,
):
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera {camera_index}")

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
                r = results[0]
                text = r.data.decode("utf-8", "ignore")
                typ  = r.type
                if normalize_upc_to_ean13 and typ == "UPCA" and len(text) == 12:
                    text = text.zfill(13)

                if show_window:
                    x, y, w, h = r.rect
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (0,255,0), 2)
                    cv2.putText(frame, f"{typ}: {text}", (x, max(0, y-8)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
                    cv2.imshow("scan_qr (press q to cancel)", frame)
                    cv2.waitKey(300)
                return text

            if show_window:
                cv2.imshow("scan_qr (press q to cancel)", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    return None

            if timeout_sec is not None and (time.time() - start) > timeout_sec:
                return None
    finally:
        cap.release()
        if show_window:
            cv2.destroyAllWindows()

def match_allergies(allergies, ingredients, thresh=0.25):
    allergies = [str(a).strip() for a in allergies if str(a).strip()]
    ingredients = [str(i).strip() for i in ingredients if str(i).strip()]
    if not allergies or not ingredients:
        return []

    vect = TfidfVectorizer(lowercase=True, token_pattern=r"[A-Za-z0-9]+")
    X = vect.fit_transform(allergies + ingredients)
    A = X[:len(allergies)]
    B = X[len(allergies):]

    S = cosine_similarity(B, A)  # [n_ing x n_all]
    best_idx = S.argmax(axis=1)
    best_scores = S[np.arange(S.shape[0]), best_idx]

    hits = []
    for i, score in enumerate(best_scores):
        if float(score) >= float(thresh):
            hits.append({
                "ingredient": ingredients[i],
                "match": allergies[best_idx[i]],
                "score": float(score),
            })
    return hits

def parse_qr_payload(text: str):
    """
    Accepts payload like "['a','b','c']" (repr format) or JSON ["a","b","c"].
    Falls back to comma-split.
    """
    if not text:
        return []
    # try Python-literal list
    try:
        val = ast.literal_eval(text)
        if isinstance(val, list):
            return [str(x) for x in val]
    except Exception:
        pass
    # try JSON list
    try:
        val = json.loads(text)
        if isinstance(val, list):
            return [str(x) for x in val]
    except Exception:
        pass
    # fallback: comma split
    return [s.strip() for s in text.split(",") if s.strip()]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--timeout", type=float, default=20.0)
    ap.add_argument("--thresh", type=float, default=0.25)
    ap.add_argument("--allergies", type=str, default="[]",
                    help='JSON array like ["milk","peanut"] or comma list "milk,peanut"')
    ap.add_argument("--show", action="store_true", default=False,
                    help="Show OpenCV window (usually False for server)")
    args = ap.parse_args()

    # parse allergies
    allergies = []
    try:
        parsed = json.loads(args.allergies)
        if isinstance(parsed, list):
            allergies = [str(x) for x in parsed]
        else:
            allergies = [s.strip() for s in str(args.allergies).split(",") if s.strip()]
    except Exception:
        allergies = [s.strip() for s in str(args.allergies).split(",") if s.strip()]

    try:
        wanted = [ZBarSymbol.QRCODE]
        raw = scan_loop(
            camera_index=args.camera,
            wanted=wanted,
            timeout_sec=args.timeout,
            show_window=args.show,
        )
        if not raw:
            print(json.dumps({"cancelled": True}))
            return

        ingredients = parse_qr_payload(raw)
        matches = match_allergies(allergies, ingredients, thresh=args.thresh)

        out = {
            "ok": True,
            "raw": raw,
            "ingredients": ingredients,
            "allergies": allergies,
            "matches": matches,
        }
        print(json.dumps(out, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))

if __name__ == "__main__":
    main()
