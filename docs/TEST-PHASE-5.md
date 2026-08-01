# 📘 راهنمای گام‌به‌گام فاز ۵

## اول: این قابلیت اصلاً برای چیه؟

تا الان Skaffo فقط **CRUD** می‌ساخت. یعنی برای هر جدول این ۶ تا:

```
GET    /api/orders        لیست سفارش‌ها
POST   /api/orders        ساخت سفارش
GET    /api/orders/{id}   یک سفارش
PUT    /api/orders/{id}   جایگزینی
PATCH  /api/orders/{id}   ویرایش
DELETE /api/orders/{id}   حذف
```

ولی پروژهٔ واقعی همیشه چیزهای بیشتری لازم دارد:

| چیزی که می‌خواهی | CRUD می‌تواند؟ |
|---|---|
| `POST /api/orders/5/refund` — عودت وجه | ❌ |
| `GET /api/products/search?q=laptop` — جستجو | ❌ |
| `POST /api/auth/forgot-password` | ❌ |
| `GET /api/reports/sales?from=...&to=...` | ❌ |

**فاز ۵ همین را حل می‌کند:** مسیرهای دلخواه خودت را در UI طراحی می‌کنی، Skaffo اسکلت کدشان را می‌سازد، و تو فقط منطق داخلش را می‌نویسی.

---

## قبل از شروع

```cmd
cd C:\Users\ilia\Desktop\skaffo
npm run dev
```

بعد: **Projects** → روی **My Shop** دکمهٔ **Open** → از نوار کناری **API**

---

## گام ۱ — صفحهٔ API را بشناس

سه ستون می‌بینی:

```
┌──────────────┬─────────────────────────────┬──────────────┐
│  Entities    │   لیست endpointها           │ Query        │
│              │                             │ Features     │
│ All endpoints│   GET  /api/users           │              │
│ ─────────    │   POST /api/users           │ Search    ○  │
│ users     5  │   ...                       │ Pagination ○ │
│ products  2  │                             │              │
│ orders    0  │                             │              │
└──────────────┴─────────────────────────────┴──────────────┘
```

**ستون چپ** فهرست جدول‌های توست. عدد کنار هر کدام یعنی چند endpoint دارد.

> ⚠️ نکتهٔ مهم: بالای این لیست ردیفی هست به اسم **All endpoints**. **اول روی همین کلیک کن.**
>
> چرا؟ چون endpointی که می‌سازیم ممکن است به هیچ جدول خاصی وصل نباشد. اگر روی `orders` باشی، فقط endpointهای orders را می‌بینی و فکر می‌کنی چیزی ساخته نشده.

بالا سمت راست سه دکمه است:

- **OpenAPI** — مستندات کامل API را نشان می‌دهد
- **+ Endpoint** — همانی که می‌خواهیم
- **Generate CRUD** — همان ۶ تای خودکار (فقط وقتی یک جدول انتخاب شده)

---

## گام ۲ — پنجرهٔ ساخت را باز کن

روی **+ Endpoint** کلیک کن. پنجره‌ای باز می‌شود با عنوان **New Endpoint**.

از بالا به پایین:

### بخش Route

دو تا فیلد کنار هم:

- **کشوی سمت چپ** — متد HTTP. الان روی `GET` است.
- **فیلد بلند سمت راست** — مسیر.

**کاری که باید بکنی:**

۱. کشو را باز کن و **POST** را انتخاب کن
۲. در فیلد مسیر بنویس (متن قبلی `/api/` را پاک کن):

```
/api/orders/{order_id}/refund
```

> 💡 آن `{order_id}` یعنی «اینجا یک عدد متغیر می‌آید». مثلاً وقتی کاربر `/api/orders/42/refund` را صدا بزند، عدد `42` داخل `order_id` می‌رود. به این می‌گویند **path parameter**.

---

## گام ۳ — هشدار زرد را ببین

به‌محض اینکه `{order_id}` را تایپ کردی، **زیر فیلد مسیر** یک نوار زرد ظاهر می‌شود:

```
⚠ Undeclared path parameter: order_id          [ Add it ]
```

**این یعنی چه؟**

تو در مسیر گفتی «یک پارامتر به اسم `order_id` دارم»، ولی هنوز نگفتی **از چه نوعی** است — عدد؟ متن؟ Skaffo بدون این نمی‌تواند کد درست بسازد.

**کاری که باید بکنی:** روی دکمهٔ **Add it** (سمت راست همان نوار زرد) کلیک کن.

**چه اتفاقی می‌افتد:** نوار زرد ناپدید می‌شود و پایین‌تر در بخش **PARAMETERS** یک ردیف اضافه می‌شود:

```
[ order_id ]  [ path ▾ ]  [ string ▾ ]  [ default ]  ☑ req  🗑
```

**یک تغییر کوچک بده:** کشوی وسط را از `string` به **`integer`** عوض کن (چون شمارهٔ سفارش عدد است).

> توجه: برای پارامترهای `path` تیک `req` همیشه روشن و قفل است — منطقی است، چون بدون آن مسیر معنا ندارد.

---

## گام ۴ — بگو چه اطلاعاتی از کاربر می‌گیری

چون متد را روی **POST** گذاشتی، بخش جدیدی ظاهر شده به اسم **REQUEST BODY**.

**این یعنی چه؟** وقتی کسی درخواست عودت وجه می‌دهد، باید بگوید **چرا**. آن «چرا» در بدنهٔ درخواست فرستاده می‌شود:

```json
{ "reason": "کالا آسیب دیده بود" }
```

**کاری که باید بکنی:**

۱. سمت راست عنوان **REQUEST BODY** روی **+ Add** کلیک کن
۲. یک ردیف خالی می‌آید. در فیلد اول بنویس: `reason`
۳. نوعش را روی `string` بگذار (پیش‌فرض همین است)
۴. تیک `req` را روشن بگذار (یعنی اجباری است)

می‌توانی یکی دیگر هم اضافه کنی، مثلاً `amount` از نوع `decimal` بدون تیک req (اختیاری، برای عودت جزئی).

---

## گام ۵ — پیش‌نمایش را نگاه کن

بروی پایین پنجره اسکرول کن. بخش **PREVIEW** را می‌بینی:

```
POST  /api/orders/{order_id}/refund                          200

def post_orders_by_order_id_refund(
    order_id,
    payload: Body,
    db: Session = Depends(get_db),
):
```

**این همان کدی است که ساخته خواهد شد.** اگر اینجا چیزی غلط به نظر می‌رسد، همین الان درستش کن.

اختیاری، اگر می‌خواهی مرتب‌تر باشد:

- **Summary** → `Refund an order`
- **Entity** → از کشو `orders` را انتخاب کن (تا کنار این endpoint برچسب orders بخورد)
- **Description** → `عودت کامل وجه و علامت‌گذاری سفارش`

---

## گام ۶ — بساز

پایین پنجره، دکمهٔ آبی **Create endpoint** را بزن.

**چه چیزی باید ببینی:**

۱. پنجره بسته می‌شود
۲. پایین صفحه پیام سبز: `POST /api/orders/{order_id}/refund added`
۳. در لیست endpointها ردیف جدیدی آمده:

```
POST   /api/orders/{order_id}/refund   [orders] [🔶 custom]   Refund an order
```

آن برچسب نارنجی **custom** یعنی «این را تو ساختی، خودکار نبود». مهم است چون Skaffo هنگام تولید مجدد، endpointهای custom را دست نمی‌زند.

> اگر پیام قرمز دیدی که می‌گوید `already exists`، یعنی قبلاً همین مسیر را ساخته‌ای. مسیر را کمی عوض کن.

---

## گام ۷ — مستندات را ببین

بالا سمت راست، دکمهٔ **OpenAPI** را بزن.

پنجره‌ای باز می‌شود با دو حالت:

**حالت Explorer** (پیش‌فرض) — endpointها بر اساس گروه دسته‌بندی شده‌اند. endpoint جدیدت را پیدا کن و روی آن کلیک کن تا باز شود. می‌بینی:

- **Parameters** → `order_id · path · integer · required`
- **Request body** → schema با `reason`
- **Responses** → `200` و `404` و `422`

**حالت JSON** — همان چیز به شکل خام. دکمهٔ **Copy** آن را کپی می‌کند.

> 💡 این JSON استاندارد **OpenAPI 3.1** است. می‌توانی آن را در [editor.swagger.io](https://editor.swagger.io) بچسبانی و مستندات تعاملی کاملش را ببینی. یا به تیم فرانت‌اند بدهی تا دقیقاً بدانند چه API‌ای می‌آید.

پنجره را با ✕ ببند.

---

## گام ۸ — کد واقعی را تولید کن

از نوار کناری برو به **Export**، بعد دکمهٔ **Generate** را بزن.

بعد از تمام شدن، در ستون راست (**OUTPUT**) درخت فایل‌ها را می‌بینی. این مسیر را باز کن:

```
backend  →  app  →  routers  →  custom.py
```

روی `custom.py` **کلیک کن** تا محتوایش باز شود. باید چیزی شبیه این ببینی:

```python
class PostOrdersByOrderIdRefundBody(BaseModel):
    reason: str


@router.post(
    "/api/orders/{order_id}/refund",
    status_code=200,
    summary="Refund an order",
)
def post_orders_by_order_id_refund(
    order_id: int,
    payload: PostOrdersByOrderIdRefundBody,
    db: Session = Depends(get_db),
):
    """Refund an order

    عودت کامل وجه و علامت‌گذاری سفارش
    """
    # codeforge:keep:start post_orders_by_order_id_refund
    # Your implementation goes here — this block is never overwritten.
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "post_orders_by_order_id_refund is not implemented yet",
    )
    # codeforge:keep:end
```

**همان چیزی که در UI طراحی کردی، تبدیل به کد واقعی پایتون شده.**

آن `501 NOT_IMPLEMENTED` عمدی است — یعنی «مسیر آماده است، منطقش با تو».

همچنین این فایل را هم نگاه کن:

```
backend  →  tests  →  test_custom.py
```

Skaffo برای endpointت خودکار تست نوشته.

---

## گام ۹ — تست نهایی: واقعاً کار می‌کند؟

پروژهٔ تولیدشده را اجرا کن:

```cmd
cd C:\Users\ilia\Documents\SkaffoProjects\my-shop\backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --reload
```

مرورگر را باز کن:

```
http://127.0.0.1:8000/docs
```

- [ ] endpoint خودت در لیست هست
- [ ] رویش کلیک کن → **Try it out** → یک عدد برای `order_id` بده و `reason` را پر کن → **Execute**
- [ ] پاسخ `501` می‌گیری — **یعنی همه‌چیز درست کار می‌کند**، فقط هنوز منطق ننوشته‌ای

---

## گام ۱۰ — منطقت را بنویس (اختیاری، ولی نکتهٔ اصلی همین است)

فایل `custom.py` را در ویرایشگرت باز کن و بین دو نشانه کد بنویس:

```python
    # codeforge:keep:start post_orders_by_order_id_refund
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    order.status = "refunded"
    db.commit()
    return {"ok": True, "refunded": order.total, "reason": payload.reason}
    # codeforge:keep:end
```

ذخیره کن. حالا **آزمون واقعی**:

۱. برگرد به Skaffo
۲. یک تغییر بده — مثلاً در **Database** یک ستون جدید به جدولی اضافه کن
۳. برو **Export → Generate** دوباره
۴. فایل `custom.py` را دوباره باز کن

**کد دست‌نویس تو هنوز آنجاست.** ✅

این مهم‌ترین ویژگی کل محصول است: می‌توانی بی‌نهایت بار تولید مجدد کنی بدون اینکه کارت را از دست بدهی.

---

## خلاصهٔ خیلی سریع

اگر فقط می‌خواهی مطمئن شوی کار می‌کند:

1. **API** → روی **All endpoints** کلیک کن
2. **+ Endpoint** → متد `POST` → مسیر `/api/test/hello`
3. **Create endpoint**
4. ردیف جدید با برچسب نارنجی **custom** ظاهر شد؟ ✅
5. **OpenAPI** → آنجا هم هست؟ ✅

همین کافی است.

---

## اگر گیر کردی

| مشکل | علت احتمالی |
|---|---|
| دکمهٔ **+ Endpoint** نیست | نسخهٔ قدیمی — ZIP جدید را extract کن |
| **Create endpoint** خاکستری است | مسیر باید با `/` شروع شود و بیش از یک حرف باشد |
| پیام `already exists` | همان مسیر و متد قبلاً هست؛ مسیر را عوض کن |
| endpoint را نمی‌بینم | روی **All endpoints** کلیک کن، نه روی یک جدول |
| `custom.py` در درخت نیست | حداقل یک endpoint دستی لازم است؛ بعد دوباره Generate بزن |
