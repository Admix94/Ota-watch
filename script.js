const KOGEMI_API = "https://kogemi-api-3.onrender.com";
const ANILIST_API = "https://graphql.anilist.co";

// State Management
let currentAnime = null;
let currentEp = 1;
let watchHistory = JSON.parse(localStorage.getItem('kogemi_history')) || [];

// --- API FETCHERS ---

async function fetchAniList(query, variables) {
    const res = await fetch(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
    });
    return (await res.json()).data;
}

const queries = {
    trending: `query { Page(perPage: 15) { media(sort: TRENDING_DESC, type: ANIME) { id title { english romaji } coverImage { extraLarge } bannerImage averageScore nextAiringEpisode { episode } episodes } } }`,
    search: `query ($search: String) { Page(perPage: 20) { media(search: $search, type: ANIME) { id title { english romaji } coverImage { extraLarge } bannerImage averageScore episodes } } }`
};

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    loadHome();
    setupSearch();
    renderHistory();
});

async function loadHome() {
    const data = await fetchAniList(queries.trending);
    const trending = data.Page.media;
    
    // Set Hero
    const featured = trending[0];
    const hero = document.getElementById('hero');
    hero.style.backgroundImage = `url(${featured.bannerImage || featured.coverImage.extraLarge})`;
    hero.innerHTML = `
        <div style="z-index: 1; max-width: 600px">
            <h1 style="font-size: 3rem; margin: 0">${featured.title.english || featured.title.romaji}</h1>
            <button class="btn-ctrl" style="padding: 15px 30px; margin-top: 20px; background: var(--accent)" 
                onclick="openAnime(${JSON.stringify(featured).replace(/"/g, '&quot;')})">Watch Now</button>
        </div>
    `;

    renderShelf('trendingList', trending);
    renderShelf('popularList', trending.slice().reverse());
}

function renderShelf(id, list) {
    const container = document.getElementById(id);
    container.innerHTML = list.map(anime => `
        <div class="anime-card" onclick='openAnime(${JSON.stringify(anime).replace(/"/g, '&quot;')})'>
            <img src="${anime.coverImage.extraLarge}" loading="lazy">
            <p>${anime.title.english || anime.title.romaji}</p>
        </div>
    `).join('');
}

// --- SEARCH LOGIC ---

function setupSearch() {
    const input = document.getElementById('searchInput');
    let debounceTimer;

    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value;

        if (query.length < 2) {
            document.getElementById('searchResults').classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(async () => {
            const data = await fetchAniList(queries.search, { search: query });
            const results = data.Page.media;
            
            const grid = document.getElementById('searchGrid');
            document.getElementById('searchResults').classList.remove('hidden');
            grid.innerHTML = results.map(anime => `
                <div class="anime-card" onclick='openAnime(${JSON.stringify(anime).replace(/"/g, '&quot;')})'>
                    <img src="${anime.coverImage.extraLarge}">
                    <p>${anime.title.english || anime.title.romaji}</p>
                </div>
            `).join('');
            window.scrollTo({ top: grid.offsetTop - 100, behavior: 'smooth' });
        }, 400);
    });
}

// --- PLAYER & DETAILS ---

async function openAnime(anime) {
    currentAnime = anime;
    const title = anime.title.english || anime.title.romaji;
    const cleanTitle = title.split(':')[0].split('(')[0].trim();

    // Show loading state
    document.getElementById('playerOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // UI Metadata
    document.getElementById('detailTitle').innerText = title;
    document.getElementById('detailRating').innerText = (anime.averageScore / 10).toFixed(1);
    document.getElementById('detailEpisodes').innerText = `${anime.episodes || '??'} Eps`;

    try {
        // Get IMDb ID via Kogemi API
        const imdbRes = await fetch(`${KOGEMI_API}/imdb?title=${encodeURIComponent(cleanTitle)}`);
        const imdbData = await imdbRes.json();
        
        currentAnime.imdb = imdbData.imdb;

        // Load History or Default to Ep 1
        const historyItem = watchHistory.find(h => h.id === anime.id);
        const startEp = historyItem ? historyItem.ep : 1;

        buildEpisodeGrid(anime.episodes || 12);
        playEpisode(startEp);

    } catch (err) {
        alert("Streaming not available for this title yet.");
    }
}

function buildEpisodeGrid(total) {
    const grid = document.getElementById('episodeGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= total; i++) {
        const btn = document.createElement('button');
        btn.className = `ep-btn ep-${i}`;
        btn.innerText = i;
        btn.onclick = () => playEpisode(i);
        grid.appendChild(btn);
    }
}

async function playEpisode(ep) {
    currentEp = ep;
    
    // Highlight Active
    document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.ep-${ep}`)?.classList.add('active');

    const server = document.getElementById('serverSelect').value;
    
    try {
        const res = await fetch(`${KOGEMI_API}/stream?imdb=${currentAnime.imdb}&ep=${ep}`);
        const data = await res.json();
        
        document.getElementById('mainIframe').src = server === 'primary' ? data.primary : data.backup;

        // Save History
        saveHistory(currentAnime, ep);
    } catch (e) {
        console.error("Stream error");
    }
}

function saveHistory(anime, ep) {
    watchHistory = watchHistory.filter(h => h.id !== anime.id);
    watchHistory.unshift({ id: anime.id, ep, anime });
    if (watchHistory.length > 10) watchHistory.pop();
    localStorage.setItem('kogemi_history', JSON.stringify(watchHistory));
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('continueList');
    if (watchHistory.length > 0) {
        document.getElementById('continueSection').classList.remove('hidden');
        container.innerHTML = watchHistory.map(item => `
            <div class="anime-card" onclick='openAnime(${JSON.stringify(item.anime).replace(/"/g, '&quot;')})'>
                <div style="position:relative">
                    <img src="${item.anime.coverImage.extraLarge}">
                    <div style="position:absolute; bottom:0; left:0; right:0; background:var(--accent); height:4px; width:${(item.ep/item.anime.episodes)*100}%"></div>
                </div>
                <p>Ep ${item.ep} - ${item.anime.title.english || item.anime.title.romaji}</p>
            </div>
        `).join('');
    }
}

function closePlayer() {
    document.getElementById('playerOverlay').classList.add('hidden');
    document.getElementById('mainIframe').src = '';
    document.body.style.overflow = 'auto';
}

function nextEp() { playEpisode(currentEp + 1); }
function prevEp() { if(currentEp > 1) playEpisode(currentEp - 1); }

// Auto-Next Logic (Simulation since iframes block event access)
setInterval(() => {
    const iframe = document.getElementById('mainIframe');
    if (iframe.src.includes('ended=1')) nextEp(); // Only if the provider supports this query param
}, 10000);
