# ✅ چک‌لیست تست فاز ۴

قبل از رفتن به فاز ۵ این‌ها را امتحان کن. حدود ۱۰ دقیقه وقت می‌برد.

```cmd
cd C:\Users\ilia\Desktop\skaffo
npm run dev
```

بعد: **Projects → My Shop → Open → Database**

---

## تست ۱ — پنل اعتبارسنجی (۳۰ ثانیه)

پایین سایدبار چپ باید یک نوار سبز ببینی:

> ✅ **Schema is valid**

اگر روی آن کلیک کنی باز/بسته می‌شود.

- [ ] نوار سبز دیده می‌شود
- [ ] بالای لیست جدول‌ها ۴ آیکون هست: **↶ ↷ ⬆ 📄**

> اگر نوار دیده نشد یعنی موتور جدید بالا نیامده — CMD را ببند و دوباره `npm run dev`.

---

## تست ۲ — گرفتن خطای واقعی (۲ دقیقه)

**الف) جدول بدون کلید اصلی**

۱. دکمهٔ **New Table** را بزن
۲. روی جدول جدید در لیست کلیک کن تا پنل راست باز شود
۳. ستون `id` را با آیکون 🗑 حذف کن

انتظار:

- [ ] نوار پایین **قرمز** می‌شود: «Schema issues»
- [ ] داخلش نوشته: `Table "table_4" has no primary key`
- [ ] خود جدول روی کانواس **حلقهٔ قرمز** می‌گیرد
- [ ] کلیک روی متن خطا آن جدول را انتخاب می‌کند

**ب) Auto-fix**

۴. دکمهٔ **Fix 1** را بزن

- [ ] ستون `id` خودکار برمی‌گردد
- [ ] نوار دوباره سبز می‌شود

**ج) کلیدواژهٔ پایتون**

۵. یک ستون اضافه کن و اسمش را بگذار `class`

- [ ] خطا می‌دهد: `"class" is a Python keyword`
- [ ] با **Fix** تبدیل می‌شود به `class_`

**د) نام تکراری**

۶. یک جدول دیگر بساز و اسمش را بگذار `users`

- [ ] خطا: `Duplicate table name "users"`

> اسمش را به چیز دیگری برگردان تا ادامه دهیم.

---

## تست ۳ — Undo / Redo (۲ دقیقه)

۱. تعداد جدول‌ها را یادداشت کن (بالای لیست عددش هست)
۲. **New Table** بزن → عدد یکی زیاد می‌شود
۳. `Ctrl+Z` بزن

- [ ] جدول حذف می‌شود، عدد به حالت قبل برمی‌گردد
- [ ] پایین صفحه toast می‌آید: «Undo: Add table»

۴. `Ctrl+Shift+Z` بزن

- [ ] جدول برمی‌گردد

۵. حالا سخت‌ترش: یک جدول را **حذف** کن (آیکون 🗑 در لیست)، بعد `Ctrl+Z`

- [ ] جدول با **همهٔ ستون‌هایش** برمی‌گردد
- [ ] روابطش هم برمی‌گردند

۶. آیکون‌های ↶ ↷ در نوار ابزار هم همین کار را می‌کنند

- [ ] وقتی چیزی برای undo نیست، آیکون کم‌رنگ (disabled) است

> ⏱ Undo چند ثانیه طول می‌کشد — چون schema را از طریق API بازسازی می‌کند تا دیتابیس و UI هرگز از هم جدا نشوند.

---

## تست ۴ — خروجی SQL (۱ دقیقه)

آیکون **📄** (Export SQL) را بزن.

- [ ] پنجره باز می‌شود و SQL واقعی نشان می‌دهد
- [ ] `PRAGMA foreign_keys = ON;` بالای فایل هست
- [ ] `users` **قبل از** `orders` می‌آید (چون orders به آن وابسته است)
- [ ] `FOREIGN KEY ... REFERENCES users("id") ON DELETE CASCADE` دیده می‌شود
- [ ] پایین `CREATE INDEX` برای کلیدهای خارجی هست

حالا دیالکت را عوض کن:

- [ ] **PostgreSQL** → `"id" SERIAL PRIMARY KEY`
- [ ] **MySQL** → `` `id` INT PRIMARY KEY AUTO_INCREMENT `` با بک‌تیک

- [ ] دکمهٔ **Copy** کار می‌کند (جایی paste کن)

### 🎯 تست طلایی — SQL را واقعاً اجرا کن

SQL دیالکت SQLite را کپی کن، بعد:

```cmd
cd %USERPROFILE%\Documents
python -c "import sqlite3;print('ready')"
```

یک فایل `test.sql` بساز، SQL را داخلش بچسبان، بعد:

```cmd
python -c "import sqlite3;c=sqlite3.connect('test.db');c.executescript(open('test.sql').read());print('tables:',[r[0] for r in c.execute(\"select name from sqlite_master where type='table'\")])"
```

- [ ] بدون خطا اجرا می‌شود و اسم جدول‌ها را چاپ می‌کند

اگر این کار کرد یعنی SQL تولیدی **واقعاً معتبر** است، نه فقط ظاهراً درست.

---

## تست ۵ — ایمپورت (۳ دقیقه)

### الف) از SQL چسبانده‌شده

آیکون **⬆** (Import) → تب **Paste SQL** → این را بچسبان:

```sql
CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  published_at DATE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);
```

۱. **Preview** بزن

- [ ] نشان می‌دهد: `authors (3)` و `books (4)` و `1 relations`

۲. Mode را روی **Merge** بگذار (تا جدول‌های فعلی نمانند) و **Import** بزن

- [ ] دو جدول جدید روی کانواس ظاهر می‌شوند
- [ ] یک خط رابطه بین `authors` و `books` کشیده شده
- [ ] `author_id` آیکون 🔗 دارد
- [ ] `Ctrl+Z` کل ایمپورت را برمی‌گرداند ✅

### ب) دامپ MySQL آشفته

این را امتحان کن (بک‌تیک و AUTO_INCREMENT دارد):

```sql
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `Email` VARCHAR(190) NOT NULL,
  `notes` LONGTEXT,
  PRIMARY KEY (`id`)
);
```

- [ ] درست پارس می‌شود، `notes` نوعش `text` می‌شود

### ج) از فایل دیتابیس واقعی

اگر فاز ۳ را تست کرده بودی، یک دیتابیس واقعی داری:

```
C:\Users\ilia\Documents\SkaffoProjects\my-shop\backend\app.db
```

تب **SQLite file** → این مسیر را بچسبان → **Preview**

- [ ] جدول‌های واقعی را می‌خواند
- [ ] `alembic_version` را نشان **نمی‌دهد** (فیلتر شده)

> فایل read-only باز می‌شود؛ هیچ خطری برای دیتابیس اصلی ندارد.

---

## تست ۶ — همه‌چیز با هم (۲ دقیقه)

مهم‌ترین تست: مطمئن شویم فاز ۴ فاز ۳ را نشکسته.

۱. یک جدول جدید بساز، مثلاً `categories` با ستون‌های `id` و `name`
۲. مطمئن شو پنل اعتبارسنجی **سبز** است
۳. برو به **Export** → **Generate**

- [ ] تعداد فایل‌ها بیشتر از قبل است (برای جدول جدید model/schema/service/router ساخته شده)
- [ ] در درخت خروجی `backend/app/models/category.py` هست
- [ ] `frontend/src/pages/Categories.tsx` هم هست

۴. اپ را ببند و دوباره باز کن

- [ ] همهٔ تغییرات سر جایشان هستند (ماندگاری فاز ۲)

---

## 🚨 اگر چیزی خراب بود

خروجی کامل CMD را برایم بفرست، به‌علاوه:

**دیدن خطاهای واقعی:** در پنجرهٔ اپ `Ctrl+Shift+I` بزن → تب **Console** → اسکرین‌شات از خطاهای قرمز.

**تست مستقیم موتور:** در مرورگر برو به `http://127.0.0.1:8731/docs` — همهٔ endpointهای جدید آنجاست و می‌توانی تک‌تک تست کنی:

- `GET /api/projects/{pid}/schema/validate`
- `GET /api/projects/{pid}/schema/ddl?dialect=mysql`
- `POST /api/projects/{pid}/schema/import/preview`

**اجرای تست‌های خودکار:**

```cmd
cd C:\Users\ilia\Desktop\skaffo\engine
.venv\Scripts\python -m pytest tests -q
```

باید بدهد: `51 passed`

---

## خلاصهٔ سریع

اگر وقت کم داری، فقط این ۴ تا:

1. جدول بساز → `id` را حذف کن → خطای قرمز بگیر → **Fix** بزن ✅
2. `Ctrl+Z` بعد از حذف یک جدول → کامل برگردد ✅
3. **Export SQL** → دیالکت را روی MySQL بگذار → بک‌تیک ببین ✅
4. SQL نمونهٔ `authors`/`books` را import کن → رابطه کشیده شود ✅

اگر این ۴ تا سبز بودند، فاز ۴ سالم است.
