(() => {
  // src/app.js
  async function initWeather() {
    const tempElement = document.querySelector(".weather-temp");
    try {
      const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=50.72&longitude=25.81&current_weather=true");
      const data = await res.json();
      const temp = Math.round(data.current_weather.temperature);
      tempElement.innerHTML = `\u2600\uFE0F ${temp}\xB0`;
    } catch (e) {
      tempElement.innerHTML = "\u2600\uFE0F +18\xB0";
    }
  }
  function renderNews() {
    const container = document.getElementById("news-container");
    const newsData = [
      {
        id: 1,
        title: "\u0412\u0456\u0434\u0440\u0435\u0441\u0442\u0430\u0432\u0440\u043E\u0432\u0430\u043D\u043E \u0432\u0435\u0436\u0443 \u041E\u043B\u0438\u0446\u044C\u043A\u043E\u0433\u043E \u0437\u0430\u043C\u043A\u0443",
        excerpt: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E \u043F\u0435\u0440\u0448\u0438\u0439 \u0435\u0442\u0430\u043F \u0440\u0435\u0441\u0442\u0430\u0432\u0440\u0430\u0446\u0456\u0457 \u043E\u0434\u043D\u0456\u0454\u0457 \u0437 \u0432\u0435\u0436 \u0437\u043D\u0430\u043C\u0435\u043D\u0438\u0442\u043E\u0433\u043E \u041E\u043B\u0438\u0446\u044C\u043A\u043E\u0433\u043E \u0437\u0430\u043C\u043A\u0443.",
        geo: "\u041E\u041B\u0418\u041A\u0410",
        category: "\u041A\u0423\u041B\u042C\u0422\u0423\u0420\u0410",
        isExclusive: true,
        source: "CSTL NEWS",
        time: "4 \u043A\u0432\u0456\u0442\u043D\u044F"
      },
      {
        id: 2,
        title: "\u041D\u043E\u0432\u0438\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u0434\u043B\u044F \u0442\u0443\u0440\u0438\u0441\u0442\u0456\u0432",
        excerpt: "\u0422\u0443\u0440\u0438\u0441\u0442\u0438\u0447\u043D\u0438\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u043F\u043E\u0454\u0434\u043D\u0443\u0454 \u043A\u0456\u043B\u044C\u043A\u0430 \u0437\u0430\u043C\u043A\u0456\u0432 \u0412\u043E\u043B\u0438\u043D\u0441\u044C\u043A\u043E\u0457 \u043E\u0431\u043B\u0430\u0441\u0442\u0456.",
        geo: "\u0412\u041E\u041B\u0418\u041D\u042C",
        category: "\u041A\u0423\u041B\u042C\u0422\u0423\u0420\u0410",
        isExclusive: false,
        source: "\u0412\u043E\u043B\u0438\u043D\u044C 24",
        time: "4 \u043A\u0432\u0456\u0442\u043D\u044F"
      }
    ];
    container.innerHTML = newsData.map((news) => `
        <div class="news-card ${news.isExclusive ? "exclusive" : ""}">
            <div class="news-card-body">
                <div style="font-size: 10px; font-weight: 700; margin-bottom: 4px;">
                    <span style="color: var(--gray)">${news.geo}</span> 
                    <span style="color: var(--red); margin-left: 5px;">${news.category}</span>
                </div>
                <h3 class="news-card-title">${news.title}</h3>
                <p class="news-card-excerpt">${news.excerpt}</p>
                <div style="font-size: 11px; color: #999; margin-top: 8px;">
                    ${news.source} \u2022 ${news.time}
                </div>
            </div>
        </div>
    `).join("");
  }
  document.addEventListener("DOMContentLoaded", () => {
    initWeather();
    renderNews();
  });
})();
//# sourceMappingURL=bundle.js.map
