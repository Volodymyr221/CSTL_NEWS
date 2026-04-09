// WMO weather codes → emoji
function codeToIcon(code) {
  if (code === 0)   return '☀️';
  if (code <= 2)    return '🌤️';
  if (code === 3)   return '☁️';
  if (code <= 48)   return '🌫️';
  if (code <= 55)   return '🌦️';
  if (code <= 65)   return '🌧️';
  if (code <= 77)   return '❄️';
  if (code <= 82)   return '🌧️';
  if (code >= 95)   return '⛈️';
  return '🌡️';
}

const OLYKA = { lat: 50.7333, lon: 25.8167, name: 'Олика' };

async function getCoords() {
  if (!navigator.geolocation) return OLYKA;
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: '' }),
      ()   => resolve(OLYKA),
      { timeout: 5000, maximumAge: 600000 }
    );
  });
}

async function initWeather() {
  const tempEl = document.querySelector('.weather-temp');
  const cityEl = document.querySelector('.weather-city');
  try {
    const { lat, lon, name } = await getCoords();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const icon = codeToIcon(data.current.weather_code);
    if (tempEl) tempEl.textContent = `${icon} ${temp}°`;
    if (cityEl) cityEl.textContent = name || 'Олика';
  } catch {
    const widget = document.getElementById('weather-widget');
    if (widget) widget.style.visibility = 'hidden';
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
