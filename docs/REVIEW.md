# بررسی ایده — Skaffo

> تحلیل فنی و محصولی ایده، پیش از شروع پیاده‌سازی.

---

## ۱. جمع‌بندی کوتاه

ایده **منسجم، قابل ساخت و بازار دارد**. چیزی که توصیف کردی در واقع ترکیبی از سه ابزار شناخته‌شده است:

| بخش تو | معادل موجود در بازار |
|---|---|
| Project Wizard + Generator | Cookiecutter / Yeoman / `create-t3-app` |
| Database Designer | dbdiagram.io / DrawSQL / Prisma Studio |
| API Designer + CRUD Gen | Swagger Editor / Directus / Hasura |
| Export Engine | خروجی ZIP / Git |

**تمایز اصلی تو:** این سه‌تا معمولاً جدا هستند. یکپارچه‌کردن «طراحی دیتابیس ← تولید API ← تولید پروژه واقعی» در یک اپ دسکتاپ آفلاین، ارزش واقعی دارد. این را باید هستهٔ پیام محصول کنی، نه «ساخت پوشه».

---

## ۲. نقاط قوت ✅

1. **معماری Plugin-Based** (قانون اصلی‌ات) — درست‌ترین تصمیم کل سند. حتماً نگهش دار.
2. **محدودکردن نسخهٔ ۱ به FastAPI + React + SQLite** — تصمیم بالغانه. اکثر پروژه‌های مشابه با پشتیبانی از ۸ فریم‌ورک شروع می‌کنند و هیچ‌کدام کامل نمی‌شود.
3. **Roadmap مرحله‌ای** — منطقی و افزایشی.
4. **دیزاین سیستم مشخص** (رنگ، فونت، آیکون، مدت انیمیشن) — کار UI را خیلی سریع می‌کند.
5. **Local-first / آفلاین** — مزیت رقابتی نسبت به ابزارهای وب.

---

## ۳. ایرادها و ریسک‌ها ⚠️

### ۳.۱ ریسک‌های فنی

| # | مشکل | توضیح | راه‌حل پیشنهادی |
|---|---|---|---|
| T1 | **Electron + Python همزمان** | باید مفسر پایتون را داخل نصب‌کننده bundle کنی (PyInstaller). حجم نصب می‌رود بالای ~۱۵۰MB و باگ‌های cross-platform زیاد دارد. | نسخهٔ ۱: بک‌اند را به‌عنوان sidecar process با PyInstaller بسته‌بندی کن. یا کلاً موتور تولید را به TypeScript ببر و پایتون را حذف کن. |
| T2 | **Jinja2 برای همه‌چیز** | تمپلیت‌های زبان‌های مختلف با `{{ }}` تداخل پیدا می‌کنند (مثلاً Vue و Angular هم `{{ }}` دارند). | از delimiterهای سفارشی Jinja استفاده کن: `<% %>` و `<< >>`. |
| T3 | **Zustand + React Flow** | React Flow برای Database Designer عالی است اما state آن باید تک‌منبع باشد. اگر schema هم در Zustand و هم داخل React Flow نگه‌داری شود، sync خراب می‌شود. | Schema = single source of truth در Zustand؛ nodes/edges به‌صورت derived محاسبه شوند. |
| T4 | **Foreign Key و Relation** | drag & drop رابطه راحت است، اما تولید کد صحیح برای relationهای many-to-many سخت است. | نسخهٔ ۱ فقط 1-1 و 1-N. M-N را به نسخهٔ ۲ ببر (یا join table دستی). |
| T5 | **«Production Ready» در Export** | این کلمه تعهد سنگینی است (CI/CD، secrets، migration، logging، health-check). | اسمش را بگذار `Docker Ready` و `Deployment Starter`. |
| T6 | **نبود Migration** | SQLite + مدل‌های SQLAlchemy بدون Alembic یعنی کاربر بعد از تغییر schema گیر می‌کند. | Alembic را از نسخهٔ ۱ در خروجی بگذار. |

### ۳.۲ ریسک‌های محصولی

- **مسئلهٔ «یک‌بار مصرف»**: کاربر یک بار پروژه می‌سازد و دیگر برنمی‌گردد. این قاتل مدل اشتراکی است.
  - **راه‌حل:** قابلیت **Re-generate / Sync** — کاربر جدول جدید اضافه کند و فقط فایل‌های مربوطه دوباره تولید شوند بدون پاک‌شدن کد دستی‌اش (با ناحیهٔ محافظت‌شده `# codeforge:keep`). این یک ویژگی است که باید در **نسخهٔ ۱** باشد، نه بعداً.
- **قیمت‌گذاری**: «Node/Laravel/Spring در Pro» یعنی باید ۴ موتور تولید کامل بنویسی تا اولین ریال درآمد. سنگین است.
  - **جایگزین:** Free = ۳ پروژه، Pro = نامحدود + Re-generate + Git + Custom Templates. اول ارزش را قفل کن نه فریم‌ورک را.
- **AI در نسخهٔ ۸**: با وضعیت فعلی بازار، AI باید حدود نسخهٔ ۲–۳ بیاید وگرنه محصول قدیمی به نظر می‌رسد.

### ۳.۳ ایرادهای کوچک UI

- Sidebar تو ۷ آیتم دارد ولی `Dashboard` و `Projects` عملاً هم‌پوشانی دارند → ادغام کن.
- `Database` و `API` فقط وقتی معنی دارند که پروژه‌ای باز باشد → باید در حالت «پروژه باز نیست» disable شوند.
- Wizard با ۸ استپ زیاد است. Step 3/4/5 (که هرکدام فقط یک گزینهٔ فعال دارند) را در یک صفحهٔ «Stack» ادغام کن → ۵ استپ.

---

## ۴. اصلاحات پیشنهادی روی معماری

```
skaffo/
├─ apps/
│  ├─ desktop/          # Electron shell
│  └─ studio/           # React + Vite UI
├─ packages/
│  ├─ core/             # Schema types + event bus  ← قلب سیستم
│  ├─ plugin-sdk/       # قرارداد پلاگین‌ها
│  └─ ui/               # design system
├─ plugins/
│  ├─ generator-fastapi/
│  ├─ generator-react/
│  ├─ designer-database/
│  ├─ designer-api/
│  └─ export-zip/
└─ engine/              # Python FastAPI + Jinja2 sidecar
```

**قرارداد پلاگین (کلید کل ماجرا):**

```ts
interface SkaffoPlugin {
  id: string;
  version: string;
  capabilities: ('generator' | 'designer' | 'exporter' | 'template')[];
  contributes?: { sidebar?: SidebarItem[]; wizardStep?: WizardStep[] };
  generate?(ctx: ProjectContext): Promise<GeneratedFile[]>;
}
```

هر پلاگین فقط `ProjectContext` می‌گیرد و `GeneratedFile[]` برمی‌گرداند — هیچ پلاگینی مستقیم روی دیسک نمی‌نویسد. نوشتن روی دیسک فقط کار Export Engine است. این یعنی preview، dry-run و ZIP رایگان به‌دست می‌آید.

---

## ۵. Roadmap بازنویسی‌شده

| نسخه | محتوا | چرا |
|---|---|---|
| **0.1 (MVP)** | Dashboard + Wizard + Generator (FastAPI/React/SQLite) + Export ZIP | کوچک‌ترین چیز قابل استفاده |
| **0.2** | Database Designer + تولید مدل/Alembic | ارزش واقعی اینجاست |
| **0.3** | API Designer + CRUD + **Re-generate/Sync** | چسبندگی کاربر |
| **1.0** | Settings + Local Templates + Installer + Docker | انتشار عمومی |
| **1.1** | Git Integration | |
| **1.2** | AI (تولید schema از توضیح متنی) | جلو افتادن از رقبا |
| **2.0** | Plugin System عمومی + Marketplace | |

---

## ۶. حکم نهایی

**ایده تأیید می‌شود** با سه شرط:

1. نسخهٔ ۱ فقط **یک استک** (همان تصمیم خودت) — ولی **Re-generate** حتماً اضافه شود.
2. مدل درآمد بر پایهٔ **قابلیت** باشد نه **فریم‌ورک**.
3. همه‌چیز از روز اول از `packages/core` و `plugin-sdk` عبور کند، حتی ماژول‌های داخلی.

---

## ۷. قدم بعدی — انتخاب با توست

برای شروع ساخت، بگو کدام مسیر:

- **الف)** Prototype قابل اجرا در مرورگر — کل UI (Dashboard، Wizard، Database Designer، API Designer، Export) با React+TS+Vite+Tailwind، دیتای mock. سریع‌ترین راه برای دیدن محصول.
- **ب)** Monorepo واقعی — Electron + React + FastAPI sidecar، با موتور تولید واقعی که فایل‌های واقعی می‌سازد. کندتر، ولی محصول واقعی.
- **ج)** فقط موتور تولید (Python) — CLI که با یک JSON، پروژهٔ کامل FastAPI+React می‌سازد. قلب محصول، بدون UI.
