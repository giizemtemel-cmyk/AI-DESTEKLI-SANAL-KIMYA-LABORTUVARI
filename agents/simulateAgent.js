const { callGemini } = require("./geminiClient");

/**
 * @param {object} simPayload — deneyAdi, malzemeler, sicaklik_C, ...
 */
async function runSimulate(simPayload) {
  const userText = `
INTERACTIVE LAB SIMULATOR — yalnızca aşağıdaki JSON’daki verileri dikkate al; hafızandan örnek sayı uydurma.

${JSON.stringify(simPayload, null, 2)}

Tarif: Kullanıcının yazdığı deney adı dışında hiçbir deneyden bahsetme.
Emir cümleleriyle adım yaz; her adımda "Ne yapmalısınız?" sorusu sor.
Yanlış seçenek: "⚠️ Yanlış; çünkü..." ile açıkla.
Her 2 adımda bir İSG uyarısı ver.
`.trim();

  return callGemini({
    userText,
    temperature: 0.2,
    maxOutputTokens: 2048
  });
}

module.exports = { runSimulate };
