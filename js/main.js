import {
    auth,
    database,
    get,
    databaseRef,
    set,
    onValue
} from './firebase.js';

// Configurações da API
const RAPIDAPI_KEY = '87e01ce830msh15680eada34ceddp15c0edjsna08c20a49482'; // Substitua pela sua chave
const API_HOST = 'api-football-v1.p.rapidapi.com';
const MAX_RETRIES = 3;

// Fila de requisições para rate limiting
const apiQueue = {
    requests: [],
    inProgress: 0,
    maxConcurrent: 3,
    delay: 350 // Delay maior entre chamadas
};

// Estado da aplicação
const state = {
    user: {
        auth: null,
        data: null
    },
    selectedSport: 'football',
    allLeagues: [],
    sportNames: {
        'football': 'Futebol'
    }
};

// --- Elementos DOM ---
const loginBtn = document.getElementById('login-btn');
const matchesContainer = document.getElementById('matches-container');
const activeBetsBtn = document.getElementById('active-bets-btn');
const activeBetsModal = document.getElementById('active-bets-modal');
const activeBetsContent = document.getElementById('active-bets-content');
const closeModalBtns = document.querySelectorAll('.close-modal');
const balanceElement = document.querySelector('.balance span');
const leagueFilterBtn = document.getElementById('league-filter-btn');
const leagueModal = document.getElementById('league-modal');
const leagueList = document.getElementById('league-list');
const applyLeaguesBtn = document.getElementById('apply-leagues');
const selectAllLeaguesBtn = document.getElementById('select-all-leagues');
const deselectAllLeaguesBtn = document.getElementById('deselect-all-leagues');

// --- Elementos DOM do Modal de Odds ---
const oddsModal = document.getElementById('odds-modal');
const oddsGameInfo = document.getElementById('odds-game-info'); // Mantido no JS, mas não será populado
const oddsList = document.getElementById('odds-list');
const oddsLoading = document.getElementById('odds-loading');
const oddsError = document.getElementById('odds-error');
const oddsBetSection = document.getElementById('odds-bet-section');
const selectedOddInfo = document.getElementById('selected-odd-info');
const oddsBetAmountInput = document.getElementById('odds-bet-amount-input');
const placeBetModalBtn = document.getElementById('place-bet-modal-btn');

// --- Variáveis Globais para o Modal de Odds ---
let currentModalBetData = null;
let currentGameDataForModal = null;

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM Carregado. Iniciando aplicação...");
    try {
        await checkAuthState();
        await fetchAllLeagues();

        if (state.user.auth && state.user.data) {
            let needsSave = false;
            if (!state.user.data.selectedLeagues || state.user.data.selectedLeagues.length === 0) {
                const defaultLeagues = [39, 140, 135, 78, 61, 71];
                const validDefaultLeagues = defaultLeagues.filter(id => state.allLeagues.some(l => l.id === id));
                state.user.data.selectedLeagues = validDefaultLeagues;
                console.log("Definindo ligas padrão:", validDefaultLeagues);
                needsSave = true;
            }
            if (!Array.isArray(state.user.data.activeBets)) {
                 state.user.data.activeBets = [];
                 needsSave = true;
             }
            if (needsSave) {
                await saveUserData();
            }
        }

        updateLeagueModal();
        await loadGames();
        setupEventListeners();
        updateActiveBetsBtn();
        updateBalanceDisplay();

    } catch (error) {
        console.error("Erro CRÍTICO na inicialização:", error);
        matchesContainer.innerHTML = '<div class="error"><i class="fas fa-exclamation-circle"></i> Erro fatal ao carregar. Tente recarregar a página.</div>';
    }
});

// --- Funções de Autenticação e Dados do Usuário ---
async function checkAuthState() {
    console.log("Verificando estado de autenticação...");
    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe();
            if (user) {
                console.log("Usuário autenticado:", user.uid);
                state.user.auth = user;
                try {
                    await loadUserData();
                    setupRealtimeUpdates();
                    resolve(user);
                } catch (error) {
                    console.error("Erro ao carregar dados do usuário após auth:", error);
                    reject(new Error("Falha ao carregar dados do usuário."));
                }
            } else {
                console.log("Nenhum usuário autenticado. Redirecionando para login...");
                window.location.href = "./login.html";
                resolve(null);
            }
        }, (error) => {
             console.error("Erro no listener de autenticação:", error);
             reject(error);
        });
    });
}

async function loadUserData() {
    if (!state.user.auth) return;
    console.log("Carregando dados do usuário do Firebase:", state.user.auth.uid);
    try {
        const userRef = databaseRef(database, 'users/' + state.user.auth.uid);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            state.user.data = snapshot.val();
            console.log("Dados do usuário carregados:", state.user.data);
            if (state.user.data.bucks === undefined || state.user.data.bucks === null) state.user.data.bucks = 0;
            if (!Array.isArray(state.user.data.activeBets)) state.user.data.activeBets = [];
            if (!Array.isArray(state.user.data.selectedLeagues)) state.user.data.selectedLeagues = [];
            if (!state.user.data.details) state.user.data.details = {};
            updateBalanceDisplay();
        } else {
            console.log("Nenhum dado encontrado no Firebase para este usuário. Criando registro inicial...");
            state.user.data = {
                details: { uid: state.user.auth.uid, email: state.user.auth.email, display_name: state.user.auth.displayName || 'Usuário', created_on: new Date().toISOString() },
                bucks: 1000, activeBets: [], selectedLeagues: []
            };
            await saveUserData();
            updateBalanceDisplay();
        }
    } catch (error) {
        console.error("Erro ao carregar dados do usuário do Firebase:", error);
        throw error;
    }
}

function setupRealtimeUpdates() {
    if (!state.user.auth) return;
    console.log("Configurando listeners de tempo real para o usuário:", state.user.auth.uid);
    const userRef = databaseRef(database, 'users/' + state.user.auth.uid);
    onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const updatedData = snapshot.val();
            if (JSON.stringify(state.user.data) !== JSON.stringify(updatedData)) {
                 state.user.data = updatedData;
                 if (state.user.data.bucks === undefined || state.user.data.bucks === null) state.user.data.bucks = 0;
                 if (!Array.isArray(state.user.data.activeBets)) state.user.data.activeBets = [];
                 if (!Array.isArray(state.user.data.selectedLeagues)) state.user.data.selectedLeagues = [];
                 updateBalanceDisplay();
                 updateActiveBetsBtn();
                 if (activeBetsModal.classList.contains('visible')) {
                     updateActiveBetsModal();
                 }
                 console.log("Estado do usuário atualizado:", state.user.data);
             }
        } else {
            console.warn("Listener de tempo real: Snapshot do usuário não existe mais!");
        }
    }, (error) => {
         console.error("Erro no listener de tempo real do usuário:", error);
    });
}

async function saveUserData() {
    if (!state.user.auth || !state.user.data) return;
    console.log("Salvando dados do usuário no Firebase:", state.user.auth.uid);
    
    // Garantir que details.display_name sempre tenha um valor válido
    const displayName = state.user.auth.displayName || 
                       state.user.data?.details?.display_name || 
                       'Usuário';
    
    const dataToSave = {
        details: {
            uid: state.user.auth.uid,
            email: state.user.auth.email,
            display_name: displayName,
            created_on: state.user.data?.details?.created_on || new Date().toISOString()
        },
        bucks: state.user.data.bucks !== undefined ? state.user.data.bucks : 0,
        activeBets: Array.isArray(state.user.data.activeBets) ? state.user.data.activeBets : [],
        selectedLeagues: Array.isArray(state.user.data.selectedLeagues) ? state.user.data.selectedLeagues : []
    };

    try {
        const userRef = databaseRef(database, 'users/' + state.user.auth.uid);
        await set(userRef, dataToSave);
        console.log("Dados do usuário salvos com sucesso.");
    } catch (error) {
        console.error("Erro CRÍTICO ao salvar dados do usuário no Firebase:", error);
        alert("Ocorreu um erro grave ao salvar seus dados. Algumas alterações podem não ter sido registradas.");
        throw error;
    }
}

// --- Configura Listeners de Eventos ---
function setupEventListeners() {
    console.log("Configurando event listeners...");
    loginBtn.addEventListener('click', () => {
        if (state.user.auth) {
             if (confirm("Deseja sair da sua conta?")) {
                 auth.signOut().then(() => { window.location.href = 'login.html'; }).catch(error => { console.error("Erro ao fazer logout:", error); alert("Erro ao tentar sair."); });
             }
        } else { window.location.href = 'login.html'; }
    });
    activeBetsBtn.addEventListener('click', () => { console.log("Abrindo modal de apostas ativas."); updateActiveBetsModal(); activeBetsModal.classList.add('visible'); });
    leagueFilterBtn.addEventListener('click', () => { console.log("Abrindo modal de ligas."); updateLeagueModal(); leagueModal.classList.add('visible'); });
    closeModalBtns.forEach(btn => { btn.addEventListener('click', (event) => { const modal = event.target.closest('.modal'); if (modal) { console.log(`Fechando modal: #${modal.id}`); modal.classList.remove('visible'); } }); });
    document.querySelectorAll('.modal').forEach(modal => { modal.addEventListener('click', (event) => { if (event.target === modal) { console.log(`Fechando modal por clique externo: #${modal.id}`); modal.classList.remove('visible'); } }); });
    applyLeaguesBtn.addEventListener('click', async () => {
        console.log("Aplicando filtros de liga...");
        const checkboxes = leagueList.querySelectorAll('input[type="checkbox"]:checked');
        const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
        if (JSON.stringify(state.user.data.selectedLeagues) !== JSON.stringify(selectedIds)) {
            state.user.data.selectedLeagues = selectedIds;
            console.log("Ligas selecionadas atualizadas:", selectedIds);
            try { await saveUserData(); leagueModal.classList.remove('visible'); await loadGames(); } catch (error) { console.error("Erro ao salvar/recarregar após aplicar ligas:", error); alert("Ocorreu um erro ao aplicar as ligas selecionadas."); }
        } else { console.log("Nenhuma mudança nas ligas selecionadas."); leagueModal.classList.remove('visible'); }
    });
    selectAllLeaguesBtn.addEventListener('click', () => { leagueList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true); });
    deselectAllLeaguesBtn.addEventListener('click', () => { leagueList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false); });
    placeBetModalBtn.addEventListener('click', async () => {
        if (!currentModalBetData || !currentGameDataForModal) { console.error("Erro: Dados da aposta ou do jogo estão faltando."); alert('Erro interno: Não foi possível identificar a aposta ou o jogo.'); return; }
        if (!state.user.auth || !state.user.data) { alert('Você precisa estar logado para apostar!'); return; }        
        const amount = parseInt(oddsBetAmountInput.value);
        if (!amount || isNaN(amount) || amount < 1) { alert('Insira um valor de aposta válido (mínimo 1 BTBucks)!'); oddsBetAmountInput.focus(); return; }
        if (amount > state.user.data.bucks) { alert(`Saldo insuficiente! Você tem ${state.user.data.bucks} BTBucks.`); oddsBetAmountInput.focus(); return; }
        const confirmationMessage = `Confirmar aposta?\nJogo: ${currentGameDataForModal.home_team} vs ${currentGameDataForModal.away_team}\nAposta: ${betTypeToText(currentModalBetData.betType)} @ ${currentModalBetData.oddValue.toFixed(2)}\nValor: ${amount} BTBucks\nGanho Potencial: ${(amount * currentModalBetData.oddValue).toFixed(2)} BTBucks`;
        if (!confirm(confirmationMessage)) { console.log("Aposta cancelada pelo usuário."); return; }
        console.log("Confirmado. Realizando aposta...");
        try {
            await placeBet(amount);
            oddsModal.classList.remove('visible'); oddsBetAmountInput.value = ''; currentModalBetData = null; currentGameDataForModal = null;
        } catch (error) { console.error("Erro originado na função placeBet:", error); }
    });
    console.log("Listeners configurados.");
}

// --- Funções da API e Jogos ---
async function fetchApiData(url, options = {}) {
    console.log(`Realizando requisição API para: ${url.split('?')[0]}`);
    await new Promise(resolve => setTimeout(resolve, apiQueue.delay));
    const defaultOptions = { method: 'GET', headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': API_HOST } };
    const fetchOptions = { ...defaultOptions, ...options };
    fetchOptions.headers = { ...defaultOptions.headers, ...options.headers };
    try {
        const response = await fetch(url, fetchOptions);
        if (!response.ok) { let errorBody = null; try { errorBody = await response.json(); } catch (e) {} console.error(`Erro HTTP ${response.status} - ${response.statusText} para ${url}`, errorBody); const error = new Error(`HTTP error! status: ${response.status} - ${response.statusText}`); error.status = response.status; error.body = errorBody; throw error; }
        const data = await response.json(); return data;
    } catch (error) { console.error(`Falha na requisição API para ${url}:`, error); throw error; }
}

async function fetchAllLeagues() {
    console.log("Buscando todas as competições da API...");
    try {
        const url = `https://${API_HOST}/v3/leagues`;
        const data = await fetchApiData(url);
        if (data && data.response) {
            state.allLeagues = data.response.map(item => {
                const league = item.league || {};
                const country = item.country || {};
                const seasons = item.seasons || [];
                const currentSeason = seasons.find(s => s?.current === true);
                
                return {
                    id: league.id || 0,
                    name: league.name || 'Competição Desconhecida',
                    type: league.type || 'League',
                    sport: 'football',
                    country: country.name || 'Internacional',
                    countryCode: country.code || null,
                    countryFlag: country.flag || null,
                    logo: league.logo || null,
                    current: !!currentSeason,
                    currentSeasonYear: currentSeason ? currentSeason.year : null
                };
            }).filter(league => league.current && league.id !== 0)  // Removido filtro por type === 'League'
              .sort((a, b) => {
                  if (a.country < b.country) return -1;
                  if (a.country > b.country) return 1;
                  if (a.name < b.name) return -1;
                  if (a.name > b.name) return 1;
                  return 0;
              });
            console.log(`${state.allLeagues.length} competições ativas carregadas.`);
        } else {
            console.warn("Resposta da API de competições inválida ou vazia:", data);
            state.allLeagues = [];
        }
    } catch (error) {
        console.error('Erro ao buscar competições:', error);
        throw error;
    }
}

function updateLeagueModal() {
    leagueList.innerHTML = '';
    if (!state.allLeagues || state.allLeagues.length === 0) {
        leagueList.innerHTML = '<p class="empty-bets">Nenhuma competição disponível.</p>';
        return;
    }

    const countries = state.allLeagues.reduce((acc, league) => {
        const countryName = league.country || 'Internacional';
        if (!acc[countryName]) {
            acc[countryName] = { leagues: [], flag: league.countryFlag };
        }
        acc[countryName].leagues.push(league);
        return acc;
    }, {});

    const sortedCountries = Object.entries(countries).sort(([countryA], [countryB]) => {
        if (countryA === 'Internacional') return 1;
        if (countryB === 'Internacional') return -1;
        return countryA.localeCompare(countryB);
    });

    for (const [country, data] of sortedCountries) {
        const countrySection = document.createElement('div');
        countrySection.className = 'league-sport-section';
        
        const countryHeader = document.createElement('h3');
        if (data.flag) {
            const flagImg = document.createElement('img');
            flagImg.src = data.flag;
            flagImg.alt = `Bandeira ${country}`;
            flagImg.style.width = '20px';
            flagImg.style.marginRight = '8px';
            flagImg.style.verticalAlign = 'middle';
            countryHeader.appendChild(flagImg);
        }
        countryHeader.appendChild(document.createTextNode(country));
        countrySection.appendChild(countryHeader);

        data.leagues.forEach(league => {
            const leagueItem = document.createElement('div');
            leagueItem.className = 'league-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `league-${league.id}`;
            checkbox.value = league.id;
            checkbox.checked = state.user.data?.selectedLeagues?.includes(league.id) || false;
            
            const label = document.createElement('label');
            label.htmlFor = `league-${league.id}`;
            
            const leagueName = document.createElement('span');
            leagueName.textContent = league.name;
            label.appendChild(leagueName);
            
            leagueItem.appendChild(checkbox);
            leagueItem.appendChild(label);
            countrySection.appendChild(leagueItem);
        });

        leagueList.appendChild(countrySection);
    }
    console.log("Modal de competições atualizado.");
}

// --- Carregamento e Exibição de Jogos ---
async function loadGames() {
    if (!state.user.data || !state.user.data.selectedLeagues || state.user.data.selectedLeagues.length === 0) {
        matchesContainer.innerHTML = '<div class="no-games"><i class="fas fa-filter"></i> Selecione competições no filtro para ver os jogos.</div>';
        return;
    }

    console.log("Carregando jogos para as competições selecionadas:", state.user.data.selectedLeagues);
    matchesContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando partidas...</div>';

    try {
        const daysToFetch = 3;
        const fetchPromises = [];
        
        for (let i = 0; i < daysToFetch; i++) {
            fetchPromises.push(fetchGamesForDate(i));
        }
        
        const allGames = await Promise.all(fetchPromises);
        displayMatches(allGames);
    } catch (error) {
        console.error('Erro ao carregar jogos:', error);
        matchesContainer.innerHTML = '<div class="error"><i class="fas fa-exclamation-circle"></i> Erro ao carregar jogos. Verifique a conexão ou a API.</div>';
    }
}

async function fetchGamesForDate(daysOffset) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysOffset);
    const dateStr = targetDate.toISOString().split('T')[0];
    console.log(`Buscando jogos para a data: ${dateStr}`);
    
    const selectedLeagueIds = state.user.data?.selectedLeagues || [];
    if (selectedLeagueIds.length === 0) return [];

    const requests = selectedLeagueIds.map(leagueId => {
        const leagueInfo = state.allLeagues.find(l => l.id === leagueId);
        const seasonYear = leagueInfo?.currentSeasonYear;
        
        if (!seasonYear) {
            console.warn(`Não foi possível encontrar o ano da temporada atual para a competição ${leagueId}. Pulando.`);
            return Promise.resolve([]);
        }
        
        const url = `https://${API_HOST}/v3/fixtures?date=${dateStr}&league=${leagueId}&season=${seasonYear}`;
        return fetchApiData(url)
            .then(data => {
                if (!data.response || data.response.length === 0) return [];
                return data.response.map(fixtureData => {
                    const fixture = fixtureData.fixture || {};
                    const league = fixtureData.league || {};
                    const teams = fixtureData.teams || { home: {}, away: {} };
                    const goals = fixtureData.goals || {};
                    const status = fixture.status || {};
                    
                    const relevantStatus = ['NS', 'TBD'];
                    if (!relevantStatus.includes(status.short)) return null;
                    
                    return {
                        id: fixture.id,
                        referee: fixture.referee || null,
                        timezone: fixture.timezone || 'UTC',
                        date: fixture.date,
                        timestamp: fixture.timestamp,
                        status: status.short || 'UNK',
                        status_long: status.long || 'Unknown',
                        elapsed: status.elapsed || null,
                        league_id: league.id,
                        league_name: league.name,
                        league_country: league.country,
                        league_logo: league.logo,
                        league_round: league.round || null,
                        season: league.season,
                        home_team_id: teams.home?.id,
                        home_team: teams.home?.name || 'Time Casa?',
                        home_team_logo: teams.home?.logo,
                        home_goals: goals.home,
                        away_team_id: teams.away?.id,
                        away_team: teams.away?.name || 'Time Fora?',
                        away_team_logo: teams.away?.logo,
                        away_goals: goals.away,
                        sport_title: leagueInfo?.name || league.name
                    };
                }).filter(game => game !== null);
            })
            .catch(error => {
                console.error(`Erro ao buscar jogos para competição ${leagueId} em ${dateStr}:`, error.status, error.message);
                return [];
            });
    });

    const resultsPerLeague = await Promise.all(requests);
    const allGamesForDate = resultsPerLeague.flat();
    allGamesForDate.sort((a, b) => a.timestamp - b.timestamp);
    return allGamesForDate;
}

function displayMatches(gamesByDay) {
    matchesContainer.innerHTML = '';
    
    // Juntar todos os jogos de todos os dias
    const allGames = gamesByDay.flat();
    
    if (allGames.length === 0) {
        matchesContainer.innerHTML = '<div class="no-games"><i class="far fa-calendar-alt"></i> Nenhum jogo futuro encontrado nas competições selecionadas.</div>';
        return;
    }
    
    // Agrupar jogos por data
    const gamesByDate = {};
    allGames.forEach(game => {
        const gameDate = game.date.split('T')[0];
        if (!gamesByDate[gameDate]) {
            gamesByDate[gameDate] = [];
        }
        gamesByDate[gameDate].push(game);
    });
    
    // Ordenar as datas e criar seções para cada dia
    const sortedDates = Object.keys(gamesByDate).sort();
    sortedDates.forEach(date => {
        // Adiciona 'T00:00:00' para garantir que a data seja interpretada corretamente
        const dateObj = new Date(date + 'T00:00:00');
        
        const dateStr = dateObj.toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long',
            timeZone: 'America/Sao_Paulo' // Especifica o fuso horário desejado
        });
        
        // Corrige a capitalização (remove vírgula se existir)
        let capitalizedDateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
        capitalizedDateStr = capitalizedDateStr.replace(/,/g, '');
        
        const daySection = createDaySection(capitalizedDateStr, gamesByDate[date]);
        matchesContainer.appendChild(daySection);
    });
}

function createDaySection(title, games) {
    const section = document.createElement('div'); section.className = 'day-section';
    const header = document.createElement('div'); header.className = 'day-header'; header.textContent = title; section.appendChild(header);
    const gamesGrid = document.createElement('div'); gamesGrid.className = 'games-grid';
    games.forEach(game => { const gameCard = createGameCard(game); gamesGrid.appendChild(gameCard); });
    section.appendChild(gamesGrid); return section;
}

function createGameCard(game) {
    const card = document.createElement('div'); card.className = 'game-card'; card.dataset.fixtureId = game.id;
    const gameTimeLocal = formatGameTime(game.date);
    // **REMOVIDO** Status explícito (ex: 'Não Iniciado')

    card.innerHTML = `
        <div class="game-header">
            <span class="league-name" title="${game.league_name} - ${game.league_country}">
                ${game.sport_title}
            </span>
            <span class="game-time">${gameTimeLocal}</span>
        </div>
        <div class="teams">
            <img class="team-logo home-team-logo" src="${game.home_team_logo || 'placeholder.png'}" alt="${game.home_team}" title="${game.home_team}">
            <span class="team home-team" title="${game.home_team}">${game.home_team}</span>
            <span class="vs">vs</span> <span class="team away-team" title="${game.away_team}">${game.away_team}</span>
            <img class="team-logo away-team-logo" src="${game.away_team_logo || 'placeholder.png'}" alt="${game.away_team}" title="${game.away_team}">
        </div>
        <div class="click-to-see-odds-info">
             <i class="fas fa-chart-line"></i> Ver Odds
         </div>
    `;

    card.addEventListener('click', () => {
        console.log(`Card clicado - Abrindo modal de odds para fixture ID: ${game.id}`);
        showOddsModal(game);
    });
    return card;
}

// --- Funções do Modal de Odds ---
async function fetchOddsForFixture(fixtureId) {
    const url = `https://${API_HOST}/v3/odds?fixture=${fixtureId}`;
    console.log(`Buscando odds para fixture: ${fixtureId}`);
    try {
        const data = await fetchApiData(url);
        if (data && data.response && Array.isArray(data.response) && data.response.length > 0) {
            const bookmakers = data.response[0]?.bookmakers || [];
            const bookmaker = bookmakers.find(b => b.id === 8) || bookmakers[0];
            const bets = bookmaker?.bets || [];

            if (bets.length) {
                return bets;
            } else {
                console.warn(`Nenhuma aposta (bets) encontrada para fixture: ${fixtureId}`);
                return [];
            }

        } else { console.warn(`Nenhuma resposta de odds válida ou vazia para fixture: ${fixtureId}`); return []; }
    } catch (error) {
        console.error(`Erro ao buscar odds para fixture ${fixtureId}:`, error);
        if (error.status === 404) { console.warn("API retornou 404 para odds, provavelmente não disponíveis."); return []; }
        throw error;
    }
}

async function showOddsModal(game) {
    console.log("Preparando modal de odds para:", game.home_team, "vs", game.away_team);
    currentGameDataForModal = game; currentModalBetData = null;
    oddsList.innerHTML = ''; oddsLoading.style.display = 'block'; oddsError.style.display = 'none'; oddsBetSection.style.display = 'none'; selectedOddInfo.textContent = 'Nenhum'; oddsBetAmountInput.value = ''; placeBetModalBtn.disabled = true; placeBetModalBtn.textContent = 'Apostar';
    oddsModal.classList.add('visible');
    try {
        const oddsData = await fetchOddsForFixture(game.id);
        console.log(oddsData);
        oddsLoading.style.display = 'none';
        displayOddsInModal(oddsData);
    } catch (error) {
        oddsLoading.style.display = 'none'; oddsError.style.display = 'block'; oddsError.querySelector('i').nextSibling.textContent = ` Erro ao carregar odds: ${error.message || 'Tente novamente.'}`;
        console.error("Erro ao buscar/exibir odds no modal:", error);
    }
}

function displayOddsInModal(bets) {
    oddsList.innerHTML = '';
    oddsError.style.display = 'none';

    if (!bets || bets.length === 0) {
        oddsList.innerHTML = '<p class="empty-bets">Nenhuma odd encontrada para este jogo.</p>';
        oddsBetSection.style.display = 'none';
        return;
    }

    console.log(`Exibindo ${bets.length} mercados de apostas.`);

    let anyOddDisplayed = false;

    bets.forEach(marketData => {
        if (!marketData.values || marketData.values.length === 0) return;

        anyOddDisplayed = true;

        // Cria o container da linha do mercado
        const market = document.createElement('div');
        market.className = 'market'; // Você pode estilizar depois com CSS

        // Nome do mercado (ex: Match Winner)
        const marketNameDiv = document.createElement('div');
        marketNameDiv.className = 'market-name';
        marketNameDiv.textContent = marketData.name || `Mercado ${marketData.id}`;
        market.appendChild(marketNameDiv);

        // Container dos botões de odds
        const oddsContainer = document.createElement('div');
        oddsContainer.className = 'market-odds-buttons';

        marketData.values.forEach(outcome => {
            const oddValueFloat = parseFloat(outcome.odd);
            if (isNaN(oddValueFloat)) return;

            const oddBtn = document.createElement('button');
            oddBtn.className = 'odd-btn-modal';

            oddBtn.innerHTML = `
                <span class="odd-name">${outcome.value}</span>
                <span class="odd-value-modal">${oddValueFloat.toFixed(2)}</span>
            `;

            oddBtn.addEventListener('click', (e) => {
                const clickedBtn = e.currentTarget;
                oddsList.querySelectorAll('.odd-btn-modal.active').forEach(btn => btn.classList.remove('active'));
                clickedBtn.classList.add('active');

                currentModalBetData = {
                    market: marketData,
                    selection: outcome.value,
                    oddValue: parseFloat(outcome.odd)
                };
                console.log("Odd selecionada:", currentModalBetData);
                selectedOddInfo.textContent = `${currentModalBetData.market.name} @ ${currentModalBetData.oddValue.toFixed(2)}`;
                oddsBetSection.style.display = 'flex';
                placeBetModalBtn.disabled = false;
                placeBetModalBtn.textContent = 'Apostar';
                oddsBetAmountInput.focus();
            });

            oddsContainer.appendChild(oddBtn);
        });

        market.appendChild(oddsContainer);
        oddsList.appendChild(market);
    });

    if (!anyOddDisplayed) {
        oddsList.innerHTML = '<p class="empty-bets">Nenhuma odd disponível para exibição.</p>';
        oddsBetSection.style.display = 'none';
    }
}

// --- Funções de Apostas ---
async function placeBet(amount) {

    const userBet = currentModalBetData;
    const betData = currentGameDataForModal 
    const gameId = betData.id;
    const homeTeam = betData.home_team;
    const awayTeam = betData.away_team;
    const league = betData.league_name;
    const market = userBet.market;
    const selection = userBet.selection;
    const oddValue = userBet.oddValue;

    const newBet = {
        id: Date.now(),
        gameId: gameId,
        teams: `${homeTeam} vs ${awayTeam}`,
        league: league,
        market: market,
        selection: selection,
        odd: oddValue,
        amount: amount,
        potentialWin: parseFloat((amount * oddValue).toFixed(2)),
        status: 'active',
        placedAt: new Date().toISOString(),
        settledAt: null
    };

    try {
        if (!state.user.data.activeBets) state.user.data.activeBets = [];
        state.user.data.bucks -= amount;
        state.user.data.activeBets.push(newBet);
        
        await saveUserData();
        return newBet;
    } catch (error) {
        console.error("Erro ao registrar aposta:", error);
        throw error;
    }
}

function updateActiveBetsModal() {
    console.log("Atualizando modal de apostas ativas...");
    if (!state.user.data?.activeBets || state.user.data.activeBets.length === 0) { activeBetsContent.innerHTML = '<p class="empty-bets"><i class="far fa-futbol"></i> Nenhuma aposta ativa no momento.</p>'; return; }
    const sortedBets = [...state.user.data.activeBets].sort((a, b) => { const dateA = a.timestamp ? new Date(a.timestamp) : 0; const dateB = b.timestamp ? new Date(b.timestamp) : 0; return dateB - dateA; });
    let betsHtml = '';
    sortedBets.forEach(bet => {
        console.log(bet);

        const displayBetName = bet.market.name; 
        const displaySelection = bet.selection; 
        const displayOdd = bet.odd; 

        const displayAmount = bet.amount; 
        const displayPotentialWin = bet.potentialWin; 
        const displayLeague = bet.league; 
        const displayTeams = bet.teams;

        betsHtml += `
            <div class="active-bet" data-bet-id="${bet.id}">
                <div class="bet-info">
                    <div class="bet-teams">${displayTeams}</div> 
                    <div class="bet-details"><span class="bet-type">${displayBetName}: ${displaySelection} @ ${displayOdd}</span> <span class="bet-amount">Valor: ${displayAmount} BTBucks</span></div>
                </div>
                <button class="cancel-bet" data-bet-id="${bet.id}" title="Cancelar Aposta"> <i class="fas fa-times"></i> </button>
            </div> `;
    });
    activeBetsContent.innerHTML = betsHtml; attachCancelBetListeners(); console.log("Modal de apostas ativas populado.");
}

function attachCancelBetListeners() { document.querySelectorAll('.active-bet .cancel-bet').forEach(btn => { btn.removeEventListener('click', handleCancelBetClick); btn.addEventListener('click', handleCancelBetClick); }); }
function handleCancelBetClick(event) { event.stopPropagation(); const btn = event.currentTarget; const betId = parseInt(btn.dataset.betId); if (isNaN(betId)) { console.error("ID de aposta inválido:", btn.dataset.betId); return; } if (confirm("Tem certeza que deseja cancelar esta aposta? O valor será reembolsado.")) { cancelBet(betId); } }

async function cancelBet(betId) {
    console.log(`Tentando cancelar aposta ID: ${betId}`);
    if (!state.user.auth || !state.user.data?.activeBets) { console.warn("Cancelamento não permitido."); return; }
    const betIndex = state.user.data.activeBets.findIndex(bet => bet.id === betId);
    if (betIndex === -1) { console.warn("Aposta não encontrada para cancelar:", betId); alert("Erro: Aposta não encontrada."); return; }
    const betToCancel = state.user.data.activeBets[betIndex];
    try {
        state.user.data.bucks += betToCancel.amount; state.user.data.activeBets.splice(betIndex, 1); console.log(`Aposta ${betId} removida localmente.`);
        updateBalanceDisplay(); updateActiveBetsBtn();
        const betElementToRemove = activeBetsContent.querySelector(`.active-bet[data-bet-id="${betId}"]`); if (betElementToRemove) { betElementToRemove.remove(); if (activeBetsContent.children.length === 0) { updateActiveBetsModal(); } } else { updateActiveBetsModal(); }
        await saveUserData(); alert("Aposta cancelada e valor reembolsado!");
    } catch (error) {
        console.error("Erro CRÍTICO ao cancelar aposta:", error); console.log("Revertendo cancelamento local..."); state.user.data.activeBets.splice(betIndex, 0, betToCancel); state.user.data.bucks -= betToCancel.amount;
        updateBalanceDisplay(); updateActiveBetsBtn(); updateActiveBetsModal(); alert(`Erro GRAVE ao cancelar:\n${error.message}\n\nNenhuma alteração feita.`);
    }
}

function updateActiveBetsBtn() { const badge = activeBetsBtn.querySelector('.badge'); if (!badge) return; const activeBetsCount = state.user.data?.activeBets?.length || 0; badge.textContent = activeBetsCount; badge.style.display = activeBetsCount > 0 ? 'flex' : 'none'; }

// --- Funções Auxiliares ---
function updateBalanceDisplay() { const balance = state.user.data?.bucks ?? 0; balanceElement.textContent = Math.floor(balance); console.log("Saldo UI:", balanceElement.textContent); }
function formatGameTime(isoDateTimeString) { if (!isoDateTimeString) return "N/A"; try { const date = new Date(isoDateTimeString); if (isNaN(date.getTime())) { throw new Error("Data inválida"); } const options = { hour: '2-digit', minute: '2-digit' }; return date.toLocaleTimeString('pt-BR', options); } catch (error) { console.error(`Erro formatar hora "${isoDateTimeString}":`, error); return "Inválido"; } }
function formatBetTimestamp(isoTimestamp) { if (!isoTimestamp) return "N/A"; try { const date = new Date(isoTimestamp); if (isNaN(date.getTime())) { throw new Error("Timestamp inválido"); } const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }; return date.toLocaleString('pt-BR', options); } catch (error) { console.error(`Erro formatar timestamp "${isoTimestamp}":`, error); return "Inválido"; } }
function betTypeToText(betType) { const types = { 'home': 'Casa', 'draw': 'Empate', 'away': 'Fora', 'double_1X': 'Casa ou Empate', 'double_12': 'Casa ou Fora', 'double_X2': 'Empate ou Fora', 'bts_yes': 'Sim', 'bts_no': 'Não' }; return types[betType?.toLowerCase()] || betType || 'Desconhecido'; }
function mapOutcomeToBetType(marketId, outcomeValue) { const valueLower = outcomeValue.toLowerCase(); switch (marketId) { case 1: if (valueLower === 'home') return 'home'; if (valueLower === 'draw') return 'draw'; if (valueLower === 'away') return 'away'; break; case 12: if (valueLower === '1x') return 'double_1X'; if (valueLower === '12') return 'double_12'; if (valueLower === 'x2') return 'double_X2'; break; case 8: if (valueLower === 'yes') return 'bts_yes'; if (valueLower === 'no') return 'bts_no'; break; } return valueLower; }
function mapOutcomeToDisplayName(marketId, outcomeValue) { const internalType = mapOutcomeToBetType(marketId, outcomeValue); const mappedText = betTypeToText(internalType); if (mappedText !== internalType) { return mappedText; } return outcomeValue.charAt(0).toUpperCase() + outcomeValue.slice(1); }

console.log("main.js carregado e pronto.");