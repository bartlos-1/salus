    ing_str = (response.data or {}).get("recipe") or ""
    recipe = [line.strip() for line in str(ing_str).splitlines() if line.strip()]
    return recipe