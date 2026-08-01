# Phase 3 — Project Generator ✅

مهم‌ترین مرحلهٔ پروژه. دکمهٔ Generate حالا واقعاً یه پروژهٔ کامل و قابل اجرا می‌سازه.

---

## نتیجه در یک نگاه

از schema «My Shop» (۳ جدول، ۲ رابطه):

| | |
|---|---|
| فایل تولیدشده | **۶۶** |
| خطوط کد | **۲٬۴۳۵** |
| حجم | ۶۳ KB |
| تست‌های تولیدشده | **۹ از ۹ پاس** |
| بیلد فرانت‌اند | ✅ موفق |
| مایگریشن Alembic | ✅ هر ۳ جدول ساخته شد |

مقصد: `Documents/SkaffoProjects/<slug>/`

---

## معماری

```
engine/app/generator/
├─ base.py           قرارداد پلاگین، محیط Jinja، نگاشت تایپ‌ها
├─ merge.py          موتور Re-generate / Sync
├─ writer.py         تنها ماژولی که به دیسک دست می‌زنه
├─ fastapi_gen.py    پلاگین بک‌اند
├─ react_gen.py      پلاگین فرانت‌اند
├─ project_gen.py    Docker، README، فایل‌های ریشه
└─ templates/        ۴۸ تمپلیت Jinja
```

قرارداد بدون تغییر باقی موند:

```python
class Generator(Protocol):
    def generate(self, ctx: GenContext) -> list[GeneratedFile]: ...
```

تابع خالص. هیچ پلاگینی روی دیسک نمی‌نویسه — فقط `writer.py`. به همین خاطر preview، dry-run و تشخیص تداخل مجانی به‌دست اومدن.

---

## چی تولید می‌شه

**بک‌اند** — `main.py`، config، database (با پراگمای FK)، deps، امنیت JWT، و به ازای هر جدول: model، schema، service، router، تست. به‌علاوه Alembic و `requirements.txt`.

**فرانت‌اند** — Vite + TS + Tailwind، کلاینت API تایپ‌دار، هوک `useApi`، `DataTable`، `Layout`، صفحهٔ Home، و یک صفحهٔ CRUD به ازای هر جدول. با auth: صفحهٔ Login و استور Zustand.

**ریشه** — README، LICENSE، `.gitignore`، `.env.example`، و در صورت فعال‌بودن Docker: دو Dockerfile، compose، و کانفیگ nginx.

---

## ⭐ Re-generate / Sync

کد بین این نشانه‌ها هرگز از بین نمی‌ره:

```python
# codeforge:keep:start product-service
def apply_discount(db, product_id: int, percent: float):
    ...   # کد دستی شما
# codeforge:keep:end
```

پنج حالت برای هر فایل: `create` · `update` · `merge` · `conflict` · `skip`

فایلی که بیرون از ناحیهٔ محافظت‌شده تغییر کرده **conflict** علامت می‌خوره و به‌صورت پیش‌فرض رد می‌شه. UI تعدادش رو نشون می‌ده و اجازه می‌گیره.

### تست واقعی

۱. یه تابع دستی داخل ناحیهٔ محافظت‌شده اضافه شد
۲. ستون `sku` به جدول products اضافه شد
۳. Regenerate

نتیجه: `merge kept=1` — هم ستون جدید تولید شد، هم تابع دستی سر جاش موند. حتی با `overwrite_conflicts=True` هم باقی موند.

---

## 🐛 شش باگ واقعی که تست‌ها پیدا کردن

| # | مشکل | رفع |
|---|---|---|
| ۱ | `{<<<Component />}` در JSX با delimiter تداخل داشت | delimiter شد `@@ @@` |
| ۲ | `Mapped[[[ c.py ]]` — جنریک پایتون با `[[` تداخل داشت | همون `@@` (در هیچ زبان مقصدی وجود نداره) |
| ۳ | `trim_blocks` خط جدید بعد از `<% endif %>` درون‌خطی رو می‌خورد → همهٔ فیلدها یک خط شدن | annotation در پایتون از پیش محاسبه شد |
| ۴ | `EmailStr` بدون وابستگی → ImportError | `pydantic[email]` |
| ۵ | SQLite کلید خارجی رو نادیده می‌گرفت (رکورد بد با ۲۰۱ قبول می‌شد) | `PRAGMA foreign_keys=ON` |
| ۶ | `models/__init__.py` خالی تولید می‌شد → Alembic هیچ جدولی نمی‌ساخت | `models` از حلقهٔ پکیج‌های خالی حذف شد |

باگ ۶ خطرناک‌ترین بود: مایگریشن «موفق» گزارش می‌شد ولی دیتابیس خالی می‌موند.

---

## تأیید نهایی

```
pytest        →  9 passed
vite build    →  ✓ built in 1.59s
alembic       →  ['alembic_version', 'orders', 'products', 'users']
POST /api/products  →  201
GET  ?q=lap         →  total: 1
POST bad FK         →  500 (درست رد شد)
openapi.json        →  7 مسیر مستند
```

---

## UI

صفحهٔ Export بازنویسی شد: آمار زنده، شمارش هر حالت، درخت خروجی، نمایشگر فایل با کلیک، و هشدار تداخل با چک‌باکس تأیید.

---

## 🔒 SECURITY-001 — Path Traversal (رفع شد)

پس از انتشار فاز ۳، بازبینی کاربر یک آسیب‌پذیری واقعی پیدا کرد: اسم جدول مستقیم به مسیر فایل تبدیل می‌شد و فیلتر `snake` جداکننده‌های مسیر را حذف نمی‌کرد. جدولی با نام `../../../evil` بیرون از پوشهٔ پروژه می‌نوشت.

با اکسپلویت واقعی تأیید شد، سپس با دفاع چهارلایه رفع شد و ۲۴ تست رگرسیون اضافه شد.

جزئیات کامل: [`SECURITY-FIX-001.md`](SECURITY-FIX-001.md)

---

## ⏭ مرحلهٔ ۴

Database Designer واقعی: اعتبارسنجی schema، Undo/Redo، ایمپورت از دیتابیس موجود، خروجی SQL DDL.
