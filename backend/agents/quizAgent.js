const { callGemini } = require("./geminiClient");

const QUIZ_SYSTEM_PROMPT =
  "Sen bir laboratuvar gözetmenisin. Kullanıcının girdiği deney konusuyla ilgili, onların formül bilgisini ve teorik kavrayışını ölçecek 3 adet zorlayıcı çoktan seçmeli soru üret.";

/**
 * @param {{ experimentName: string, materials?: string, measured?: number, measuredUnit?: string, temperature?: number }} input
 * @returns {Promise<{ raw: string, questions: Array<object>|null }>}
 */
async function runQuiz(input) {
  const exp = String(input.experimentName || "").trim();
  const userText = `Deney Adı: ${exp}
Ek bağlam (malzemeler): ${String(input.materials || "").trim() || "—"}
Ölçülen (varsa): ${Number.isFinite(input.measured) ? `${input.measured} ${String(input.measuredUnit || "").trim()}` : "—"}
Sıcaklık °C: ${Number.isFinite(input.temperature) ? input.temperature : "—"}

Çıktıyı YALNIZCA geçerli bir JSON dizisi olarak ver (başka metin yok). Tam 3 eleman. Şema:
[
  {
    "question": "soru metni",
    "options": ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı"],
    "correctIndex": 0,
    "explanation": "doğru cevabın kısa gerekçesi"
  }
]
correctIndex: 0–3 arası. Sorular yalnızca bu deney konusuyla ilgili olsun.`;

  const raw = await callGemini({
    systemInstruction: QUIZ_SYSTEM_PROMPT,
    userText,
    temperature: 0.4,
    maxOutputTokens: 2048
  });

  let questions = null;
  const trimmed = String(raw || "").trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length >= 1) {
        questions = parsed.slice(0, 3);
      }
    } catch {
      questions = null;
    }
  }

  return { raw, questions };
}

module.exports = { runQuiz, QUIZ_SYSTEM_PROMPT };
