# SECURITY-001 — Path Traversal in Project Generator

**Severity:** High · **Status:** Fixed · **Reported by:** user review of Phase 3

---

## خلاصه

اسم جدول مستقیم به مسیر فایل تبدیل می‌شد و فیلتر `snake` فقط `-` را به `_` تبدیل و حروف را کوچک می‌کرد:

```python
env.filters["snake"] = lambda s: str(s).replace("-", "_").lower()
render("model.py.j2", f"backend/app/models/{e['snake']}.py", e=e)
```

`writer.py` هم بدون اعتبارسنجی می‌نوشت:

```python
dest = target / p.path      # ← هیچ بررسی‌ای نبود
```

نتیجه: جدولی با نام `../../../../escaped/OWNED` باعث نوشتن فایل **بیرون از پوشهٔ پروژه** می‌شد.

## اثبات (قبل از رفع)

```
$ find /tmp/escaped -type f
/tmp/escaped/owned_service.py
/tmp/escaped/owned.py
>>> PATH TRAVERSAL CONFIRMED <<<
```

## چرا مهم بود

نکتهٔ گزارش‌دهنده دقیق بود: در **فاز ۴** قرار است «ایمپورت از دیتابیس موجود» اضافه شود، یعنی نام جدول‌ها دیگر فقط از UI خودی نمی‌آید. اگر محصول روزی multi-user یا SaaS شود، این یک آسیب‌پذیری جدی است. اصل درست این است که ورودی از همان ابتدا نامعتمد فرض شود.

---

## رفع — دفاع لایه‌ای

### لایه ۱ — پاک‌سازی نام‌ها (`base.py`)

```python
def safe_identifier(raw: str, *, fallback: str = "table") -> str:
    name = _UNSAFE.sub("_", str(raw)).strip("_").lower()   # فقط [0-9a-zA-Z_]
    if not name:                    raise UnsafeIdentifier(...)
    if name[0].isdigit():           name = f"{fallback}_{name}"
    if name in _RESERVED or keyword.iskeyword(name): name = f"{name}_"
    return name
```

اعمال شد روی: نام جدول، نام ستون، `slug` و `snake` پروژه، و فیلترهای `pascal` / `camel` / `snake`.

| ورودی | خروجی |
|---|---|
| `../../../evil` | `evil` |
| `/etc/passwd` | `etc_passwd` |
| `C:\Windows\system32` | `c_windows_system32` |
| `class` | `class_` |
| `con` | `con_` (رزرو ویندوز) |
| `2fast` | `table_2fast` |

### لایه ۲ — اعتبارسنجی هنگام ساخت (`GeneratedFile`)

```python
def __post_init__(self):
    object.__setattr__(self, "path", safe_relpath(self.path))
```

هیچ پلاگینی نمی‌تواند مسیر خطرناک تولید کند، حتی سهواً.

### لایه ۳ — مهار در نویسنده (`writer.py`)

```python
def contained_path(target: Path, rel: str) -> Path:
    rel = safe_relpath(rel)
    root, dest = target.resolve(), (target / rel).resolve()
    if dest != root and root not in dest.parents:
        raise UnsafeIdentifier(f"path escapes project directory: {rel!r}")
    return dest
```

هم در `build_plan` (خواندن) و هم در `apply_plan` (نوشتن) استفاده می‌شود.

### لایه ۴ — محافظت از پوشهٔ مقصد

`resolve_target` حالا از تولید در `/`, `/etc`, `/usr`, `C:\Windows`, … و مستقیماً در home جلوگیری می‌کند و خطای `400` برمی‌گرداند.

---

## تأیید

```
$ pytest tests/test_path_safety.py -q
24 passed
```

اکسپلویت بعد از رفع:

```
hostile table name still in DB: ['../../../../escaped/OWNED']
generated paths:
    backend/app/models/escaped_owned.py
    frontend/src/pages/EscapedOwned.tsx
=== anything outside the project dir? ===
  NONE — traversal blocked
```

### بدون رگرسیون

```
pytest (generated)  →  9 passed
vite build          →  ✓ built in 1.65s
alembic             →  ['alembic_version','orders','products','users']
Electron end-to-end →  66 files, 0 console errors
```

نام فایل‌های عادی تغییری نکرد: `user.py`, `order.py`, `Products.tsx`.

---

## درس

نقطهٔ ضعف این بود که «نام» و «مسیر» یکی فرض شده بودند. حالا تبدیل نام به مسیر فقط از یک تابع می‌گذرد و در سه نقطه بررسی می‌شود. تست‌های `test_path_safety.py` جلوی برگشت این باگ را می‌گیرند.
