const { callGemini } = require("./geminiClient");

const TUTOR_SYSTEM_PROMPT =
  "Sen üniversite 2. sınıf kimya mühendisliği öğrencilerine fizikokimya ve akışkanlar mekaniği laboratuvarlarında rehberlik eden akademik bir asistansın. Kullanıcının girdiği deneyin amacını, termodinamik/fizikokimyasal prensiplerini ve endüstrideki kullanım alanlarını anlaşılır bir dille açıkla.";

/**
 * @param {{
 *   experimentName: string,
 *   materials?: string,
 *   measured?: number,
 *   measuredUnit?: string,
 *   expected?: number|null,
 *   expectedUnit?: string,
 *   temperature?: number
 * }} input
 */
async function runTutor(input) {
  const exp = String(input.experimentName || "").trim();
  const userText = `Deney Adı: ${exp}
Malzemeler: ${String(input.materials || "").trim() || "—"}
Ölçülen değer: ${Number.isFinite(input.measured) ? input.measured : "—"} ${String(input.measuredUnit || "").trim()}
Beklenen/teorik: ${Number.isFinite(input.expected) ? `${input.expected} ${String(input.expectedUnit || "").trim()}` : "girilmedi"}
Laboratuvar sıcaklığı (°C): ${Number.isFinite(input.temperature) ? input.temperature : "—"}

Yukarıdaki deney için akademik bir özet yaz: amaç, ilgili fizikokimyasal/termodinamik çerçeve, dikkat edilecek kontrol değişkenleri ve endüstride tipik kullanım örnekleri.`;

  return callGemini({
    systemInstruction: TUTOR_SYSTEM_PROMPT,
    userText,
    temperature: 0.35,
    maxOutputTokens: 3072
  });
}

module.exports = { runTutor, TUTOR_SYSTEM_PROMPT };
