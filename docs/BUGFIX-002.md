# BUGFIX-002 — `database is locked`

**شدت:** بالا · **وضعیت:** رفع شد · **گزارش:** کاربر، هنگام تست فاز ۴

---

## علائم

اپ هنگام استفادهٔ عادی کرش می‌کرد:

```
sqlite3.OperationalError: database is locked
[SQL: INSERT INTO columns (...) VALUES (?, ?, ...)]
```

در لاگ کاربر یک سرنخ مهم دیگر هم بود:

```
[ELECTRON] wait-on tcp:5273 && electron . exited with code 1     ← اجرای قبلی
[VITE]     VITE v6.4.3  ready in 81952 ms                        ← ۸۲ ثانیه!
```

---

## سه علت ریشه‌ای

### ۱. نبود `busy_timeout`

`create_engine` فقط `check_same_thread` را ست می‌کرد. SQLite به‌صورت پیش‌فرض تنها **۵ ثانیه** برای آزادشدن قفل صبر می‌کند و بعد خطا می‌دهد. یک عملیات Undo دهها نوشتن پشت‌سرهم تولید می‌کرد و از این حد عبور می‌کرد.

### ۲. پروسهٔ پایتون یتیم

خط `exited with code 1` نشان می‌داد اجرای قبلی درست بسته نشده. آن پروسهٔ پایتون زنده می‌ماند و **روی همان فایل دیتابیس قفل نگه می‌داشت**. اجرای بعدی چون پورت آزاد بعدی را انتخاب می‌کرد بالا می‌آمد، اما دو موتور روی یک دیتابیس می‌جنگیدند.

### ۳. Undo با N درخواست به‌جای یکی

پیاده‌سازی اول `restore()` این کار را می‌کرد:

```
برای هر جدول موجود      → DELETE
برای هر جدول در snapshot → POST
برای هر ستون            → POST/PATCH
برای هر رابطه           → POST
```

بازگرداندن یک جدول ۷ ستونه یعنی بیش از ۱۰ تراکنش جدا در چند صد میلی‌ثانیه. این عملاً یک تست فشار روی SQLite بود.

---

## رفع

### الف) تنظیمات مقاوم دیتابیس

```python
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 30},
    poolclass=StaticPool,          # یک اتصال مشترک
)

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _record):
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=30000")   # ۳۰ ثانیه صبر
    cur.execute("PRAGMA synchronous=NORMAL")
```

`StaticPool` جلوی رقابت نویسنده‌ها درون پروسه را می‌گیرد — SQLite در هر لحظه فقط یک نویسنده می‌پذیرد.

### ب) پاک‌سازی پروسه‌های یتیم

`electron/engine.cjs` قبل از هر اجرا موتورهای جامانده را می‌کشد:

```js
function killOrphans(onLog) {
  if (isWin) {
    // فقط sidecar خودمان: python که app.main اجرا می‌کند
    spawnSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*app.main*' " +
      "-and $_.Name -like 'python*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"]);
  } else {
    spawnSync('pkill', ['-f', 'app.main --port']);
  }
}
```

الگو به‌قدر کافی خاص هست که پایتون‌های دیگر کاربر را نکشد.

### ج) جایگزینی اتمی schema

endpoint جدید `PUT /api/projects/{pid}/schema` کل schema را در **یک تراکنش** عوض می‌کند. چون شناسه‌ها سمت سرور بازتولید می‌شوند، روابط با **اندیس موقعیتی** ستون فرستاده می‌شوند و سرور خودش نگاشت می‌کند.

`restore()` از ~۱۰ درخواست به **۱** رسید.

---

## تأیید

```
۲۵ نوشتن پشت‌سرهم ستون      →  همه ۲۰۱، صفر قفل
۲۴ نوشتن از دو موتور همزمان →  همه ۲۰۱، صفر قفل
```

سناریوی کامل در Electron:

```
before      : 3 جدول، 2 رابطه
delete orders: 2 جدول، 0 رابطه
after undo  : 3 جدول، 2 رابطه — بازیابی در t+1s
console errors: 0
```

قبلاً چند ثانیه طول می‌کشید و گاهی قفل می‌کرد؛ حالا زیر یک ثانیه است.

`engine/tests` → **51 passed**

---

## نکتهٔ جانبی: کندی ۸۲ ثانیه‌ای Vite

`VITE ready in 81952 ms` طبیعی نیست (روی این ماشین ~۲.۷ ثانیه است). تقریباً همیشه Windows Defender است که `node_modules` را اسکن می‌کند. راه‌حل، در PowerShell با دسترسی Administrator:

```powershell
Add-MpPreference -ExclusionPath "C:\Users\ilia\Desktop\skaffo"
```

---

## درس

خطای «database is locked» تقریباً هیچ‌وقت یک باگ نیست، بلکه سه چیز را با هم نشان می‌دهد: تنظیمات سهل‌گیرانه، چرخهٔ حیات ناقص پروسه، و الگوی دسترسی پرسروصدا. رفع فقط یکی از این سه، مشکل را کمیاب‌تر می‌کرد نه ناپدید.
