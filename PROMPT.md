# Site Yönetim Paneli - AI Prompt

Bu uygulama bir yapay zeka kodlama asistanı (Antigravity vb.) kullanılarak oluşturulmuştur. Aşağıdaki prompt, bu projenin sıfırdan yapay zekaya yaptırılması için kullanılabilecek temel metni (yönergeyi) içermektedir.

---

## Proje İstemi (Prompt)

```text
Bir "Site Yönetim Paneli" masaüstü uygulaması geliştirmek istiyorum. Aşağıdaki gereksinimleri sağlayacak şekilde projeyi planla ve kodla:

1. **Teknoloji Yığını:** 
   - Masaüstü uygulaması için Electron.js kullan.
   - Veritabanı olarak SQLite kullan ve verileri proje dizininde "veritabani/site_yonetim.sqlite" dosyasına kaydet.
   - Arayüzde Vanilla HTML, CSS ve JavaScript kullan.
   - Grafikler için Chart.js, harita için Leaflet.js kullan.

2. **Veritabanı Yapısı:**
   - "daireler" tablosu (id, blok, daire_no, sakin_ad, sakin_telefon, sakin_mail, sakin_daire_konum)
   - "aidatlar" tablosu (id, daire_id, yil, ay, tutar, odendi_mi)

3. **Arayüz (UI) ve Tasarım (UX):**
   - Premium, modern, Dark Mode (koyu tema) ağırlıklı bir tasarım yap.
   - Glassmorphism (cam efekti) efektleri ve şık animasyonlar kullan.
   - Sol tarafta bir menü (Dashboard, Sakinler & Aidatlar, Harita) olsun.
   - "Dashboard" sayfasında toplam daire sayısı, bu ay aidat ödeyen/ödemeyen sayısı ve Chart.js ile "Aidat Ödeme Oranları" pasta grafiği bulunsun.

4. **İşlevsellik:**
   - "Sakinler & Aidatlar" sayfasında, üstten bir "Daire/Kişi" seçilebilsin.
   - Daire seçilince kişinin iletişim ve konum bilgileri (sakin_telefon, sakin_mail, sakin_daire_konum) bir kart içinde gösterilsin.
   - Seçilen dairenin geçmiş aidat bilgileri bir tabloda listelensin (Yıl, Ay, Tutar, Durum).
   - Bu tablo üzerinden aidat "Ödendi" veya "Ödenmedi" olarak değiştirilebilsin.
   - Sağ üstteki "+ Manuel Aidat Ekle" butonuna basınca geçmiş bir döneme ait aidat bilgisi manuel olarak girilip kaydedilebilsin.

5. **Harita Özelliği:**
   - "Harita" sekmesinde Leaflet.js kullanarak uydu haritası (Google Satellite tile) yükle.
   - Harita, "Ankara, Altınbel Sitesi" koordinatlarına odaklansın.
   - Sitenin sınırlarını belirten, içi yarı saydam, kırmızı çizgili bir poligon (çokgen) çiz.

6. **İletişim (IPC):**
   - Veritabanı işlemleri `main.js` (Main Process) üzerinde yürütülsün.
   - Arayüz (Renderer Process), `ipcRenderer.invoke` üzerinden Main Process'e sorgu atarak verileri çeksin ve yazsın.
```
