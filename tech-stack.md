## 💻 Kullanılan Teknolojiler ve Mimari (Tech Stack & Architecture)

**🧠 Yapay Zeka Mimarisi (Multi-Agent System)**
* **Google Gemini API:** Projenin çekirdek zekası olarak kullanılmıştır.
* **Özelleştirilmiş AI Ajanları (Agents):** Tüm yükü tek bir modele bindirmek yerine, spesifik laboratuvar görevleri için `temperature` ve sistem promptları (System Instructions) optimize edilmiş modüler ajan mimarisi tasarlanmıştır:
  * `Analyzer Agent:` Sıfır halüsinasyon (`temperature: 0`) ile çalışan, kimyasal proses ve fizikokimya formüllerini kesin doğrulukla çözen analitik hesaplama motoru.
  * `Tutor Agent:` Laboratuvar deneylerinin teorik arka planını lisans düzeyinde açıklayan akademik rehber.
  * `Quiz Agent:` Kullanıcının laboratuvar ve formül bilgisini anlık olarak ölçen dinamik test modülü.

**⚙️ Backend (Sunucu ve İş Mantığı)**
* **Node.js & Express.js:** Frontend'den gelen istekleri karşılayıp ilgili AI ajanına yönlendiren (router) sunucu altyapısı (`server.js`).
* **Clean Code Mimarisi:** Ajan fonksiyonlarının (`agents/` klasörü) ve sunucu rotalarının birbirinden tamamen izole edildiği, kolay ölçeklenebilir ve yönetilebilir arka uç tasarımı.

**🖥️ Frontend (Kullanıcı Arayüzü)**
* **HTML5 & CSS3:** Laboratuvar temasına uygun, temiz ve modern arayüz tasarımı.
* **Vanilla JavaScript:** Ağır framework'ler kullanılmadan, arka plandaki ajanlarla doğrudan ve asenkron (fetch API) haberleşen hızlı istemci mimarisi.

**🚀 Araçlar ve Dağıtım (DevOps & Deployment)**
* **Vercel:** Uygulamanın ve Node.js backend'inin (serverless fonksiyonlar olarak) internette canlıya alınması (`vercel.json`).
* **npm:** Paket ve bağımlılık yönetimi (`package.json`).
* **dotenv:** API anahtarları gibi hassas verilerin sunucu tarafında güvenli bir şekilde saklanması.