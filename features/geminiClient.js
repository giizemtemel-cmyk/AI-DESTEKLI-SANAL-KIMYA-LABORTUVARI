const { GoogleGenerativeAI } = require("@google/generative-ai");

function getModelName() {
  return process.env.GEMINI_MODEL || "gemini-1.5-pro";
}

function getGenAI() {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

/**
 * @param {object} opts
 * @param {string} [opts.systemInstruction]
 * @param {string} opts.userText
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxOutputTokens]
 * @param {number} [opts.topP]
 * @param {number} [opts.topK]
 */
async function callGemini(opts) {
  const genAI = getGenAI();
  if (!genAI) throw new Error("GEMINI_API_KEY bulunamadı.");

  const modelOpts = { model: getModelName() };
  if (opts.systemInstruction) {
    modelOpts.systemInstruction = opts.systemInstruction;
  }

  const model = genAI.getGenerativeModel(modelOpts);
  const generationConfig = {
    maxOutputTokens: typeof opts.maxOutputTokens === "number" ? opts.maxOutputTokens : 2048,
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0
  };
  if (typeof opts.topP === "number") generationConfig.topP = opts.topP;
  if (typeof opts.topK === "number") generationConfig.topK = opts.topK;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: opts.userText }] }],
    generationConfig
  });

  return result?.response?.text?.() || "";
}

module.exports = { callGemini, getGenAI, getModelName };
