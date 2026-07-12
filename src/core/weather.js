import { getCoords, getCityName } from './utils.js';
import { weatherCodeInfo } from './weather-icons.js';

export async function initWeather() {
  // 08.07: погоду з ШАПКИ прибрано (рішення Роми) — елементів #weather-* більше
  // нема в index.html, тож guard нижче робить функцію no-op (нічого не робить).
  // Блок «Погода в Олиці» на Громаді — інший код (community-blocks), працює далі.
  // Виклик з app.js лишаємо: порядок імпортів app.js не чіпаємо без обговорення.
  const iconEl = document.getElementById('weather-icon');
  const tempEl = document.getElementById('weather-temp');
  if (!iconEl || !tempEl) return;

  // B-13 fix: AbortController з 5с таймаутом, щоб fetch не висів безкінечно.
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 5000);

  try {
    const { lat, lon, city: knownCity } = await getCoords();
    const [weatherRes, cityName] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`,
        { signal: ac.signal }
      ),
      knownCity ? Promise.resolve(knownCity) : getCityName(lat, lon),
    ]);
    clearTimeout(timeoutId);
    const data = await weatherRes.json();
    const temp = Math.round(data.current.temperature_2m);
    iconEl.innerHTML = weatherCodeInfo(data.current.weather_code).icon;
    document.getElementById('weather-city').textContent = cityName;
    tempEl.textContent = `${temp}°`;
  } catch {
    clearTimeout(timeoutId);
    const widget = document.getElementById('weather-widget');
    if (widget) widget.style.visibility = 'hidden';
  }
}
