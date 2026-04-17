// Координати Олики (fallback якщо геолокація недоступна)
const OLYKA = { lat: 50.7333, lon: 25.8167 };

// WMO weather codes → emoji
function codeToIcon(code) {
  if (code === 0)               return '☀️';
  if (code <= 2)                return '🌤️';
  if (code === 3)               return '☁️';
  if (code <= 48)               return '🌫️';
  if (code <= 55)               return '🌦️';
  if (code <= 65)               return '🌧️';
  if (code <= 77)               return '❄️';
  if (code <= 82)               return '🌧️';
  if (code >= 95)               return '⛈️';
  return '🌡️';
}

async function getCoords() {
  if (!navigator.geolocation) return { ...OLYKA, city: 'Олика' };
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: null }),
      ()  => resolve({ ...OLYKA, city: 'Олика' }),
      { timeout: 5000, maximumAge: 600000 }
    );
  });
}

async function getCityName(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'uk' } }
    );
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.village || 'Олика';
  } catch {
    return 'Олика';
  }
}

export async function initWeather() {
  const iconEl = document.getElementById('weather-icon');
  const tempEl = document.getElementById('weather-temp');
  if (!iconEl || !tempEl) return;

  try {
    const { lat, lon, city: knownCity } = await getCoords();
    const [weatherRes, cityName] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`),
      knownCity ? Promise.resolve(knownCity) : getCityName(lat, lon),
    ]);
    const data = await weatherRes.json();
    const temp = Math.round(data.current.temperature_2m);
    iconEl.textContent = codeToIcon(data.current.weather_code);
    document.getElementById('weather-city').textContent = cityName;
    tempEl.textContent = `${temp}°`;
  } catch {
    const widget = document.getElementById('weather-widget');
    if (widget) widget.style.visibility = 'hidden';
  }
}
