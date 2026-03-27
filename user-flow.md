## 🔄 Kullanıcı Akışı (User Flow)

Uygulamanın çalışma mantığı, kullanıcının laboratuvar verilerini girip yapay zekadan anında doğrulanmış geri bildirim alması üzerine kuruludur:

**1. Arayüze Giriş (Landing):**
Kullanıcı web uygulamasına erişir ve sade, laboratuvar temalı arayüzle karşılaşır.

**2. Parametre ve Veri Girişi:**
Kullanıcı; gerçekleştirdiği **Deneyin Adını** ve laboratuvarda ölçtüğü/verilen değerleri (örn: sıcaklık, hacim, süre, yoğunluk) ilgili giriş alanlarına yazar.

**3. İşlem Seçimi (Aksiyon):**
Kullanıcı, yapmak istediği işleme göre menüden bir mod seçer:
- `🧪 Analiz Et:` Girilen verilerle matematiksel hesaplama ve hata analizi yapar.
- `🎓 Konuyu Öğret:` Deneyin arkasındaki teorik fizikokimya/termodinamik prensiplerini anlatır.
- `🔬 İnteraktif Deney / 📝 Quiz Başlat:` Konuyu pekiştirmek için kullanıcıyı teste tabi tutar.

**4. Arka Plan İşlemi (Backend & AI API):**
- Frontend, girilen verileri güvenli bir şekilde Node.js sunucusuna iletir.
- Sunucu, verileri özel hazırlanmış bir "System Prompt" (Sıfır halüsinasyon, Temperature: 0) ile paketleyerek Google Gemini API'ye gönderir.
- Yapay Zeka, sadece kullanıcının girdiği anlık verileri referans alarak doğru formülü bulur ve hesaplamayı tamamlar.

**5. Çıktı ve Görüntüleme (Output):**
İşlenen veriler arayüze döner ve kullanıcı ekranında 3 yapılandırılmış başlık halinde gösterilir:
1. **Kullanılan Formül** (Örn: Poiseuille Denklemi)
2. **Adım Adım Hesaplama** (Verilerin formülde yerine konmuş hali)
3. **Analiz/Öğretim Çıktısı** (Bulunan sonucun kimyasal yorumu)