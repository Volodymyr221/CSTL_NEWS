// Дані про погоду
async function initWeather() {
    const tempElement = document.querySelector('.weather-temp');
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=50.72&longitude=25.81&current_weather=true');
        const data = await res.json();
        const temp = Math.round(data.current_weather.temperature);
        tempElement.innerHTML = `☀️ ${temp}°`;
    } catch (e) {
        tempElement.innerHTML = '☀️ +18°';
    }
}

// Функція рендеру новин
function renderNews() {
    const container = document.getElementById('news-container');
    const newsData = [
        {
            id: 1,
            title: "Відреставровано вежу Олицького замку",
            excerpt: "Завершено перший етап реставрації однієї з веж знаменитого Олицького замку.",
            geo: "ОЛИКА",
            category: "КУЛЬТУРА",
            isExclusive: true,
            source: "CSTL NEWS",
            time: "4 квітня"
        },
        {
            id: 2,
            title: "Новий маршрут для туристів",
            excerpt: "Туристичний маршрут поєднує кілька замків Волинської області.",
            geo: "ВОЛИНЬ",
            category: "КУЛЬТУРА",
            isExclusive: false,
            source: "Волинь 24",
            time: "4 квітня"
        }
    ];

    container.innerHTML = newsData.map(news => `
        <div class="news-card ${news.isExclusive ? 'exclusive' : ''}">
            <div class="news-card-body">
                <div style="font-size: 10px; font-weight: 700; margin-bottom: 4px;">
                    <span style="color: var(--gray)">${news.geo}</span> 
                    <span style="color: var(--red); margin-left: 5px;">${news.category}</span>
                </div>
                <h3 class="news-card-title">${news.title}</h3>
                <p class="news-card-excerpt">${news.excerpt}</p>
                <div style="font-size: 11px; color: #999; margin-top: 8px;">
                    ${news.source} • ${news.time}
                </div>
            </div>
        </div>
    `).join('');
}

// Запуск
document.addEventListener('DOMContentLoaded', () => {
    initWeather();
    renderNews();
});
