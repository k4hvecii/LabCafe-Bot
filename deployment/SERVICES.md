# Bağımsız bot ve dashboard servisleri

`labcafe-bot.service` ve `labcafe-dashboard.service` ayrı Node süreçleri ve
systemd cgroup'ları kullanır. Birbirlerini Requires, PartOf veya BindsTo ile
başlatmaz/durdurmazlar. Ayrı yeniden başlatma, 512 MB bellek sınırı ve journal
logları vardır. Başlangıçta build çalıştırılmaz; iki servis aynı dist klasörünü
eşzamanlı temizleyemez. Güncellemede build bir kez, servislerin dışında yapılır.

Sunucu uygulaması `/opt/labcafe` altında root sahipliğinde salt okunur tutulur.
`/root/labcafe` hazırlık/yedek alanı olabilir; servis kullanıcısına /root erişimi
açılmaz. Node `/opt/labcafe-runtime/node` konumunda ve 24.17+ olmalıdır. Root hesabının NVM dizinine bağımlı olmamalıdır.

Ortak veri: `/var/lib/labcafe/settings.sqlite`. systemd StateDirectory bu dizini
labcafe kullanıcısına yazılabilir açar. Mevcut yerel data/settings.sqlite silinmez;
üretimde mevcut veri varsa iki süreç kapalıyken yedeklenip bu konuma taşınmalıdır.
LABCAFE_SETTINGS_PATH tanımsızken eski yerel dosya yolu kullanılmaya devam eder.

Gizli ortam dosyaları `/etc/labcafe/bot.env` ve `/etc/labcafe/dashboard.env`:

- İkisinde DISCORD_TOKEN ve DISCORD_CLIENT_ID gerekir.
- Bot dosyasında isteğe bağlı DISCORD_GUILD_ID ve LOG_LEVEL bulunur.
- Dashboard dosyasında DISCORD_CLIENT_SECRET, DASHBOARD_ORIGIN,
  DASHBOARD_SUPPORT_GUILD_ID ve DASHBOARD_SUPPORT_INVITE_URL bulunur.
- Public bot için DISCORD_GUILD_ID boş olmalıdır. Yerel .env korunur.
- Dosyalar root:root ve 0600 olmalı; tokenı komut satırına yazmayın.

Kaynak, bağımlılıklar ve gizli ayarlar hazır olduktan sonra:

```sh
sudo useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin labcafe
sudo install -d -m 700 /etc/labcafe
# Uygulama dosyalarını /opt/labcafe konumuna kurun, npm ci ve build çalıştırın.
# İki ortam dosyasını güvenli editörde hazırlayın; .env dosyasını kaynaklara eklemeyin.
sudo install -m 644 deployment/labcafe-bot.service deployment/labcafe-dashboard.service /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/labcafe-{bot,dashboard}.service
sudo systemctl daemon-reload
sudo systemctl enable --now labcafe-bot labcafe-dashboard
```

Kullanıcı zaten varsa useradd adımını atlayın. Ortam dosyaları ve uygulama
hazır değilken servisleri başlatmayın. Dashboard yalnızca 127.0.0.1:3000 dinler;
HTTPS nginx üzerinden sağlanır.

```sh
systemctl status labcafe-bot labcafe-dashboard
systemctl restart labcafe-bot
systemctl restart labcafe-dashboard
journalctl -u labcafe-bot -n 50 --no-pager
journalctl -u labcafe-dashboard -n 50 --no-pager
```

Süreç izolasyonu VPS veya disk arızasını, ortak SQLite dosyasındaki sorunu ya da
Discord kesintisini ortadan kaldırmaz. Web oturumları bellekte olduğundan web
yeniden başladığında kullanıcılar tekrar giriş yapar; bot bundan etkilenmez.
Otomatik süreç testi Discord'a bağlanmadan gerçek bot istemcisini ve web
sunucusunu ayrı çocuk süreçlerde açar, sırayla sonlandırır ve veri kalıcılığını
kontrol eder. Canlı Discord ve systemd restart kabul testi ayrıca yapılmalıdır.

Dahili sağlık: bot http://127.0.0.1:3001/healthz (BOT_HEALTH_PORT), dashboard http://127.0.0.1:3000/healthz. 200 hazır, 503 hazır değil. Bot Gateway + SQLite, Web yalnızca HTTP + SQLite kontrol eder; OAuth ve Discord REST erişimi garanti edilmez. Public nginx /healthz erişimini kapatın. Bu endpointler otomatik systemd watchdog değildir.
