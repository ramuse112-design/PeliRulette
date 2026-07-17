// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN GLOBAL
// ==========================================
const API_KEY = '078a31abaeebab72bac9019c26b37db4';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_URL = 'https://image.tmdb.org/t/p/w500';

// Estados del usuario activo
let currentUser = "";
let watchlist = [];
let watched = [];
let audioCtx = null;

function obtenerAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

// ==========================================
// 2. ELEMENTOS DEL DOM
// ==========================================
const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const usernameInput = document.getElementById('username-input');
const btnLogin = document.getElementById('btn-login');
const displayUsername = document.getElementById('display-username');
const btnLogout = document.getElementById('btn-logout');

const btnRecommend = document.getElementById('btn-recommend');
const genreSelect = document.getElementById('genre');
const eraSelect = document.getElementById('era');
const filterTypeSelect = document.getElementById('filter-type');
const movieResult = document.getElementById('movie-result');

// Sidebar y pestañas
const watchlistSidebar = document.getElementById('watchlist-sidebar');
const btnOpenWatchlist = document.getElementById('btn-open-watchlist');
const btnCloseWatchlist = document.getElementById('btn-close-watchlist');
const watchlistCount = document.getElementById('watchlist-count');
const tabButtons = document.querySelectorAll('.tab-btn');
const watchlistList = document.getElementById('watchlist-list');
const watchedList = document.getElementById('watched-list');

// Buscador predictivo
const searchInput = document.getElementById('search-input');
const searchDropdown = document.getElementById('search-results-dropdown');
const btnClearSearch = document.getElementById('btn-clear-search');

// Modal de Stats
const btnOpenStats = document.getElementById('btn-open-stats');
const btnCloseStats = document.getElementById('btn-close-stats');
const statsModal = document.getElementById('stats-modal');
const statsUserName = document.getElementById('stats-user-name');
const statMovies = document.getElementById('stat-movies');
const statTime = document.getElementById('stat-time');
const statGenre = document.getElementById('stat-genre');
const statEra = document.getElementById('stat-era');

// ==========================================
// 3. GESTIÓN DE SESIÓN DE USUARIOS (LOCAL)
// ==========================================
btnLogin.addEventListener('click', iniciarSesion);
usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') iniciarSesion(); });
btnLogout.addEventListener('click', cerrarSesion);

function iniciarSesion() {
    const user = usernameInput.value.trim();
    if (!user) { alert("Por favor, introduce un nombre válido."); return; }
    
    currentUser = user;
    displayUsername.textContent = currentUser;
    statsUserName.textContent = currentUser;

    // Cargar listas específicas del usuario
    watchlist = JSON.parse(localStorage.getItem(`cinema_${currentUser}_watchlist`)) || [];
    watched = JSON.parse(localStorage.getItem(`cinema_${currentUser}_watched`)) || [];

    loginScreen.classList.add('hidden');
    appContent.classList.remove('hidden');
    
    actualizarListasUI();
}

function cerrarSesion() {
    currentUser = "";
    usernameInput.value = "";
    loginScreen.classList.remove('hidden');
    appContent.classList.add('hidden');
    movieResult.classList.add('hidden');
    searchInput.value = "";
    searchDropdown.classList.add('hidden');
    btnClearSearch.classList.add('hidden');
}

// Guarda de forma automática el array incluyendo las plataformas pre-cargadas
function guardarDatosLocales() {
    if (!currentUser) return;
    localStorage.setItem(`cinema_${currentUser}_watchlist`, JSON.stringify(watchlist));
    localStorage.setItem(`cinema_${currentUser}_watched`, JSON.stringify(watched));
    watchlistCount.textContent = watchlist.length;
}

// ==========================================
// 4. MOTOR DEL BUSCADOR (AUTOCOMPLETE FLOTANTE)
// ==========================================
searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    if (query.length < 2) {
        searchDropdown.classList.add('hidden');
        btnClearSearch.classList.add('hidden');
        return;
    }

    btnClearSearch.classList.remove('hidden');

    try {
        const res = await fetch(`${BASE_URL}/search/movie?api_key=${API_KEY}&language=es-ES&query=${encodeURIComponent(query)}&page=1`);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            renderDropdown(data.results.slice(0, 7)); // Top 7 resultados
        } else {
            searchDropdown.innerHTML = `<div class="search-item"><span class="search-item-title">No se encontraron películas</span></div>`;
            searchDropdown.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Error buscando películas:", err);
    }
});

function renderDropdown(peliculas) {
    searchDropdown.innerHTML = "";
    peliculas.forEach(peli => {
        const div = document.createElement('div');
        div.className = 'search-item';
        const año = peli.release_date ? peli.release_date.split('-')[0] : 'N/D';
        const poster = peli.poster_path ? `${IMAGE_URL}${peli.poster_path}` : 'https://via.placeholder.com/45x65?text=🎦';
        
        div.innerHTML = `
            <img src="${poster}" class="search-thumb">
            <div class="search-item-info">
                <span class="search-item-title">${peli.title}</span>
                <span class="search-item-year">📅 ${año}</span>
            </div>
        `;
        
        div.onclick = () => {
            searchDropdown.classList.add('hidden');
            searchInput.value = peli.title;
            cargarPeliculaEspecifica(peli.id);
        };
        searchDropdown.appendChild(div);
    });
    searchDropdown.classList.remove('hidden');
}

btnClearSearch.onclick = () => {
    searchInput.value = "";
    searchDropdown.classList.add('hidden');
    btnClearSearch.classList.add('hidden');
};

// Cerrar desplegable al hacer click fuera
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.classList.add('hidden');
    }
});

async function cargarPeliculaEspecifica(id) {
    try {
        const detailRes = await fetch(`${BASE_URL}/movie/${id}?api_key=${API_KEY}&language=es-ES`);
        const peliElegida = await detailRes.json();
        
        peliElegida.runtime = peliElegida.runtime || 0;
        peliElegida.genres_full = peliElegida.genres || [];
        
        // Carga en paralelo de plataformas de streaming en España
        peliElegida.plataformas = await obtenerPlataformas(peliElegida.id);

        const trailerKey = await obtenerTrailerId(peliElegida.id);
        const trailerUrl = trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null;

        mostrarPelicula(peliElegida, trailerUrl);
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// 5. AUDIO EFECTOS RETRO (8-BITS)
// ==========================================
function playTickSound() {
    const ctx = obtenerAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const gainNode = ctx.createGain();
    osc.connect(gainNode); gainNode.connect(ctx.destination);
    osc.type = 'triangle'; osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.03);
    gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.start(); osc.stop(ctx.currentTime + 0.03);
}

function playWinSound() {
    const ctx = obtenerAudioContext(); if (!ctx) return;
    const now = ctx.currentTime;
    triggerNote(523.25, now, 0.12); triggerNote(659.25, now + 0.1, 0.12);
    triggerNote(783.99, now + 0.2, 0.12); triggerNote(1046.50, now + 0.3, 0.4);
}

function triggerNote(frequency, startTime, duration) {
    const ctx = obtenerAudioContext(); if (!ctx) return;
    const osc = ctx.createOscillator(); const gainNode = ctx.createGain();
    osc.connect(gainNode); gainNode.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, startTime);
    gainNode.gain.setValueAtTime(0.12, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime); osc.stop(startTime + duration);
}

// ==========================================
// 6. FILTRADO Y RULETA ALEATORIA
// ==========================================
filterTypeSelect.addEventListener('change', () => {
    const isTrending = filterTypeSelect.value === 'trending';
    genreSelect.disabled = isTrending; eraSelect.disabled = isTrending;
    genreSelect.parentElement.style.opacity = isTrending ? '0.5' : '1';
    eraSelect.parentElement.style.opacity = isTrending ? '0.5' : '1';
});

async function obtenerPelicula() {
    obtenerAudioContext();
    const genreId = genreSelect.value;
    const era = eraSelect.value;
    const filterType = filterTypeSelect.value;
    let finalUrl = '';

    try {
        btnRecommend.textContent = 'Girando la ruleta... 🎰';
        btnRecommend.disabled = true;

        if (filterType === 'trending') {
            const randomPage = Math.floor(Math.random() * 3) + 1;
            finalUrl = `${BASE_URL}/trending/movie/week?api_key=${API_KEY}&language=es-ES&page=${randomPage}`;
        } else {
            let baseDiscoverUrl = `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=es-ES&sort_by=popularity.desc`;
            baseDiscoverUrl += (filterType === 'gems') ? `&vote_average.gte=7.2&vote_count.gte=80&vote_count.lte=800` : `&vote_count.gte=150`;

            if (genreId) baseDiscoverUrl += `&with_genres=${genreId}`;
            
            const dates = {
                'retro': '1980-01-01&primary_release_date.lte=1999-12-31',
                '2000s': '2000-01-01&primary_release_date.lte=2010-12-31',
                'modern': '2011-01-01&primary_release_date.lte=2020-12-31',
                'recent': '2021-01-01'
            };
            if (dates[era]) baseDiscoverUrl += `&primary_release_date.gte=${dates[era]}`;

            const resPrevia = await fetch(baseDiscoverUrl);
            const dataPrevia = await resPrevia.json();
            const totalPaginas = Math.min(dataPrevia.total_pages || 1, 35);
            finalUrl = `${baseDiscoverUrl}&page=${Math.floor(Math.random() * totalPaginas) + 1}`;
        }

        const resFinal = await fetch(finalUrl);
        const data = await resFinal.json();
        if (!data.results?.length) throw new Error('Sin resultados');

        const peliElegida = data.results[Math.floor(Math.random() * data.results.length)];

        // Carga de metadatos completos
        const detailRes = await fetch(`${BASE_URL}/movie/${peliElegida.id}?api_key=${API_KEY}&language=es-ES`);
        const detailData = await detailRes.json();
        peliElegida.runtime = detailData.runtime || 0;
        peliElegida.genres_full = detailData.genres || [];
        
        // Carga de plataformas de streaming vinculadas antes de iniciar la animación
        peliElegida.plataformas = await obtenerPlataformas(peliElegida.id);

        const trailerKey = await obtenerTrailerId(peliElegida.id);
        const trailerUrl = trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null;

        await iniciarRuleta(data.results, peliElegida, trailerUrl);

    } catch (e) {
        movieResult.innerHTML = `<p style="color: #f87171; text-align: center;">❌ Sin coincidencias exactas. Intenta ampliando tus filtros.</p>`;
        movieResult.classList.remove('hidden');
    } finally {
        btnRecommend.textContent = '¡Recomendar Película! ⚡';
        btnRecommend.disabled = false;
    }
}

async function obtenerTrailerId(id) {
    try {
        const res = await fetch(`${BASE_URL}/movie/${id}/videos?api_key=${API_KEY}&language=es-ES`);
        const data = await res.json();
        return data.results?.find(v => v.site === 'YouTube' && v.type === 'Trailer')?.key || null;
    } catch { return null; }
}

async function obtenerPlataformas(id) {
    try {
        const res = await fetch(`${BASE_URL}/movie/${id}/watch/providers?api_key=${API_KEY}`);
        const data = await res.json();
        // Filtramos por la región de España (ES) y la modalidad 'flatrate' (tarifa plana de suscripción)
        return data.results?.ES?.flatrate || [];
    } catch { 
        return []; 
    }
}

function iniciarRuleta(peliculas, peliFinal, trailerUrlFinal) {
    return new Promise((resolve) => {
        let paso = 0; const totalPasos = 12; let delay = 60;
        movieResult.classList.remove('hidden');

        function girar() {
            if (paso >= totalPasos) {
                `cinematch`
                playWinSound();
                mostrarPelicula(peliFinal, trailerUrlFinal);
                resolve(); return;
            }
            const peliFrame = peliculas[Math.floor(Math.random() * peliculas.length)];
            playTickSound();
            movieResult.innerHTML = `
                <div class="spinning">
                    <img class="movie-poster" src="${peliFrame.poster_path ? IMAGE_URL + peliFrame.poster_path : 'https://via.placeholder.com/500x750?text=🎰'}">
                    <h2 class="movie-title">${peliFrame.title}</h2>
                    <p style="text-align:center; color:var(--accent-color); font-weight:bold;">🎰 Seleccionando título...</p>
                </div>`;
            paso++; delay = Math.floor(delay * 1.25);
            setTimeout(girar, delay);
        }
        girar();
    });
}

// ==========================================
// 7. RENDERIZADO DETALLADO Y ACCIONES DE GUARDADO
// ==========================================
function mostrarPelicula(peli, trailerUrl) {
    const poster = peli.poster_path ? `${IMAGE_URL}${peli.poster_path}` : 'https://via.placeholder.com/500x750?text=Sin+Póster';
    
    const enWatchlist = watchlist.some(item => item.id === peli.id);
    const enWatched = watched.some(item => item.id === peli.id);
    
    // Mapeo estilizado de géneros completos
    const generosHTML = peli.genres_full?.length 
        ? peli.genres_full.map(g => `<span class="genre-tag">${g.name}</span>`).join('') 
        : '<span>N/D</span>';

    // Bloque constructor inyectable de logos JustWatch
    const plataformasHTML = peli.plataformas?.length 
        ? `<div class="platforms-container">
            <p class="platforms-title">Disponible en:</p>
            <div class="platforms-list">
                ${peli.plataformas.map(p => `
                    <img src="https://image.tmdb.org/t/p/original${p.logo_path}" 
                         title="${p.provider_name}" 
                         alt="${p.provider_name}" 
                         class="platform-logo">
                `).join('')}
            </div>
           </div>`
        : `<p class="platforms-empty">⚠️ No disponible en plataformas de suscripción en España.</p>`;

    movieResult.innerHTML = `
        <img class="movie-poster" src="${poster}">
        <h2 class="movie-title">${peli.title}</h2>
        <div class="movie-info">
            <span>📅 ${peli.release_date?.split('-')[0] || 'N/D'}</span>
            <span>⭐ ${(peli.vote_average ?? 0).toFixed(1)}/10</span>
            <span>⏱️ ${peli.runtime || 0} min</span>
        </div>
        <div class="genre-tags">${generosHTML}</div>
        ${plataformasHTML}
        <p class="movie-overview">${peli.overview || 'Sin sinopsis disponible en español.'}</p>
        <div class="action-buttons">
            ${trailerUrl ? `<a href="${trailerUrl}" target="_blank" class="btn-trailer">Ver Tráiler 🎬</a>` : ''}
            <button id="btn-add-to-watchlist" class="btn-save" ${enWatchlist ? 'disabled' : ''}>
                ${enWatchlist ? '📌 En tus Pendientes' : 'Añadir a mi Lista 💖'}
            </button>
            <button id="btn-add-to-watched" class="btn-watched" ${enWatched ? 'disabled' : ''}>
                ${enWatched ? '✅ ¡Película Vista!' : 'Ya vista 👀'}
            </button>
        </div>
    `;
    movieResult.classList.remove('hidden');

    // Manejadores lógicos con control anti-duplicados y exclusión cruzada
    document.getElementById('btn-add-to-watchlist').onclick = () => {
        if (watched.some(item => item.id === peli.id)) {
            alert("⚠️ ¡Esta película ya figura en tu registro de películas vistas!");
            return;
        }
        if (!watchlist.some(item => item.id === peli.id)) {
            watchlist.push({ ...peli, trailerUrl });
            guardarDatosLocales();
            actualizarListasUI();
            mostrarPelicula(peli, trailerUrl);
        }
    };

    document.getElementById('btn-add-to-watched').onclick = () => {
        // Exclusión mutua automática
        if (watchlist.some(item => item.id === peli.id)) {
            watchlist = watchlist.filter(item => item.id !== peli.id);
        }
        if (!watched.some(item => item.id === peli.id)) {
            watched.push({ ...peli, trailerUrl });
            guardarDatosLocales();
            actualizarListasUI();
            mostrarPelicula(peli, trailerUrl);
        }
    };
}

// ==========================================
// 8. PESTAÑAS DEL SIDEBAR Y BORRADO DIRECTO
// ==========================================
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const target = btn.getAttribute('data-target');
        if (target === 'pendientes') {
            watchlistList.classList.add('active');
            watchedList.classList.remove('active');
        } else {
            watchlistList.classList.remove('active');
            watchedList.classList.add('active');
        }
    });
});

function actualizarListasUI() {
    watchlistList.innerHTML = '';
    watchedList.innerHTML = '';
    
    watchlistCount.textContent = watchlist.length;

    // Renderizar Pestaña Pendientes
    if (watchlist.length === 0) {
        watchlistList.innerHTML = '<li class="empty-list-msg">No tienes pelis pendientes. 🍿</li>';
    } else {
        watchlist.forEach(peli => {
            const li = document.createElement('li');
            li.className = 'watchlist-item';
            li.innerHTML = `
                <div class="watchlist-info">
                    <img src="${peli.poster_path ? IMAGE_URL + peli.poster_path : 'https://via.placeholder.com/40x55'}" class="watchlist-thumb">
                    <span class="watchlist-title">${peli.title}</span>
                </div>
                <button class="btn-delete">🗑️</button>
            `;
            li.onclick = () => { watchlistSidebar.classList.remove('open'); mostrarPelicula(peli, peli.trailerUrl); };
            li.querySelector('.btn-delete').onclick = (e) => {
                e.stopPropagation();
                watchlist = watchlist.filter(item => item.id !== peli.id);
                guardarDatosLocales();
                actualizarListasUI();
            };
            watchlistList.appendChild(li);
        });
    }

    // Renderizar Pestaña Vistas
    if (watched.length === 0) {
        watchedList.innerHTML = '<li class="empty-list-msg">Aún no has marcado películas como vistas.</li>';
    } else {
        watched.forEach(peli => {
            const li = document.createElement('li');
            li.className = 'watchlist-item';
            li.innerHTML = `
                <div class="watchlist-info">
                    <img src="${peli.poster_path ? IMAGE_URL + peli.poster_path : 'https://via.placeholder.com/40x55'}" class="watchlist-thumb">
                    <span class="watchlist-title">${peli.title}</span>
                </div>
                <button class="btn-delete">🗑️</button>
            `;
            li.onclick = () => { watchlistSidebar.classList.remove('open'); mostrarPelicula(peli, peli.trailerUrl); };
            li.querySelector('.btn-delete').onclick = (e) => {
                e.stopPropagation();
                watched = watched.filter(item => item.id !== peli.id);
                guardarDatosLocales();
                actualizarListasUI();
            };
            watchedList.appendChild(li);
        });
    }
    
    calcularEstadisticasAvanzadas();
}

// ==========================================
// 9. CÓMPUTO AVANZADO DE ESTADÍSTICAS
// ==========================================
function calcularEstadisticasAvanzadas() {
    statMovies.textContent = watched.length;

    // 1. Desglose matemático: Días, Horas y Minutos
    const totalMinutos = watched.reduce((sum, p) => sum + (p.runtime || 0), 0);
    const dias = Math.floor(totalMinutos / 1440);
    const horas = Math.floor((totalMinutos % 1440) / 60);
    const mins = totalMinutos % 60;
    statTime.textContent = `${dias}d ${horas}h ${mins}m`;

    // 2. Cálculo de Género Frecuente
    const generosContador = {};
    // 3. Cálculo de Época Favorita basada en años reales
    const epocasContador = {
        'Clásicos Retro (80s - 90s)': 0,
        'Época Dorada (2000 - 2010)': 0,
        'Modernas (2011 - 2020)': 0,
        'Estrenos (2021+)': 0
    };

    watched.forEach(peli => {
        // Contar géneros
        peli.genres_full?.forEach(g => {
            generosContador[g.name] = (generosContador[g.name] || 0) + 1;
        });

        // Contar Épocas
        if (peli.release_date) {
            const año = parseInt(peli.release_date.split('-')[0]);
            if (año >= 1980 && año <= 1999) epocasContador['Clásicos Retro (80s - 90s)']++;
            else if (año >= 2000 && año <= 2010) epocasContador['Época Dorada (2000 - 2010)']++;
            else if (año >= 2011 && año <= 2020) epocasContador['Modernas (2011 - 2020)']++;
            else if (año >= 2021) epocasContador['Estrenos (2021+)']++;
        }
    });

    // Encontrar Top Género
    const topGeneroArray = Object.entries(generosContador).sort((a, b) => b[1] - a[1]);
    statGenre.textContent = topGeneroArray.length ? topGeneroArray[0][0] : '-';

    // Encontrar Top Época
    const topEpocaArray = Object.entries(epocasContador).sort((a, b) => b[1] - a[1]);
    statEra.textContent = (topEpocaArray.length && topEpocaArray[0][1] > 0) ? topEpocaArray[0][0] : '-';
}

// ==========================================
// 10. LISTENERS PARA MENÚS DE INTERFAZ
// ==========================================
btnRecommend.addEventListener('click', obtenerPelicula);
btnOpenWatchlist.addEventListener('click', () => watchlistSidebar.classList.add('open'));
btnCloseWatchlist.addEventListener('click', () => watchlistSidebar.classList.remove('open'));

btnOpenStats.addEventListener('click', () => statsModal.classList.remove('hidden'));
btnCloseStats.addEventListener('click', () => statsModal.classList.add('hidden'));