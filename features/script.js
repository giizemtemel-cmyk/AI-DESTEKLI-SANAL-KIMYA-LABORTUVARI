const analysisOutput = document.getElementById("analysisOutput");
const teachingOutput = document.getElementById("teachingOutput");
const simulationOutput = document.getElementById("simulationOutput");
const simulationPanel = simulationOutput.parentElement;
const analyzeBtn = document.getElementById("analyzeBtn");
const teachBtn = document.getElementById("teachBtn");
const simulateBtn = document.getElementById("simulateBtn");
const quizBtn = document.getElementById("quizBtn");
const quizModal = document.getElementById("quizModal");
const quizCloseBtn = document.getElementById("quizCloseBtn");
const quizSubtitle = document.getElementById("quizSubtitle");
const quizProgress = document.getElementById("quizProgress");
const quizBody = document.getElementById("quizBody");
const quizActions = document.getElementById("quizActions");
const REQUEST_TIMEOUT_MS = 12000;

/** Sunucudaki modüler rotalarla uyumlu (backend: /api/analyze, /api/tutor, …). */
const API_ANALYZE = "api/analyze";
const API_TUTOR = "api/tutor";
const API_SIMULATE = "api/simulate";

function normalizeBaseUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return s.replace(/\/+$/, "");
}

/** file://, localhost, 127.0.0.1 → yerel geliştirme; canlı domain → false (göreceli API yolu). */
function isLocalDevContext() {
  if (window.location.protocol === "file:") return true;
  const h = String(window.location.hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "";
}

function joinApiUrl(base, endpoint) {
  const ep = String(endpoint || "").replace(/^\/+/, "");
  const b = normalizeBaseUrl(base);
  if (!b) return `/${ep}`;
  return `${b}/${ep}`;
}

/**
 * API base list (order matters).
 * 1) window.__API_BASE_URL__ — ayrı API host’u (ör. Vercel + Render)
 * 2) Yerel: http://127.0.0.1:PORT ve localhost yedek
 * 3) Canlı (production): boş string → fetch göreceli yol (/api/...) kullanır
 */
function getApiCandidates() {
  const configured = normalizeBaseUrl(
    typeof window.__API_BASE_URL__ === "string" ? window.__API_BASE_URL__ : ""
  );
  if (configured) {
    return [configured];
  }

  if (isLocalDevContext()) {
    const port = String(window.__DEV_API_PORT__ || "3000").trim() || "3000";
    return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  }

  return [""];
}

function isFileProtocol() {
  return window.location.protocol === "file:";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postWithFallback(endpoint, payload) {
  const candidates = getApiCandidates();
  let lastError = null;

  for (const base of candidates) {
    try {
      const response = await fetchWithTimeout(joinApiUrl(base, endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store"
      });
      return response;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("API endpoint is unreachable.");
}

let simulationControls = null;
let activeSimulationSteps = [];
const quizState = {
  questions: [],
  current: 0,
  selected: null,
  answers: [],
  revealed: false
};

/** Sunucu detectExperimentType ile aynı öncelik; ad + malzemeler birlikte (İngilizce / eşanlamlılar dahil). */
const EXPERIMENT_LABEL_TR = {
  titration: "Titrasyon",
  distillation: "Damıtma / fraksiyon",
  ph_measurement: "pH ölçümü",
  saponification: "Sabunlaşma",
  viscosity: "Viskozite",
  electrical_circuit: "Elektrik devresi ölçümü",
  gas_law: "Gaz yasası (P-V-T)",
  solubility: "Çözünürlük",
  generic: "Genel laboratuvar"
};

function normalizeLabText(s) {
  return String(s || "")
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

/**
 * Önce yalnızca DENey adına bakılır; tür ancak ad “generic” ise malzemelerle birleştirilir.
 * Böylece viskozite vb. adı yazılıp malzemede “asit/titr” geçse bile yanlış havuza düşülmez.
 */
function classifyExperimentTypeFromNormalizedText(text, rawForRegex) {
  const raw = String(rawForRegex || "");
  if (
    text.includes("titras") ||
    text.includes("titration") ||
    text.includes("buret") ||
    text.includes("notraliz") ||
    text.includes("neutraliz") ||
    text.includes("equivalence") ||
    text.includes("esdegerlik") ||
    text.includes("indikator") ||
    text.includes("indicator")
  ) {
    return "titration";
  }
  if (
    text.includes("damit") ||
    text.includes("distil") ||
    text.includes("fraksiyon") ||
    text.includes("rektifikasyon") ||
    text.includes("distillation") ||
    text.includes("reflux")
  ) {
    return "distillation";
  }
  if (
    text.includes("ph olcum") ||
    text.includes("ph olcumu") ||
    text.includes("ph metre") ||
    text.includes("phmetre") ||
    text.includes("ph-meter") ||
    /\bph\s*metre\b/.test(text) ||
    text.includes("potansiyometrik") ||
    /\bph\b/.test(text) ||
    text.includes("asitlik") ||
    text.includes("alkalilik")
  ) {
    return "ph_measurement";
  }
  if (text.includes("sabunlas") || text.includes("saponifik") || text.includes("saponification")) {
    return "saponification";
  }
  if (
    text.includes("viskoz") ||
    text.includes("akiskanlik") ||
    text.includes("viscosity") ||
    text.includes("viscometer") ||
    text.includes("viskometre") ||
    text.includes("ostwald") ||
    text.includes("ubbelohde") ||
    text.includes("cannon") ||
    text.includes("kinematik viskozite") ||
    text.includes("kinematik")
  ) {
    return "viscosity";
  }
  if (
    text.includes("elektrik devresi") ||
    text.includes("elektrik") ||
    text.includes("devre") ||
    text.includes("circuit") ||
    text.includes("voltage") ||
    text.includes("voltaj") ||
    text.includes("akim") ||
    text.includes("amper") ||
    text.includes("direnc") ||
    text.includes("ohm") ||
    text.includes("multimetre") ||
    text.includes("multimeter")
  ) {
    return "electrical_circuit";
  }
  if (
    text.includes("gaz yasasi") ||
    text.includes("ideal gaz") ||
    text.includes("boyle") ||
    text.includes("charles") ||
    text.includes("avogadro") ||
    text.includes("gas law") ||
    /\bpv\s*=\s*nrt\b/i.test(raw)
  ) {
    return "gas_law";
  }
  if (text.includes("cozun") || text.includes("doygun") || text.includes("solubility") || text.includes("soluble")) {
    return "solubility";
  }
  return "generic";
}

function detectExperimentTypeFromForm(form) {
  const name = String(form.experimentName || "").trim();
  const mat = String(form.materials || "").trim();
  const rawFull = `${name} ${mat}`;

  if (name.length) {
    const fromName = classifyExperimentTypeFromNormalizedText(normalizeLabText(name), name);
    if (fromName !== "generic") return fromName;
  }

  return classifyExperimentTypeFromNormalizedText(normalizeLabText(rawFull), rawFull);
}

/**
 * Yalnızca ilgili deney konusuna ait şablon sorular (model yok; bağlam sızması engellenir).
 * Tüm metinler Türkçe; {deney} yer tutucusu quiz oluşturulurken doldurulur.
 */
const QUIZ_POOLS = {
  titration: [
    {
      type: "mcq",
      question: "«{deney}» deneyi için en doğru temel amaç hangisidir?",
      options: [
        "Bilinmeyen derişimi, uygun indikatör ile eşdeğerlik noktasında hacim ölçümüyle belirlemek",
        "Karışımı kaynama sıcaklığına göre ayırmak",
        "Yalnızca çözeltinin rengini kaydetmek",
        "Gaz basıncını sabit tutarak hacim ölçmek"
      ],
      correctIndex: 0,
      explanation: "Titrasyonda amaç genelde bilinmeyen derişimi standart çözelti ile eşdeğerlikte nicel olarak bulmaktır."
    },
    {
      type: "mcq",
      question: "Bitiş noktasına yaklaşırken titrant eklenmesi nasıl olmalıdır?",
      options: [
        "Damla damla, sürekli karıştırarak",
        "Hızlı ve kesintisiz dökerek",
        "Karıştırmadan bekleyerek",
        "Tek seferde fazla hacim vererek"
      ],
      correctIndex: 0,
      explanation: "Eşdeğerlik noktasını kaçırmamak için titrant genelde damla damla ve karıştırarak eklenir."
    },
    {
      type: "mcq",
      question: "Burette kalıcı hava kabarcığı varsa sonuç nasıl etkilenir?",
      options: [
        "Okunan harcanan hacim yanlış olur (sistematik hata)",
        "Sonuç etkilenmez",
        "Yalnızca renk geçişi gecikir, hacim doğrudur",
        "Sadece sıcaklık ölçümünü bozar"
      ],
      correctIndex: 0,
      explanation: "Kabarcık gerçek titre hacmini şaşırtır; hacim okuması ve derişim hesabı bozulur."
    },
    {
      type: "mcq",
      question: "Güçlü asit–güçlü baz titrasyonunda indikatör seçiminde kritik olan nedir?",
      options: [
        "Eşdeğerlik pH’sına uygun geçiş aralığı",
        "En canlı renk",
        "Her deneyde aynı indikatörü kullanmak",
        "En ucuz indikatör"
      ],
      correctIndex: 0,
      explanation: "İndikatörün pH geçiş aralığı eşdeğerlik bölgesiyle örtüşmelidir."
    },
    {
      type: "tf",
      question: "Aynı analit üzerinde art arda iki titrasyon sonuçları arasında büyük fark normal kabul edilir.",
      options: ["Doğru", "Yanlış"],
      correctIndex: 1,
      explanation: "İyi uygulamada tekrarlar birbirine yakın olmalıdır; büyük fark teknik sorun göstergesidir."
    }
  ],
  distillation: [
    {
      type: "mcq",
      question: "«{deney}» (damıtma / fraksiyon) için birincil ayırma ilkesi nedir?",
      options: [
        "Bileşenlerin kaynama noktası / uçuculuk farkı",
        "Yalnızca çözeltinin pH’ı",
        "Katının tam yanması",
        "Gazın mol kütlesi"
      ],
      correctIndex: 0,
      explanation: "Damıtmada buhar–sıvı dengesi ve kaynama sıcaklığı farkı ayrımın temelidir."
    },
    {
      type: "mcq",
      question: "Liebig soğutucuda yoğuşma zayıfsa ilk kontrol ne olmalıdır?",
      options: [
        "Soğutucu su yönü ve debisini kontrol etmek",
        "Isıtmayı en yüksek güce çıkarmak",
        "Termometreyi sıvıya batırmak",
        "Deneyi kayıtsız sürdürmek"
      ],
      correctIndex: 0,
      explanation: "Yetersiz soğutma yoğuşmayı düşürür; akış ve yön kontrolü önceliklidir."
    },
    {
      type: "mcq",
      question: "Buhar sıcaklığını temsilen termometre genelde nereye yerleştirilir?",
      options: [
        "Buhar yolunda, sıvıya ve cam duvara temas ettirmeden",
        "Sadece balon içi sıvıya tam batırılarak",
        "Laboratuvar zeminine yakın",
        "Soğutucu çıkış sıvısına"
      ],
      correctIndex: 0,
      explanation: "Süreç kontrolü için buhar fazına uygun temsil gereklidir."
    },
    {
      type: "mcq",
      question: "İlk distillat (forerun) hakkında hangisi daha doğrudur?",
      options: [
        "Saflık riski nedeniyle genelde ayrı toplanır veya atılır",
        "Her zaman doğrudan ana ürün kabul edilir",
        "Sadece renk açısından önemlidir",
        "Termometre ile ilgisi yoktur"
      ],
      correctIndex: 0,
      explanation: "İlk kesitte çözücü ve uçucu safsızlıklar olabilir; protokole göre ayrılır."
    },
    {
      type: "tf",
      question: "Damıtmada sızdırmazlık hatası yalnızca güvenliği etkiler, ürün saflığını etkilemez.",
      options: ["Doğru", "Yanlış"],
      correctIndex: 1,
      explanation: "Kaçak buhar kaybı ve karışım oranını bozar; saflık ve verimi düşürür."
    }
  ],
  ph_measurement: [
    {
      type: "mcq",
      question: "«{deney}» kapsamında pH ölçümünün doğrudan amacı nedir?",
      options: [
        "Çözeltideki asitlik/bazlığı (H+ aktivitesi) elektrot ile belirlemek",
        "Kaynama noktası farkıyla ayırmak",
        "Gazın PV davranışını ölçmek",
        "Viskoziteyi zamanla ölçmek"
      ],
      correctIndex: 0,
      explanation: "pH-metre ile amaç çözeltinin asidik/bazik karakterini sayısal vermektir."
    },
    {
      type: "mcq",
      question: "Ölçümden önce cam elektrot ile yapılması gereken kritik adım?",
      options: [
        "Uygun tamponlarla kalibrasyon",
        "Elektrodu kurumaya bırakmak",
        "Kalibrasyonu kasıtlı atlamak",
        "Sadece sıvıyı ısıtmak"
      ],
      correctIndex: 0,
      explanation: "Kalibrasyon ofset ve eğim hatalarını azaltır."
    },
    {
      type: "mcq",
      question: "Sıcaklık, pH okumasını etkileyebilir çünkü:",
      options: [
        "Nernst eğimi sıcaklığa bağlıdır; kompanzasyon doğruluğu şarttır",
        "pH sıcaklıktan hiç etkilenmez",
        "Elektrot sıcaklığı sadece kablo uzunluğuna bağlıdır",
        "Sadece renk indikatörünü etkiler"
      ],
      correctIndex: 0,
      explanation: "Potansiyometrik pH’da sıcaklık katsayısı önemlidir."
    },
    {
      type: "mcq",
      question: "Kararlı pH değeri için hangi pratik doğrudur?",
      options: [
        "Değer dalgalanması durunca kayıt",
        "Kararsızken ilk sayıyı yazmak",
        "Elektrodu kaba sürtmek",
        "Kalibrasyon çözeltisinde ölçüm yapıp numuneyi atlamak"
      ],
      correctIndex: 0,
      explanation: "Kararlılık tekrarlanabilir ölçüm için gereklidir."
    },
    {
      type: "tf",
      question: "pH ölçümünde iki nokta kalibrasyon, tek noktaya göre genelde daha güvenilir referans sağlar.",
      options: ["Doğru", "Yanlış"],
      correctIndex: 0,
      explanation: "Eğim düzeltmesi için çok noktalı kalibrasyon tercih edilir."
    }
  ],
  saponification: [
    {
      type: "mcq",
      question: "«{deney}» (sabunlaşma) için tipik hedef neyi değerlendirmektir?",
      options: [
        "Esterin bazla hidrolizi ve sabun/yan ürün oluşumu (verim ve tüketim)",
        "Kaynama sıcaklığıyla fraksiyon ayırmak",
        "Gaz denklemini PV=nRT ile doğrulamak",
        "Yalnızca iletkenlik ölçmek"
      ],
      correctIndex: 0,
      explanation: "Sabunlaşmada ester + baz tepkimesi ve ürün verimi merkezdedir."
    },
    {
      type: "mcq",
      question: "Reaksiyon hızını ve verim yorumunu doğrudan etkileyen parametreler?",
      options: [
        "Sıcaklık ve baz derişimi / karıştırma",
        "Yalnızca çözeltinin rengi",
        "Sadece büret hacmi",
        "Termometrenin cam kalınlığı"
      ],
      correctIndex: 0,
      explanation: "Kinetik ve stoikiyometri için sıcaklık ve baz miktarı kritiktir."
    },
    {
      type: "mcq",
      question: "Verim hesabında hangi karşılaştırma gerekir?",
      options: [
        "Teorik ve fiili ürün miktarı (birimli)",
        "Sadece başlangıç rengi",
        "Sadece oda sıcaklığı tahmini",
        "Önceki haftanın notları"
      ],
      correctIndex: 0,
      explanation: "Yüzde verim için teorik ve gerçekleşen miktar gerekir."
    },
    {
      type: "mcq",
      question: "Aşırı sıcaklık artışı bu deneyde neye yol açabilir?",
      options: [
        "Yan tepkimeler ve koyulaşma / kontrol kaybı riski",
        "Reaksiyonu tamamen durdurur",
        "Sadece pH sayacını sıfırlar",
        "Esteri geri oluşturur"
      ],
      correctIndex: 0,
      explanation: "Yüksek sıcaklıkta oluşum ve bozunma dengesi karmaşıklaşır."
    },
    {
      type: "tf",
      question: "Baz derişimi ölçülmeden eklenirse sonuç yorumu güvenilir olur.",
      options: ["Doğru", "Yanlış"],
      correctIndex: 1,
      explanation: "Stoikiyometri için baz konsantrasyonu ve hacim kontrolü şarttır."
    }
  ],
  viscosity: [
    {
      type: "mcq",
      question: "«{deney}» deneyinde ölçülen nicel büyüklük esas olarak nedir?",
      options: [
        "Akışa direnç (iç sürtünme; viskozite)",
        "Çözeltinin yalnızca pH’ı",
        "Gazın mol hacmi",
        "Nötralizasyon derecesi"
      ],
      correctIndex: 0,
      explanation: "Viskozite deneyinde temel amaç akış direncinin nicel ölçümüdür."
    },
    {
      type: "mcq",
      question: "Kapiler veya küresel viskozimetre kullanımında ilk teknik şart?",
      options: [
        "Sıcaklığın sabitlenmesi ve termal denge",
        "Numuneyi rastgele sıcaklıkta ölçmek",
        "Kalibrasyonu tamamen atlamak",
        "Sadece renk skalası okumak"
      ],
      correctIndex: 0,
      explanation: "Viskozite sıcaklığa çok duyarlıdır; denge şarttır."
    },
    {
      type: "mcq",
      question: "Çoğu sıvı için sıcaklık arttıkça viskozite genelde nasıl değişir?",
      options: ["Azalır", "Sabit kalır", "Her zaman artar", "pH ile tanımlanır"],
      correctIndex: 0,
      explanation: "Moleküler hareketlilik arttıkça iç sürtünme genelde azalır."
    },
    {
      type: "mcq",
      question: "Güvenilir sonuç için hangi pratik doğrudur?",
      options: [
        "Birden çok tekrar ölçüm ve ortalama; birim (ör. mPa·s) raporu",
        "Tek ölçüm ve birimsiz kayıt",
        "Önceki deneyi kopyalamak",
        "Sadece görsel gözlem"
      ],
      correctIndex: 0,
      explanation: "Tekrar ve birim raporu belirsizliği azaltır."
    },
    {
      type: "mcq",
      question: "Referans sıvı ile kalibrasyonun amacı?",
      options: [
        "Cihaz/sistem sabitini ve düzeltmeyi belirlemek",
        "Ekonomik tasarruf",
        "Sadece deney süresini uzatmak",
        "Numuneyi seyreltilmiş sanmak"
      ],
      correctIndex: 0,
      explanation: "Kalibrasyon sistematik hatayı düşürür."
    }
  ],
  gas_law: [
    {
      type: "mcq",
      question: "«{deney}» (gaz yasası) çalışmasında temel model ilişkisi hangisidir?",
      options: ["PV = nRT (ideal gaz yaklaşımı)", "pH = -log[H+]", "C1V1=C2V2 nötralizasyon", "Kaynama platoları ile ayırma"],
      correctIndex: 0,
      explanation: "Gaz yasası deneylerinde P, V, T ve n ilişkisi merkezdedir."
    },
    {
      type: "mcq",
      question: "Sıcaklık sabitken hacim yarıya inerse ideal gazda basınç yaklaşık olarak?",
      options: ["İkiye yakın katına çıkar", "Yarıya iner", "Değişmez", "Sıfırlanır"],
      correctIndex: 0,
      explanation: "Boyle yasası (T sabit): P ile V ters orantılıdır."
    },
    {
      type: "mcq",
      question: "Deneyde en sık yapılan hata kaynağı?",
      options: [
        "Birim uyumsuzluğu (ör. L, mol, K, kPa karışması)",
        "Sadece renk okuma",
        "İndikatör seçimi",
        "Menisküs okuma (sıvı titre)"
      ],
      correctIndex: 0,
      explanation: "Gaz hesaplarında SI uyumu kritiktir."
    },
    {
      type: "mcq",
      question: "Sıcaklık mutlak olarak kullanılırken hangisi doğrudur?",
      options: ["T genelde kelvin ile tutarlı olmalıdır (ideal denklemde)", "°C yeterlidir, dönüşüm gerekmez", "Sadece Fahrenheit kullanılır", "Sıcaklık gazı etkilemez"],
      correctIndex: 0,
      explanation: "PV=nRT’de T Kelvin cinsindendir."
    },
    {
      type: "tf",
      question: "Ölçümlerde bir değişkeni değiştirirken diğerlerini kontrol altında tutmak, nedensellik yorumu için önemlidir.",
      options: ["Doğru", "Yanlış"],
      correctIndex: 0,
      explanation: "Kontrollü değişkenler nedensel çıkarım için gereklidir."
    }
  ],
  solubility: [
    {
      type: "mcq",
      question: "«{deney}» (çözünürlük) için doygunluk ne anlama gelir?",
      options: [
        "İleri-geri çözünme hızlarının eşitlendiği denge",
        "Sıvının kaynama noktası",
        "Gazın tam ideal olması",
        "pH’ın tamponlanması"
      ],
      correctIndex: 0,
      explanation: "Doygun çözeltide katı–çözücü denge kurulmuştur."
    },
    {
      type: "mcq",
      question: "Çoğu katı için sıcaklık artışı çözünürlüğü genelde?",
      options: ["Artırır", "Her zaman azaltır", "Değiştirmez", "Sadece gaz fazında ölçülür"],
      correctIndex: 0,
      explanation: "Çoğu iyonik/kristal sistemde sıcaklık çözünürlüğü artırır (istisnalar vardır)."
    },
    {
      type: "mcq",
      question: "Erken filtreleme / kayıt hatası neye yol açar?",
      options: [
        "Dengeye ulaşmadan yanlış çözünürlük",
        "Daha iyi saflık",
        "Gaz sabitinin sıfırlanması",
        "pH ölçümünün iptali"
      ],
      correctIndex: 0,
      explanation: "Dengeye varmadan alınan numune sistematik hata verir."
    },
    {
      type: "mcq",
      question: "Karıştırmanın rolü?",
      options: [
        "Konsantrasyon homojenliği ve dengeye yaklaşma hızı",
        "Sıcaklığı sabit tutmak için yeterlidir",
        "Gazı kaçırmak",
        "pH’ı kalıcı düşürmek"
      ],
      correctIndex: 0,
      explanation: "Homojenlik ve kütle transferi için karıştırma önemlidir."
    },
    {
      type: "tf",
      question: "Çözünürlük eğrisi sıcaklığa bağlıdır; raporda sıcaklık mutlaka belirtilmelidir.",
      options: ["Doğru", "Yanlış"],
      correctIndex: 0,
      explanation: "Çözünürlük verisi sıcaklık olmadan yorumlanamaz."
    }
  ],
  electrical_circuit: [
    {
      type: "mcq",
      question: "«{deney}» deneyinde temel amaç genellikle hangisidir?",
      options: [
        "Gerilim, akım ve direnç arasındaki ilişkiyi ölçüm verisiyle doğrulamak",
        "Sıvı faz dengesini menisküs üzerinden değerlendirmek",
        "Damıtma fraksiyonlarını toplamak",
        "Çözünürlük eğrisi çıkarmak"
      ],
      correctIndex: 0,
      explanation: "Elektrik devresi ölçümünde temel büyüklükler V-I-R ilişkisidir."
    },
    {
      type: "mcq",
      question: "Devrede doğru ve güvenli ölçüm için ilk adım hangisidir?",
      options: [
        "Bağlantı şemasını doğrulayıp ölçü aletini uygun moda almak",
        "Rastgele kablolama yapıp sonucu beklemek",
        "Sadece önceki deneyi kopyalamak",
        "Birimleri yazmadan tabloya sayı girmek"
      ],
      correctIndex: 0,
      explanation: "Yanlış mod/yanlış bağlantı hem güvenlik hem veri doğruluğu sorunu doğurur."
    },
    {
      type: "mcq",
      question: "Ohm kanununa göre birim kontrolünde doğru eşleştirme hangisidir?",
      options: [
        "V (volt), I (amper), R (ohm)",
        "V (mL), I (°C), R (g)",
        "V (mol), I (L), R (kJ)",
        "V (pH), I (mPa·s), R (kPa)"
      ],
      correctIndex: 0,
      explanation: "Elektrik devresi sorularında birim disiplini kritik kalite kriteridir."
    },
    {
      type: "mcq",
      question: "Ölçümlerde beklenmeyen sapma varsa en doğru yaklaşım nedir?",
      options: [
        "Kaynak gerilimi, bağlantı noktaları ve cihaz kalibrasyonunu tekrar kontrol etmek",
        "Verileri silip rastgele yeni değer yazmak",
        "Deneyi sonuçlandırıp sapmayı rapora almamak",
        "Kimyasal menisküs okuması yapmak"
      ],
      correctIndex: 0,
      explanation: "Sapma analizi devre elemanları, bağlantı ve ölçü cihazı doğrulamasıyla başlar."
    },
    {
      type: "tf",
      question: "«{deney}» raporunda devre şeması ve ölçüm birimleri verilmeden sonuçlar profesyonel kabul edilir.",
      options: ["Doğru", "Yanlış"],
      correctIndex: 1,
      explanation: "Devre raporlarında şema + birim + ölçüm koşulu zorunludur."
    }
  ],
  generic: [
    {
      type: "mcq",
      question: "«{deney}» deneyi için kayıt altına almanız gereken bilgilerle en uyumlu amaç hangisidir?",
      options: [
        "Bu deneye özgü ölçümleri, birim ve koşulları ile birlikte tekrarlanabilir şekilde dokümante etmek",
        "Farklı bir deneyin protokolünü kopyalayıp aynen raporlamak",
        "Yalnızca son rakamı yazıp süreç bilgisini atlamak",
        "Malzeme listesini ve deney adını hiç belirtmemek"
      ],
      correctIndex: 0,
      explanation: "Rapor, girdiğiniz deney adı ve ölçümlerle tutarlı olmalıdır."
    },
    {
      type: "mcq",
      question: "«{deney}» deneyinde ölçüm kalitesini artırmak için en doğru genel yaklaşım hangisidir?",
      options: [
        "Uygun cihaz ve birimlerle ölçüp her adımı zaman damgası ile kaydetmek",
        "Ölçüm adımlarını atlayıp yalnızca sonucu yazmak",
        "Bağlantı/kurulum kontrolü yapmadan işe başlamak",
        "Birimsiz tahmini değerlerle rapor tamamlamak"
      ],
      correctIndex: 0,
      explanation: "Bağlamdan bağımsız en güvenli yol: doğru cihaz + doğru birim + izlenebilir kayıt."
    },
    {
      type: "mcq",
      question: "«{deney}» kurulumunda ilk öncelik ne olmalıdır?",
      options: [
        "Ekipman uygunluğu, temizlik ve sızdırmazlık / güvenli bağlantılar",
        "Yalnızca başka grupların kurulumuna bakmak",
        "Deney adını rapordan çıkarmak",
        "Sıcaklık ve zaman damgası istememek"
      ],
      correctIndex: 0,
      explanation: "Kurulum, yazdığınız deneyin güvenli ve doğru yürümesi için temeldir."
    },
    {
      type: "mcq",
      question: "«{deney}» sırasında sıcaklık, süre veya debi gibi parametreler hedefden saparsa ne yapılmalıdır?",
      options: [
        "Sapmayı zaman damgasıyla not edip yorumda deney bağlamına bağlamak",
        "Veriyi silip başka bir deneyin sonucunu yazmak",
        "Sapmaya dair hiç not almamak",
        "Yalnızca teorik literatürden genel paragraf yapıştırmak"
      ],
      correctIndex: 0,
      explanation: "Hata analizi, sizin o anki deney koşullarınıza dayanmalıdır."
    },
    {
      type: "tf",
      question: "«{deney}» için raporda deney adı ve kullanılan önemli malzemeler belirtilmeden sonuç yeterince izlenebilir sayılır.",
      options: ["Doğru", "Yanlış"],
      correctIndex: 1,
      explanation: "İzlenebilirlik için deney kimliği ve malzeme/ekipman özeti gerekir."
    }
  ]
};

function cloneQuizQuestion(q, deneyName, materialsLine) {
  const name = String(deneyName || "").trim() || "Bu deney";
  const matRaw = String(materialsLine || "").trim();
  const matShort = matRaw ? (matRaw.length > 80 ? `${matRaw.slice(0, 77)}…` : matRaw) : "Malzeme girilmedi";
  let question = String(q.question || "")
    .replace(/\{deney\}/g, name)
    .replace(/\{malzeme\}/g, matShort);
  const options = Array.isArray(q.options)
    ? q.options.map((opt) =>
        String(opt)
          .replace(/\{deney\}/g, name)
          .replace(/\{malzeme\}/g, matShort)
      )
    : [];
  return { ...q, question, options };
}

function buildTemperatureQuizQuestion(expType, form) {
  const temp = Number.isFinite(form.temperature) ? form.temperature : 25;
  const wrong = ["Sadece daha hızlı bitirmek", "Raporu kısa tutmak", "Kalibrasyonu kasıtlı atlama"];

  const bodies = {
    titration: {
      text: `«${form.experimentName || "Titrasyon"}» sırasında sistemin yaklaşık **${temp} °C** civarında kontrol edilmesinin başlıca gerekçesi?`,
      correct: "Titrasyon hızı ve indikatör geçişi sıcaklığa duyarlı olabilir; tekrarlanabilirlik için kontrol önemlidir.",
      expl: "Sıcaklık kinetik ve geçiş netliğini etkiler."
    },
    distillation: {
      text: `Damıtma / fraksiyonda yaklaşık **${temp} °C** proses sıcaklığını yönetmenin temel nedeni?`,
      correct: "Fraksiyonların kaynama bantlarına uygun ayrım ve buhar yükü kontrolü",
      expl: "Profil kontrolü saflık ve güvenlik içindir."
    },
    ph_measurement: {
      text: `pH ölçümünde çalışma sıcaklığının yaklaşık **${temp} °C** olması neden önemlidir?`,
      correct: "Nernst eğimi ve aktivite; sıcaklık kompanzasyonu veya not ile yorum şart",
      expl: "pH elektrotları sıcaklığa duyarlıdır."
    },
    saponification: {
      text: `Sabunlaşma deneyinde **${temp} °C** civarı sıcaklığın anlamı?`,
      correct: "Reaksiyon hızı ve dönüşüm profili sıcaklığa bağlıdır; kontrollü profil şart",
      expl: "Kinetik ve yan ürün riski sıcaklıkla değişir."
    },
    viscosity: {
      text: `Viskozite ölçümünde yaklaşık **${temp} °C** sıcaklığın sabitlenmesi neden kritiktir?`,
      correct: "Viskozite sıcaklığa çok duyarlıdır; karşılaştırılabilir sonuç için şarttır",
      expl: "Küçük sıcaklık sapması büyük viskozite hatası yapabilir."
    },
    electrical_circuit: {
      text: `«${String(form.experimentName || "").trim() || "Elektrik Devresi"}» ölçümünde ortam sıcaklığının yaklaşık **${temp} °C** olarak not edilmesi neden profesyonel bir pratiktir?`,
      correct: "Eleman toleransları ve ölçüm kararlılığı sıcaklıktan etkilenebilir; koşulların raporda izlenebilir olması gerekir",
      expl: "Elektrik ölçümlerinde çevre koşulu kaydı, karşılaştırılabilirlik ve kalite için önemlidir."
    },
    gas_law: {
      text: `Gaz yasası çalışmasında sıcaklığın **${temp} °C** ölçülürken nelere dikkat edilmelidir?`,
      correct: "Kelvin dönüşümü ve diğer parametreleri sabitleyerek P-V-T ilişkisini izole etme",
      expl: "Denklemde sıcaklık mutlak ölçekte kullanılır."
    },
    solubility: {
      text: `Çözünürlük deneyinde **${temp} °C** kaydı neden zorunludur?`,
      correct: "Çözünürlük genelde sıcaklığın güçlü bir fonksiyonudur",
      expl: "Veri sıcaklıksız yorumlanamaz."
    },
    generic: {
      text: `«${String(form.experimentName || "").trim() || "Deney"}» deneyinde yaklaşık **${temp} °C** sıcaklığın kontrolü/ kaydı neden önemlidir?`,
      correct: "Bu deneyin sonuçları ve tekrarlanabilirliği sıcaklığa duyarlı olabilir; koşul sabitleme veya açık dokümantasyon gerekir",
      expl: "Sınıflandırma genel olsa da sorular sizin yazdığınız deney adına göre çerçevelenir."
    }
  };

  const b = bodies[expType] || bodies.generic;
  const opts = shuffleArray([b.correct, ...wrong]).slice(0, 4);
  if (!opts.includes(b.correct)) opts[0] = b.correct;
  const correctIndex = opts.indexOf(b.correct);

  return {
    type: "mcq",
    question: b.text,
    options: opts,
    correctIndex,
    explanation: b.expl
  };
}

const simulationCatalog = {
  distillation: [
  {
    title: "Adım 1 - Etil alkol transferi",
    question: "Etil alkolü balona nasıl eklersin?",
    options: [
      { text: "A) Mezür ile ölçerek yavaşça", correct: false, feedback: "Yakın ama eksik: huni ve kontrollü akış daha güvenlidir." },
      { text: "B) Direkt şişeden hızlı dökerek", correct: false, feedback: "Yanlış: sıçrama ve buhar kaybı oluşabilir." },
      { text: "C) Huni ile yavaş aktarım ve mezürle hacim kontrolü", correct: true, feedback: "Doğru seçim, kontrollü aktarım yaptın." }
    ]
  },
  {
    title: "Adım 2 - Kurulum",
    question: "Balon + Liebig soğutucu kurulumunda ilk kontrolün ne olur?",
    options: [
      { text: "A) Önce maksimum ısıtmayı açmak", correct: false, feedback: "Yanlış: kurulum doğrulanmadan ısıtma risklidir." },
      { text: "B) Cam birleşimlerde sızdırmazlık kontrolü", correct: true, feedback: "Doğru: kaçak varsa tüm sonuçlar bozulur." },
      { text: "C) Termometreyi sıvıya daldırmak", correct: false, feedback: "Yanlış: buhar sıcaklığını değil sıvıyı ölçersin." }
    ]
  },
  {
    title: "Adım 3 - Isıtma kontrolü",
    question: "Isıtmayı nasıl başlatmalısın?",
    options: [
      { text: "A) Kademeli güç artışıyla", correct: true, feedback: "Doğru: kontrollü buharlaşma ve daha iyi saflık sağlar." },
      { text: "B) Bir anda maksimum güçle", correct: false, feedback: "Yanlış: taşma, köpürme ve saflık kaybı olur." },
      { text: "C) Hiç ısıtmadan bekleyerek", correct: false, feedback: "Yanlış: süreç başlamaz, verim alınamaz." }
    ]
  },
  {
    title: "Adım 4 - Termometre yerleşimi",
    question: "Termometreyi en doğru nereye konumlandırırsın?",
    options: [
      { text: "A) Sıvının içine tamamen daldırırım", correct: false, feedback: "Yanlış: sıvı sıcaklığı okunur, buhar sıcaklığı kaçırılır." },
      { text: "B) Buhar çıkış seviyesine yakın, cama temas etmeyecek şekilde", correct: true, feedback: "Doğru: süreç kontrolü için uygun ölçüm noktasıdır." },
      { text: "C) Soğutucu çıkışına yakın bir noktaya", correct: false, feedback: "Yanlış: bu değer proses sıcaklığını temsil etmez." }
    ]
  },
  {
    title: "Adım 5 - Sıcaklık etkisi",
    question: "Sıcaklığı 90°C yaptın, ne olur?",
    options: [
      { text: "A) Daha hızlı saflaşma", correct: false, feedback: "Yanlış: yüksek sıcaklık istenmeyen bileşenleri de taşıyabilir." },
      { text: "B) Yan ürün oluşur", correct: false, feedback: "Kısmen doğru olabilir ama tek başına yeterli açıklama değil." },
      { text: "C) Buharlaşma kontrolsüz olur", correct: true, feedback: "Doğru: kontrolsüz buharlaşma ayırma kalitesini düşürür." }
    ]
  },
  {
    title: "Adım 6 - Yoğuşma gözlemi",
    question: "Yoğuşma zayıfsa ilk teknik müdahale ne olmalı?",
    options: [
      { text: "A) Isıtmayı daha da artırmak", correct: false, feedback: "Yanlış: buhar yükü artar, kayıp büyüyebilir." },
      { text: "B) Soğutucu su akış yönü ve debisini kontrol etmek", correct: true, feedback: "Doğru: yoğuşma verimini doğrudan artırır." },
      { text: "C) Deneyi kayıtsız devam ettirmek", correct: false, feedback: "Yanlış: hata analizi yapılamaz." }
    ]
  },
  {
    title: "Adım 7 - Fraksiyon toplama",
    question: "İlk gelen fraksiyonu nasıl yönetmelisin?",
    options: [
      { text: "A) Hepsini tek kapta ana ürün diye toplarım", correct: false, feedback: "Yanlış: ilk fraksiyon safsızlık içerebilir." },
      { text: "B) Sıcaklık ve akış sabitlenene kadar ayrı fraksiyon toplarım", correct: true, feedback: "Doğru: saflık kontrolü için doğru yaklaşımdır." },
      { text: "C) Fraksiyonları ölçmeden dökerim", correct: false, feedback: "Yanlış: verim ve kalite takibi yapılamaz." }
    ]
  },
  {
    title: "Adım 8 - Kayıt ve kapanış",
    question: "Deney sonunda hangi adım kritik kabul edilir?",
    options: [
      { text: "A) Sadece sonucu yazmak", correct: false, feedback: "Yanlış: süreç bilgisi olmadan sonuç yorumlanamaz." },
      { text: "B) Cihazı kapatmadan alanı terk etmek", correct: false, feedback: "Yanlış: ciddi güvenlik riski oluşur." },
      { text: "C) Sıcaklık-zaman-verim kayıtlarını tamamlayıp güvenli kapatma yapmak", correct: true, feedback: "Doğru: profesyonel laboratuvar standardı budur." }
    ]
  },
  {
    title: "Adım 9 - Acil durum",
    question: "Cam bağlantıda çatlak fark ettin. En doğru aksiyon nedir?",
    options: [
      { text: "A) Isıtmayı kapatıp sistemi güvenli şekilde durdurmak", correct: true, feedback: "Doğru: önce güvenlik, sonra ekipman değişimi." },
      { text: "B) Çatlakla deneye devam etmek", correct: false, feedback: "Yanlış: kırılma ve kimyasal maruziyet riski artar." },
      { text: "C) Çatlağı bantla sarıp ısıtmaya devam etmek", correct: false, feedback: "Yanlış: geçici çözümler laboratuvarda kabul edilmez." }
    ]
  },
  {
    title: "Adım 10 - Son kontrol",
    question: "Ürün saflığını doğrulamak için ilk olarak neyi kontrol edersin?",
    options: [
      { text: "A) Kap rengini", correct: false, feedback: "Yanlış: görsel renk tek başına saflık göstergesi değildir." },
      { text: "B) Ölçüm cihazı kalibrasyon kaydı ve sıcaklık profili", correct: true, feedback: "Doğru: teknik doğrulama için temel veridir." },
      { text: "C) Sadece kokusunu", correct: false, feedback: "Yanlış: subjektif yöntem güvenilir değildir." }
    ]
  }
  ],
  titration: [
    {
      title: "Adım 1 - Çözelti hazırlığı",
      question: "Titrasyona başlamadan önce ilk doğru işlem nedir?",
      options: [
        { text: "A) Erleni rastgele doldurmak", correct: false, feedback: "Yanlış: bilinmeyen hacim sonuç doğruluğunu bozar." },
        { text: "B) Analit çözeltisini ölçülü hacimde erlene almak", correct: true, feedback: "Doğru: doğru stokiyometri için hacim kontrolü şarttır." },
        { text: "C) Doğrudan indikatör ekleyip başlamak", correct: false, feedback: "Yanlış: önce analit hacmi sabitlenmelidir." }
      ]
    },
    {
      title: "Adım 2 - Buret hazırlığı",
      question: "Buret kullanımında en kritik başlangıç kontrolü nedir?",
      options: [
        { text: "A) Bureti suyla bırakmak", correct: false, feedback: "Yanlış: titrant seyrelir ve hata oluşur." },
        { text: "B) Bureti titrant ile çalkalayıp hava kabarcığını gidermek", correct: true, feedback: "Doğru: gerçek derişim ve düzgün akış sağlanır." },
        { text: "C) Sıfır okumayı atlamak", correct: false, feedback: "Yanlış: harcanan hacim doğru hesaplanamaz." }
      ]
    },
    {
      title: "Adım 3 - İndikatör seçimi",
      question: "İndikatör seçiminde temel kriter nedir?",
      options: [
        { text: "A) Rengi en canlı olanı seçmek", correct: false, feedback: "Yanlış: estetik değil, pH geçiş aralığı önemlidir." },
        { text: "B) Eşdeğerlik noktasına uygun pH geçiş aralığı", correct: true, feedback: "Doğru: gerçek bitiş noktasına en yakın okuma verir." },
        { text: "C) Her deneyde aynı indikatörü kullanmak", correct: false, feedback: "Yanlış: reaksiyona göre değişmelidir." }
      ]
    },
    {
      title: "Adım 4 - Titrasyon hızı",
      question: "Bitiş noktasına yaklaşırken titrant nasıl eklenmeli?",
      options: [
        { text: "A) Hızlı ve sürekli akışla", correct: false, feedback: "Yanlış: bitiş noktası aşılabilir." },
        { text: "B) Damla damla ve sürekli karıştırarak", correct: true, feedback: "Doğru: eşdeğerlik noktasını doğru yakalarsın." },
        { text: "C) Karıştırmadan bekleyerek", correct: false, feedback: "Yanlış: homojenlik bozulur." }
      ]
    },
    {
      title: "Adım 5 - Hata senaryosu",
      question: "Burette hava kabarcığı kaldıysa ne olur?",
      options: [
        { text: "A) Harcanan hacim olduğundan büyük okunabilir", correct: true, feedback: "Doğru: sistematik hacim hatası oluşur." },
        { text: "B) Sonuç etkilenmez", correct: false, feedback: "Yanlış: titrasyon hesapları bozulur." },
        { text: "C) Sadece renk değişimi gecikir", correct: false, feedback: "Yanlış: asıl etki hacim hesabındadır." }
      ]
    },
    {
      title: "Adım 6 - Kör numune kontrolü",
      question: "Şimdi 10 mL saf su ile kör deneyi yap ve farkı kontrol et. Hangi amaçla yapılır?",
      options: [
        { text: "A) Sadece süreyi uzatmak için", correct: false, feedback: "Yanlış: kör deney analitik düzeltme içindir." },
        { text: "B) Reaktiflerin arka plan etkisini düzeltmek için", correct: true, feedback: "Doğru: gerçek analit sinyalini ayırmana yardım eder." },
        { text: "C) Renk kontrastını artırmak için", correct: false, feedback: "Yanlış: temel amaç arka plan hatasını ölçmektir." }
      ]
    },
    {
      title: "Adım 7 - Tekrar ölçüm",
      question: "Aynı titrasyonu ikinci kez yap. Sonuçlar arasında en fazla ne kadar fark kabul edersin?",
      options: [
        { text: "A) Yüzde 0.5-1.0 arası fark", correct: true, feedback: "Doğru: iyi laboratuvar pratiğinde tekrar edilebilirlik hedeflenir." },
        { text: "B) Yüzde 10 fark normaldir", correct: false, feedback: "Yanlış: bu fark analitik kalite için çok yüksektir." },
        { text: "C) Farkın önemi yok", correct: false, feedback: "Yanlış: tekrarlanabilirlik güvenilirliğin temelidir." }
      ]
    },
    {
      title: "Adım 8 - Son hesap",
      question: "Şimdi C1xV1=C2xV2 ile analit derişimini hesapla. İlk kontrolün ne olmalı?",
      options: [
        { text: "A) Birim dönüşümlerini (mL -> L) doğrulamak", correct: true, feedback: "Doğru: yanlış birim tüm hesabı bozar." },
        { text: "B) Sadece sonuca bakmak", correct: false, feedback: "Yanlış: adım kontrolü olmadan güvenilirlik düşer." },
        { text: "C) Yuvarlama ile başlamayı tercih etmek", correct: false, feedback: "Yanlış: erken yuvarlama hata büyütür." }
      ]
    }
  ],
  ph_measurement: [
    {
      title: "Adım 1 - Elektrot hazırlığı",
      question: "pH ölçümünden önce en doğru ilk işlem nedir?",
      options: [
        { text: "A) Elektrodu tamponlarla kalibre etmek", correct: true, feedback: "Doğru: ofset ve eğim hatası azaltılır." },
        { text: "B) Kalibrasyonu atlayıp numuneye geçmek", correct: false, feedback: "Yanlış: sistematik ölçüm hatası artar." },
        { text: "C) Elektrodu kuru şekilde bekletmek", correct: false, feedback: "Yanlış: elektrot cevabı bozulabilir." }
      ]
    },
    {
      title: "Adım 2 - Numune ölçümü",
      question: "Kararlı pH değeri için hangi yaklaşım doğrudur?",
      options: [
        { text: "A) Numuneyi homojenleştirip değerin stabil olmasını beklemek", correct: true, feedback: "Doğru: daha tekrarlanabilir ölçüm alırsın." },
        { text: "B) Değer değişirken hemen ilk sayıyı yazmak", correct: false, feedback: "Yanlış: kararsız ölçüm hataya yol açar." },
        { text: "C) Elektrodu kaba temas ettirmek", correct: false, feedback: "Yanlış: elektrot hasarı ve gürültü artar." }
      ]
    },
    {
      title: "Adım 3 - Sıcaklık etkisi",
      question: "Sıcaklık arttığında pH ölçümünde ne yapılmalıdır?",
      options: [
        { text: "A) Sıcaklık kompanzasyonunu doğrulamak", correct: true, feedback: "Doğru: Nernst eğimi sıcaklığa bağlıdır." },
        { text: "B) Aynı kalibrasyonla her koşulda devam etmek", correct: false, feedback: "Yanlış: sıcaklık değişimi kalibrasyonu etkiler." },
        { text: "C) Veriyi kaydetmeden bitirmek", correct: false, feedback: "Yanlış: analiz kalitesi düşer." }
      ]
    }
  ],
  saponification: [
    {
      title: "Adım 1 - Reaktif hazırlama",
      question: "Sabunlaşma deneyinde ilk teknik kontrol nedir?",
      options: [
        { text: "A) Baz derişimini doğrulamak", correct: true, feedback: "Doğru: reaksiyon stokiyometrisi buna bağlıdır." },
        { text: "B) Derişimi ölçmeden eklemek", correct: false, feedback: "Yanlış: verim hesabı güvenilmez olur." },
        { text: "C) Sıcaklığı yok saymak", correct: false, feedback: "Yanlış: hız ve dönüşüm etkilenir." }
      ]
    },
    {
      title: "Adım 2 - Reaksiyon kontrolü",
      question: "Süreç boyunca hangi parametre sabit tutulmalıdır?",
      options: [
        { text: "A) Sıcaklık ve karıştırma hızı", correct: true, feedback: "Doğru: tekrar edilebilirlik artar." },
        { text: "B) Sadece gözlem rengi", correct: false, feedback: "Yanlış: nicel kontrol gerekir." },
        { text: "C) Kayıtsız ilerlemek", correct: false, feedback: "Yanlış: hata analizi yapılamaz." }
      ]
    },
    {
      title: "Adım 3 - Sonuç değerlendirme",
      question: "Ürün verimini doğru değerlendirmek için ne yapılır?",
      options: [
        { text: "A) Teorik ve gerçek ürün miktarını karşılaştırmak", correct: true, feedback: "Doğru: yüzde verim böyle hesaplanır." },
        { text: "B) Sadece ürün görünümüne bakmak", correct: false, feedback: "Yanlış: nitel gözlem tek başına yeterli değildir." },
        { text: "C) Birimi yazmadan raporlamak", correct: false, feedback: "Yanlış: sonuç izlenebilir olmaz." }
      ]
    }
  ],
  viscosity: [
    {
      title: "Adım 1 - Cihaz hazırlığı",
      question: "Viskozite ölçümünde ilk doğru adım nedir?",
      options: [
        { text: "A) Referansla kalibrasyon yapmak", correct: true, feedback: "Doğru: sistematik cihaz hatası azalır." },
        { text: "B) Kalibrasyonsuz ölçüme geçmek", correct: false, feedback: "Yanlış: sonuçlar kayabilir." },
        { text: "C) Numuneyi sıcaklık kontrolü olmadan ölçmek", correct: false, feedback: "Yanlış: viskozite sıcaklığa duyarlıdır." }
      ]
    },
    {
      title: "Adım 2 - Termal denge",
      question: "Numune neden sıcaklık dengesine getirilir?",
      options: [
        { text: "A) Viskoziteyi karşılaştırılabilir ölçmek için", correct: true, feedback: "Doğru: sıcaklık sapması büyük hata üretir." },
        { text: "B) Sadece süre kazanmak için", correct: false, feedback: "Yanlış: ölçüm kalitesi düşer." },
        { text: "C) Karıştırmayı tamamen bırakmak için", correct: false, feedback: "Yanlış: homojenlik bozulabilir." }
      ]
    },
    {
      title: "Adım 3 - Veri güvenilirliği",
      question: "Hangi yaklaşım doğru raporlamadır?",
      options: [
        { text: "A) Çoklu ölçüm ortalaması ve mPa·s birimi ile raporlamak", correct: true, feedback: "Doğru: analitik kalite artar." },
        { text: "B) Tek ölçümü birimsiz yazmak", correct: false, feedback: "Yanlış: yorumlanabilirlik azalır." },
        { text: "C) Eski deneyi kopyalamak", correct: false, feedback: "Yanlış: deney özeli kaybolur." }
      ]
    }
  ],
  generic: [
    {
      title: "Adım 1 - Deney planı",
      question: "Girilen deneye başlamadan önce ilk profesyonel adım nedir?",
      options: [
        { text: "A) Ölçümleri başlamadan önce kayıt şablonu hazırlamak", correct: true, feedback: "Doğru: izlenebilirlik ve hata analizi için temel adımdır." },
        { text: "B) Önce rastgele deneme yapmak", correct: false, feedback: "Yanlış: kontrolsüz başlangıç hata riskini artırır." },
        { text: "C) Talimat okumadan ekipmanı çalıştırmak", correct: false, feedback: "Yanlış: güvenlik ve doğruluk riski doğar." }
      ]
    },
    {
      title: "Adım 2 - Ekipman kontrolü",
      question: "Kurulum sırasında en kritik kontrol nedir?",
      options: [
        { text: "A) Ekipmanların temizliği ve bağlantıların sızdırmazlığı", correct: true, feedback: "Doğru: veri kalitesi ve güvenlik buradan başlar." },
        { text: "B) Sadece görsel düzen", correct: false, feedback: "Yanlış: teknik uygunluk daha önemlidir." },
        { text: "C) Kayıt almadan devam etmek", correct: false, feedback: "Yanlış: izlenebilirlik kaybolur." }
      ]
    },
    {
      title: "Adım 3 - Süreç yönetimi",
      question: "Deney sırasında hangi yaklaşım doğrudur?",
      options: [
        { text: "A) Parametre değişimlerini anlık not etmek", correct: true, feedback: "Doğru: değişken-etki ilişkisini böyle kurarsın." },
        { text: "B) Sadece final sonucu yazmak", correct: false, feedback: "Yanlış: süreç verisi olmadan yorum zayıf kalır." },
        { text: "C) Ölçüm cihazı kalibrasyonunu atlamak", correct: false, feedback: "Yanlış: sistematik hataya neden olur." }
      ]
    },
    {
      title: "Adım 4 - Sıcaklık senaryosu",
      question: "Sıcaklık hedef değerden +10 °C arttı. İlk teknik aksiyonun ne olur?",
      options: [
        { text: "A) Isıtmayı azaltıp sistemi yeniden hedef banda çekmek", correct: true, feedback: "Doğru: süreç kontrolü için geri besleme şarttır." },
        { text: "B) Aynen devam etmek", correct: false, feedback: "Yanlış: sapma büyür ve veri güvenilirliği düşer." },
        { text: "C) Kayıt almadan beklemek", correct: false, feedback: "Yanlış: izlenebilirlik kaybolur." }
      ]
    },
    {
      title: "Adım 5 - Hata analizi",
      question: "İki ölçüm arasında büyük fark var. Önce neyi kontrol edersin?",
      options: [
        { text: "A) Cihaz kalibrasyonu ve numune hazırlama adımlarını", correct: true, feedback: "Doğru: kök neden analizi buradan başlar." },
        { text: "B) Sadece sonucu değiştiririm", correct: false, feedback: "Yanlış: veri manipülasyonu bilimsel değildir." },
        { text: "C) Ölçümleri silerim", correct: false, feedback: "Yanlış: hatayı gizlemek yerine analiz etmelisin." }
      ]
    },
    {
      title: "Adım 6 - Son rapor",
      question: "Deney raporunda profesyonel olarak neyi zorunlu eklersin?",
      options: [
        { text: "A) Yöntem, ölçüm belirsizliği ve iyileştirme önerisi", correct: true, feedback: "Doğru: akademik raporlama standardı budur." },
        { text: "B) Sadece nihai sayı", correct: false, feedback: "Yanlış: yorum gücü zayıf kalır." },
        { text: "C) Sadece görsel notlar", correct: false, feedback: "Yanlış: nicel analiz olmadan rapor eksik olur." }
      ]
    }
  ]
};

const simState = {
  currentStep: 0,
  correctCount: 0,
  wrongCount: 0,
  mistakes: [],
  criticalMistakes: 0,
  formSnapshot: null
};

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Her quiz oturumunda şık sırasını rastgeleleştirir; doğru indeks buna göre güncellenir. */
function shuffleQuizQuestionOptions(q) {
  const opts = q.options;
  if (!Array.isArray(opts) || opts.length < 2) {
    return { ...q, options: opts ? [...opts] : [] };
  }
  const tagged = opts.map((text, i) => ({ text, isCorrect: i === q.correctIndex }));
  const shuffled = shuffleArray(tagged);
  return {
    ...q,
    options: shuffled.map((t) => t.text),
    correctIndex: shuffled.findIndex((t) => t.isCorrect)
  };
}

function stripChoicePrefix(text) {
  return String(text).replace(/^[A-C]\)\s*/i, "").trim();
}

function buildShuffledSimulationSteps() {
  return activeSimulationSteps.map((step) => {
    const letters = ["A", "B", "C"];
    const shuffled = shuffleArray(step.options).map((option, index) => ({
      ...option,
      text: `${letters[index]}) ${stripChoicePrefix(option.text)}`
    }));
    return { ...step, options: shuffled };
  });
}

function getSimulationStepsForExperiment(experimentName, materials = "") {
  const form = { experimentName: experimentName || "", materials: materials || "" };
  const type = detectExperimentTypeFromForm(form);
  const byType = {
    titration: simulationCatalog.titration,
    distillation: simulationCatalog.distillation,
    ph_measurement: simulationCatalog.ph_measurement,
    saponification: simulationCatalog.saponification,
    viscosity: simulationCatalog.viscosity,
    electrical_circuit: simulationCatalog.generic,
    gas_law: simulationCatalog.generic,
    solubility: simulationCatalog.generic,
    generic: simulationCatalog.generic
  };
  return byType[type] || simulationCatalog.generic;
}

function readForm() {
  const expectedRaw = document.getElementById("expected").value.trim();
  const measuredUnitRaw = document.getElementById("measuredUnit").value.trim();
  const expectedUnitRaw = document.getElementById("expectedUnit").value.trim();
  return {
    experimentName: document.getElementById("experimentName").value.trim(),
    materials: document.getElementById("materials").value.trim(),
    temperature: Number(document.getElementById("temperature").value),
    measured: Number(document.getElementById("measured").value),
    measuredUnit: measuredUnitRaw,
    expectedUnit: expectedUnitRaw,
    expected: expectedRaw === "" ? null : Number(expectedRaw)
  };
}

function setOutput(el, text, muted = false) {
  const tableRegex = /(\|.+\|\r?\n\|\s*:?[-]+.*\|\r?\n(?:\|.*\|\r?\n?)*)/g;
  const convertMarkdownTable = (block) => {
    const lines = String(block)
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return block;

    const splitCells = (line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());

    const headers = splitCells(lines[0]);
    const rows = lines.slice(2).map(splitCells);
    const headHtml = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
    const bodyHtml = `<tbody>${rows
      .map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody>`;
    return `<table class="report-table">${headHtml}${bodyHtml}</table>`;
  };

  const html = String(text)
    .replace(tableRegex, (match) => convertMarkdownTable(match))
    .replace(/^###\s(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s(.+)$/gm, "<h2>$1</h2>")
    .replace(/^\>\s(.+)$/gm, "<p><em>$1</em></p>")
    .replace(/^\-\s(.+)$/gm, "<p>• $1</p>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  el.innerHTML = html;
  el.classList.toggle("muted", muted);
}

function ensureSimulationControls() {
  if (simulationControls) return simulationControls;
  simulationControls = document.createElement("div");
  simulationControls.id = "simulationControls";
  simulationControls.className = "simulation-controls";
  simulationPanel.appendChild(simulationControls);
  return simulationControls;
}

function renderSimulationFinal() {
  const mistakesText = simState.mistakes.length
    ? simState.mistakes.map((m, i) => `${i + 1}. ${m}`).join("\n")
    : "Kritik hata yapmadın, süreç kontrolün iyi.";

  const total = Math.max(1, activeSimulationSteps.length);
  const successRate = Math.round((simState.correctCount / total) * 100);
  const measured = simState.formSnapshot?.measured;
  const measuredUnit = simState.formSnapshot?.measuredUnit || "birim";
  const expected = simState.formSnapshot?.expected;
  const expectedUnit = simState.formSnapshot?.expectedUnit || measuredUnit;
  const hasExpected = Number.isFinite(expected) && Number.isFinite(measured);
  const percentError =
    hasExpected && expected !== 0 ? Math.abs((expected - measured) / expected) * 100 : null;

  setOutput(
    simulationOutput,
    `🎯 Simülasyon Tamamlandı
Başarı Oranı: %${successRate}
Kritik Hata Sayısı: ${simState.criticalMistakes} adet

📊 Simülasyon Sonuç Raporu
Analitik Veri: ${Number.isFinite(measured) ? `${measured} ${measuredUnit}` : "Girilmedi"}
${hasExpected ? `%(Hata) = ${percentError.toFixed(2)} | (Hesaplama: % Hata = |(Teorik - Ölçülen) / Teorik| x 100)\nBeklenen: ${expected} ${expectedUnit}` : "Teorik değer olmadığı için yüzde hata hesaplanmadı."}

🧾 Hata Listesi:
${mistakesText}
`
  );

  const controls = ensureSimulationControls();
  controls.innerHTML = "";
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.textContent = "Simülasyonu Yeniden Başlat";
  retryBtn.addEventListener("click", startInteractiveSimulation);
  controls.appendChild(retryBtn);
}

function handleSimulationChoice(step, option) {
  if (option.correct) {
    simState.correctCount += 1;
  } else {
    simState.wrongCount += 1;
    simState.criticalMistakes += 1;
    simState.mistakes.push(`${step.title}: ${option.text}`);
  }

  setOutput(
    simulationOutput,
    `${step.title}
${option.correct ? "✔ Doğru" : "⚠️ Yanlış; çünkü"} ${option.feedback}

Skor -> Doğru: ${simState.correctCount} | Hata: ${simState.wrongCount}`
  );

  const controls = ensureSimulationControls();
  controls.innerHTML = "";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent =
    simState.currentStep >= activeSimulationSteps.length - 1 ? "Simülasyonu Bitir" : "Sonraki Adım";
  nextBtn.addEventListener("click", () => {
    simState.currentStep += 1;
    if (simState.currentStep >= activeSimulationSteps.length) {
      renderSimulationFinal();
      return;
    }
    renderSimulationStep();
  });
  controls.appendChild(nextBtn);
}

function renderSimulationStep() {
  const step = activeSimulationSteps[simState.currentStep];
  if (!step) {
    renderSimulationFinal();
    return;
  }

  setOutput(
    simulationOutput,
    `🧪 ${step.title}
🎯 Aksiyon: ${step.action || step.question}
🔧 Teknik İpucu: ${step.tip || "Adımları kontrollü ve kayıtlı şekilde yürütün."}
${simState.currentStep % 2 === 1 ? `🦺 İSG Uyarısı: ${step.safety || "Koruyucu gözlük, eldiven ve önlük kullanın."}` : ""}

❓ Ne yapmalısınız?`
  );

  const controls = ensureSimulationControls();
  controls.innerHTML = "";

  step.options.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = option.text;
    btn.addEventListener("click", () => handleSimulationChoice(step, option));
    controls.appendChild(btn);
  });
}

function startInteractiveSimulation() {
  const form = readForm();
  activeSimulationSteps = getSimulationStepsForExperiment(form.experimentName, form.materials);
  activeSimulationSteps = buildShuffledSimulationSteps();
  simState.currentStep = 0;
  simState.correctCount = 0;
  simState.wrongCount = 0;
  simState.criticalMistakes = 0;
  simState.mistakes = [];
  simState.formSnapshot = form;
  renderSimulationStep();
}

/** Sadece şablondan soru: LLM yok; deney bağlamı detectExperimentTypeFromForm ile kilitlenir. */
function buildQuizQuestions() {
  const form = readForm();
  const expType = detectExperimentTypeFromForm(form);
  const expName = form.experimentName.trim() || "Deney";
  const measuredUnit = form.measuredUnit || "birim";
  const expectedUnit = form.expectedUnit || measuredUnit;
  const hasExpected = Number.isFinite(form.expected) && Number.isFinite(form.measured);
  const percentError =
    hasExpected && form.expected !== 0 ? Math.abs((form.expected - form.measured) / form.expected) * 100 : null;

  const pool = QUIZ_POOLS[expType] || QUIZ_POOLS.generic;
  const questions = [];

  questions.push(cloneQuizQuestion(pool[0], expName, form.materials));
  questions.push(buildTemperatureQuizQuestion(expType, form));
  questions.push(cloneQuizQuestion(pool[1], expName, form.materials));
  questions.push(cloneQuizQuestion(pool[2], expName, form.materials));

  if (hasExpected) {
    questions.push({
      type: "mcq",
      question: `«${expName}» — Ölçülen **${form.measured} ${measuredUnit}** ve beklenen **${form.expected} ${expectedUnit}** için yaklaşık yüzde hata kaçtır?`,
      options: [
        `%${Math.max(0, (percentError || 0) - 4).toFixed(1)}`,
        `%${(percentError || 0).toFixed(1)}`,
        `%${((percentError || 0) + 6).toFixed(1)}`,
        `%${((percentError || 0) + 12).toFixed(1)}`
      ],
      correctIndex: 1,
      explanation: "Model: %Hata = |(Teorik-Ölçülen)/Teorik| x 100."
    });
    questions.push(cloneQuizQuestion(pool[4], expName, form.materials));
  } else {
    questions.push(cloneQuizQuestion(pool[3], expName, form.materials));
    questions.push(cloneQuizQuestion(pool[4], expName, form.materials));
  }

  questions.push({
    type: "mcq",
    question: `«${expName}» raporunda hangisi en güvenilir yaklaşımdır?`,
    options: [
      "Ölçüm + birim + süreç koşulu + olası hata kaynağı ile raporlamak",
      "Yalnızca son sayıyı yazmak",
      "Başka bir deneyin raporunu kopyalamak",
      "Yalnızca subjektif görsel gözlem"
    ],
    correctIndex: 0,
    explanation: "İzlenebilirlik ve hata analizi, bu deneyin verileriyle tutarlı olmalıdır."
  });

  return questions.slice(0, 7);
}

function openQuizModal() {
  const form = readForm();
  const expType = detectExperimentTypeFromForm(form);
  quizState.questions = buildQuizQuestions().map(shuffleQuizQuestionOptions);
  quizState.current = 0;
  quizState.selected = null;
  quizState.answers = [];
  quizState.revealed = false;
  const deney = form.experimentName.trim() || "Deney";
  quizSubtitle.textContent = `${deney} — ${EXPERIMENT_LABEL_TR[expType] || "Genel"} · Sorular, yazdığınız deney adı (ve tanınan tür) ile eşleştirilir`;
  quizModal.classList.remove("hidden");
  renderQuizQuestion();
}

function closeQuizModal() {
  quizModal.classList.add("hidden");
}

function renderQuizQuestion() {
  const q = quizState.questions[quizState.current];
  const total = quizState.questions.length;
  quizProgress.textContent = `Soru ${quizState.current + 1}/${total}`;
  quizBody.innerHTML = "";
  quizActions.innerHTML = "";

  const qEl = document.createElement("div");
  qEl.className = "quiz-question";
  qEl.textContent = q.question;
  quizBody.appendChild(qEl);

  const optionsWrap = document.createElement("div");
  optionsWrap.className = "quiz-options";
  const feedback = document.createElement("div");
  feedback.className = "quiz-note";
  feedback.textContent = "Devam etmek için bir seçenek seçin.";
  let locked = false;

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.disabled = true;
  nextBtn.textContent = quizState.current === total - 1 ? "Bitir" : "Sonraki";

  q.options.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quiz-option";
    b.textContent = opt;
    b.addEventListener("click", () => {
      if (locked) return;
      locked = true;
      quizState.selected = idx;
      quizState.revealed = true;
      quizState.answers[quizState.current] = idx;
      [...optionsWrap.children].forEach((child, cidx) => {
        child.classList.remove("selected");
        if (cidx === q.correctIndex) child.classList.add("correct");
      });
      if (idx !== q.correctIndex) {
        b.classList.add("wrong");
        feedback.textContent = `Yanlış: ${q.explanation}`;
      } else {
        b.classList.add("selected");
        feedback.textContent = `Doğru: ${q.explanation}`;
      }
      nextBtn.disabled = false;
    });
    optionsWrap.appendChild(b);
  });
  quizBody.appendChild(optionsWrap);
  quizBody.appendChild(feedback);

  nextBtn.addEventListener("click", () => {
    if (!quizState.revealed) return;
    quizState.selected = null;
    quizState.revealed = false;
    if (quizState.current < total - 1) {
      quizState.current += 1;
      renderQuizQuestion();
      return;
    }
    renderQuizResult();
  });
  quizActions.appendChild(nextBtn);
}

function feedbackByScore(score, total) {
  const ratio = score / Math.max(total, 1);
  if (ratio >= 0.8) return "İyi gidiyorsun! Temel kavramları doğru yorumluyorsun.";
  if (ratio >= 0.5) return "Fena değil. Birkaç kritik adımı tekrar etmen faydalı olur.";
  return "Tekrar dene. Ölçüm-disiplin ve yorum adımlarını yeniden gözden geçir.";
}

function renderQuizResult() {
  quizProgress.textContent = "Quiz Sonucu";
  quizBody.innerHTML = "";
  quizActions.innerHTML = "";

  let score = 0;
  quizState.questions.forEach((q, i) => {
    if (quizState.answers[i] === q.correctIndex) score += 1;
  });

  const summary = document.createElement("div");
  summary.className = "quiz-question";
  summary.textContent = `Skor: ${score}/${quizState.questions.length}`;
  quizBody.appendChild(summary);

  const fb = document.createElement("div");
  fb.className = "quiz-note";
  fb.textContent = feedbackByScore(score, quizState.questions.length);
  quizBody.appendChild(fb);

  const review = document.createElement("div");
  review.className = "quiz-options";
  quizState.questions.forEach((q, i) => {
    const row = document.createElement("div");
    row.className = "quiz-option";
    row.textContent = `${i + 1}. ${q.question}`;
    review.appendChild(row);

    q.options.forEach((opt, idx) => {
      const optEl = document.createElement("div");
      optEl.className = "quiz-option";
      optEl.textContent = opt;
      if (idx === q.correctIndex) optEl.classList.add("correct");
      if (idx === quizState.answers[i] && idx !== q.correctIndex) optEl.classList.add("wrong");
      review.appendChild(optEl);
    });
    const why = document.createElement("div");
    why.className = "quiz-note";
    why.textContent = `Açıklama: ${q.explanation}`;
    review.appendChild(why);
  });
  quizBody.appendChild(review);

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.textContent = "Tekrar Dene";
  retryBtn.addEventListener("click", openQuizModal);
  quizActions.appendChild(retryBtn);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Kapat";
  closeBtn.addEventListener("click", closeQuizModal);
  quizActions.appendChild(closeBtn);
}

async function callApi(endpoint, outputEl, loadingText) {
  const payload = readForm();
  payload.requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  payload.requestedAt = new Date().toISOString();

  if (!payload.experimentName) {
    setOutput(outputEl, "Lütfen Deney Adı giriniz.");
    return null;
  }
  if (endpoint === API_ANALYZE && !Number.isFinite(payload.measured)) {
    setOutput(outputEl, "Analiz için Ölçülen Değer alanına geçerli sayı giriniz.");
    return null;
  }
  if (endpoint === API_ANALYZE && payload.temperature !== 0 && !Number.isFinite(payload.temperature)) {
    payload.temperature = 25;
  }
  if (endpoint !== API_ANALYZE && !Number.isFinite(payload.temperature)) {
    payload.temperature = 25;
  }
  // Beklenen/teorik değer zorunlu değil: boşsa veya geçersizse null kabul et.
  if (payload.expected !== null && !Number.isFinite(payload.expected)) {
    payload.expected = null;
  }

  setOutput(outputEl, loadingText, true);
  try {
    const response = await postWithFallback(endpoint, payload);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOutput(outputEl, data.result || "Sunucu hatası oluştu.");
      return null;
    }
    return data;
  } catch {
    const port = String(window.__DEV_API_PORT__ || "3000").trim() || "3000";
    const localUrl = `http://127.0.0.1:${port}`;
    let hint;
    if (isFileProtocol()) {
      hint = `Sayfa dosyadan (file://) açıldığı için API çağrısı çoğu tarayıcıda engellenebilir veya sunucuya ulaşılamıyor. Çözüm: proje klasöründe "npm start" çalıştırın ve adres çubuğuna ${localUrl} yazın (çift tıklama yerine).`;
    } else if (isLocalDevContext()) {
      hint = `Sunucuya ulaşılamıyor. "npm start" ile backend’i başlatıp ${localUrl} veya http://localhost:${port} üzerinden açmayı deneyin.`;
    } else {
      hint =
        "Sunucuya ulaşılamıyor. Dağıtımın çalıştığını, API’nin aynı kökte veya PUBLIC_API_URL ile doğru yapılandırıldığını kontrol edin.";
    }
    setOutput(outputEl, `Bağlantı hatası: ${hint}`);
    return null;
  }
}

function initFileOpenBanner() {
  const el = document.getElementById("fileOpenBanner");
  const link = document.getElementById("fileOpenBannerLink");
  if (!el || !isFileProtocol()) return;
  const port = String(window.__DEV_API_PORT__ || "3000").trim() || "3000";
  const href = `http://127.0.0.1:${port}`;
  if (link) {
    link.href = href;
    link.textContent = href;
  }
  el.hidden = false;
}

initFileOpenBanner();

analyzeBtn.addEventListener("click", async () => {
  const data = await callApi(API_ANALYZE, analysisOutput, "AI düşünüyor...");
  if (!data) return;
  console.log(data.result);
  setOutput(analysisOutput, data.result || "Analiz çıktısı alınamadı.");
});

teachBtn.addEventListener("click", async () => {
  const data = await callApi(API_TUTOR, teachingOutput, "AI düşünüyor...");
  if (!data) return;
  console.log("TEACH RESPONSE:", data.result);
  setOutput(teachingOutput, data.result || "Öğretim çıktısı alınamadı.");
});

simulateBtn.addEventListener("click", async () => {
  const data = await callApi(API_SIMULATE, simulationOutput, "AI düşünüyor...");
  if (!data) return;
  console.log(data.result);
  setOutput(
    simulationOutput,
    `${data.result || "Simülasyon başlatılıyor..."}

🧪 İnteraktif aşamaya geçiliyor...`
  );
  startInteractiveSimulation();
});

quizBtn.addEventListener("click", openQuizModal);
quizCloseBtn.addEventListener("click", closeQuizModal);
quizModal.addEventListener("click", (event) => {
  if (event.target === quizModal) closeQuizModal();
});