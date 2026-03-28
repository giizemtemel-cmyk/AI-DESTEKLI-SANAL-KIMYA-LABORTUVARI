const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { runAnalyze } = require("./agents/analyzerAgent");
const { runTutor } = require("./agents/tutorAgent");
const { runQuiz } = require("./agents/quizAgent");
const { runSimulate } = require("./agents/simulateAgent");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

/** Render / Railway / Vercel: FRONTEND_ORIGIN ile kısıtlama varken kendi public URL’sini de listeye ekle (tek serviste site açılır ama API CORS’a takılırdı). */
function extraDeploymentOrigins() {
  const list = [];
  const render = (process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  if (render) list.push(render);
  const rail = (process.env.RAILWAY_PUBLIC_DOMAIN || "").trim().replace(/^https?:\/\//i, "");
  if (rail) list.push(`https://${rail}`);
  const vercel = (process.env.VERCEL_URL || "").trim().replace(/^https?:\/\//i, "");
  if (vercel) list.push(`https://${vercel}`);
  return list;
}

const FRONTEND_ORIGIN_RAW = (process.env.FRONTEND_ORIGIN || "").trim();
const userOrigins = FRONTEND_ORIGIN_RAW.length
  ? FRONTEND_ORIGIN_RAW.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const allowedFrontendOrigins =
  userOrigins.length > 0 ? [...new Set([...userOrigins, ...extraDeploymentOrigins()])] : null;

const corsOptions = {
  origin(origin, callback) {
    if (!allowedFrontendOrigins || allowedFrontendOrigins.length === 0) {
      return callback(null, true);
    }
    if (!origin || origin === "null") {
      return callback(null, true);
    }
    if (allowedFrontendOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn("[CORS] İzin verilmeyen origin:", origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const frontendDir = path.join(__dirname, "..", "frontend");
if (!fs.existsSync(path.join(frontendDir, "index.html"))) {
  console.warn("[uyarı] frontend/index.html bulunamadı:", frontendDir);
}
app.use(express.static(frontendDir));

const rawPort = process.env.PORT;
const PORT =
  rawPort !== undefined && String(rawPort).trim() !== "" && !Number.isNaN(Number(rawPort))
    ? Number(rawPort)
    : 3000;

app.set("trust proxy", 1);

function parseInput(body = {}, options = {}) {
  const requireMeasured = options.requireMeasured !== false;
  const experimentName = String(body.experimentName || "").trim();
  const materials = String(body.materials || "").trim();
  const measuredRaw = body.measured;
  const measured = measuredRaw === null || measuredRaw === undefined || measuredRaw === "" ? null : Number(measuredRaw);
  const temperatureRaw = body.temperature;
  const temperature = temperatureRaw === null || temperatureRaw === undefined || temperatureRaw === "" ? 25 : Number(temperatureRaw);
  const expectedRaw = body.expected;
  const expectedParsed = expectedRaw === null || expectedRaw === undefined || expectedRaw === "" ? null : Number(expectedRaw);
  const expected = Number.isFinite(expectedParsed) ? expectedParsed : null;

  if (requireMeasured && !Number.isFinite(measured)) return null;
  if (!Number.isFinite(temperature)) return null;
  return {
    experimentName,
    materials,
    measured: measured ?? 0,
    measuredUnit: String(body.measuredUnit || "").trim(),
    expectedUnit: String(body.expectedUnit || body.measuredUnit || "").trim(),
    expected,
    temperature,
    requestId: String(body.requestId || "").trim(),
    requestedAt: String(body.requestedAt || "").trim()
  };
}

function unitOrBirimsiz(unitText) {
  const unit = String(unitText || "").trim();
  return unit || "birim";
}

function extractCurrentExperiment(text = "") {
  const raw = String(text || "").trim();
  const match = raw.match(/^deney(\s*adı)?\s*:\s*(.+)$/iu);
  return match ? match[2].trim() : raw;
}

function hasUnrelatedExperimentLeak(outputText = "", currentExperiment = "") {
  const txt = String(outputText || "").toLowerCase();
  const current = String(currentExperiment || "").toLowerCase();
  const blocked = ["titrasyon", "damıtma", "distilasyon", "gaz yasası", "çözünürlük", "pikasso"];
  return blocked.some((name) => txt.includes(name) && !current.includes(name));
}

/** Türkçe/İngilizce karışık metni sınıflandırma için sadeleştirir (frontend ile uyumlu). */
function foldTrAscii(s) {
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

function classifyExperimentTypeFromFolded(folded, rawForRegex) {
  const raw = String(rawForRegex || "");
  if (
    folded.includes("titras") ||
    folded.includes("titration") ||
    folded.includes("buret") ||
    folded.includes("notraliz") ||
    folded.includes("neutraliz") ||
    folded.includes("equivalence") ||
    folded.includes("esdegerlik") ||
    folded.includes("indikator") ||
    folded.includes("indicator")
  ) {
    return "titration";
  }
  if (
    folded.includes("damit") ||
    folded.includes("distil") ||
    folded.includes("fraksiyon") ||
    folded.includes("rektifikasyon") ||
    folded.includes("distillation") ||
    folded.includes("reflux")
  ) {
    return "distillation";
  }
  if (
    folded.includes("ph olcum") ||
    folded.includes("ph olcumu") ||
    folded.includes("ph metre") ||
    folded.includes("phmetre") ||
    folded.includes("ph-meter") ||
    /\bph\s*metre\b/.test(folded) ||
    folded.includes("potansiyometrik") ||
    /\bph\b/.test(folded) ||
    folded.includes("asitlik") ||
    folded.includes("alkalilik")
  ) {
    return "ph_measurement";
  }
  if (folded.includes("sabunlas") || folded.includes("saponifik") || folded.includes("saponification")) {
    return "saponification";
  }
  if (
    folded.includes("viskoz") ||
    folded.includes("akiskanlik") ||
    folded.includes("viscosity") ||
    folded.includes("viscometer") ||
    folded.includes("viskometre") ||
    folded.includes("ostwald") ||
    folded.includes("ubbelohde") ||
    folded.includes("cannon") ||
    folded.includes("kinematik viskozite") ||
    folded.includes("kinematik")
  ) {
    return "viscosity";
  }
  if (
    folded.includes("gaz yasasi") ||
    folded.includes("ideal gaz") ||
    folded.includes("boyle") ||
    folded.includes("charles") ||
    folded.includes("avogadro") ||
    folded.includes("gas law") ||
    /\bpv\s*=\s*nrt\b/i.test(raw)
  ) {
    return "gas_law";
  }
  if (folded.includes("cozun") || folded.includes("doygun") || folded.includes("solubility") || folded.includes("soluble")) {
    return "solubility";
  }
  return "generic";
}

function normalizeChemicalAliases(text = "") {
  let normalized = String(text || "").toLowerCase();
  const aliasMap = [
    [/hidrojen\s*klor(ü|u)r|hydrogen\s*chloride/gi, "hcl"],
    [/hidroklorik\s*asit/gi, "hcl"],
    [/sodyum\s*hidroksit/gi, "naoh"],
    [/sülf(ü|u)rik\s*asit|sulfuric\s*acid/gi, "h2so4"],
    [/nitrik\s*asit|nitric\s*acid/gi, "hno3"],
    [/asetik\s*asit|acetic\s*acid/gi, "ch3cooh"],
    [/sodyum\s*klor(ü|u)r|sofra\s*tuzu|table\s*salt/gi, "nacl"],
    [/etanol|ethyl\s*alcohol/gi, "c2h5oh"],
    [/metanol|methyl\s*alcohol/gi, "ch3oh"]
  ];

  aliasMap.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return normalized;
}

/** Önce deney adı; yalnızca o belirsizse ad + malzemeler (frontend ile aynı kurallar). */
function detectExperimentType(name = "", materials = "") {
  const n = String(name || "").trim();
  const m = String(materials || "").trim();
  const rawFull = `${n} ${m}`;
  if (n.length) {
    const foldedName = foldTrAscii(normalizeChemicalAliases(n));
    const fromName = classifyExperimentTypeFromFolded(foldedName, n);
    if (fromName !== "generic") return fromName;
  }
  const foldedFull = foldTrAscii(normalizeChemicalAliases(rawFull));
  return classifyExperimentTypeFromFolded(foldedFull, rawFull);
}

const EXPERIMENT_TYPE_LABEL_TR = {
  titration: "Titrasyon",
  distillation: "Damıtma / fraksiyon",
  ph_measurement: "pH ölçümü",
  saponification: "Sabunlaşma",
  viscosity: "Viskozite",
  gas_law: "Gaz yasası (P-V-T)",
  solubility: "Çözünürlük",
  generic: "Genel (anahtar kelime eşleşmesi yok; hesap yine formdaki sayılara dayanır)"
};

function longTeachFallback(input) {
  const experimentName = String(input.experimentName || "Deney").trim();
  const experimentType = detectExperimentType(input.experimentName, input.materials);
  const materialsList = String(input.materials || "laboratuvar ekipmanları")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 5);

  const theoryByType = {
    titration:
      "Titrasyonda eşdeğerlik koşulu mol dengeye dayanır. Uygun tepkimelerde eşdeğerlik noktasında **n_asit = n_baz** sağlanır; bu nedenle ölçümün sayısal değeri, hacim ölçümünün doğruluğuna ve indikatör seçiminin geçiş aralığına doğrudan bağlıdır.",
    distillation:
      "Damıtma ayırması, buhar–sıvı dengesindeki uçuculuk farkına dayanır. Kaynama noktası farkı, farklı fraksiyonların farklı sıcaklık bantlarında yoğunlaşmasına neden olur; bu nedenle sıcaklık kontrolü ayrım verimini belirler.",
    ph_measurement:
      "pH ölçümü, çözeltideki hidrojen iyonu aktivitesinin cam elektrot-potansiyometrik yöntemle belirlenmesine dayanır. Nernst yaklaşımı nedeniyle sıcaklık değişimi elektrot eğimini etkiler; bu yüzden kalibrasyon ve termal dengeleme kritik önemdedir.",
    saponification:
      "Sabunlaşma deneyi, esterlerin baz katalizi altında hidroliziyle yağ asidi tuzlarının oluşumuna dayanır. Reaksiyon hızı sıcaklık ve baz derişiminden güçlü biçimde etkilendiği için süre-sıcaklık kontrolü ürün verimini belirler.",
    viscosity:
      "Viskozite tayini, akışa karşı iç sürtünmenin nicel ölçümüdür ve çoğu sıvıda sıcaklık arttıkça viskozite azalır. Kapiler veya rotasyonel ölçümlerde kalibrasyon ve sabit sıcaklık, doğru sonuç için zorunludur.",
    gas_law:
      "Gaz yasası deneyleri ideal gaz yaklaşımı üzerinden **PV = nRT** ilişkisini doğrular. Sıcaklık–basınç–hacim değişimleri, sabit tutulan parametrelere göre beklenen doğrusal/ters orantı davranışı verir.",
    solubility:
      "Çözünürlük deneyinde doygunluk, çözünme ve kristallenme hızlarının eşitlendiği denge durumudur. Sıcaklık değişimi çözünürlüğü termal olarak etkiler; dengeye ulaşma süresi ölçüm belirsizliğini etkiler.",
    generic:
      "Deneyin kuramsal çerçevesi tanımlanan fizikokimyasal prensiplere dayanır. Doğru yorum, ölçüm değişkenlerinin kontrollü yönetimi ve kalibrasyon doğruluğunun birlikte değerlendirilmesini gerektirir."
  }[experimentType];

  const kbByType = {
    titration: {
      aim: "Bilinmeyen derişimi, standart çözelti ile eşdeğerlik noktasında doğru hacim ölçümü yaparak belirlemek.",
      observation: "Renk dönüşüm noktası kalıcı olur; örnek veri: eşdeğerlikte pH yaklaşık 7.0 (güçlü asit-güçlü baz)."
    },
    distillation: {
      aim: "Kaynama noktası farkını kullanarak karışımı fraksiyonlara ayırmak.",
      observation: "Sıcaklık plato eğilimi görülür; örnek veri: etanol fraksiyonu yaklaşık 78.0°C çevresinde toplanır."
    },
    ph_measurement: {
      aim: "Çözeltinin asidik/bazik karakterini pH metre ile doğru kalibrasyon altında belirlemek.",
      observation: "Tampon kalibrasyonu sonrası aynı numunede tekrar ölçümlerde sapma genelde ±0.05 pH içinde kalır."
    },
    saponification: {
      aim: "Ester hidrolizi ile sabun oluşumunu gözleyip reaksiyon verimini değerlendirmek.",
      observation: "Reaksiyon sonunda baz tüketimi artar ve ürün fazında sabunlaşma belirtileri belirginleşir."
    },
    viscosity: {
      aim: "Sıvının akış davranışını ölçerek viskozite değerini sıcaklıkla ilişkilendirmek.",
      observation: "Sıcaklık yükseldikçe akış süresi azalır ve görünür viskozite düşer."
    },
    gas_law: {
      aim: "P, V ve T arasındaki nicel ilişkiyi (PV=nRT) deneysel olarak doğrulamak.",
      observation: "Sabit T'de P-V ters değişir; örnek veri: V yarıya indiğinde P yaklaşık iki katına çıkar."
    },
    solubility: {
      aim: "Belirli sıcaklıkta doygun çözelti oluşturarak çözünürlük miktarını belirlemek.",
      observation: "Dengeye ulaşıldığında artık çözünme durur; örnek veri: 25°C'de 100 g suda 35 g çözünen."
    },
    generic: {
      aim: "Deney değişkenlerini kontrollü yöneterek güvenilir ölçüm ve doğru yorum üretmek.",
      observation: "Kontrol değişkenleri sabit tutulduğunda ölçümlerin dağılımı daralır; örnek veri: tekrar ölçümlerde fark yüzde 2'nin altına iner."
    }
  }[experimentType];
  const kb = kbByType || kbByType.generic;

  const m1 = materialsList[0] || "Ana ölçüm ekipmanı";
  const m2 = materialsList[1] || "Numune kabı";

  const stepsByType = {
    titration: [
      `Bureti ${m1} ile şartlandırıp başlangıç menisküsünü oku.`,
      `Numuneyi ${m2} içine ölçülü hacimde al ve uygun indikatör ekle.`,
      "Titrantı damla damla eklerken sürekli karıştır ve renk değişimini izle.",
      "Kalıcı renk değişiminde bitiş hacmini kaydet ve sonucu hesapla."
    ],
    distillation: [
      "Kurulumu sızdırmazlık açısından kontrol et ve soğutucu akışını başlat.",
      "Isıtmayı kademeli artır ve sıcaklık değişimini anlık izle.",
      "Buharlaşan fazın yoğuşmasını gözleyerek fraksiyonu ayrı kapta topla.",
      "Toplanan fraksiyonun sıcaklık aralığına göre saflık değerlendirmesi yap."
    ],
    ph_measurement: [
      "pH metre elektrodunu yıkayıp tampon çözeltilerle iki/üç nokta kalibrasyon yap.",
      "Numuneyi homojenleştir ve ölçüm öncesi sıcaklığı dengele.",
      "Elektrodu numuneye daldır, değer kararlı hale gelince pH'ı kaydet.",
      "Tekrar ölçümle sapmayı kontrol edip ortalama pH değerini raporla."
    ],
    saponification: [
      "Yağ/ester numunesini belirli hacimde al ve baz çözeltisini kontrollü ekle.",
      "Karışımı sabit sıcaklıkta ve sabit karıştırma hızında reaksiyona bırak.",
      "Belirli aralıklarda numune alarak dönüşüm seviyesini izle.",
      "Reaksiyon sonunda verim ve olası yan tepkimeleri değerlendir."
    ],
    viscosity: [
      "Viskozimetreyi referans sıvı ile kalibre et ve sıcaklığı sabitle.",
      "Numuneyi cihaz haznesine alıp termal dengeye ulaşmasını bekle.",
      "Akış süresi veya tork verisini birden fazla tekrar ile ölç.",
      "Ortalama viskoziteyi sıcaklık koşuluyla birlikte raporla."
    ],
    gas_law: [
      "Sensörleri sıfırla ve başlangıç P-V-T değerlerini kaydet.",
      "Tek bir değişkeni değiştirip diğerlerini sabit tut.",
      "Her adımda yeni basınç/hacim/sıcaklık değerlerini ölç.",
      "Verileri PV=nRT ilişkisine göre karşılaştır ve sapmayı yorumla."
    ],
    solubility: [
      "Sabit sıcaklıkta çözücüyi hazırla ve başlangıç sıcaklığını kaydet.",
      "Çözüneni küçük porsiyonlarla ekleyip sürekli karıştır.",
      "Çözünme durduğunda doygunluk noktasını not et.",
      "Çözünen miktarını sıcaklıkla ilişkilendirerek sonuçlandır."
    ],
    generic: [
      "Deney düzeneğini kur ve başlangıç koşullarını doğrula.",
      "Kontrol değişkenlerini sabit tutarak ölçümleri başlat.",
      "Verileri adım adım kaydet ve sapmaları not et.",
      "Sonuçları teorik beklentiyle karşılaştırıp yorumla."
    ]
  };
  const steps = stepsByType[experimentType] || stepsByType.generic;
  const qty = ["100 mL", "50 mL", "25 g", "1 adet"];

  const reactionByType = {
    titration: "HCl(aq) + NaOH(aq) -> NaCl(aq) + H2O(l)",
    distillation: "Fiziksel ayırma süreci: buharlaşma -> yoğuşma",
    ph_measurement: "H+ aktivitesi -> elektrot potansiyeli (Nernst ilişkisi)",
    saponification: "Ester + NaOH -> Karboksilat tuzu (sabun) + alkol",
    viscosity: "Akış direnci ~ iç sürtünme (eta) ve sıcaklık bağımlılığı",
    gas_law: "PV = nRT (ideal gaz yaklaşımı)",
    solubility: "Çözünme(s) <-> Çözeltide iyon/molekül (denge)",
    generic: "Deney tipine göre kimyasal/termodinamik prensip uygulanır"
  };

  const expectedValueByType = {
    titration: `pH 7 birim`,
    distillation: `78 °C`,
    ph_measurement: `pH 7.00 birim`,
    saponification: `85 % verim`,
    viscosity: `12.5 mPa·s`,
    gas_law: `101.3 kPa`,
    solubility: `35 g/100 mL`,
    generic: `${input.measured} ${unitOrBirimsiz(input.measuredUnit)}`
  };

  const measuredUnitText = unitOrBirimsiz(input.measuredUnit);
  const expectedUnitText = unitOrBirimsiz(input.expectedUnit || input.measuredUnit);
  const hasExpected = Number.isFinite(input.expected);
  const expectedSafe = hasExpected ? input.expected : null;
  const delta = hasExpected ? expectedSafe - input.measured : null;
  const percentError =
    hasExpected && expectedSafe !== 0 ? (Math.abs(delta) / Math.abs(expectedSafe)) * 100 : null;

  const expectedBlock = hasExpected
    ? `**${expectedSafe} ${expectedUnitText}** (±% **${percentError.toFixed(2)}**)`
    : "**GİRİLMEDİ** (Teorik değer olmadığından ±% hesaplanamaz)";

  return `**${experimentName.toUpperCase()} - TEKNİK ANALİZ VE UYGULAMA PROTOKOLÜ**
---

| I. KURAMSAL ÇERÇEVE | II. OPERASYONEL PROSEDÜR | III. ANALİTİK DEĞERLENDİRME |
| :--- | :--- | :--- |
| **GÜNCEL DENEY:** ${experimentName} | **UYGULAMA SAFHALARI** | **DENEYSEL ANALİZ** |
| ${theoryByType} | 1. **5 mL** numuneyi menisküs seviyesini dikkate alarak uygun kaba transfer edin. | Bu deneyde sıcaklık/hız etkisi **${input.temperature} °C** koşulunda Arrhenius yaklaşımına göre hız sabiti **k** ve denge konumu **ΔH** üzerinden değerlendirilir. |
| **TEKNİK PARAMETRELER** | 2. Sistemi **${input.temperature} °C** seviyesinde sabitleyin, ajitasyon hızını sabit tutun. | **HATA ANALİZİ** |
| Cihaz kalibrasyonu, menisküs okuma doğruluğu, kontaminasyon kontrolü ve **ISG** standartları doğrulanmalıdır. | 3. Verileri dijital ve zaman damgalı olarak kaydedin. | **Beklenen:** ${expectedBlock} |

---
**DOKÜMAN SONU**`;
}

function strictDynamicTeachFallback(input) {
  const experiment = String(input.experimentName || "").trim();
  const materials = String(input.materials || "").trim() || "Belirtilmedi";
  const materialList = materials
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
  const temp = Number.isFinite(input.temperature) ? input.temperature : 25;
  const measuredUnit = unitOrBirimsiz(input.measuredUnit);
  const measuredText = Number.isFinite(input.measured) ? `**${input.measured} ${measuredUnit}**` : "**GİRİLMEDİ**";
  const expectedUnitText = unitOrBirimsiz(input.expectedUnit || input.measuredUnit);
  const hasExpected = Number.isFinite(input.expected);
  const expectedText = hasExpected ? `**${input.expected} ${expectedUnitText}**` : "**GİRİLMEDİ**";
  const errorText =
    hasExpected && input.expected !== 0 && Number.isFinite(input.measured)
      ? `%(Hata) = **${(Math.abs((input.expected - input.measured) / input.expected) * 100).toFixed(2)} birim**`
      : "%(Hata) = **GİRİLMEDİ birim**";

  return `**${experiment.toUpperCase()} - DİNAMİK TEKNİK RAPOR**
---
| I. KURAMSAL ÇERÇEVE | II. OPERASYONEL PROSEDÜR | III. ANALİTİK DEĞERLENDİRME |
| :--- | :--- | :--- |
| **GÜNCEL ÇALIŞMA:** ${experiment} | **TEKNİK ADIMLAR** | **PARAMETRİK ANALİZ** |
| ${experiment} için kuramsal çerçeve, ilgili reaksiyon/ölçüm mekanizmasının kontrollü koşullarda yürütülmesine dayanır. Kritik değişkenler (**${temp} °C**, temas süresi, karıştırma hızı) sonuç doğruluğunu belirler. | 1. Numuneyi **10.0 mL** olarak hazırlayın; ekipman: ${materialList}. 2. Çalışma koşulunu **${temp} °C** seviyesinde sabitleyin ve adımları zaman damgalı yürütün. | Sıcaklık artışı veya azalışı ${experiment} sisteminde kinetik dengeyi değiştirir; bu nedenle **${temp} °C** çevresinde kontrol, ölçüm sapmasını azaltır. |
| **ÖN HAZIRLIK** | **HASSAS ÖLÇÜMLER** | **HATA MODELİ** |
| Cihaz kalibrasyonunu deney öncesi referans standardı ile doğrulayın; cam ekipman temizliğini ve kör kontrol koşulunu kayıt altına alın. | Ölçülen veri: ${measuredText}. Teorik/beklenen: ${expectedText}. Birim tutarlılığını tüm adımlarda sabitleyin. | ${errorText}; model: %Hata = \|Teorik - Ölçülen\| / Teorik x 100. |`;
}

function ensureTeachConsistency(rawText, input, experimentType) {
  let text = String(rawText || "").trim();
  // AI yanlışlıkla Q&A bölümünü eklerse temizle (başlık varyasyonlarına karşı en sağlam yaklaşım).
  const lowerText = text.toLowerCase();
  const marker1 = "teknik konsültasyon";
  const idx1 = lowerText.indexOf(marker1);
  if (idx1 !== -1) {
    text = text.slice(0, idx1).trim();
  }
  // Çıkış sonuna davet/soru-cevap kalıbı eklenmesini engelle.
  text = text
    .replace(/.*soru\s+sorabilirsiniz.*$/gimu, "")
    .replace(/.*yard[ıi]mc[ıi]\s+olabilir\s+miyim.*$/gimu, "")
    .replace(/.*anlamad[ıi][ğg][ıi]n[ıi]z.*sorabilirsiniz.*$/gimu, "")
    .trim();
  if (!text) return longTeachFallback(input);

  const lower = text.toLowerCase();
  const experimentTokens = String(input.experimentName || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  // Kalite kapısı: çok kısa veya deney dışı içerik varsa güvenli fallback kullan.
  if (text.split(/\s+/).length < 80) return longTeachFallback(input);
  if (experimentTokens.length && !experimentTokens.some((t) => lower.includes(t))) return longTeachFallback(input);
  if (text.includes("#")) return longTeachFallback(input);
  if (
    !lower.includes("dinamik teknik rapor") ||
    !lower.includes("| i. kuramsal çerçeve | ii. operasyonel prosedür | iii. analitik değerlendirme |") ||
    lower.includes("iv. teknik değerlendirme") ||
    lower.includes("quiz") ||
    lower.includes("doğru cevaplar")
  ) {
    return strictDynamicTeachFallback(input);
  }

  if (experimentType === "titration" && (lower.includes("damıt") || lower.includes("distil") || lower.includes("fraksiyon"))) {
    return longTeachFallback(input);
  }
  return text;
}

function detailedAnalyzeFallback(input, expectedSafe = null) {
  const experimentType = detectExperimentType(input.experimentName, input.materials);
  const hasExpected = Number.isFinite(expectedSafe);
  const delta = hasExpected ? input.measured - expectedSafe : null;
  const absDelta = hasExpected ? Math.abs(delta) : null;
  const percentError = hasExpected
    ? expectedSafe === 0
      ? 0
      : (absDelta / Math.abs(expectedSafe)) * 100
    : null;
  const direction = hasExpected
    ? delta > 0
      ? "beklenenden yüksek"
      : delta < 0
        ? "beklenenden düşük"
        : "beklenenle tam uyumlu"
    : "beklenen değer olmadığı için doğrudan karşılaştırılamayan";

  let reliability = "orta";
  if (hasExpected) {
    reliability = "yüksek";
    if (percentError > 10) reliability = "düşük";
    else if (percentError > 5) reliability = "orta";
  }

  const highTempScenario =
    input.temperature >= 85
      ? "Mevcut sıcaklık yüksek bantta olduğu için ölçüm kararlılığı bozulabilir, reaksiyon/denge profili beklenmedik yönde kayabilir."
      : "Sıcaklık daha da yükselirse ölçüm doğruluğu düşebilir, sistemde hızlı değişimler nedeniyle tekrar edilebilirlik zayıflayabilir.";

  const lowTempScenario =
    input.temperature <= 60
      ? "Mevcut sıcaklık düşük banda yakın olduğu için süreç kinetiği yavaşlar ve ölçümlerin dengeye ulaşma süresi uzayabilir."
      : "Sıcaklık daha düşük olsaydı süreç daha yavaş ilerler, ölçüm süresi artar ve deney tamamlanma süresi uzayabilirdi.";

  const typeSpecificNote = {
    titration:
      " Titrasyon özelinde yorum n_asit = n_baz, n = C x V ve C1 x V1 = C2 x V2 ilişkileriyle doğrulanmalı; menisküs okuma, buret kabarcığı ve indikatör seçimi ayrıca kontrol edilmelidir.",
    distillation:
      " Damıtma özelinde sıcaklık profili, buharlaşma-yoğuşma dengesi ve fraksiyon ayrımı doğruluk üzerinde belirleyicidir.",
    gas_law:
      " Gaz yasası deneyinde P-V-T değişkenlerinin birim tutarlılığı ve sabit tutulan parametrelerin doğruluğu temel kriterdir.",
    solubility:
      " Çözünürlük deneyinde doygunluk noktası, karıştırma süresi ve sıcaklık bağımlı çözünme davranışı kritik olarak izlenmelidir.",
    generic: ""
  }[experimentType];

  const measuredUnitText = unitOrBirimsiz(input.measuredUnit);
  const expectedUnitText = unitOrBirimsiz(input.expectedUnit);
  const netSapmaText = hasExpected ? `%${percentError.toFixed(2)} (Hata Payı)` : "GİRİLMEDİ (Teorik değer yok)";
  const thermalDirection = input.temperature >= 40 ? "artan" : "azalan";
  const thermalImpact =
    input.temperature >= 40
      ? "Aktivasyon enerjisi bariyeri daha kolay aşılır, hız sabiti (k) artma eğilimi gösterir."
      : "Aktivasyon enerjisi bariyerinin aşılması zorlaşır, hız sabiti (k) düşme eğilimi gösterir.";
  const thermoBalance =
    "Vant't Hoff yaklaşımına göre denge sabiti sıcaklığa duyarlıdır; entalpi işaretine bağlı olarak denge konumu sıcaklık değişiminde yer değiştirir.";

  return `### 📈 ANALİZ VE DEĞERLENDİRME
- **Sıcaklık Dinamiği:** ${input.temperature} °C değerinde reaksiyon hızı ${thermalDirection} yönde etkilenir. ${thermalImpact} ${thermoBalance}
- **Hata Analizi:** Ölçülen değer ile teorik değer arasındaki sapma ${hasExpected ? "saptanmıştır" : "teorik değer girilmediği için yüzde hata modeliyle sayısallaştırılamamıştır"}.
  *(Hesaplama: % Hata = |(Teorik Değer - Ölçülen Değer) / Teorik Değer| x 100)*
- **Sayısal Doğruluk:**
  - **Ölçülen:** ${input.measured} ${measuredUnitText}
  - **Beklenen (Teorik):** ${hasExpected ? `${expectedSafe} ${expectedUnitText}` : "GİRİLMEDİ"}
  - **Net Sapma:** ${netSapmaText}

### ⚠️ TEKNİK GÖZLEM VE RİSK ANALİZİ
- **Kontaminasyon Riski:** Numune transferinde cam yüzeyde kalan artıklar ve yetersiz durulama, ölçüm değerini sistematik olarak saptırabilir.
- **Sistem İyileştirmesi:** ${typeSpecificNote || "Ölçüm zinciri için kalibrasyon, kör numune kontrolü ve tekrar ölçüm protokolü standartlaştırılmalıdır."}`;
}

function strictAnalyzeByExperiment(input, expectedSafe = null) {
  const hasExpected = Number.isFinite(expectedSafe);
  const expectedUnit = unitOrBirimsiz(input.expectedUnit || input.measuredUnit);
  const measuredUnit = unitOrBirimsiz(input.measuredUnit);
  const O = input.measured;
  const T = hasExpected ? expectedSafe : null;
  const tempC = input.temperature;

  if (hasExpected) {
    if (T === 0) {
      return `1. Formül
%Hata = |(beklenenTeorik - olculenDeger) / beklenenTeorik| × 100

2. İşlem Adımları
beklenenTeorik = 0 olduğu için payda sıfırdır; bölme tanımsızdır. olculenDeger = ${O} ${measuredUnit}, sicaklikOlculen_C = ${tempC}.

3. Sonuç
Hesaplama yapılamadı (payda sıfır). Ölçülen: ${O} ${measuredUnit}.`;
    }
    const delta = O - T;
    const pct = (Math.abs(delta) / Math.abs(T)) * 100;
    return `1. Formül
%Hata = |(beklenenTeorik - olculenDeger) / beklenenTeorik| × 100

2. İşlem Adımları
beklenenTeorik = ${T} ${expectedUnit}, olculenDeger = ${O} ${measuredUnit}, sicaklikOlculen_C = ${tempC}.
Adım 1: |${T} - ${O}| = ${Math.abs(delta).toString()}
Adım 2: |pay / beklenenTeorik| = ${Math.abs(delta).toString()} / ${Math.abs(T).toString()} = ${(Math.abs(delta) / Math.abs(T)).toString()}
Adım 3: × 100 → %Hata = ${pct.toFixed(2)}%

3. Sonuç
Göreli sapma **%${pct.toFixed(2)}** (ölçülen ${O} ${measuredUnit}, teorik ${T} ${expectedUnit}).`;
  }

  return `1. Formül
Beklenen/teorik değer girilmediği için yüzde hata uygulanmaz; yalnızca girilen ölçümler listelenir.

2. İşlem Adımları
olculenDeger = ${O}, olculenBirim = ${measuredUnit}, sicaklikOlculen_C = ${tempC}.

3. Sonuç
Ölçülen **${O} ${measuredUnit}**, sıcaklık **${tempC} °C**. Teorik karşılaştırma yok.`;
}

/** Üç zorunlu başlık + ölçülen sayının geçmesi (hallucination / format sapmasına karşı) */
function isAnalyzeCalculatorOutputOk(text = "", input = {}) {
  const raw = String(text || "");
  const output = raw.toLowerCase();
  if (!output.trim()) return false;
  const hasHeadings =
    /1\.\s*formül/i.test(raw) && /2\.\s*işlem\s+adımları/i.test(raw) && /3\.\s*sonuç/i.test(raw);
  const measuredStr = String(input.measured);
  const mentionsMeasured = measuredStr.length > 0 && output.includes(measuredStr.toLowerCase());
  return hasHeadings && mentionsMeasured;
}

function sanitizeTutorOutput(text = "") {
  return String(text || "")
    .replace(/.*soru\s+sorabilirsiniz.*$/gimu, "")
    .replace(/.*yard[ıi]mc[ıi]\s+olabilir\s+miyim.*$/gimu, "")
    .replace(/.*anlamad[ıi][ğg][ıi]n[ıi]z.*sorabilirsiniz.*$/gimu, "")
    .trim();
}

async function handleAnalyze(req, res) {
  const input = parseInput(req.body, { requireMeasured: true });
  if (!input) return res.status(400).json({ result: "Geçerli sayısal veri giriniz." });
  if (!input.experimentName) return res.status(400).json({ result: "Lütfen Deney Adı giriniz." });

  const hasExpected = Number.isFinite(input.expected);
  const expectedSafe = hasExpected ? input.expected : null;
  const experimentType = detectExperimentType(input.experimentName, input.materials);

  const olculenDegerler = {
    malzemeler: input.materials || null,
    sicaklikOlculen_C: input.temperature,
    olculenDeger: input.measured,
    olculenBirim: unitOrBirimsiz(input.measuredUnit),
    beklenenTeorik: hasExpected ? expectedSafe : null,
    beklenenBirim: hasExpected ? unitOrBirimsiz(input.expectedUnit) : null,
    cikarimDeneyTipi: experimentType,
    istekKimligi: input.requestId || null,
    istekZamani: input.requestedAt || null
  };

  try {
    const result = await runAnalyze({
      experimentName: input.experimentName,
      olculenDegerler
    });
    const safeResult = isAnalyzeCalculatorOutputOk(result, input)
      ? result
      : strictAnalyzeByExperiment(input, expectedSafe);
    return res.json({
      result: safeResult || strictAnalyzeByExperiment(input, expectedSafe),
      measured: input.measured,
      expected: expectedSafe
    });
  } catch {
    return res.json({
      result: strictAnalyzeByExperiment(input, expectedSafe),
      measured: input.measured,
      expected: expectedSafe
    });
  }
}

async function handleTeach(req, res) {
  console.log("TEACH GELDİ");

  const body = req.body || {};
  const currentExperiment = extractCurrentExperiment(body.experimentName);
  if (!currentExperiment) {
    return res.status(400).json({ result: "Geçersiz deney girdisi. Lütfen deney adını giriniz." });
  }
  const experimentType = detectExperimentType(body.experimentName, body.materials);
  const input = {
    experimentName: currentExperiment,
    materials: String(body.materials || "").trim(),
    measured: Number(body.measured) || 0,
    measuredUnit: String(body.measuredUnit || "").trim(),
    expected: body.expected === null || body.expected === undefined || body.expected === "" ? null : Number(body.expected),
    expectedUnit: String(body.expectedUnit || body.measuredUnit || "").trim(),
    temperature: Number(body.temperature) || 25,
    requestId: String(body.requestId || "").trim(),
    requestedAt: String(body.requestedAt || "").trim()
  };
  if (!input.experimentName) {
    return res.status(400).json({ result: "Lütfen Deney Adı giriniz." });
  }

  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (geminiKey) {
    try {
      const tutorText = await runTutor(input);
      const cleaned = sanitizeTutorOutput(tutorText);
      if (cleaned.length > 120 && !hasUnrelatedExperimentLeak(cleaned, input.experimentName)) {
        return res.json({ result: cleaned });
      }
    } catch (err) {
      console.error("tutorAgent:", err?.message || err);
    }
  }

  const deterministic = longTeachFallback(input);
  const checked = ensureTeachConsistency(deterministic, input, experimentType);
  if (hasUnrelatedExperimentLeak(checked, input.experimentName)) {
    return res.json({ result: strictDynamicTeachFallback(input) });
  }
  return res.json({ result: checked });
}

async function handleSimulate(req, res) {
  const input = parseInput(req.body, { requireMeasured: false });
  if (!input) return res.status(400).json({ result: "Geçerli sayısal veri giriniz." });
  if (!input.experimentName) return res.status(400).json({ result: "Lütfen Deney Adı giriniz." });
  const experimentType = detectExperimentType(input.experimentName, input.materials);

  const simPayload = {
    deneyAdi: input.experimentName,
    malzemeler: input.materials,
    sicaklik_C: input.temperature,
    olculen: input.measured,
    olculenBirim: unitOrBirimsiz(input.measuredUnit),
    beklenen: Number.isFinite(input.expected) ? input.expected : null,
    deneyTipi: experimentType,
    istekKimligi: input.requestId || null
  };

  try {
    const result = await runSimulate(simPayload);
    return res.json({ result });
  } catch {
    return res.json({ result: "Simülasyon başlatılıyor. Kontrollü kurulum, kademeli ısıtma ve güvenli çalışma adımlarını takip et." });
  }
}

async function handleQuiz(req, res) {
  const body = req.body || {};
  const experimentName = String(body.experimentName || "").trim();
  if (!experimentName) {
    return res.status(400).json({ result: "Lütfen Deney Adı giriniz.", questions: null });
  }
  const input = {
    experimentName,
    materials: String(body.materials || "").trim(),
    measured: body.measured === null || body.measured === undefined || body.measured === "" ? NaN : Number(body.measured),
    measuredUnit: String(body.measuredUnit || "").trim(),
    temperature: body.temperature === null || body.temperature === undefined || body.temperature === "" ? 25 : Number(body.temperature)
  };
  try {
    const { raw, questions } = await runQuiz(input);
    return res.json({ result: raw, questions });
  } catch (err) {
    return res.status(500).json({ result: err?.message || "Quiz üretilemedi.", questions: null });
  }
}

app.post("/analyze", handleAnalyze);
app.post("/api/analyze", handleAnalyze);
app.post("/teach", handleTeach);
app.post("/api/tutor", handleTeach);
app.post("/simulate", handleSimulate);
app.post("/api/simulate", handleSimulate);
app.post("/api/quiz", handleQuiz);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.use((err, _req, res, next) => {
  console.error("[server]", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ result: "Sunucu hatası." });
});

function tryOpenDefaultBrowser() {
  if (process.env.OPEN_BROWSER === "0") return;
  if (process.env.RENDER === "true" || process.env.NODE_ENV === "production") return;
  const url = `http://127.0.0.1:${PORT}`;
  const cmd =
    process.platform === "win32"
      ? `cmd /c start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  setTimeout(() => {
    exec(cmd, () => {});
  }, 500);
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("Sunucu çalışıyor.");
  console.log(`  → http://127.0.0.1:${PORT}`);
  console.log(`  → http://localhost:${PORT}`);
  console.log("");
  console.log("İpucu: Sekme otomatik açılmadıysa adresi elle yapıştırın. Otomatik açmayı kapatmak için: OPEN_BROWSER=0 npm start");
  tryOpenDefaultBrowser();
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} zaten kullanılıyor. Çözüm: çalışan Node sürecini kapatın veya .env dosyasında PORT=3001 gibi başka bir port verin.\n`);
    process.exit(1);
  }
  console.error(err);
});
