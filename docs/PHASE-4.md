# Phase 4 — Database Designer واقعی ✅

طراح دیتابیس دیگر فقط شکل نمی‌کشد: schema را اعتبارسنجی می‌کند، SQL واقعی می‌سازد، از دیتابیس موجود می‌خواند، و Undo/Redo دارد.

---

## چی اضافه شد

### ۱. اعتبارسنجی Schema

`engine/app/services/validate.py` — ۲۰ قانون در سه سطح:

| کد | سطح | چه چیزی را می‌گیرد |
|---|---|---|
| `table.duplicate` | error | نام تکراری جدول (بدون حساسیت به بزرگی حروف) |
| `table.no_pk` | error | جدول بدون کلید اصلی |
| `table.no_columns` | error | جدول بدون ستون |
| `table.invalid_name` | error | نام غیرمجاز برای شناسه |
| `column.duplicate` | error | ستون تکراری |
| `column.pk_nullable` | error | کلید اصلی nullable |
| `column.python_keyword` | error | نام ستون کلیدواژهٔ پایتون است |
| `relation.type_mismatch` | error | نوع کلید خارجی با ستون مرجع نمی‌خواند |
| `relation.dangling` | error | رابطه به جدول/ستون حذف‌شده اشاره دارد |
| `table.reserved_word` | warning | کلمهٔ رزرو SQL |
| `column.orphan_fk` | warning | ستون `*_id` بدون رابطه |
| `schema.cycle` | warning | وابستگی حلقوی (DFS رنگی) |
| `relation.parent_not_unique` | warning | مقصد رابطه unique نیست |
| `column.should_be_unique` | info | `email`/`slug`/… معمولاً unique است |
| `table.isolated` | info | جدول بدون هیچ رابطه |

**Auto-fix** برای موارد مکانیکی: افزودن کلید اصلی، غیرnullable کردن PK، unique کردن، اصلاح نام‌ها، حذف روابط معلق، هم‌نوع کردن کلید خارجی.

### ۲. خروجی SQL

`engine/app/services/ddl.py` — سه دیالکت با نگاشت نوع مخصوص هرکدام:

- **SQLite** — `INTEGER PRIMARY KEY AUTOINCREMENT` + `PRAGMA foreign_keys = ON`
- **PostgreSQL** — `SERIAL` / `BIGSERIAL`، `JSONB`، `TIMESTAMP`
- **MySQL** — بک‌تیک، `AUTO_INCREMENT`، `TINYINT(1)` برای boolean

جدول‌ها با **مرتب‌سازی توپولوژیک** خروجی می‌گیرند (والد قبل از فرزند) و برای هر کلید خارجی ایندکس ساخته می‌شود.

### ۳. ایمپورت (Reverse Engineering)

دو مسیر:

- **فایل SQLite** — با `PRAGMA table_info` / `foreign_key_list` خوانده می‌شود، **read-only**. جدول‌های `sqlite_*` و `alembic_version` نادیده گرفته می‌شوند.
- **SQL چسبانده‌شده** — پارسر `CREATE TABLE` که بک‌تیک MySQL، `AUTO_INCREMENT`، `BIGSERIAL`، `PRIMARY KEY(x)` سطح جدول و `FOREIGN KEY … ON DELETE` را می‌فهمد.

دو حالت: **Replace** (پاک‌کردن و جایگزینی) یا **Merge** (نگه‌داشتن جدول‌های موجود). هر دو Undo می‌شوند.

پیش‌نمایش قبل از اعمال نشان می‌دهد چه جدول‌هایی و چند رابطه پیدا شده.

### ۴. Undo / Redo

رویکرد: **snapshot** کل schema قبل از هر تغییر ساختاری، نه معکوس‌کردن تک‌تک عملیات‌ها. ساده‌تر و بسیار مقاوم‌تر.

- تاریخچه تا ۵۰ مرحله
- میان‌بر `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`
- هنگام تایپ در input غیرفعال می‌شود
- با باز/بسته کردن پروژه پاک می‌شود
- بازیابی از طریق API انجام می‌شود تا دیتابیس و UI هرگز واگرا نشوند

---

## UI

- **نوار ابزار** بالای لیست جدول‌ها: Undo · Redo · Import · Export SQL
- **پنل اعتبارسنجی** پایین سایدبار — جمع‌شونده، با شمارش خطا/هشدار و دکمهٔ «Fix N»
- کلیک روی هر مشکل، جدول مربوطه را انتخاب می‌کند
- جدول‌های دارای خطا **حلقهٔ قرمز** می‌گیرند
- دیالوگ SQL با انتخاب دیالکت و دکمهٔ Copy
- دیالوگ Import با تب SQL / فایل و پیش‌نمایش

---

## 🐛 دو باگ واقعی

**۱. `useState` به‌جای `useEffect`** در `DdlDialog` — دیالوگ SQL خالی باز می‌شد چون `useState(() => load())` قابل اتکا اجرا نمی‌شود. با `useEffect` رفع شد.

**۲. سلکتور اشتباه در تست خودکار** — نوار ابزار داخل `<div>` است نه `<aside>`، پس کلیک‌های تست به هیچ نمی‌خورد و Undo «خراب» به نظر می‌رسید. خود قابلیت درست بود؛ تست اصلاح شد. یادآوری خوبی که تست سبز/قرمز را هم باید تأیید کرد.

---

## ✅ تست‌ها

```
engine/tests            →  51 passed
  test_path_safety.py   →  24  (SECURITY-001)
  test_schema_tools.py  →  27  (فاز ۴)
```

پوشش فاز ۴ شامل: schema سالم بدون خطای کاذب، هر قانون اعتبارسنجی، تشخیص حلقه (یک‌بار نه دوبار)، هر سه دیالکت، **اجرای واقعی DDL در SQLite**، رفت‌وبرگشت کامل (schema → DDL → دیتابیس → introspect → schema)، دامپ MySQL آشفته، و اینکه نام‌های خصمانه از مسیر ایمپورت هم پاک‌سازی می‌شوند.

### تأیید end-to-end در Electron

```
validation banner : Schema is valid
add table         : 3 → 4
after undo        : 3  ✅
after redo        : 4  ✅
DDL dialog        : CREATE TABLE ✅
console errors    : 0
```

---

## 🐛 BUGFIX-002 — database is locked

هنگام تست فاز ۴ کاربر به کرش `sqlite3.OperationalError: database is locked` خورد. سه علت داشت: نبود `busy_timeout`، پروسهٔ پایتون یتیم از اجرای قبلی، و Undo که به‌جای یک درخواست دهها درخواست می‌فرستاد.

هر سه رفع شد و با تست فشار (۲۵ نوشتن پیاپی، ۲۴ نوشتن از دو موتور همزمان) تأیید شد. Undo حالا زیر یک ثانیه است.

جزئیات: [`BUGFIX-002.md`](BUGFIX-002.md)

---

## ⏭ مرحلهٔ ۵

API Designer واقعی: تولید router/schema/service از entity، endpoint دستی، پیش‌نمایش OpenAPI، و تست pytest برای هر endpoint.
