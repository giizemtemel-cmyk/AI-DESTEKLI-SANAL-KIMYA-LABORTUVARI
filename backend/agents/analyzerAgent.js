const { callGemini } = require("./geminiClient");

const ANALYZER_SYSTEM_PROMPT =
  'Sen katı kurallı bir kimya laboratuvarı hesap makinesisin. Sadece sana verilen "Ölçülen Değerler"i kullanarak, "Deney Adı"na uygun formülü bul ve hesapla. Asla teorik değer uydurma (Temperature: 0 olmalı). Çıktıyı 1. Formül, 2. İşlem Adımları, 3. Sonuç olarak ver.';

/**
 * @param {{ experimentName: string, olculenDegerler: object }} params
 */
async function runAnalyze({ experimentName, olculenDegerler }) {
  const userText = `Deney Adı: ${experimentName}
Kullanıcının Laboratuvar Verileri (Ölçülen Değerler):
${JSON.stringify(olculenDegerler, null, 2)}

Kurallar:
- Hesaplamada yalnızca yukarıdaki kullanıcı verilerindeki sayıları kullan.
- Evrensel sabitler (R, g, π vb.) ve yaygın referans sabitleri kullanılabilir; ölçüm sayısı uydurma.
- Hayati veri eksikse hesaplama yapma; eksik veriyi açıkça belirt.

Yanıtını yalnızca şu başlıklarla ver (numara ve metin birebir):
1. Formül
2. İşlem Adımları
3. Sonuç

Başka başlık veya giriş paragrafı ekleme.`;

  return callGemini({
    systemInstruction: ANALYZER_SYSTEM_PROMPT,
    userText,
    temperature: 0,
    maxOutputTokens: 2048,
    topP: 1,
    topK: 1
  });
}

module.exports = { runAnalyze, ANALYZER_SYSTEM_PROMPT };
