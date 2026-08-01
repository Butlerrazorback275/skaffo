# 🗺 نقشهٔ راه Skaffo

**۶ مرحله تا نسخهٔ ۱.۰** — بعدش ۴ نسخهٔ بعدی.

| مرحله | عنوان | وضعیت | پیشرفت تجمعی |
|---|---|---|---|
| ۱ | Electron + React Shell | ✅ تمام | ۱۵٪ |
| ۲ | FastAPI Sidecar | ⏳ بعدی | ۲۵٪ |
| ۳ | Project Generator | ⬜ | ۵۰٪ |
| ۴ | Database Designer واقعی | ⬜ | ۷۰٪ |
| ۵ | API Designer واقعی | ⬜ | ۸۵٪ |
| ۶ | Export واقعی | ⬜ | ۹۵٪ |
| — | Release v1.0 | ⬜ | ۱۰۰٪ |

---

## ✅ مرحله ۱ — Electron + React Shell (تمام شد)

**چی اضافه شد:**
- پنجرهٔ Electron با titlebar سفارشی و IPC امن
- ۸ صفحه: Dashboard، Projects، Templates، Database، API، Export، Settings، Wizard
- Wizard کامل ۸ مرحله‌ای
- Database Designer با React Flow (drag، relation، ویرایش ستون)
- API Designer با Generate CRUD و پیش‌نمایش کد
- دیزاین سیستم کامل (رنگ‌ها، Inter، Lucide، انیمیشن ۲۰۰ms)
- `core/` + `plugin-sdk` — قانون اصلی پروژه از روز اول

**چی نداره:** هیچ بک‌اندی، هیچ فایلی تولید نمی‌شه، با رفرش ریست می‌شه.

---

## ⏳ مرحله ۲ — FastAPI Sidecar

**هدف:** بک‌اند واقعی زیر UI، به‌جای mock data.

**چی اضافه می‌شه:**
- پوشهٔ `engine/` با اپ FastAPI
- endpointها: `/health`، `/projects` (CRUD)، `/schema`، `/settings`
- دیتابیس SQLite برای ذخیرهٔ پروژه‌های خود Skaffo
- اجرای خودکار پروسهٔ پایتون از `electron/main.cjs`
- بسته‌بندی با PyInstaller (که کاربر نهایی پایتون لازم نداشته باشه)
- حذف `mock.ts` و جایگزینی با API client

**دستاورد کلیدی:** 🔒 **دیتا موندگار می‌شه** — پروژه بسازی، اپ رو ببندی، باز کنی، هنوز هست.

**نکتهٔ معماری:** رابط store عوض نمی‌شه، پس **هیچ کامپوننت UI تغییر نمی‌کنه**. این آزمون واقعی معماری پلاگین‌محوره.

---

## ⬜ مرحله ۳ — Project Generator ⭐

**مهم‌ترین مرحلهٔ کل پروژه.** اینجاست که Skaffo از یه UI قشنگ تبدیل می‌شه به یه ابزار واقعی.

**چی اضافه می‌شه:**
- موتور تمپلیت Jinja2 با delimiter سفارشی `<% %>` (که با Vue/Angular تداخل نکنه)
- پلاگین `generator-fastapi`: main.py، routers، models، schemas، services، core، config، Alembic
- پلاگین `generator-react`: Vite، Tailwind، pages، components، hooks، store، API client
- تولید Auth (JWT / OAuth) بر اساس انتخاب Wizard
- تولید Docker: Dockerfile ×۲، docker-compose، nginx
- README، .env.example، .gitignore، requirements.txt، package.json، LICENSE
- **Re-generate / Sync** ← همونی که تأیید کردی
  - ناحیهٔ محافظت‌شده با `# codeforge:keep`
  - کد دستی کاربر موقع تولید مجدد پاک نمی‌شه
  - نمایش diff قبل از اعمال

**دستاورد کلیدی:** 🚀 دکمهٔ Generate واقعاً یه پروژهٔ کامل و قابل اجرا می‌سازه.

**چرا Re-generate اینجاست:** بدون این، کاربر یه بار پروژه می‌سازه و دیگه برنمی‌گرده. این تنها چیزیه که محصول رو از «یک‌بارمصرف» نجات می‌ده.

---

## ⬜ مرحله ۴ — Database Designer واقعی

**الان:** فقط شکل می‌کشه. **بعدش:** کد تولید می‌کنه.

**چی اضافه می‌شه:**
- Schema → مدل‌های SQLAlchemy
- تولید خودکار migration با Alembic
- روابط واقعی: ForeignKey، relationship، back_populates، cascade
- اعتبارسنجی: تشخیص نام تکراری، PK گمشده، رابطهٔ حلقوی
- Import از دیتابیس موجود (reverse engineering)
- Export به SQL DDL
- Undo / Redo روی کانواس

**دستاورد کلیدی:** 🗄 جدول می‌کشی → مدل و migration واقعی بیرون میاد.

---

## ⬜ مرحله ۵ — API Designer واقعی

**چی اضافه می‌شه:**
- تولید واقعی router / schema / service / model از روی entity
- Search، Pagination، Sorting، Filtering به‌صورت کد واقعی
- endpoint دستی (غیر CRUD) با ویرایشگر
- تولید Pydantic v2 schema از روی ستون‌ها
- پیش‌نمایش OpenAPI / Swagger
- تولید تست pytest برای هر endpoint
- تولید API client تایپ‌دار برای فرانت‌اند

**دستاورد کلیدی:** 🌐 یه کلیک روی Generate CRUD → ۴ فایل واقعی و آمادهٔ اجرا.

---

## ⬜ مرحله ۶ — Export واقعی

**چی اضافه می‌شه:**
- نوشتن واقعی روی دیسک (Folder)
- ساخت ZIP واقعی
- خروجی Docker Ready
- پیش‌نمایش فایل‌ها قبل از نوشتن (dry-run)
- تشخیص تداخل: «این فایل قبلاً هست، overwrite بشه؟»
- گزارش بعد از export: چند فایل، چند خط، چه حجمی

**دستاورد کلیدی:** 📦 حلقه کامل می‌شه — از ایده تا پروژهٔ روی دیسک.

---

## 🎯 نسخهٔ ۱.۰ — Release

- نصب‌کنندهٔ ویندوز (NSIS) + macOS (dmg) + Linux (AppImage)
- آیکون، امضای دیجیتال، auto-update
- Onboarding برای اولین اجرا
- مستندات کاربر
- ذخیره/بازیابی واقعی Backup

---

## 🔮 بعد از ۱.۰

| نسخه | قابلیت | توضیح |
|---|---|---|
| **۱.۱** | Git Integration | init، commit اول، اتصال به remote |
| **۱.۲** | AI Integration | «یه فروشگاه با محصول و سبد خرید بساز» → schema خودکار |
| **۲.۰** | Plugin System | پلاگین شخص ثالث، API عمومی |
| **۲.۱** | Marketplace | تمپلیت‌های جامعه |
| **۳.۰** | استک‌های Pro | Node، Django، Vue، PostgreSQL و... |

> **توجه:** AI رو از نسخهٔ ۸ آوردم به ۱.۲ — با وضعیت فعلی بازار، اگه دیرتر بیاد محصول قدیمی به نظر می‌رسه.

---

## 📊 تخمین زمان

| مرحله | حجم کار |
|---|---|
| ۲ — FastAPI | کوچک |
| ۳ — Generator | **بزرگ** (بزرگ‌ترین مرحله) |
| ۴ — Database | متوسط |
| ۵ — API | متوسط |
| ۶ — Export | کوچک |
| v1.0 | متوسط |

مرحلهٔ ۳ تقریباً به اندازهٔ ۴+۵+۶ روی هم کار داره. اگه خواستی می‌شه شکوندش به ۳الف (بک‌اند) و ۳ب (فرانت‌اند).

---

## ⭐ قانونی که در همهٔ مراحل رعایت می‌شه

هر ماژول مستقل و پلاگین‌محور. هیچ پلاگینی پلاگین دیگه رو import نمی‌کنه.
قرارداد generator یه تابع خالصه: `context → GeneratedFile[]` و هیچ‌وقت مستقیم روی دیسک نمی‌نویسه.
فقط Export Engine می‌نویسه — به همین خاطر preview، dry-run و ZIP مجانی به‌دست میان.
