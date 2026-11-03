/* ========================================================
   4U.IA.BR / AUTOCARE PRO - GESTÃO VEICULAR & GOOGLE DRIVE
   Data Engine, Google Drive Sync & UI Controller
   ======================================================== */

// Google OAuth & Cloud Drive Configuration
const GOOGLE_CLIENT_ID = '569266864432-pd09jbb5no9ekdhdr018fj643nopp817.apps.googleusercontent.com';
const DRIVE_FOLDER_NAME = 'AutoCare 4U';
const DRIVE_FILE_NAME = 'autocare_dados.json';

// Application State
let appState = {
    vehicles: [],
    maintenance: [],
    fuel: [],
    alerts: [],
    settings: {
        currency: 'BRL',
        lastSync: null
    }
};

let googleUser = null;
let googleTokenClient = null;
let driveAccessToken = null;
let driveTokenExpiresAt = 0;
let driveFolderId = null;
let driveMasterFileId = null;
let isSyncing = false;
let autoSyncTimeout = null;

// Maintenance Presets for 1-Click Setup
const MAINTENANCE_PRESETS = [
    { title: 'Troca de Óleo + Filtro', kmInterval: 10000, daysInterval: 180, icon: '🛢️' },
    { title: 'Pastilhas de Freio', kmInterval: 20000, daysInterval: 365, icon: '🛑' },
    { title: 'Filtro de Ar e Cabine', kmInterval: 15000, daysInterval: 365, icon: '💨' },
    { title: 'Correia Dentada / Tensores', kmInterval: 50000, daysInterval: 1460, icon: '⚙️' },
    { title: 'Alinhamento e Balanceamento', kmInterval: 10000, daysInterval: 180, icon: '🛞' },
    { title: 'Troca de Velas de Ignição', kmInterval: 40000, daysInterval: 730, icon: '⚡' },
    { title: 'Fluido de Freio', kmInterval: 30000, daysInterval: 730, icon: '💧' },
    { title: 'IPVA e Licenciamento Anual', kmInterval: null, daysInterval: 365, icon: '📋' }
];

// Sample demo data
const DEMO_DATA = {
    vehicles: [
        {
            id: 'demo-v1',
            brand: 'Honda',
            model: 'Civic Touring 1.5 Turbo',
            year: 2021,
            plate: 'BRA-2E19',
            color: 'Preto Cristal',
            currentKm: 42500,
            fuelType: 'Gasolina',
            notes: 'Revisões sempre na concessionária'
        },
        {
            id: 'demo-v2',
            brand: 'Jeep',
            model: 'Renegade Longitude 1.3 T270',
            year: 2023,
            plate: 'RNG-4B28',
            color: 'Cinza Granite',
            currentKm: 18400,
            fuelType: 'Flex',
            notes: 'Uso diário urbano'
        }
    ],
    maintenance: [
        {
            id: 'demo-m1',
            vehicleId: 'demo-v1',
            type: 'Troca de Óleo',
            date: '2026-08-15',
            km: 40000,
            cost: 480.00,
            workshop: 'Honda AutoMais',
            notes: 'Óleo sintético 0W20 + filtro de óleo e anel do cárter'
        },
        {
            id: 'demo-m2',
            vehicleId: 'demo-v1',
            type: 'Alinhamento',
            date: '2026-06-10',
            km: 37500,
            cost: 160.00,
            workshop: 'Pneus & Cia',
            notes: 'Alinhamento 3D e balanceamento das 4 rodas'
        },
        {
            id: 'demo-m3',
            vehicleId: 'demo-v2',
            type: 'Revisão Geral',
            date: '2026-05-20',
            km: 12000,
            cost: 790.00,
            workshop: 'Jeep Concessionária',
            notes: '1ª Revisão obrigatória de 12.000km'
        }
    ],
    fuel: [
        {
            id: 'demo-f1',
            vehicleId: 'demo-v1',
            date: '2026-09-28',
            km: 42500,
            liters: 44.5,
            pricePerLiter: 5.89,
            totalCost: 262.10,
            fuelType: 'Gasolina',
            station: 'Posto Shell Ipiranga',
            fullTank: true
        },
        {
            id: 'demo-f2',
            vehicleId: 'demo-v1',
            date: '2026-09-14',
            km: 41980,
            liters: 42.0,
            pricePerLiter: 5.85,
            totalCost: 245.70,
            fuelType: 'Gasolina',
            station: 'Posto Petrobras',
            fullTank: true
        },
        {
            id: 'demo-f3',
            vehicleId: 'demo-v2',
            date: '2026-09-25',
            km: 18400,
            liters: 46.0,
            pricePerLiter: 3.89,
            totalCost: 178.94,
            fuelType: 'Etanol',
            station: 'Posto Ipiranga Centro',
            fullTank: true
        }
    ],
    alerts: [
        {
            id: 'demo-a1',
            vehicleId: 'demo-v1',
            title: 'Troca de Óleo + Filtro (50.000 km)',
            triggerType: 'km',
            triggerValue: 50000,
            description: 'Próxima troca de óleo recomendada aos 50.000 km',
            completed: false
        },
        {
            id: 'demo-a2',
            vehicleId: 'demo-v2',
            title: 'IPVA e Licenciamento 2027',
            triggerType: 'date',
            triggerValue: '2027-03-20',
            description: 'Pagamento da cota única com desconto',
            completed: false
        }
    ]
};

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    loadLocalData();
    initGoogleAuth();
    setupEventListeners();
    updateUI();
    checkAlertsStatus();
});

// Load from LocalStorage
function loadLocalData() {
    try {
        const saved = localStorage.getItem('autocare_data');
        if (saved) {
            const parsed = JSON.parse(saved);
            appState.vehicles = parsed.vehicles || [];
            appState.maintenance = parsed.maintenance || [];
            appState.fuel = parsed.fuel || [];
            appState.alerts = parsed.alerts || [];
            appState.settings = parsed.settings || appState.settings;
        }

        // Restore saved Google session if available
        const savedUser = localStorage.getItem('autocare_google_user');
        if (savedUser) {
            googleUser = JSON.parse(savedUser);
            renderUserProfile();
        }

        driveAccessToken = localStorage.getItem('autocare_drive_token');
        driveTokenExpiresAt = parseInt(localStorage.getItem('autocare_drive_token_exp') || '0', 10);
        driveFolderId = localStorage.getItem('autocare_drive_folder_id');
        driveMasterFileId = localStorage.getItem('autocare_drive_file_id');

        if (driveAccessToken && Date.now() < driveTokenExpiresAt) {
            updateCloudBadge('connected', 'Conectado ao Drive');
        } else {
            updateCloudBadge('local', 'Modo Local');
        }
    } catch (e) {
        console.error('Erro ao ler localStorage:', e);
    }
}

// Save to LocalStorage and trigger auto-sync to Google Drive
function saveLocalData(triggerCloudSync = true) {
    try {
        localStorage.setItem('autocare_data', JSON.stringify(appState));
        updateUI();
        
        if (triggerCloudSync && driveAccessToken && Date.now() < driveTokenExpiresAt) {
            clearTimeout(autoSyncTimeout);
            autoSyncTimeout = setTimeout(() => {
                syncWithGoogleDrive(false);
            }, 2000);
        }
    } catch (e) {
        console.error('Erro ao salvar no localStorage:', e);
        showToast('Erro ao salvar dados localmente', 'error');
    }
}

// ----------------------------------------------------
// GOOGLE IDENTITY & DRIVE INTEGRATION
// ----------------------------------------------------
function initGoogleAuth() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        let attempts = 0;
        const checkGis = setInterval(() => {
            attempts++;
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                clearInterval(checkGis);
                createTokenClient();
            } else if (attempts > 20) {
                clearInterval(checkGis);
                console.warn('Google Identity Services não carregou.');
            }
        }, 300);
        return;
    }
    createTokenClient();
}

function createTokenClient() {
    if (googleTokenClient) return;
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email openid',
        callback: async (resp) => {
            if (resp && resp.access_token) {
                driveAccessToken = resp.access_token;
                const expiresIn = (resp.expires_in ? parseInt(resp.expires_in, 10) : 3600) * 1000;
                driveTokenExpiresAt = Date.now() + expiresIn;
                
                localStorage.setItem('autocare_drive_token', driveAccessToken);
                localStorage.setItem('autocare_drive_token_exp', String(driveTokenExpiresAt));

                // Fetch user info
                try {
                    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { Authorization: `Bearer ${driveAccessToken}` }
                    });
                    if (userRes.ok) {
                        googleUser = await userRes.json();
                        localStorage.setItem('autocare_google_user', JSON.stringify(googleUser));
                        renderUserProfile();
                    }
                } catch (err) {
                    console.warn('Erro ao obter perfil Google:', err);
                }

                showToast('Conta Google conectada com sucesso!', 'success');
                updateCloudBadge('connected', 'Conectado ao Drive');
                
                // Immediately sync with Google Drive
                await syncWithGoogleDrive(true);
            } else if (resp && resp.error) {
                if (resp.error !== 'popup_closed_by_user') {
                    showToast('Erro ao autenticar com o Google.', 'error');
                }
            }
        }
    });
}

// Request Token Client for User Sign-in
window.loginWithGoogle = function() {
    if (!googleTokenClient) {
        initGoogleAuth();
    }
    if (googleTokenClient) {
        googleTokenClient.requestAccessToken({ prompt: 'select_account' });
    } else {
        showToast('Serviço do Google indisponível. Verifique sua conexão.', 'error');
    }
};

window.logoutGoogle = function() {
    if (confirm('Deseja desconectar sua Conta Google deste navegador? Seus dados locais serão mantidos.')) {
        googleUser = null;
        driveAccessToken = null;
        driveTokenExpiresAt = 0;
        localStorage.removeItem('autocare_google_user');
        localStorage.removeItem('autocare_drive_token');
        localStorage.removeItem('autocare_drive_token_exp');
        renderUserProfile();
        updateCloudBadge('local', 'Modo Local');
        showToast('Desconectado da Conta Google', 'info');
    }
};

function renderUserProfile() {
    const avatarEl = document.getElementById('userAvatar');
    const nameEl = document.getElementById('userName');
    const emailEl = document.getElementById('userEmail');
    const authBtn = document.getElementById('btnGoogleAuth');

    if (googleUser && googleUser.email) {
        if (googleUser.picture) {
            avatarEl.innerHTML = `<img src="${googleUser.picture}" class="user-avatar-img" alt="Avatar">`;
        } else {
            avatarEl.innerHTML = `<div class="user-avatar-fallback">${(googleUser.name || 'U').charAt(0).toUpperCase()}</div>`;
        }
        nameEl.textContent = googleUser.name || 'Usuário Google';
        emailEl.textContent = googleUser.email;
        authBtn.innerHTML = `<span>Desconectar</span>`;
        authBtn.onclick = window.logoutGoogle;
    } else {
        avatarEl.innerHTML = `<div class="user-avatar-fallback">⚡</div>`;
        nameEl.textContent = 'Modo Local';
        emailEl.textContent = 'Sem Conta Google';
        authBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            <span>Conectar Google</span>
        `;
        authBtn.onclick = window.loginWithGoogle;
    }
}

function updateCloudBadge(state, text) {
    const dot = document.getElementById('cloudDot');
    const label = document.getElementById('cloudStatusText');
    if (!dot || !label) return;

    dot.className = 'cloud-dot ' + state;
    label.textContent = text;
}

// ----------------------------------------------------
// GOOGLE DRIVE SYNC ENGINE
// ----------------------------------------------------
async function getValidAccessToken(interactive = false) {
    if (driveAccessToken && Date.now() < driveTokenExpiresAt) {
        return driveAccessToken;
    }
    if (!interactive) {
        throw new Error('Token expirado. Conecte sua conta Google.');
    }
    return new Promise((resolve, reject) => {
        if (!googleTokenClient) {
            initGoogleAuth();
        }
        if (!googleTokenClient) {
            return reject(new Error('GIS não disponível'));
        }
        googleTokenClient.callback = (resp) => {
            if (resp && resp.access_token) {
                driveAccessToken = resp.access_token;
                const expiresIn = (resp.expires_in ? parseInt(resp.expires_in, 10) : 3600) * 1000;
                driveTokenExpiresAt = Date.now() + expiresIn;
                localStorage.setItem('autocare_drive_token', driveAccessToken);
                localStorage.setItem('autocare_drive_token_exp', String(driveTokenExpiresAt));
                resolve(driveAccessToken);
            } else {
                reject(new Error('Autorização cancelada'));
            }
        };
        googleTokenClient.requestAccessToken({ prompt: 'select_account' });
    });
}

// Find or Create 'AutoCare 4U' Folder on User's Drive
async function getOrCreateDriveFolder(token) {
    if (driveFolderId) {
        try {
            const check = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFolderId}?fields=id,trashed`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (check.ok) {
                const data = await check.json();
                if (!data.trashed) return driveFolderId;
            }
        } catch (_) {}
    }

    const q = encodeURIComponent(`name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
            driveFolderId = searchData.files[0].id;
            localStorage.setItem('autocare_drive_folder_id', driveFolderId);
            return driveFolderId;
        }
    }

    // Create new folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: DRIVE_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            description: 'Pasta oficial de dados e backups do AutoCare Pro 4U'
        })
    });

    if (createRes.ok) {
        const folder = await createRes.json();
        driveFolderId = folder.id;
        localStorage.setItem('autocare_drive_folder_id', driveFolderId);
        return driveFolderId;
    }

    throw new Error('Não foi possível criar a pasta no Google Drive');
}

// Find master autocare_dados.json inside the folder
async function findMasterDriveFile(token, folderId) {
    if (driveMasterFileId) {
        try {
            const check = await fetch(`https://www.googleapis.com/drive/v3/files/${driveMasterFileId}?fields=id,trashed`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (check.ok) {
                const data = await check.json();
                if (!data.trashed) return driveMasterFileId;
            }
        } catch (_) {}
    }

    const q = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and '${folderId}' in parents and trashed = false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
            driveMasterFileId = searchData.files[0].id;
            localStorage.setItem('autocare_drive_file_id', driveMasterFileId);
            return driveMasterFileId;
        }
    }

    return null;
}

// Full Sync: Merge remote with local and update Drive
window.syncWithGoogleDrive = async function(interactive = true) {
    if (isSyncing) return;
    if (!navigator.onLine) {
        if (interactive) showToast('Você está offline.', 'info');
        return;
    }

    let token = null;
    try {
        token = await getValidAccessToken(interactive);
    } catch (e) {
        if (interactive) showToast('Conecte sua Conta Google para sincronizar com o Drive.', 'info');
        return;
    }

    isSyncing = true;
    updateCloudBadge('syncing', 'Sincronizando...');

    try {
        const folderId = await getOrCreateDriveFolder(token);
        const fileId = await findMasterDriveFile(token, folderId);

        let remoteData = null;

        if (fileId) {
            // Download remote file
            const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (downloadRes.ok) {
                remoteData = await downloadRes.json();
            }
        }

        // Merge logic
        if (remoteData) {
            mergeRemoteData(remoteData);
        }

        // Upload latest payload to Drive
        const payload = {
            app: 'AutoCare Pro 4U',
            version: '2.0',
            updatedAt: new Date().toISOString(),
            data: appState
        };
        const payloadJson = JSON.stringify(payload, null, 2);

        if (fileId) {
            // Update existing file
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: payloadJson
            });
        } else {
            // Create new multipart file
            const metadata = {
                name: DRIVE_FILE_NAME,
                parents: [folderId],
                description: 'Banco de dados de veículos, manutenções e combustível AutoCare'
            };
            const boundary = '-------AutoCareDriveBoundary';
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";
            const multipartBody =
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                payloadJson +
                close_delim;

            const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: multipartBody
            });

            if (createRes.ok) {
                const newFile = await createRes.json();
                driveMasterFileId = newFile.id;
                localStorage.setItem('autocare_drive_file_id', driveMasterFileId);
            }
        }

        appState.settings.lastSync = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        localStorage.setItem('autocare_data', JSON.stringify(appState));
        
        updateCloudBadge('connected', `Sincronizado às ${appState.settings.lastSync}`);
        if (interactive) showToast('Dados sincronizados com o Google Drive!', 'success');
        updateUI();
    } catch (err) {
        console.error('Erro no sync do Google Drive:', err);
        updateCloudBadge('local', 'Erro no Drive');
        if (interactive) showToast('Erro ao sincronizar com Google Drive: ' + err.message, 'error');
    } finally {
        isSyncing = false;
    }
};

// Merge remote into local safely
function mergeRemoteData(remotePayload) {
    const rData = remotePayload.data || remotePayload;
    if (!rData) return;

    // Merge vehicles
    if (Array.isArray(rData.vehicles)) {
        const localMap = new Map(appState.vehicles.map(v => [v.id, v]));
        rData.vehicles.forEach(rv => {
            if (!localMap.has(rv.id)) {
                appState.vehicles.push(rv);
            }
        });
    }

    // Merge maintenance
    if (Array.isArray(rData.maintenance)) {
        const localMap = new Map(appState.maintenance.map(m => [m.id, m]));
        rData.maintenance.forEach(rm => {
            if (!localMap.has(rm.id)) {
                appState.maintenance.push(rm);
            }
        });
    }

    // Merge fuel
    if (Array.isArray(rData.fuel)) {
        const localMap = new Map(appState.fuel.map(f => [f.id, f]));
        rData.fuel.forEach(rf => {
            if (!localMap.has(rf.id)) {
                appState.fuel.push(rf);
            }
        });
    }

    // Merge alerts
    if (Array.isArray(rData.alerts)) {
        const localMap = new Map(appState.alerts.map(a => [a.id, a]));
        rData.alerts.forEach(ra => {
            if (!localMap.has(ra.id)) {
                appState.alerts.push(ra);
            }
        });
    }
}

// ----------------------------------------------------
// UI RENDERING & CONTROLLER
// ----------------------------------------------------
function updateUI() {
    updateDashboardMetrics();
    renderVehiclesList();
    renderMaintenanceList();
    renderFuelList();
    renderAlertsList();
    populateVehicleSelects();
    renderFlexCalc();
    renderReports();
}

function updateDashboardMetrics() {
    // Vehicles count
    const totalVehicles = appState.vehicles.length;
    document.getElementById('totalVehicles').textContent = totalVehicles;

    // Maintenance count
    const totalMaint = appState.maintenance.length;
    document.getElementById('totalMaintenance').textContent = totalMaint;

    // Total spent (fuel + maintenance)
    const maintTotal = appState.maintenance.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0);
    const fuelTotal = appState.fuel.reduce((sum, f) => sum + (parseFloat(f.totalCost) || 0), 0);
    const totalSpent = maintTotal + fuelTotal;
    document.getElementById('totalSpent').textContent = formatCurrency(totalSpent);

    // Pending alerts
    const pendingAlerts = getPendingAlertsCount();
    document.getElementById('pendingAlerts').textContent = pendingAlerts;
    
    // Sidebar badges
    const badgeEl = document.getElementById('sidebarAlertBadge');
    if (badgeEl) {
        if (pendingAlerts > 0) {
            badgeEl.textContent = pendingAlerts;
            badgeEl.classList.remove('hidden');
        } else {
            badgeEl.classList.add('hidden');
        }
    }

    // Cost per KM calculation
    const costPerKmEl = document.getElementById('costPerKm');
    if (costPerKmEl) {
        let totalKmTracked = 0;
        appState.vehicles.forEach(v => {
            const vFuel = appState.fuel.filter(f => f.vehicleId === v.id).sort((a,b) => a.km - b.km);
            if (vFuel.length >= 2) {
                totalKmTracked += (vFuel[vFuel.length - 1].km - vFuel[0].km);
            }
        });

        if (totalKmTracked > 0 && totalSpent > 0) {
            const costPerKm = (totalSpent / totalKmTracked).toFixed(2);
            costPerKmEl.textContent = `R$ ${costPerKm} / km`;
        } else {
            costPerKmEl.textContent = '-- / km';
        }
    }
}

// ----------------------------------------------------
// VEHICLES
// ----------------------------------------------------
function renderVehiclesList() {
    const container = document.getElementById('vehiclesContainer');
    const recentContainer = document.getElementById('recentVehiclesContainer');
    if (!container) return;

    if (appState.vehicles.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">🚗</div>
                <h4>Nenhum veículo cadastrado</h4>
                <p>Cadastre seu primeiro carro ou moto para começar a controlar manutenções e combustível.</p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn-primary" onclick="openModal('vehicleModal')">+ Cadastrar Veículo</button>
                    <button class="btn-secondary" onclick="loadDemoData()">⚡ Carregar Dados de Exemplo</button>
                </div>
            </div>
        `;
        if (recentContainer) {
            recentContainer.innerHTML = `<p class="empty-state">Nenhum veículo registrado ainda.</p>`;
        }
        return;
    }

    const cardsHtml = appState.vehicles.map(v => {
        const vMaint = appState.maintenance.filter(m => m.vehicleId === v.id);
        const vFuel = appState.fuel.filter(f => f.vehicleId === v.id);
        const totalMaintCost = vMaint.reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
        const totalFuelCost = vFuel.reduce((s, f) => s + (parseFloat(f.totalCost) || 0), 0);

        return `
            <div class="vehicle-card">
                <div>
                    <div class="vehicle-card-top">
                        <div class="vehicle-main-info">
                            <h3>${escapeHtml(v.brand)} ${escapeHtml(v.model)}</h3>
                            <div class="vehicle-sub">${escapeHtml(v.color || 'Cor não informada')} • Ano ${v.year} • ${v.fuelType || 'Flex'}</div>
                        </div>
                        <div class="plate-badge">
                            <div class="plate-header-mercosul">
                                <span>BRASIL</span>
                                <span>🇧🇷</span>
                            </div>
                            <div class="plate-number">${formatPlate(v.plate)}</div>
                        </div>
                    </div>

                    <div class="vehicle-stats-row">
                        <div class="v-stat-col">
                            <span>KM Atual</span>
                            <strong>${formatNumber(v.currentKm)} km</strong>
                        </div>
                        <div class="v-stat-col">
                            <span>Manutenções</span>
                            <strong>${vMaint.length}</strong>
                        </div>
                        <div class="v-stat-col">
                            <span>Total Gasto</span>
                            <strong style="color: var(--emerald-primary);">${formatCurrency(totalMaintCost + totalFuelCost)}</strong>
                        </div>
                    </div>
                </div>

                <div class="vehicle-card-actions">
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.78rem;" onclick="openDossierModal('${v.id}')">📄 Dossiê</button>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.78rem;" onclick="editVehicle('${v.id}')">✏️ Editar</button>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.78rem; margin-left: auto; color: var(--red-primary);" onclick="deleteVehicle('${v.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
    if (recentContainer) {
        recentContainer.innerHTML = cardsHtml;
    }
}

window.saveVehicleForm = function(e) {
    e.preventDefault();
    const id = document.getElementById('vehicleId').value;
    const brand = document.getElementById('vehicleBrand').value.trim();
    const model = document.getElementById('vehicleModel').value.trim();
    const year = parseInt(document.getElementById('vehicleYear').value, 10);
    const plate = formatPlate(document.getElementById('vehiclePlate').value.trim());
    const color = document.getElementById('vehicleColor').value.trim();
    const currentKm = parseInt(document.getElementById('vehicleKm').value, 10) || 0;
    const fuelType = document.getElementById('vehicleFuel').value;
    const notes = document.getElementById('vehicleNotes').value.trim();

    if (!brand || !model || !plate) {
        showToast('Preencha os campos obrigatórios.', 'error');
        return;
    }

    if (id) {
        // Edit
        const idx = appState.vehicles.findIndex(v => v.id === id);
        if (idx !== -1) {
            appState.vehicles[idx] = { ...appState.vehicles[idx], brand, model, year, plate, color, currentKm, fuelType, notes };
            showToast('Veículo atualizado!', 'success');
        }
    } else {
        // Create
        const newVehicle = {
            id: 'v-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
            brand,
            model,
            year,
            plate,
            color,
            currentKm,
            fuelType,
            notes
        };
        appState.vehicles.push(newVehicle);
        showToast('Veículo cadastrado!', 'success');
    }

    closeModal('vehicleModal');
    saveLocalData();
};

window.editVehicle = function(id) {
    const v = appState.vehicles.find(x => x.id === id);
    if (!v) return;

    document.getElementById('vehicleId').value = v.id;
    document.getElementById('vehicleBrand').value = v.brand;
    document.getElementById('vehicleModel').value = v.model;
    document.getElementById('vehicleYear').value = v.year;
    document.getElementById('vehiclePlate').value = v.plate;
    document.getElementById('vehicleColor').value = v.color || '';
    document.getElementById('vehicleKm').value = v.currentKm || '';
    document.getElementById('vehicleFuel').value = v.fuelType || 'Flex';
    document.getElementById('vehicleNotes').value = v.notes || '';
    document.getElementById('vehicleModalTitle').textContent = 'Editar Veículo';

    openModal('vehicleModal');
};

window.deleteVehicle = function(id) {
    const v = appState.vehicles.find(x => x.id === id);
    if (!v) return;

    if (confirm(`Excluir o veículo ${v.brand} ${v.model} (${v.plate}) e todos os seus registros de manutenção e abastecimento?`)) {
        appState.vehicles = appState.vehicles.filter(x => x.id !== id);
        appState.maintenance = appState.maintenance.filter(x => x.vehicleId !== id);
        appState.fuel = appState.fuel.filter(x => x.vehicleId !== id);
        appState.alerts = appState.alerts.filter(x => x.vehicleId !== id);
        saveLocalData();
        showToast('Veículo removido com sucesso.', 'info');
    }
};

// ----------------------------------------------------
// MAINTENANCE
// ----------------------------------------------------
function renderMaintenanceList() {
    const container = document.getElementById('maintenanceTableBody');
    const upcomingContainer = document.getElementById('upcomingMaintenanceContainer');
    if (!container) return;

    if (appState.maintenance.length === 0) {
        container.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhuma manutenção cadastrada.</td></tr>`;
        if (upcomingContainer) {
            upcomingContainer.innerHTML = `<p class="empty-state">Nenhuma manutenção pendente.</p>`;
        }
        return;
    }

    const filterVehicleId = document.getElementById('filterMaintVehicle')?.value || '';
    const filterType = document.getElementById('filterMaintType')?.value || '';

    let list = [...appState.maintenance].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filterVehicleId) {
        list = list.filter(m => m.vehicleId === filterVehicleId);
    }
    if (filterType) {
        list = list.filter(m => m.type === filterType);
    }

    container.innerHTML = list.map(m => {
        const vehicle = appState.vehicles.find(v => v.id === m.vehicleId);
        const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plate})` : 'Veículo Desconhecido';

        return `
            <tr>
                <td><strong>${formatDate(m.date)}</strong></td>
                <td>${escapeHtml(vehicleName)}</td>
                <td><span class="status-pill status-ok">${escapeHtml(m.type)}</span></td>
                <td>${formatNumber(m.km)} km</td>
                <td><strong style="color: var(--emerald-primary);">${formatCurrency(m.cost)}</strong></td>
                <td>${escapeHtml(m.workshop || '--')}</td>
                <td>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.72rem; color: var(--red-primary);" onclick="deleteMaintenance('${m.id}')">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    // Render upcoming
    if (upcomingContainer) {
        const upcomingAlerts = appState.alerts.filter(a => !a.completed).slice(0, 4);
        if (upcomingAlerts.length === 0) {
            upcomingContainer.innerHTML = `<p class="empty-state" style="padding: 20px;">Tudo em dia! Nenhuma manutenção pendente.</p>`;
        } else {
            upcomingContainer.innerHTML = upcomingAlerts.map(a => {
                const v = appState.vehicles.find(x => x.id === a.vehicleId);
                const triggerText = a.triggerType === 'km' ? `Em ${formatNumber(a.triggerValue)} km` : `Data: ${formatDate(a.triggerValue)}`;
                return `
                    <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <strong style="font-size: 0.88rem; color: #fff;">${escapeHtml(a.title)}</strong>
                            <span class="status-pill status-warn">${triggerText}</span>
                        </div>
                        <p style="font-size: 0.75rem; color: var(--text-muted);">${v ? `${v.brand} ${v.model} (${v.plate})` : ''}</p>
                    </div>
                `;
            }).join('');
        }
    }
}

window.saveMaintenanceForm = function(e) {
    e.preventDefault();
    const vehicleId = document.getElementById('maintVehicle').value;
    const type = document.getElementById('maintType').value;
    const date = document.getElementById('maintDate').value;
    const km = parseInt(document.getElementById('maintKm').value, 10) || 0;
    const cost = parseFloat(document.getElementById('maintCost').value) || 0;
    const workshop = document.getElementById('maintWorkshop').value.trim();
    const notes = document.getElementById('maintNotes').value.trim();

    if (!vehicleId || !type || !date) {
        showToast('Preencha os campos obrigatórios.', 'error');
        return;
    }

    const newMaint = {
        id: 'm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        vehicleId,
        type,
        date,
        km,
        cost,
        workshop,
        notes
    };

    appState.maintenance.push(newMaint);

    // Update vehicle km if greater
    const v = appState.vehicles.find(x => x.id === vehicleId);
    if (v && km > (v.currentKm || 0)) {
        v.currentKm = km;
    }

    closeModal('maintenanceModal');
    saveLocalData();
    showToast('Manutenção registrada com sucesso!', 'success');
};

window.deleteMaintenance = function(id) {
    if (confirm('Deseja excluir este registro de manutenção?')) {
        appState.maintenance = appState.maintenance.filter(m => m.id !== id);
        saveLocalData();
        showToast('Manutenção excluída.', 'info');
    }
};

// ----------------------------------------------------
// FUELING (ABASTECIMENTOS)
// ----------------------------------------------------
function renderFuelList() {
    const container = document.getElementById('fuelTableBody');
    if (!container) return;

    // Calculate overall fuel metrics
    const totalLiters = appState.fuel.reduce((sum, f) => sum + (parseFloat(f.liters) || 0), 0);
    const totalFuelCost = appState.fuel.reduce((sum, f) => sum + (parseFloat(f.totalCost) || 0), 0);
    
    document.getElementById('totalFuelSpent').textContent = formatCurrency(totalFuelCost);
    document.getElementById('totalFuelLiters').textContent = `${totalLiters.toFixed(1)} L`;

    // Calculate consumption (km/l)
    let totalKmTraveled = 0;
    let totalLitersForAvg = 0;
    
    appState.vehicles.forEach(v => {
        const vFuel = appState.fuel.filter(f => f.vehicleId === v.id && f.fullTank).sort((a,b) => a.km - b.km);
        if (vFuel.length >= 2) {
            for (let i = 1; i < vFuel.length; i++) {
                const kmDiff = vFuel[i].km - vFuel[i-1].km;
                if (kmDiff > 0 && vFuel[i].liters > 0) {
                    totalKmTraveled += kmDiff;
                    totalLitersForAvg += vFuel[i].liters;
                }
            }
        }
    });

    const avgKmL = (totalKmTraveled > 0 && totalLitersForAvg > 0) ? (totalKmTraveled / totalLitersForAvg).toFixed(1) : '--';
    document.getElementById('avgConsumption').textContent = `${avgKmL} km/l`;

    if (appState.fuel.length === 0) {
        container.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhum abastecimento registrado.</td></tr>`;
        return;
    }

    const sortedFuel = [...appState.fuel].sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = sortedFuel.map(f => {
        const v = appState.vehicles.find(x => x.id === f.vehicleId);
        const vName = v ? `${v.brand} ${v.model}` : 'Veículo Desconhecido';

        return `
            <tr>
                <td><strong>${formatDate(f.date)}</strong></td>
                <td>${escapeHtml(vName)}</td>
                <td><span class="status-pill status-ok">${escapeHtml(f.fuelType)}</span></td>
                <td>${formatNumber(f.km)} km</td>
                <td>${f.liters.toFixed(2)} L</td>
                <td>${formatCurrency(f.pricePerLiter)}</td>
                <td><strong style="color: var(--emerald-primary);">${formatCurrency(f.totalCost)}</strong></td>
                <td>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.72rem; color: var(--red-primary);" onclick="deleteFuel('${f.id}')">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.saveFuelForm = function(e) {
    e.preventDefault();
    const vehicleId = document.getElementById('fuelVehicle').value;
    const date = document.getElementById('fuelDate').value;
    const km = parseInt(document.getElementById('fuelKm').value, 10) || 0;
    const liters = parseFloat(document.getElementById('fuelLiters').value) || 0;
    const pricePerLiter = parseFloat(document.getElementById('fuelPrice').value) || 0;
    const fuelType = document.getElementById('fuelType').value;
    const station = document.getElementById('fuelStation').value.trim();
    const fullTank = document.getElementById('fuelFullTank').checked;

    if (!vehicleId || !date || liters <= 0 || pricePerLiter <= 0) {
        showToast('Preencha os valores de litros e preço.', 'error');
        return;
    }

    const totalCost = liters * pricePerLiter;

    const newFuel = {
        id: 'f-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        vehicleId,
        date,
        km,
        liters,
        pricePerLiter,
        totalCost,
        fuelType,
        station,
        fullTank
    };

    appState.fuel.push(newFuel);

    // Update vehicle km if greater
    const v = appState.vehicles.find(x => x.id === vehicleId);
    if (v && km > (v.currentKm || 0)) {
        v.currentKm = km;
    }

    closeModal('fuelModal');
    saveLocalData();
    showToast('Abastecimento registrado com sucesso!', 'success');
};

window.deleteFuel = function(id) {
    if (confirm('Deseja excluir este abastecimento?')) {
        appState.fuel = appState.fuel.filter(f => f.id !== id);
        saveLocalData();
        showToast('Abastecimento excluído.', 'info');
    }
};

// ----------------------------------------------------
// CALCULADORA FLEX (ETANOL VS GASOLINA)
// ----------------------------------------------------
function renderFlexCalc() {
    const ethanolInput = document.getElementById('calcPriceEthanol');
    const gasInput = document.getElementById('calcPriceGas');
    if (!ethanolInput || !gasInput) return;

    const ethanol = parseFloat(ethanolInput.value) || 0;
    const gas = parseFloat(gasInput.value) || 0;

    const ratioDisplay = document.getElementById('calcRatioDisplay');
    const verdictTitle = document.getElementById('calcVerdictTitle');
    const verdictDesc = document.getElementById('calcVerdictDesc');

    if (ethanol <= 0 || gas <= 0) {
        if (ratioDisplay) ratioDisplay.textContent = '0%';
        if (verdictTitle) verdictTitle.textContent = 'Informe os Preços na Bomba';
        if (verdictDesc) verdictDesc.textContent = 'Digite o preço do litro do Etanol e da Gasolina para comparar.';
        return;
    }

    const ratio = (ethanol / gas) * 100;
    if (ratioDisplay) ratioDisplay.textContent = `${ratio.toFixed(1)}%`;

    if (ratio <= 70.0) {
        if (verdictTitle) {
            verdictTitle.textContent = '🌿 ABASTEÇA COM ETANOL (ÁLCOOL)';
            verdictTitle.style.color = 'var(--emerald-primary)';
        }
        const savingsEst = ((gas * 0.7 - ethanol) * 50).toFixed(2);
        if (verdictDesc) {
            verdictDesc.textContent = `O Etanol está custando ${ratio.toFixed(1)}% da Gasolina (abaixo de 70%). Economia estimada de até R$ ${savingsEst} por tanque de 50L!`;
        }
    } else {
        if (verdictTitle) {
            verdictTitle.textContent = '⛽ ABASTEÇA COM GASOLINA';
            verdictTitle.style.color = 'var(--cyan-primary)';
        }
        if (verdictDesc) {
            verdictDesc.textContent = `O Etanol está custando ${ratio.toFixed(1)}% da Gasolina (acima da barreira de 70%). A Gasolina rende mais e vale mais a pena.`;
        }
    }
}

// ----------------------------------------------------
// ALERTS & NOTIFICATIONS
// ----------------------------------------------------
function renderAlertsList() {
    const container = document.getElementById('alertsContainer');
    if (!container) return;

    if (appState.alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔔</div>
                <h4>Nenhum alerta configurado</h4>
                <p>Crie alertas para nunca perder a data ou quilometragem da troca de óleo, pastilhas, correia ou IPVA.</p>
                <button class="btn-primary" onclick="openModal('alertModal')">+ Criar Alerta</button>
            </div>
        `;
        return;
    }

    container.innerHTML = appState.alerts.map(a => {
        const v = appState.vehicles.find(x => x.id === a.vehicleId);
        const status = evaluateAlertStatus(a, v);

        return `
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                        <strong style="color: #fff; font-size: 1rem;">${escapeHtml(a.title)}</strong>
                        <span class="status-pill ${status.class}">${status.text}</span>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">${v ? `${v.brand} ${v.model} (${v.plate})` : 'Todos os veículos'} • ${escapeHtml(a.description || '')}</p>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.78rem;" onclick="toggleAlertComplete('${a.id}')">${a.completed ? '↩️ Reabrir' : '✅ Concluir'}</button>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.78rem; color: var(--red-primary);" onclick="deleteAlert('${a.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function evaluateAlertStatus(alert, vehicle) {
    if (alert.completed) {
        return { text: 'Concluído', class: 'status-ok' };
    }

    if (alert.triggerType === 'km') {
        const targetKm = parseInt(alert.triggerValue, 10);
        const currentKm = vehicle ? (vehicle.currentKm || 0) : 0;
        const diff = targetKm - currentKm;

        if (diff <= 0) {
            return { text: `Vencido (${Math.abs(diff)} km atrás)`, class: 'status-danger' };
        } else if (diff <= 1000) {
            return { text: `Próximo (em ${diff} km)`, class: 'status-warn' };
        } else {
            return { text: `Faltam ${diff} km`, class: 'status-ok' };
        }
    } else {
        const targetDate = new Date(alert.triggerValue);
        const today = new Date();
        const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { text: `Vencido há ${Math.abs(diffDays)} dias`, class: 'status-danger' };
        } else if (diffDays <= 15) {
            return { text: `Vence em ${diffDays} dias`, class: 'status-warn' };
        } else {
            return { text: `Vence em ${diffDays} dias`, class: 'status-ok' };
        }
    }
}

function getPendingAlertsCount() {
    return appState.alerts.filter(a => {
        if (a.completed) return false;
        const v = appState.vehicles.find(x => x.id === a.vehicleId);
        const st = evaluateAlertStatus(a, v);
        return st.class === 'status-danger' || st.class === 'status-warn';
    }).length;
}

function checkAlertsStatus() {
    const pending = getPendingAlertsCount();
    if (pending > 0) {
        showToast(`Você tem ${pending} alerta(s) de manutenção pendente(s)!`, 'info');
    }
}

window.saveAlertForm = function(e) {
    e.preventDefault();
    const vehicleId = document.getElementById('alertVehicle').value;
    const title = document.getElementById('alertTitle').value.trim();
    const triggerType = document.querySelector('input[name="alertTrigger"]:checked')?.value || 'km';
    const triggerValue = triggerType === 'km' 
        ? parseInt(document.getElementById('alertKmValue').value, 10)
        : document.getElementById('alertDateValue').value;
    const description = document.getElementById('alertDesc').value.trim();

    if (!vehicleId || !title || !triggerValue) {
        showToast('Preencha todos os campos do alerta.', 'error');
        return;
    }

    const newAlert = {
        id: 'a-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        vehicleId,
        title,
        triggerType,
        triggerValue,
        description,
        completed: false
    };

    appState.alerts.push(newAlert);
    closeModal('alertModal');
    saveLocalData();
    showToast('Alerta cadastrado!', 'success');
};

window.toggleAlertComplete = function(id) {
    const a = appState.alerts.find(x => x.id === id);
    if (a) {
        a.completed = !a.completed;
        saveLocalData();
    }
};

window.deleteAlert = function(id) {
    if (confirm('Excluir este alerta?')) {
        appState.alerts = appState.alerts.filter(a => a.id !== id);
        saveLocalData();
        showToast('Alerta removido.', 'info');
    }
};

// ----------------------------------------------------
// REPORTS & CHARTS
// ----------------------------------------------------
function renderReports() {
    const monthlyContainer = document.getElementById('monthlyBarChart');
    if (!monthlyContainer) return;

    // Last 6 months breakdown
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleDateString('pt-BR', { month: 'short' })
        });
    }

    const monthlyValues = months.map(m => {
        const mCost = appState.maintenance
            .filter(x => x.date && x.date.startsWith(m.key))
            .reduce((s, x) => s + (parseFloat(x.cost) || 0), 0);
        const fCost = appState.fuel
            .filter(x => x.date && x.date.startsWith(m.key))
            .reduce((s, x) => s + (parseFloat(x.totalCost) || 0), 0);
        return mCost + fCost;
    });

    const maxVal = Math.max(...monthlyValues, 100);

    monthlyContainer.innerHTML = monthlyValues.map((val, i) => {
        const heightPct = Math.max((val / maxVal) * 100, 6);
        return `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%;">
                <span style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 6px; font-family: var(--font-mono);">R$${Math.round(val)}</span>
                <div style="width: 100%; max-width: 48px; height: ${heightPct}%; background: linear-gradient(180deg, var(--emerald-primary), #059669); border-radius: 6px 6px 0 0; transition: height 0.4s ease;"></div>
                <span style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 8px; font-weight: 600;">${months[i].label}</span>
            </div>
        `;
    }).join('');
}

// ----------------------------------------------------
// DOSSIÊ DO VEÍCULO (REVENDAS / HISTÓRICO IMPRESSO)
// ----------------------------------------------------
window.openDossierModal = function(vehicleId) {
    const v = appState.vehicles.find(x => x.id === vehicleId);
    if (!v) return;

    const vMaint = appState.maintenance.filter(m => m.vehicleId === v.id).sort((a,b) => new Date(b.date) - new Date(a.date));
    const vFuel = appState.fuel.filter(f => f.vehicleId === v.id);
    const totalSpent = vMaint.reduce((s, m) => s + (parseFloat(m.cost) || 0), 0) + vFuel.reduce((s, f) => s + (parseFloat(f.totalCost) || 0), 0);

    document.getElementById('dossierModalTitle').textContent = `Dossiê de Procedência: ${v.brand} ${v.model}`;
    document.getElementById('dossierContent').innerHTML = `
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; background: rgba(255,255,255,0.02); margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h2 style="font-size: 1.4rem; color: #fff; margin-bottom: 4px;">${escapeHtml(v.brand)} ${escapeHtml(v.model)}</h2>
                    <p style="color: var(--text-muted); font-size: 0.85rem;">Ano ${v.year} • Cor: ${escapeHtml(v.color || '--')} • Combustível: ${v.fuelType}</p>
                </div>
                <div class="plate-badge">
                    <div class="plate-header-mercosul"><span>BRASIL</span><span>🇧🇷</span></div>
                    <div class="plate-number">${formatPlate(v.plate)}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center; border-top: 1px solid var(--border-color); padding-top: 14px;">
                <div><span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Odômetro Atual</span><strong style="font-size: 1.1rem; color: #fff;">${formatNumber(v.currentKm)} km</strong></div>
                <div><span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Revisões Registradas</span><strong style="font-size: 1.1rem; color: #fff;">${vMaint.length}</strong></div>
                <div><span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Investimento Total</span><strong style="font-size: 1.1rem; color: var(--emerald-primary);">${formatCurrency(totalSpent)}</strong></div>
            </div>
        </div>

        <h4 style="font-size: 1rem; color: #fff; margin-bottom: 12px;">Histórico Cronológico de Manutenções</h4>
        <div class="data-table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Serviço / Manutenção</th>
                        <th>Quilometragem</th>
                        <th>Oficina / Estabelecimento</th>
                        <th>Valor</th>
                    </tr>
                </thead>
                <tbody>
                    ${vMaint.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: 20px;">Nenhuma manutenção registrada para este veículo.</td></tr>' : vMaint.map(m => `
                        <tr>
                            <td>${formatDate(m.date)}</td>
                            <td><strong>${escapeHtml(m.type)}</strong></td>
                            <td>${formatNumber(m.km)} km</td>
                            <td>${escapeHtml(m.workshop || '--')}</td>
                            <td>${formatCurrency(m.cost)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    openModal('dossierModal');
};

window.printDossier = function() {
    window.print();
};

// ----------------------------------------------------
// DEMO DATA & BACKUP ENGINE
// ----------------------------------------------------
window.loadDemoData = function(skipConfirm = false) {
    if (!skipConfirm && appState.vehicles.length > 0) {
        if (!confirm('Carregar os dados de demonstração adicionará veículos e manutenções de exemplo. Deseja continuar?')) {
            return;
        }
    }
    appState = JSON.parse(JSON.stringify(DEMO_DATA));
    saveLocalData();
    showToast('Dados de demonstração carregados com sucesso!', 'success');
};

window.exportBackupJSON = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `autocare_backup_${new Date().toISOString().slice(0,10)}.json`);
    dlAnchor.click();
    showToast('Arquivo de backup exportado!', 'success');
};

window.importBackupJSON = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const parsed = JSON.parse(evt.target.result);
            const dataToLoad = parsed.data || parsed;
            if (dataToLoad.vehicles) {
                appState.vehicles = dataToLoad.vehicles;
                appState.maintenance = dataToLoad.maintenance || [];
                appState.fuel = dataToLoad.fuel || [];
                appState.alerts = dataToLoad.alerts || [];
                saveLocalData();
                showToast('Backup importado com sucesso!', 'success');
            } else {
                showToast('Formato de arquivo de backup inválido.', 'error');
            }
        } catch (err) {
            showToast('Erro ao ler arquivo JSON: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

window.exportCSV = function() {
    let csv = "\uFEFF"; // UTF-8 BOM
    csv += "TIPO,DATA,VEICULO,DESCRICAO/TIPO,KM,LITROS,VALOR_TOTAL,LOCAL/POSTO\n";

    appState.maintenance.forEach(m => {
        const v = appState.vehicles.find(x => x.id === m.vehicleId);
        const vPlate = v ? v.plate : '';
        csv += `MANUTENÇÃO,${m.date},"${vPlate}","${m.type}",${m.km},,${m.cost},"${m.workshop || ''}"\n`;
    });

    appState.fuel.forEach(f => {
        const v = appState.vehicles.find(x => x.id === f.vehicleId);
        const vPlate = v ? v.plate : '';
        csv += `COMBUSTÍVEL,${f.date},"${vPlate}","${f.fuelType}",${f.km},${f.liters},${f.totalCost},"${f.station || ''}"\n`;
    });

    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `autocare_relatorio_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Planilha CSV exportada!', 'success');
};

window.clearAllData = function() {
    if (confirm('ATENÇÃO: Deseja apagar TODOS os seus veículos, manutenções e abastecimentos? Esta ação não pode ser desfeita.')) {
        appState = {
            vehicles: [],
            maintenance: [],
            fuel: [],
            alerts: [],
            settings: { currency: 'BRL', lastSync: null }
        };
        saveLocalData();
        showToast('Todos os dados foram apagados.', 'info');
    }
};

// ----------------------------------------------------
// NAVIGATION & MODALS
// ----------------------------------------------------
window.showSection = function(sectionId) {
    document.querySelectorAll('.app-section').forEach(sec => sec.style.display = 'none');
    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';

    // Update desktop sidebar items
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.section === sectionId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update mobile bottom bar items
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        if (btn.dataset.section === sectionId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Close mobile drawer if open
    document.getElementById('sidebar')?.classList.remove('open');
};

window.toggleSidebar = function() {
    document.getElementById('sidebar')?.classList.toggle('open');
};

window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
};

function populateVehicleSelects() {
    const selects = ['maintVehicle', 'fuelVehicle', 'alertVehicle', 'filterMaintVehicle'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentVal = select.value;
        const isFilter = id.startsWith('filter');

        let html = isFilter ? '<option value="">Todos os veículos</option>' : '<option value="">Selecione um veículo</option>';
        html += appState.vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.brand)} ${escapeHtml(v.model)} (${v.plate})</option>`).join('');
        
        select.innerHTML = html;
        if (currentVal) select.value = currentVal;
    });
}

function setupEventListeners() {
    // Alert trigger type toggle
    document.querySelectorAll('input[name="alertTrigger"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isKm = e.target.value === 'km';
            document.getElementById('alertKmGroup').style.display = isKm ? 'block' : 'none';
            document.getElementById('alertDateGroup').style.display = isKm ? 'none' : 'block';
        });
    });

    // Plate uppercase formatting
    const plateInput = document.getElementById('vehiclePlate');
    if (plateInput) {
        plateInput.addEventListener('input', (e) => {
            e.target.value = formatPlate(e.target.value);
        });
    }

    // Modal background click to close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });
}

// ----------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------
function formatPlate(str) {
    if (!str) return '';
    let clean = str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length > 7) clean = clean.substring(0, 7);
    if (clean.length > 3) {
        return clean.substring(0, 3) + '-' + clean.substring(3);
    }
    return clean;
}

function formatNumber(num) {
    return (num || 0).toLocaleString('pt-BR');
}

function formatCurrency(val) {
    return 'R$ ' + (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(msg)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}
