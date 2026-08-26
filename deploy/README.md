# النشر — `nabd.apps.madafa.net`

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

```bash
sudo mysql_secure_installation

sudo mysql -e "
CREATE DATABASE nabd CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nabd'@'localhost' IDENTIFIED BY 'ضع-كلمة-مرور-قوية-هنا';
GRANT ALL PRIVILEGES ON nabd.* TO 'nabd'@'localhost';
FLUSH PRIVILEGES;"
```

> **محرّك التخزين مثبَّت في `config/database.php` على `InnoDB ROW_FORMAT=DYNAMIC` ولا يُورَّث من الخادم.**
> خادم افتراضيّه MyISAM — وهو ما زال افتراض بعض الاستضافات — كان سينشئ كل الجداول **بلا معاملات وبلا مفاتيح أجنبية، ولا يقول شيئاً**. كل `DB::transaction` في المشروع يصير بلا أثر، واستيعاب المزامنة يفقد ذرّيته، ودفعة تُطبَّق جزئياً تفسد تاريخ طالب بلا خطأ في أي مكان.

## ٤. الكود

```bash
sudo mkdir -p /var/www/nabd && sudo chown -R "$USER":"$USER" /var/www/nabd
git clone <repo> /var/www/nabd
cd /var/www/nabd

cp api/.env.example api/.env
php api/artisan key:generate
```

`api/.env` للإنتاج:

```ini
APP_NAME=NABD
APP_ENV=production
APP_DEBUG=false
APP_URL=https://nabd.apps.madafa.net
APP_LOCALE=ar

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=nabd
DB_USERNAME=nabd
DB_PASSWORD=...

# لا Redis. على 2GB الذاكرة تُنفَق على PHP-FPM وMariaDB،
# وسائق قاعدة البيانات كافٍ تماماً لهذا الحجم.
CACHE_STORE=database
QUEUE_CONNECTION=database
SESSION_DRIVER=database

# دخول بضغطة للمحكمين. أطفئه فور انتهاء التحكيم.
NABD_DEMO_MODE=true

# اختياري — اكتشاف المفاهيم الخاطئة. بدونه يُربَط محلّل فارغ وكل شيء آخر يعمل.
ANTHROPIC_API_KEY=
```

## ٥. Nginx و SSL

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/nabd
sudo ln -s /etc/nginx/sites-available/nabd /etc/nginx/sites-enabled/nabd
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d nabd.apps.madafa.net --redirect
```

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
* * * * * cd /var/www/nabd/api && php artisan schedule:run >> /dev/null 2>&1
```

هذا السطر وحده يشغّل:
- `nabd:demo-reset` يومياً ٠٣:٠٠ — التحكيم يمتدّ أسابيع على رابط عام، وبدونه يفتحه العاشر ليجد صفاً شخبط عليه التسعة قبله ويستنتج أن الشيء لا يعمل.
- `nabd:discover-misconceptions` أسبوعياً — إجابة خاطئة مشتركة تحتاج أسبوع استخدام لتتراكم.

## ٨. بعد النشر

| | |
|---|---|
| الرابط | `https://nabd.apps.madafa.net` |
| رمز الصف | `NABD26` · الرقم السري `1234` |
| معلّم | `teacher@nabd.demo` / `nabd-demo` |
| صحة الخادم | `https://nabd.apps.madafa.net/up` |

**غيّر كلمات مرور العرض قبل أي بيانات حقيقية، وأطفئ `NABD_DEMO_MODE`.** نقطة تُصدِر رموزاً بلا بيانات اعتماد لا مكان لها على خادم يحمل عمل أطفال حقيقيين.

---

## إن ساءت الأمور

| العرض | السبب |
|---|---|
| البناء يُقتل بلا رسالة | لا swap — الخطوة ٢ |
| `1071 key too long` | المحرّك ليس InnoDB — تحقّق من `config/database.php` |
| التطبيق لا يعمل بدون إنترنت | لا شهادة، أو `/sw.js` مُخبَّأ. الـ SW يحتاج HTTPS ويحتاج ألا يُخبَّأ |
| 502 من `/api` | مسار مقبس PHP-FPM. `ls /run/php/` وعدّل `nginx.conf` |
| المزامنة تعمل والمعلّم لا يرى شيئاً | خطأ في التوقيت لا في المزامنة — تحقّق أن الطالب في صف هذا المعلّم |
