# AI Destekli Kimya Laboratuvarı

## Problem
Kimya mühendisliği laboratuvarlarında (Fizikokimya, Akışkanlar Mekaniği, Analitik Kimya vb.) yapılan deneylerde, karmaşık matematiksel modellerin çözümü ve elde edilen sonuçların teorik olarak yorumlanması öğrenciler için zorlayıcı ve hataya açık bir süreçtir. Öte yandan, standart üretken yapay zeka araçları bu hesaplamalara yardımcı olmakta yetersiz kalmaktadır; çünkü anlık ölçüm verilerini analiz etmek yerine genellikle kendi eğitim verilerindeki teorik standart cevapları üreterek (halüsinasyon) kullanıcıyı yanıltmaktadır. 

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
