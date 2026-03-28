(() => {
  const analysisOutput = document.getElementById("analysisOutput");
  const teachingOutput = document.getElementById("teachingOutput");
  const simulationOutput = document.getElementById("simulationOutput");
  const simulationControls = document.getElementById("simulationControls");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const teachBtn = document.getElementById("teachBtn");
  const simulateBtn = document.getElementById("simulateBtn");
  let labChart = null;

  const simulationSteps = [
    {
      step: "Adım 1 - Etanol transferi",
      why: "Hacim ve güvenlik hataları daha ilk adımda sonucu bozabilir.",
      question: "Elindeki etanolü balona nasıl aktarırsın?",
      options: [
        { text: "A) Huni ile yavaşça ve hacim çizgisini kontrol ederek", correct: true, feedback: "✅ Doğru: dökülme ve hacim kaybını önlersin." },
        { text: "B) Şişeden doğrudan hızlı dökerek", correct: false, feedback: "⚠️ Hatalı: sıçrama, hacim kaybı ve güvenlik riski artar." }
      ]
    },
    {
      step: "Adım 2 - Termometre konumu",
      why: "Yanlış termometre konumu tüm sıcaklık analizini hatalı yapar.",
      question: "Termometreyi nereye yerleştirirsin?",
      options: [
        { text: "A) Buhar hattını ölçecek seviyede, cama değmeden", correct: true, feedback: "✅ Doğru: gerçek buhar sıcaklığını okursun." },
        { text: "B) Sıvı içine daldırarak", correct: false, feedback: "⚠️ Hatalı: sıvı sıcaklığını okur, ayrımı yanlış yönetirsin." }
      ]
    },
    {
      step: "Adım 3 - Isıtma kontrolü",
      why: "Kademeli ısıtma saflığı ve verimi artırır.",
      question: "Isıtmayı nasıl başlatmalısın?",
      options: [
        { text: "A) Kademeli güç artışıyla", correct: true, feedback: "✅ Doğru: dengeli buharlaşma sağlanır." },
        { text: "B) Bir anda maksimum güçle", correct: false, feedback: "⚠️ Hatalı: taşma, köpürme ve saflık kaybı oluşur." }
      ]
    },
    {
      step: "Adım 4 - Yoğuşturucu su akışı",
      why: "Yanlış su yönü, soğutma verimini düşürür.",
      question: "Doğru su akış yönü hangisidir?",
      options: [
        { text: "A) Alttan giriş, üstten çıkış", correct: true, feedback: "✅ Doğru: yoğuşturucu gövdesi tam kullanılır." },
        { text: "B) Üstten giriş, alttan çıkış", correct: false, feedback: "⚠️ Hatalı: soğutma alanı verimsizleşir." }
      ]
    },
    {
      step: "Adım 5 - Hata müdahalesi",
      why: "Kaçak ve yanlış bağlantı güvenliği ve sonucu bozar.",
      question: "Buhar kaçağı fark ettin. Ne yaparsın?",
      options: [
        { text: "A) Isıyı azaltır, bağlantıları yeniden sıkılaştırırım", correct: true, feedback: "✅ Doğru: hem güvenlik hem doğruluk korunur." },
        { text: "B) Deneye ara vermeden devam ederim", correct: false, feedback: "⚠️ Hatalı: ürün kaybı, hatalı analiz ve güvenlik riski artar." }
      ]
    }
  ];

  const simState = { intro: "", index: 0, score: 0, mistakes: [] };

  function dataFromForm() {
    const expectedValue = document.getElementById("expected").value.trim();
    return {
      experimentName: document.getElementById("experimentName").value.trim() || "Damıtma",
      materials: document.getElementById("materials").value.trim() || "Liebig soğutucu, balon, termometre, kolon",
      temperature: parseFloat(document.getElementById("temperature").value),
      measured: parseFloat(document.getElementById("measured").value),
      expected: expectedValue === "" ? null : parseFloat(expectedValue)
    };
  }

  function setOutput(el, text, muted = false) {
    el.textContent = text;
    el.classList.toggle("muted", muted);
  }

  function validate(payload) {
    if (Number.isNaN(payload.temperature) || Number.isNaN(payload.measured)) {
      return "⚠️ Sıcaklık ve Ölçülen Değer sayısal olmalıdır.";
    }
    if (payload.expected !== null && Number.isNaN(payload.expected)) {
      return "⚠️ Beklenen değer geçerli bir sayı olmalıdır.";
    }
    return null;
  }

  async function post(endpoint, outputEl, loadingText) {
    const payload = dataFromForm();
    const error = validate(payload);
    if (error) {
      setOutput(outputEl, error);
      return null;
    }

    setOutput(outputEl, loadingText, true);

    const apiBase = (() => {
      const cfg =
        typeof window.__API_BASE_URL__ === "string" ? window.__API_BASE_URL__.trim().replace(/\/+$/, "") : "";
      if (cfg) return cfg;
      const proto = window.location.protocol;
      const host = String(window.location.hostname || "").toLowerCase();
      const local =
        proto === "file:" || host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "";
      if (local) {
        const p = String(window.__DEV_API_PORT__ || "3000").trim() || "3000";
        return `http://127.0.0.1:${p}`;
      }
      return "";
    })();

    const path = String(endpoint || "").replace(/^\/+/, "");
    const url = apiBase ? `${apiBase.replace(/\/+$/, "")}/${path}` : `/${path}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOutput(outputEl, data.result || "❌ Sunucu hatası oluştu.");
        return null;
      }
      return data;
    } catch (_) {
      setOutput(outputEl, "❌ Sunucuya bağlantı kurulamadı.");
      return null;
    }
  }

  function drawChart(chart) {
    if (!window.Chart || !chart) return;
    const canvas = document.getElementById("labChart");
    if (!canvas) return;
    if (labChart) labChart.destroy();

    labChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: chart.labels || [],
        datasets: [
          {
            label: "Ölçüm",
            data: chart.measuredSeries || [],
            borderColor: "#67d8ff",
            backgroundColor: "rgba(103,216,255,0.12)",
            fill: true,
            tension: 0.35
          },
          {
            label: "Verim (%)",
            data: chart.efficiencySeries || [],
            borderColor: "#8effaa",
            backgroundColor: "rgba(142,255,170,0.08)",
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function renderSimStep() {
    const current = simulationSteps[simState.index];
    if (!current) {
      setOutput(
        simulationOutput,
        `${simState.intro}\n\n🎯 Simülasyon Sonu\nDoğru karar sayısı: ${simState.score}/${simulationSteps.length}\nHata sayısı: ${simState.mistakes.length}\n\n🧾 Hata Çıktısı:\n${simState.mistakes.length ? simState.mistakes.map((m, i) => `${i + 1}) ${m}`).join("\n") : "Kritik hata kaydı yok."}`
      );
      simulationControls.innerHTML = "";
      return;
    }

    setOutput(
      simulationOutput,
      `${simState.intro}\n\n👉 ${current.step}\nNeden: ${current.why}\n❓ ${current.question}`
    );
    simulationControls.innerHTML = "";

    current.options.forEach((option) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.type = "button";
      btn.textContent = option.text;
      btn.addEventListener("click", () => {
        if (option.correct) {
          simState.score += 1;
        } else {
          simState.mistakes.push(`${current.step}: ${option.text}`);
        }
        setOutput(
          simulationOutput,
          `${simState.intro}\n\n👉 ${current.step}\n${option.feedback}\n\n🧾 Anlık Hata Kayıtları:\n${simState.mistakes.length ? simState.mistakes.map((m, i) => `${i + 1}) ${m}`).join("\n") : "Henüz kritik hata yok."}`
        );
        simulationControls.innerHTML = "";
        const next = document.createElement("button");
        next.className = "next-btn";
        next.type = "button";
        next.textContent = simState.index === simulationSteps.length - 1 ? "Simülasyonu Tamamla" : "Sonraki Adım";
        next.addEventListener("click", () => {
          simState.index += 1;
          renderSimStep();
        });
        simulationControls.appendChild(next);
      });
      simulationControls.appendChild(btn);
    });
  }

  analyzeBtn.addEventListener("click", async () => {
    const data = await post("analyze", analysisOutput, "🧠 Analiz motoru çalışıyor...");
    if (!data) return;
    setOutput(analysisOutput, data.result || "Analiz çıktısı yok.");
    drawChart(data.chart || null);
  });

  teachBtn.addEventListener("click", async () => {
    const data = await post("teach", teachingOutput, "📘 Öğretim motoru hazırlanıyor...");
    if (!data) return;
    setOutput(teachingOutput, data.result || "Öğretim çıktısı yok.");
  });

  simulateBtn.addEventListener("click", async () => {
    const data = await post("simulate", simulationOutput, "🎬 Simülasyon motoru hazırlanıyor...");
    if (!data) return;
    simState.intro = data.result || "Sanal laboratuvar başlatıldı.";
    simState.index = 0;
    simState.score = 0;
    simState.mistakes = [];
    renderSimStep();
  });
})();
