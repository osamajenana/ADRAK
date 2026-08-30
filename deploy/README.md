# النشر — `adrak.madafa.net`

خادم Ubuntu بـ root و2GB RAM. **بلا Docker**: سحب صورة على إنترنت غزة يكلّف مئات الميغابايتات مقابل لا شيء هنا، و2GB ذاكرة تُنفَق على التطبيق لا على طبقة تشغيل.

---

## ١. الحزم

```bash
sudo apt update && sudo apt install -y \
  nginx mariadb-server \
  php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl \
  php8.3-zip php8.3-gd php8.3-intl php8.3-bcmath \
  git unzip curl

# Node 20+ للبناء
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

## ٢. الذاكرة — خطوة إلزامية على 2GB

بناء Vite يحتاج ذاكرة أكثر مما يبدو. **بلا swap سيُقتل البناء في منتصفه** برسالة تشبه انقطاع الشبكة ولا علاقة لها بها:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## ٣. قاعدة البيانات

> **على خادم يحمل مشاريع أخرى: لا تشغّل `mysql_secure_installation`.** يغيّر مصادقة `root` ويحذف
> المستخدمين المجهولين وقاعدة `test` — وأي مشروع قائم يعتمد على أيّ من ذلك يسقط بلا إنذار. السطور
> أدناه إضافية بحتة: قاعدة جديدة ومستخدم جديد، ولا تمسّ شيئاً قائماً.

```bash
sudo mysql -e "
CREATE DATABASE adrak CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'adrak'@'localhost' IDENTIFIED BY 'ضع-كلمة-مرور-قوية-هنا';
GRANT ALL PRIVILEGES ON adrak.* TO 'adrak'@'localhost';
FLUSH PRIVILEGES;"
```

> **محرّك التخزين مثبَّت في `config/database.php` على `InnoDB ROW_FORMAT=DYNAMIC` ولا يُورَّث من الخادم.**
> خادم افتراضيّه MyISAM — وهو ما زال افتراض بعض الاستضافات — كان سينشئ كل الجداول **بلا معاملات وبلا مفاتيح أجنبية، ولا يقول شيئاً**. كل `DB::transaction` في المشروع يصير بلا أثر، واستيعاب المزامنة يفقد ذرّيته، ودفعة تُطبَّق جزئياً تفسد تاريخ طالب بلا خطأ في أي مكان.

## ٤. الكود

```bash
sudo mkdir -p /var/www/adrak && sudo chown -R "$USER":"$USER" /var/www/adrak
git clone <repo> /var/www/adrak
cd /var/www/adrak

cp api/.env.example api/.env
php api/artisan key:generate
```

`api/.env` للإنتاج:

```ini
APP_NAME=ADRAK
APP_ENV=production
APP_DEBUG=false
APP_URL=https://adrak.madafa.net
APP_LOCALE=ar

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=adrak
DB_USERNAME=adrak
DB_PASSWORD=...

# لا Redis. على 2GB الذاكرة تُنفَق على PHP-FPM وMariaDB،
# وسائق قاعدة البيانات كافٍ تماماً لهذا الحجم.
CACHE_STORE=database
QUEUE_CONNECTION=database
SESSION_DRIVER=database

# دخول بضغطة للمحكمين. أطفئه فور انتهاء التحكيم.
ADRAK_DEMO_MODE=true

# اختياري — اكتشاف المفاهيم الخاطئة. بدونه يُربَط محلّل فارغ وكل شيء آخر يعمل.
ANTHROPIC_API_KEY=
```

**وملكية الملف تُحسم هنا، لا لاحقاً:**

```bash
sudo chown root:www-data api/.env && sudo chmod 640 api/.env
```

`640` وحده فخّ: مع ملكية `root:root` لا يستطيع `www-data` قراءة الملف، **وLaravel لا يشتكي**. يقلع بلا بيئة،
فيسقط `DB_CONNECTION` إلى قيمته الافتراضية `sqlite` ويصير الخطأ «ملف قاعدة بيانات غير موجود» على مسار
لم يذكره أحد في أي إعداد. والأسوأ أن `/up` يبقى **200** طوال الوقت لأنه لا يلمس قاعدة البيانات — فيبدو
الخادم سليماً في كل فحص صحة بينما كل نقطة حقيقية تردّ 500.

والمالك `root` لا `www-data`: الملف يحمل كلمة مرور قاعدة البيانات، والعملية المعرَّضة للإنترنت تقرأه ولا تكتبه.

## ٥. PHP-FPM وNginx وSSL

**pool خاص بأدرك، قبل nginx.** على خادم يحمل مواقع أخرى هذه ليست تحسيناً بل حدود ضرر:

```bash
sudo cp deploy/php-fpm.pool.conf /etc/php/8.3/fpm/pool.d/adrak.conf
sudo php-fpm8.3 -t && sudo systemctl reload php8.3-fpm
```

> pool الافتراضي `[www]` على الخادم الذي يستضيف هذا يحمل عشرة مواقع إنتاج على `pm.max_children = 5`.
> ساكن حادي عشر في نفس الـ pool يعني أن صفاً من ثلاثين طالباً يزامنون في آخر الحصة يشغل كل عامل
> على الجهاز — والموقع الذي يبدأ بإعطاء 502 عيادة أسنان لا يذكر سجلّها أدرك بحرف.
>
> `reload` لا `restart`: الأولى إشارة `SIGUSR2` تُنهي الطلبات الجارية قبل تبديل العمّال، والثانية
> تقطعها. الفرق يقع على مواقع غيرك، فلا تستبدلها.

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/adrak
sudo ln -s /etc/nginx/sites-available/adrak /etc/nginx/sites-enabled/adrak
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d adrak.madafa.net --redirect
```

> **لا تحذف `sites-enabled/default` ولا أيّ موقع آخر.** كتلة `server` هنا تُطابَق بـ `server_name`
> وليست `default_server`، فهي تتعايش مع ما على الخادم من مواقع بلا تعارض. حذف الافتراضي على خادم
> مشترك يعني أن كل طلب لدومين لا يطابق أحداً يصير من نصيب أول موقع في الترتيب — وهو موقع شخص آخر.

> **الشهادة ليست تجميلاً.** الـ Service Worker يتطلّب سياقاً آمناً، وبدونه **لا عمل بدون إنترنت إطلاقاً** — أي أن أقوى ما في المنتج يتوقّف عن الوجود على HTTP.

## ٦. النشر

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

يُدخل وضع الصيانة → يسحب → يثبّت → يهاجر → يحمّل المحتوى → يبني الواجهة → **يفحص ميزانية الأداء ويفشل إن تُجوِزت** → يخبّئ → يخرج من الصيانة → يتحقق بثلاثة طلبات حقيقية.

## ٧. المجدول والبيانات التجريبية

```bash
php api/artisan db:seed --class=DemoSeeder --force

sudo crontab -u www-data -e
```
أضف:
```
* * * * * cd /var/www/adrak/api && php artisan schedule:run >> /dev/null 2>&1
```

هذا السطر وحده يشغّل:
- `adrak:demo-reset` يومياً ٠٣:٠٠ — التحكيم يمتدّ أسابيع على رابط عام، وبدونه يفتحه العاشر ليجد صفاً شخبط عليه التسعة قبله ويستنتج أن الشيء لا يعمل.
- `adrak:discover-misconceptions` أسبوعياً — إجابة خاطئة مشتركة تحتاج أسبوع استخدام لتتراكم.

## ٨. بعد النشر

| | |
|---|---|
| الرابط | `https://adrak.madafa.net` |
| رمز الصف | `ADRAK6` · الرقم السري `1234` |
| معلّم | `teacher@adrak.demo` / `adrak-demo` |
| صحة الخادم | `https://adrak.madafa.net/up` |

**غيّر كلمات مرور العرض قبل أي بيانات حقيقية، وأطفئ `ADRAK_DEMO_MODE`.** نقطة تُصدِر رموزاً بلا بيانات اعتماد لا مكان لها على خادم يحمل عمل أطفال حقيقيين.

---

## ترحيل نشر `nabd` قائم

الأقسام أعلاه تصف تثبيتاً جديداً. إن كان الخادم يحمل بالفعل النشر القديم تحت اسم **نبض**، فهذه هي الخطوات — ولا يكفي `git pull`، لأن اسم المشروع كان يسكن في المسار وقاعدة البيانات والدومين، وثلاثتها خارج المستودع.

**١. الدومين قبل أي شيء.** أضف سجل DNS لـ `adrak.madafa.net` يشير لنفس عنوان الخادم، وانتظر انتشاره. `deploy.sh` ينتهي بـ `curl` على الرابط الجديد وسيفشل بدونه.

**٢. المسار.**

```bash
sudo mv /var/www/nabd /var/www/adrak
cd /var/www/adrak && git pull
```

**٣. قاعدة البيانات.** أعد التسمية بدل الترحيل — لا تغيير في المخطط، والبيانات تنتقل كما هي:

```bash
sudo mysql -e "
CREATE DATABASE adrak CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'adrak'@'localhost' IDENTIFIED BY 'نفس-كلمة-المرور-أو-جديدة';
GRANT ALL PRIVILEGES ON adrak.* TO 'adrak'@'localhost';
FLUSH PRIVILEGES;"

# MariaDB لا تملك RENAME DATABASE. النقل جدولاً جدولاً هو الطريق المدعوم:
sudo mysql -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema='nabd'"   | while read t; do sudo mysql -e "RENAME TABLE nabd.$t TO adrak.$t"; done
```

**٤. `api/.env`** — خارج المستودع، فلن يلمسه `git pull`. عدّل يدوياً: `APP_NAME`، `APP_URL`، `DB_DATABASE`، `DB_USERNAME`، وكل مفتاح `NABD_*` صار `ADRAK_*` (`ADRAK_DEMO_MODE`، `ADRAK_DISCOVERY_MODEL`، `ADRAK_DISCOVERY_MIN_STUDENTS`). مفتاح `NABD_*` منسيّ لا يرفع خطأ — يعود للقيمة الافتراضية بصمت، و`ADRAK_DEMO_MODE` المنسيّ يعني `false` ويختفي دخول المحكمين بضغطة.

**٥. Nginx وSSL.**

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/adrak
sudo ln -sf /etc/nginx/sites-available/adrak /etc/nginx/sites-enabled/adrak
sudo rm -f /etc/nginx/sites-enabled/nabd /etc/nginx/sites-available/nabd
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d adrak.madafa.net --redirect
```

**٦. الكرون.** السطر القديم يشير لـ `/var/www/nabd`، والمسار لم يعد موجوداً:

```bash
crontab -e   # /var/www/nabd → /var/www/adrak
```

**٧. الصف التجريبي.** رمز الصف صار `ADRAK6` وبريد المعلّم `teacher@adrak.demo`، وكلاهما بيانات مبذورة لا مخطَّط. أعد بذرها:

```bash
php api/artisan adrak:demo-reset --force
```

**ما ينكسر عمداً:** أي رمز QR مطبوع قبل الترحيل. ترويسة إطار المزامنة كانت `NABD1` وصارت `ADRAK1`، وشاشة المعلّم سترفض القديم برسالة «هذا الرمز ليس من أدرك». وهذا هو السلوك الصحيح — الترويسة موجودة تحديداً ليفشل عدم التطابق بصوت عالٍ بدل أن يُفكّ ترميزه إلى نصف أسبوع من عمل طالب.

**وبيانات الطلاب المحلية على أجهزتهم.** قاعدة IndexedDB اسمها `adrak` بدل `nabd`، فأي عمل لم يُزامَن بعد على هاتف طالب يصير غير مرئي للتطبيق الجديد. صرّف الطوابير قبل الترحيل، أو رحّل بعد جلسة مزامنة.

---

## إن ساءت الأمور

| العرض | السبب |
|---|---|
| البناء يُقتل بلا رسالة | لا swap — الخطوة ٢ |
| `1071 key too long` | المحرّك ليس InnoDB — تحقّق من `config/database.php` |
| التطبيق لا يعمل بدون إنترنت | لا شهادة، أو `/sw.js` مُخبَّأ. الـ SW يحتاج HTTPS ويحتاج ألا يُخبَّأ |
| 502 من `/api` | الـ pool لم يُحمَّل. `ls -l /run/php/adrak.sock` — إن غاب فراجع `/var/log/php8.3-fpm.log` |
| المزامنة تعمل والمعلّم لا يرى شيئاً | خطأ في التوقيت لا في المزامنة — تحقّق أن الطالب في صف هذا المعلّم |
