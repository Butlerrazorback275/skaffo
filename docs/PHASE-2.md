# Phase 2 — FastAPI Sidecar ✅

## هدف
بک‌اند واقعی زیر UI، به‌جای mock data. دیتا باید بعد از بستن اپ باقی بمونه.

---

## چی ساخته شد

### `engine/` — اپ FastAPI

```
engine/
├─ app/
│  ├─ main.py              FastAPI app + lifespan + CORS
│  ├─ core/
│  │  ├─ config.py         مسیر دیتابیس per-OS، پورت، CORS
│  │  └─ database.py       SQLAlchemy engine, WAL, foreign_keys=ON
│  ├─ models/__init__.py   7 جدول ORM
│  ├─ schemas/__init__.py  Pydantic v2 (camelCase = تایپ‌های TS)
│  ├─ routers/
│  │  ├─ projects.py       CRUD پروژه + build/export
│  │  ├─ schema.py         جدول‌ها، ستون‌ها، روابط
│  │  ├─ api_design.py     endpointها + CRUD flags
│  │  └─ misc.py           health، activity، settings
│  └─ services/
│     ├─ serialize.py      ORM → wire format
│     └─ seed.py           دیتای دمو در اولین اجرا
└─ requirements.txt
```

### مدل داده

`projects` · `tables` · `columns` · `relations` · `endpoints` · `crud_options` · `activities` · `app_settings`

همه با `ON DELETE CASCADE`. پروژه رو پاک کنی، همه‌چیزش پاک می‌شه.

### محل دیتابیس

| OS | مسیر |
|---|---|
| Windows | `%APPDATA%\Skaffo\skaffo.db` |
| macOS | `~/Library/Application Support/Skaffo/` |
| Linux | `~/.local/share/Skaffo/` |

بیرون از پوشهٔ پروژه — یعنی آپدیت اپ دیتا رو پاک نمی‌کنه.

### `electron/engine.cjs` — مدیریت پروسهٔ پایتون

- پیدا کردن پورت آزاد از ۸۷۳۱ به بالا (تداخل نداشته باشه)
- دیو: `engine/.venv/…/python -m app.main`
- پروداکشن: باینری PyInstaller از `resources/engine/`
- fallback به `python` روی PATH اگه venv نبود
- kill درست موقع خروج (`taskkill /t` روی ویندوز)
- پورت از طریق `additionalArguments` → preload → `window.skaffo.enginePort`

### `src/core/api.ts` — کلاینت تایپ‌دار

هر endpoint یه متد. `waitForEngine()` تا ۳۰ ثانیه poll می‌کنه چون پایتون کندتر از Electron بالا میاد.

### `src/ui/BootGate.tsx`

سه حالت: **Starting engine…** → **اپ** یا **صفحهٔ خطا** با دستور دقیق رفع مشکل و دکمهٔ Retry.

---

## الگوهای مهم در store

**Optimistic برای چیزهای پرتکرار** — تایپ کردن اسم ستون، جابه‌جایی جدول. UI فوراً آپدیت می‌شه، خطا بخوره `refresh()` می‌شه.

**Debounce روی drag** — کشیدن جدول ده‌ها event تولید می‌کنه؛ فقط موقعیت نهایی بعد از ۵۰۰ms ذخیره می‌شه.

**Reload بعد از تغییرات ساختاری** — افزودن/حذف جدول یا رابطه، کل پروژه رو دوباره می‌خونه تا state قطعاً درست باشه.

---

## ✅ تست‌ها

| تست | نتیجه |
|---|---|
| health + ۵ پروژهٔ seed | ✅ |
| ساخت پروژه از API | ✅ |
| افزودن جدول و ستون | ✅ |
| Generate CRUD (۶ endpoint) | ✅ |
| ذخیره و بازخوانی settings | ✅ |
| **بقای دیتا بعد از ری‌استارت پروسه** | ✅ |
| Electron پایتون رو اجرا می‌کنه | ✅ |
| UI با badge «SQLite» بالا میاد | ✅ |
| افزودن جدول از UI: ۳ → ۴ | ✅ |
| **relaunch اپ: جدول جدید سر جاشه** | ✅ |
| خطای کنسول | **صفر** |

### باگ واقعی که پیدا و رفع شد

`Content-Security-Policy` توی `index.html` فقط `connect-src 'self' ws://localhost:5273` رو اجازه می‌داد. مرورگر **همهٔ** درخواست‌ها به `127.0.0.1:8731` رو بلاک می‌کرد و اپ بی‌صدا offline می‌موند.

رفع: اضافه کردن `http://127.0.0.1:* http://localhost:*` به `connect-src` — لازمه چون پورت موتور داینامیکه.

---

## 🎯 آزمون معماری

`mock.ts` **حذف شد** و هیچ ارجاعی بهش نبود.

هیچ کامپوننت UI‌ای عوض نشد جز:
- `App.tsx` — دو خط برای `<BootGate>`
- `Topbar.tsx` — badge «Mock Data» شد نشانگر زندهٔ اتصال

Dashboard، Projects، Templates، DatabaseDesigner، ApiDesigner، Export، Settings، Wizard — **دست‌نخورده**.

این دقیقاً همون چیزیه که معماری پلاگین‌محور قرار بود بده.

---

## 🚀 اجرا

### اولین بار

```cmd
setup-engine.bat
```

### هر بار

```cmd
npm run dev
```

Electron خودش موتور پایتون رو بالا میاره و موقع خروج می‌بنده.

### فقط مرورگر

```cmd
npm run dev:web
```

Vite و موتور رو با هم اجرا می‌کنه. مستندات API: `http://127.0.0.1:8731/docs`

---

## ⏭ مرحلهٔ ۳ — Project Generator

مهم‌ترین مرحله. Jinja2 با delimiter سفارشی `<% %>`، پلاگین‌های `generator-fastapi` و `generator-react`، و **Re-generate/Sync** با ناحیهٔ محافظت‌شدهٔ `# codeforge:keep`.
