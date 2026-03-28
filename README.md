# AI Destekli Kimya Laboratuvarı

## Problem
Günümüzde özellikle mühendislik ve fen bilimleri alanlarında öğrenciler, teorik bilgiyi anlamakta ve bunu uygulamaya dönüştürmekte zorluk yaşamaktadır. Mevcut dijital eğitim araçları çoğunlukla statik içerik sunmakta, etkileşim ve kişiselleştirme açısından yetersiz kalmaktadır. Bu durum, deneysel konularda öğrencilerin formüllerin mantığını kavrayamamasına, teori ile uygulama arasında bağ kuramamasına ve öğrenme sürecine aktif katılamamasına neden olmaktadır. Buna ek olarak birçok eğitim kurumunda laboratuvar imkanlarının sınırlı olması, ekipman erişiminin kısıtlılığı, kalabalık sınıflar ve maliyet-güvenlik gibi nedenlerle deneylerin yeterince yapılamaması veya tekrar edilememesi, deneysel öğrenmeyi ciddi şekilde kısıtlamaktadır. Tüm bu eksiklikler, öğrencilerin ezbere dayalı öğrenmeye yönelmesine ve bilgi kalıcılığının düşmesine yol açmaktadır.
## Çözüm
Kullanıcıların sadece "Deney Adı" ve "Ölçülen Değerler"i girerek anında, hatasız ve adım adım çözüm alabildiği dinamik bir laboratuvar asistanı geliştirdim. Özel yapılandırılmış sistem promptları ve "Temperature: 0" kısıtlaması sayesinde yapay zekanın ezberden konuşması tamamen engellenmiştir. Sistem arka planda doğru formülü dinamik olarak tespit eder, *sadece* kullanıcının girdiği verileri kullanarak hesaplama yapar ve çıktıyı üç net başlık altında sunar: 
1. Kullanılan Formül ve Mantığı 
2. Adım Adım İşlem (Verilerin Yerine Konması) 
3. Analiz Çıktısı (Sonucun kimyasal/fiziksel yorumu).

## Canlı Demo
Yayın Linki: https://chem-buddy.lovable.app
Demo Video: https://www.loom.com/share/c9a7e560ea91451c992bd8fdda9812e9

## Kullanılan Teknolojiler
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Yapay Zeka:** [Kullandığın Model: Örn. OpenAI API / Gemini API] (İleri düzey prompt engineering ve yapılandırılmış JSON payload ile)
- **Geliştirme Ortamı:** Cursor AI IDE

## Nasıl Çalıştırılır?
1. Bilgisayarınızda terminali açın ve depoyu klonlayın: 
   `git clone https://github.com/[github-kullanici-adin]/[proje-adi].git`
2. Klonlanan proje klasörünün içine girin.
3. Kodu bir kod editöründe (VS Code / Cursor) açın.
4. Doğrudan dosya yolundan (`file:///`) kaynaklanan CORS hatalarını önlemek için projeyi **Live Server** eklentisi ile `localhost` üzerinden çalıştırın.
5. (Eğer API anahtarını gizlediysen) `.env` dosyası oluşturun ve yapay zeka API anahtarınızı ilgili değişkene tanımlayın.
