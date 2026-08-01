# Phase 5 — API Designer واقعی ✅

طراح API دیگر فقط لیست نگه نمی‌دارد: endpoint دستی می‌سازی، OpenAPI زنده می‌بینی، و کد و تست واقعی تولید می‌شود.

---

## چی اضافه شد

### ۱. ویرایشگر کامل endpoint

هر چیزی که یک endpoint لازم دارد، از UI:

- **Route** — method و path با پشتیبانی از `{param}`
- **Parameters** — query / path / header، با نوع، اجباری‌بودن، مقدار پیش‌فرض و توضیح
- **Request body** — فیلدهای دلخواه با نوع و اجباری‌بودن
- **Response** — نوع (entity / list / custom / none)، کد وضعیت، tag
- **Auth** — نیاز به احراز هویت
- **پیش‌نمایش زنده** — امضای تابع پایتون همان‌جا ساخته می‌شود

اگر در path پارامتری بنویسی که تعریف نشده، هشدار می‌دهد و دکمهٔ افزودن خودکار می‌گذارد.

### ۲. تولید کد

endpointهای دستی به `backend/app/routers/custom.py` می‌روند، جدا از CRUD تولیدشده. بدنهٔ هر تابع یک **ناحیهٔ محافظت‌شده** است:

```python
@router.post("/api/orders/{order_id}/refund", status_code=200, summary="Refund an order")
def post_orders_by_order_id_refund(
    order_id: int,
    payload: PostOrdersByOrderIdRefundBody,
    db: Session = Depends(get_db),
):
    """Refund an order

    Issues a full refund and marks the order refunded.
    """
    # codeforge:keep:start post_orders_by_order_id_refund
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "...")
    # codeforge:keep:end
```

منطق خودت را داخل نشانه‌ها می‌نویسی و هرگز پاک نمی‌شود.

### ۳. تست خودکار برای هر endpoint

`backend/tests/test_custom.py` برای هر endpoint یک تست قرارداد می‌سازد: مسیر ثبت شده؟ ۴۰۴ نمی‌دهد؟ اعتبارسنجی ورودی کار می‌کند؟ تا وقتی پیاده‌سازی نکرده‌ای ۵۰۱ را می‌پذیرد، پس سوئیت همیشه سبز است.

### ۴. پیش‌نمایش OpenAPI 3.1

`GET /api/projects/{pid}/api/openapi` سند کامل می‌سازد و UI آن را دو حالته نشان می‌دهد:

- **Explorer** — گروه‌بندی بر اساس tag، رنگ متد، قفل برای مسیرهای محافظت‌شده، جزئیات بازشونده
- **JSON** — سند خام با دکمهٔ Copy

سند شامل schemaهای component (`Product` / `ProductCreate` / `ProductPage`)، securityScheme، و پاسخ‌های ۴۰۴ و ۴۲۲ است.

### ۵. نمای All endpoints

سایدبار حالا یک ردیف «All endpoints» دارد که همهٔ مسیرها را یکجا نشان می‌دهد — لازم بود چون endpoint دستی ممکن است به هیچ جدولی وصل نباشد.

---

## 🐛 چهار باگ واقعی

**۱. `Decimal` تعریف‌نشده** — تولید بدنهٔ درخواست با فیلد decimal کد نامعتبر می‌ساخت. حالا importها از روی نوع‌های استفاده‌شده محاسبه می‌شوند.

**۲. ترتیب مسیرها** 🔑 مهم‌ترین — `/api/products/search` بعد از `/api/products/{item_id}` ثبت می‌شد، پس Starlette کلمهٔ `search` را به‌عنوان `item_id` می‌گرفت و ۴۲۲ می‌داد. حالا مسیرهای دستی **اول** ثبت می‌شوند.

**۳. مقدار پیش‌فرض رشته‌ای در OpenAPI** — اعتبارسنج رسمی گرفت: `'20' is not of type 'integer'`. مقادیر در UI متن‌اند ولی در سند باید نوع واقعی داشته باشند.

**۴. عرض فیلد در ویرایشگر** — پرایمیتیوهای `Input`/`Select` کلاس `w-full` دارند و `w-32`/`flex-1` را می‌بلعیدند؛ فیلد path به یک نوار باریک تبدیل شده بود. با wrapper اندازه‌دار حل شد.

---

## مهاجرت دیتابیس

جدول `endpoints` نه ستون جدید گرفت. برای اینکه نصب‌های موجود نشکنند، یک مهاجر سبک اضافه شد (`app/core/migrate.py`) که فقط ستون گمشده اضافه می‌کند و idempotent است.

تست شد روی یک دیتابیس شبیه‌سازی‌شدهٔ v0.4: ۷ ستون → ۱۶ ستون، دادهٔ قبلی سالم.

---

## ✅ تست‌ها

```
engine/tests            →  85 passed
  test_path_safety.py   →  24
  test_schema_tools.py  →  27
  test_api_designer.py  →  34  ← فاز ۵
```

پوشش فاز ۵: نام‌گذاری تابع (شامل مسیر خصمانه)، literalهای پایتون، مرتب‌سازی پارامترها، بدنه فقط برای متدهای نوشتنی، **اعتبارسنجی سند با `openapi-spec-validator` رسمی**، و بررسی اینکه همهٔ فایل‌های `.py` تولیدشده با `ast.parse` معتبرند.

### تأیید روی کد تولیدشده

```
pytest (generated)  →  12 passed   (۹ CRUD + ۳ custom)
app imports         →  OK
POST /orders/1/refund        →  501 (placeholder، طبق طراحی)
GET  /products/search?q=x    →  501
GET  /products/search        →  422 (اعتبارسنجی کار می‌کند)
GET  /products/1             →  404 (CRUD نشکسته)
```

### end-to-end در Electron

```
endpoints before : 7
create endpoint  : 8 ✅
custom badge     : ✅
OpenAPI explorer : 19 operations ✅
console errors   : 0
```

---

## ⏭ مرحلهٔ ۶

Export واقعی: نوشتن ZIP، خروجی Docker، dry-run، و گزارش بعد از export.
