// --- AUTO SYNC (GITHUB & LOCAL DATA) INTERCEPTOR ---
const originalInvoke = ipcRenderer.invoke;
ipcRenderer.invoke = async function(channel, ...args) {
    const result = await originalInvoke.apply(this, [channel, ...args]);
    
    // Veritabanını değiştiren işlemler listesi
    const modifyingChannels = [
        'update-daire-info', 'set-aidat-tanimi', 'delete-aidat-tanimi', 
        'delete-all-aidat-tanimlari', 'add-ekstra-odeme', 'delete-ekstra-odeme',
        'set-aidat-odeme-durumu', 'add-gider', 'update-gider', 'set-gider-durum', 
        'delete-gider', 'save-ayarlar', 'add-aidat', 'update-aidat-durum'
    ];
    
    if (modifyingChannels.includes(channel)) {
        // İşlem bittikten sonra arkada otomatik olarak GitHub ve local docs'a sync et
        originalInvoke.apply(this, ['publish-to-github']).then(res => {
            if (res && !res.success && res.error && !res.error.includes("ayarlanmamış")) {
                console.error("Auto GitHub Sync Hatası:", res.error);
            } else if (res && res.success) {
                console.log("Değişiklikler başarıyla GitHub'a otomatik yüklendi!");
            }
        }).catch(err => console.error("Auto Sync tetiklenemedi:", err));
    }
    
    return result;
};
// ---------------------------------------------------

let currentDaireId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Mini Takvimi Oluştur
    renderMiniCalendar();

    // Navigasyon Mantığı
    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            link.classList.add('active');
            const target = link.getAttribute('data-target');
            document.getElementById(target).classList.add('active');
            
            // Eğer harita sekmesine geçildiyse, haritanın render sorununu çözmek için
            if (target === 'harita' && window.myMap) {
                setTimeout(() => {
                    window.myMap.invalidateSize();
                }, 100);
            }
        });
    });

    window.initializeApp = function() {
        const sessionRole = sessionStorage.getItem('userRole');
        const sessionDaireId = sessionStorage.getItem('userDaireId');
        
        if (!sessionRole) {
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('app-container').style.display = 'none';
            return;
        }

        // Role-based UI
        if (sessionRole === 'sakin') {
            const sakinAd = sessionStorage.getItem('sakin_ad');
            document.getElementById('user-role-badge').innerText = sakinAd ? `Hoş Geldin ${sakinAd}` : 'Daire Sakini';
            
            document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.sakin-only').forEach(el => el.classList.remove('hidden'));
            
            document.getElementById('daire-secimi-container')?.style.setProperty('display', 'none');
            document.getElementById('yeni-aidat-btn')?.style.setProperty('display', 'none');
            document.getElementById('sakin-bilgi')?.style.setProperty('display', 'none');
            
            currentDaireId = sessionDaireId;
            
            // Sakin-specific initializations
            loadSakinPano();
            loadSakinOdemelerim(sessionDaireId);
            loadSakinGiderler();
            
            setTimeout(() => document.getElementById('nav-harita').click(), 50);
            
        } else {
            document.getElementById('user-role-badge').innerText = 'Yönetici';
            
            // Remove hidden from all admin-only elements to ensure they are visible
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.sakin-only').forEach(el => el.classList.add('hidden'));
            
            document.getElementById('duzenle-sakin-btn').classList.remove('hidden');
            const btnTopluMailOdeyenler = document.getElementById('btn-toplu-mail-odiyenler');
            if (btnTopluMailOdeyenler) btnTopluMailOdeyenler.classList.remove('hidden');
            const btnTopluMailBorclular = document.getElementById('btn-toplu-mail-borclular');
            if (btnTopluMailBorclular) btnTopluMailBorclular.classList.remove('hidden');
            
            // Revert inline styles in case they were set
            document.getElementById('daire-secimi-container')?.style.removeProperty('display');
            document.getElementById('yeni-aidat-btn')?.style.removeProperty('display');
            document.getElementById('sakin-bilgi')?.style.removeProperty('display');
            
            const aidatNav = document.getElementById('nav-aidatayarlari');
            if (aidatNav) aidatNav.classList.remove('hidden');
            
            loadDashboard();
            loadDaireler();
            initGelirGiderTab();
            loadAyarlar();

            setTimeout(() => document.getElementById('nav-dashboard').click(), 50);
        }
    };

    // İlk açılışta session varsa hemen initialize et
    if (sessionStorage.getItem('userRole')) {
        window.initializeApp();
    } else {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('app-container').style.display = 'none';
    }

    // Çıkış Yap
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.clear();
        window.location.reload();
    });

    // Ana Sayfa Butonu
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            const role = sessionStorage.getItem('userRole');
            if (role === 'sakin') {
                document.getElementById('nav-harita').click();
            } else {
                document.getElementById('nav-dashboard').click();
            }
        });
    }

    // Toplu Mail Gönder İşlemleri
    const btnTopluMailOdeyenler = document.getElementById('btn-toplu-mail-odiyenler');
    if (btnTopluMailOdeyenler) {
        btnTopluMailOdeyenler.addEventListener('click', () => sendBulkMail('odeyenler'));
    }
    const btnTopluMailBorclular = document.getElementById('btn-toplu-mail-borclular');
    if (btnTopluMailBorclular) {
        btnTopluMailBorclular.addEventListener('click', () => sendBulkMail('borclular'));
    }

    // Sakin Seçimi Değiştiğinde
    document.getElementById('daire-select').addEventListener('change', (e) => {
        currentDaireId = e.target.value;
        if (currentDaireId) {
            loadSakinBilgi(currentDaireId);
            loadAidatGecmisi(currentDaireId);
        } else {
            document.getElementById('sakin-bilgi').classList.add('hidden');
            document.getElementById('aidat-tbody').innerHTML = '';
        }
    });



    // Sakin Düzenle İşlemleri
    document.getElementById('duzenle-sakin-btn').addEventListener('click', () => {
        if (!currentDaireId || !window.daireListesi) return;
        const daire = window.daireListesi.find(d => d.id == currentDaireId);
        if (daire) {
            document.getElementById('edit-ad').value = daire.sakin_ad || '';
            document.getElementById('edit-telefon').value = daire.sakin_telefon || '';
            document.getElementById('edit-mail').value = daire.sakin_mail || '';
            document.getElementById('edit-username').value = daire.username || '';
            document.getElementById('edit-password').value = daire.password || '';
            document.getElementById('edit-il').value = daire.il || '';
            document.getElementById('edit-ilce').value = daire.ilce || '';
            document.getElementById('edit-mahalle').value = daire.mahalle || '';
            document.getElementById('edit-adano').value = daire.adano || '';
            document.getElementById('edit-parselno').value = daire.parselno || '';
            document.getElementById('edit-sakin-form').classList.remove('hidden');
            
            // Scroll sayfayı formun olduğu yere indir
            setTimeout(() => {
                document.getElementById('edit-sakin-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    });

    document.getElementById('iptal-sakin-btn').addEventListener('click', () => {
        document.getElementById('edit-sakin-form').classList.add('hidden');
    });

    document.getElementById('kaydet-sakin-btn').addEventListener('click', async () => {
        if (!currentDaireId) return;

        let telefonInput = document.getElementById('edit-telefon').value.replace(/\s+/g, '').trim();
        const mailInput = document.getElementById('edit-mail').value.trim();

        if (telefonInput && telefonInput.length !== 10) {
            alert('Lütfen telefonu tam 10 haneli olacak şekilde (başında 0 olmadan) giriniz. Örn: 532 123 4567');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (mailInput && !emailRegex.test(mailInput)) {
            alert('Lütfen geçerli bir e-posta adresi giriniz.');
            return;
        }

        const updatedData = {
            id: currentDaireId,
            sakin_ad: document.getElementById('edit-ad').value,
            sakin_telefon: telefonInput,
            sakin_mail: document.getElementById('edit-mail').value,
            username: document.getElementById('edit-username').value,
            password: document.getElementById('edit-password').value,
            il: document.getElementById('edit-il').value,
            ilce: document.getElementById('edit-ilce').value,
            mahalle: document.getElementById('edit-mahalle').value,
            adano: document.getElementById('edit-adano').value,
            parselno: document.getElementById('edit-parselno').value
        };

        const fileInput = document.getElementById('edit-koord-dosya');
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const base64File = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
            updatedData.koordinat_dosyasi = base64File;
            updatedData.koordinat_formati = document.querySelector('input[name="koord-format"]:checked').value;
        }

        try {
            await ipcRenderer.invoke('update-daire-info', updatedData);
            document.getElementById('edit-sakin-form').classList.add('hidden');
            await loadDaireler();
            // Restore current daire selection
            document.getElementById('daire-select').value = currentDaireId;
            loadSakinBilgi(currentDaireId);
            
            // Haritadaki parselleri yenile
            if (window.loadParcelsToMap) {
                window.loadParcelsToMap();
            }
        } catch (err) {
            console.error("Güncelleme hatası", err);
            alert("Bilgiler güncellenirken bir hata oluştu.");
        }
    });

    document.getElementById('yeni-gider-btn').addEventListener('click', () => {
        window.editingGiderId = null;
        document.getElementById('gider-tarih').value = '';
        document.getElementById('gider-aciklama').value = '';
        document.getElementById('gider-tutar').value = '';
        document.getElementById('gider-modal-title').innerText = 'Yeni Gider Ekle';
        document.getElementById('yeni-gider-form').classList.remove('hidden');
    });

    document.getElementById('iptal-gider-btn').addEventListener('click', () => {
        document.getElementById('yeni-gider-form').classList.add('hidden');
    });

    document.getElementById('kaydet-gider-btn').addEventListener('click', async () => {
        const tarih = document.getElementById('gider-tarih').value;
        const aciklama = document.getElementById('gider-aciklama').value;
        const tutar = document.getElementById('gider-tutar').value;
        const faturaInput = document.getElementById('gider-fatura');

        if (!tarih || !aciklama || !tutar) {
            alert('Lütfen tüm gider alanlarını doldurun!');
            return;
        }

        try {
            let fatura_dosyasi = undefined;
            if (faturaInput && faturaInput.files.length > 0) {
                const file = faturaInput.files[0];
                fatura_dosyasi = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });
            }

            if (window.editingGiderId) {
                await ipcRenderer.invoke('update-gider', {
                    id: window.editingGiderId,
                    tarih: tarih,
                    aciklama: aciklama,
                    tutar: parseFloat(tutar),
                    fatura_dosyasi: fatura_dosyasi
                });
                window.editingGiderId = null;
            } else {
                await ipcRenderer.invoke('add-gider', {
                    tarih: tarih,
                    aciklama: aciklama,
                    tutar: parseFloat(tutar),
                    fatura_dosyasi: fatura_dosyasi !== undefined ? fatura_dosyasi : null
                });
            }
            
            document.getElementById('yeni-gider-form').classList.add('hidden');
            if(faturaInput) faturaInput.value = ''; // reset file input
            loadGelirGiderTab();
            if (sessionStorage.getItem('userRole') === 'yonetici') loadDashboard();
        } catch (err) {
            console.error("Gider ekleme hatası:", err);
            alert('Gider eklenirken hata oluştu: ' + err.message);
        }
    });
});

// Helper
function formatMoney(amount) {
    if(amount === undefined || amount === null) amount = 0;
    return Number(amount).toLocaleString('tr-TR') + " ₺";
}

// Mini Takvim Render
function renderMiniCalendar() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentYear = today.getFullYear();
    
    const calContainer = document.getElementById('mini-calendar');
    if(calContainer) {
        let options = '';
        for (let y = currentYear - 5; y <= currentYear + 5; y++) {
            options += `<option value="${y}" ${y === currentYear ? 'selected' : ''} style="color: black;">${y}</option>`;
        }
        calContainer.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:5px; padding:5px;">
                <select id="widget-year-picker" class="form-control" style="background:rgba(255,255,255,0.1); border:none; color:white; font-size:12px; height: 30px; margin-top:5px; padding:0 5px;">
                    ${options}
                </select>
            </div>
        `;
        
        document.getElementById('widget-year-picker').addEventListener('change', (e) => {
            const val = e.target.value; // YYYY
            if(val) {
                loadDashboard(parseInt(val));
            }
        });
    }
}

async function loadDashboard(year, month) {
    try {
        const stats = await ipcRenderer.invoke('get-dashboard-stats', {year, month});
        
        document.getElementById('stat-total-daire').innerText = stats.totalDaire;
        
        const odemeyenEl = document.getElementById('stat-odemeyen');
        odemeyenEl.innerText = stats.odemeyen;
        odemeyenEl.style.cursor = 'pointer';
        
        window.currentOdemeyenListesi = stats.odemeyenListesi || [];
        
        document.getElementById('stat-bakiye').innerText = formatMoney(stats.bakiye);
        
        const ggAidat = document.getElementById('gg-beklenen-aidat');
        if (ggAidat) ggAidat.innerText = formatMoney(stats.beklenenAidat);
        
        const ggEkstra = document.getElementById('gg-beklenen-ekstra');
        if (ggEkstra) ggEkstra.innerText = formatMoney(stats.beklenenEkstra);
        
        const dashAidat = document.getElementById('dash-beklenen-aidat');
        if (dashAidat) dashAidat.innerText = formatMoney(stats.beklenenAidat);
        
        const dashEkstra = document.getElementById('dash-beklenen-ekstra');
        if (dashEkstra) dashEkstra.innerText = formatMoney(stats.beklenenEkstra);

        // Chart Güncelleme (charts.js'de tanımlı fonksiyonu çağırıyoruz)
        if (window.updateChart) {
            window.updateChart(stats.odenen, stats.odemeyen);
        }
        
        // Ok ile gösterilen ödemeyenler listesini doldur
        const chartList = document.getElementById('chart-odemeyenler-listesi');
        if (chartList) {
            chartList.innerHTML = '';
            if (stats.odemeyenListesi && stats.odemeyenListesi.length > 0) {
                stats.odemeyenListesi.forEach(d => {
                    const li = document.createElement('li');
                    li.style.padding = '8px 0';
                    li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    li.innerText = `${d.blok} / ${d.daire_no} - ${d.sakin_ad || 'Bilinmiyor'}`;
                    chartList.appendChild(li);
                });
            } else {
                chartList.innerHTML = '<li style="color:#10b981; font-weight:bold;">Mükemmel! Bu yıl aidat borcu olan kimse yok.</li>';
            }
        }
    } catch (err) {
        console.error("Dashboard yüklenemedi", err);
    }
}

async function loadDaireler() {
    try {
        const daireler = await ipcRenderer.invoke('get-daireler');
        const select = document.getElementById('daire-select');
        
        // Reset options
        select.innerHTML = '<option value="">Lütfen Bir Daire Seçin</option>';
        window.daireListesi = daireler; // Global cache for Sakin Bilgi
        
        daireler.forEach(d => {
            const option = document.createElement('option');
            option.value = d.id;
            const ada = d.adano || '-';
            const parsel = d.parselno || '-';
            const tel = d.sakin_telefon || '-';
            option.textContent = `${d.blok} Sk. No: ${d.daire_no} - ${d.sakin_ad} (Ada/Parsel: ${ada}/${parsel} | Tel: ${tel})`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error("Daireler yüklenemedi", err);
    }
}


let currentGgStats = null;

function initGelirGiderTab() {
    const yilSelect = document.getElementById('gg-yil-secici');
    if (yilSelect) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear - 5; y <= currentYear + 5; y++) {
            const option = document.createElement('option');
            option.value = y;
            option.textContent = y;
            if (y === currentYear) option.selected = true;
            yilSelect.appendChild(option);
        }
        yilSelect.addEventListener('change', loadGelirGiderTab);
    }



    loadGelirGiderTab();
}

function updateGelirGiderUI() {
    if (!currentGgStats) return;
    const { buYilGelir, buYilGider } = currentGgStats;
    
    document.getElementById('gg-toplam-gelir').innerText = formatMoney(buYilGelir);
    document.getElementById('gg-toplam-gider').innerText = formatMoney(buYilGider);
    
    const bakiyeText = document.getElementById('gg-guncel-bakiye');
    bakiyeText.innerText = formatMoney(buYilGelir - buYilGider);
}

async function loadGelirGiderTab() {
    try {
        const yilSelect = document.getElementById('gg-yil-secici');
        const year = yilSelect ? parseInt(yilSelect.value) : new Date().getFullYear();
        
        currentGgStats = await ipcRenderer.invoke('get-gelir-gider-stats', year);
        updateGelirGiderUI();
        
        const tbody = document.getElementById('gider-tbody');
        tbody.innerHTML = '';
        
        window.giderListesi = {};
        
        currentGgStats.giderlerListesi.forEach(gider => {
            window.giderListesi[gider.id] = gider;
            const tr = document.createElement('tr');
            
            let faturaBtn = '';
            if (gider.fatura_dosyasi) {
                faturaBtn = `<button class="btn-primary" style="padding: 2px 8px; font-size:11px; margin-right:5px;" onclick="gosterFatura('${gider.id}')">🔍</button>`;
                if(!window.faturaCache) window.faturaCache = {};
                window.faturaCache[gider.id] = gider.fatura_dosyasi;
            }
            
            let durumBtn = gider.durum === 2 
                ? `<button class="btn-danger" style="padding: 2px 8px; font-size:11px; opacity:0.8;" onclick="toggleGiderDurum(${gider.id}, 1)">Pasif</button>`
                : `<button class="btn-primary" style="padding: 2px 8px; font-size:11px; background:#10b981;" onclick="toggleGiderDurum(${gider.id}, 2)">Aktif</button>`;
            
            tr.style.opacity = gider.durum === 2 ? '0.5' : '1';
            
            tr.innerHTML = `
                <td>${gider.tarih}</td>
                <td>${gider.aciklama}</td>
                <td class="text-danger font-bold">${formatMoney(gider.tutar)}</td>
                <td>${durumBtn}</td>
                <td>
                    ${faturaBtn}
                    <button class="btn-primary" style="padding: 2px 8px; font-size:11px;" onclick="duzenleGider(${gider.id})">Düzenle</button>
                    <button class="btn-danger" style="padding: 2px 8px; font-size:11px;" onclick="silGider(${gider.id})">Sil</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Gelir Gider verileri yüklenemedi", err);
    }
}

window.toggleGiderDurum = async function(id, yeniDurum) {
    try {
        await ipcRenderer.invoke('set-gider-durum', {id, durum: yeniDurum});
        loadGelirGiderTab();
        loadDashboard();
    } catch (err) {
        console.error("Gider durumu güncellenemedi", err);
    }
}

window.silGider = async function(id) {
    if (confirm("Bu gideri silmek istediğinize emin misiniz?")) {
        try {
            await ipcRenderer.invoke('delete-gider', id);
            loadGelirGiderTab();
            loadDashboard();
        } catch (err) {
            console.error("Gider silinemedi", err);
        }
    }
}

window.duzenleGider = function(id) {
    if(!window.giderListesi || !window.giderListesi[id]) return;
    const gider = window.giderListesi[id];
    
    window.editingGiderId = id;
    document.getElementById('gider-tarih').value = gider.tarih;
    document.getElementById('gider-aciklama').value = gider.aciklama;
    document.getElementById('gider-tutar').value = gider.tutar;
    document.getElementById('gider-modal-title').innerText = 'Gideri Düzenle';
    
    document.getElementById('yeni-gider-form').classList.remove('hidden');
}

window.silEkstraOdeme = async function(id) {
    if (confirm('Bu ekstra ödemeyi silmek istediğinize emin misiniz?')) {
        try {
            await ipcRenderer.invoke('delete-ekstra-odeme', id);
            loadEkstraOdemelerListesi();
            if (currentDaireId) loadAidatGecmisi(currentDaireId);
            loadDashboard();
            if (window.loadParcelsToMap) window.loadParcelsToMap();
        } catch (err) {
            console.error("Ekstra ödeme silinemedi", err);
        }
    }
}

// Odemeyenler Modal
document.getElementById('stat-odemeyen').addEventListener('click', () => {
    if (!window.currentOdemeyenListesi) return;
    
    const ul = document.getElementById('odemeyenler-listesi');
    ul.innerHTML = '';
    
    if (window.currentOdemeyenListesi.length === 0) {
        ul.innerHTML = '<li style="color:var(--success); font-weight:bold;">Tüm daireler bu ayki aidatlarını ödemiş!</li>';
    } else {
        window.currentOdemeyenListesi.forEach(d => {
            const li = document.createElement('li');
            li.style.padding = '10px';
            li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            li.innerText = `${d.blok} Sk. No: ${d.daire_no} - ${d.sakin_ad}`;
            ul.appendChild(li);
        });
    }
    
    document.getElementById('odemeyenler-modal').classList.remove('hidden');
});

document.getElementById('close-odemeyenler-modal').addEventListener('click', () => {
    document.getElementById('odemeyenler-modal').classList.add('hidden');
});

// Fatura Modal
window.gosterFatura = function(id) {
    if (!window.faturaCache || !window.faturaCache[id]) return;
    
    const faturaData = window.faturaCache[id];
    const contentDiv = document.getElementById('fatura-content');
    contentDiv.innerHTML = '';
    
    if (faturaData.startsWith('data:application/pdf')) {
        contentDiv.innerHTML = `<iframe src="${faturaData}" style="width:100%; height:100%; border:none;"></iframe>`;
    } else if (faturaData.startsWith('data:image/')) {
        contentDiv.innerHTML = `<img src="${faturaData}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
    } else {
        contentDiv.innerHTML = '<p>Bilinmeyen dosya formatı.</p>';
    }
    
    document.getElementById('fatura-modal').classList.remove('hidden');
}

document.getElementById('close-fatura-modal').addEventListener('click', () => {
    document.getElementById('fatura-modal').classList.add('hidden');
});


function loadSakinBilgi(id) {
    if (!window.daireListesi) return;
    
    const daire = window.daireListesi.find(d => d.id == id);
    if (daire) {
        document.getElementById('sakin-bilgi').classList.remove('hidden');
        document.getElementById('info-telefon').innerText = daire.sakin_telefon || '-';
        document.getElementById('info-mail').innerText = daire.sakin_mail || '-';
        
        const tekilMailContainer = document.getElementById('tekil-mail-buttons');
        if (tekilMailContainer) {
            if (sessionStorage.getItem('userRole') === 'yonetici' && daire.sakin_mail) {
                tekilMailContainer.classList.remove('hidden');
                
                const btnOdeyen = document.getElementById('btn-tekil-mail-odeyen');
                const newBtnOdeyen = btnOdeyen.cloneNode(true);
                btnOdeyen.parentNode.replaceChild(newBtnOdeyen, btnOdeyen);
                newBtnOdeyen.addEventListener('click', () => sendMailToResident(daire, 'odeyen'));
                
                const btnBorclu = document.getElementById('btn-tekil-mail-borclu');
                const newBtnBorclu = btnBorclu.cloneNode(true);
                btnBorclu.parentNode.replaceChild(newBtnBorclu, btnBorclu);
                newBtnBorclu.addEventListener('click', () => sendMailToResident(daire, 'borclu'));
            } else {
                tekilMailContainer.classList.add('hidden');
            }
        }
        
        document.getElementById('info-konum').innerText = daire.sakin_daire_konum || '-';
        document.getElementById('info-il-ilce').innerText = `${daire.il || '-'} / ${daire.ilce || '-'}`;
        document.getElementById('info-mahalle').innerText = daire.mahalle || '-';
        document.getElementById('info-ada-parsel').innerText = `${daire.adano || '-'} / ${daire.parselno || '-'}`;

        const downloadContainer = document.getElementById('download-koord-container');
        if (daire.koordinat_dosyasi) {
            downloadContainer.classList.remove('hidden');
            document.getElementById('info-koord-format').innerText = daire.koordinat_formati || 'Bilinmiyor';
            
            const downloadBtn = document.getElementById('download-koord-btn');
            // Remove old listeners by cloning
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
            
            newBtn.addEventListener('click', () => {
                const a = document.createElement('a');
                a.href = daire.koordinat_dosyasi;
                a.download = `koordinat_${daire.adano}_${daire.parselno}_${daire.id}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        } else {
            downloadContainer.classList.add('hidden');
        }
    }
}

async function loadAidatGecmisi(daire_id) {
    if (!daire_id) return;
    try {
        const yil = parseInt(document.getElementById('aidat-takip-yil').value);
        if (isNaN(yil)) return;

        // Fetch required data
        const aidatTanimlari = await ipcRenderer.invoke('get-aidat-tanimlari', yil);
        const ekstraOdemeler = await ipcRenderer.invoke('get-ekstra-odemeler', yil);
        const fiiliOdemeler = await ipcRenderer.invoke('get-aidatlar', daire_id); 
        const dosyalar = await ipcRenderer.invoke('get-file-list', 'aidatlar');

        const tbody = document.getElementById('aidat-tbody');
        tbody.innerHTML = '';
        
        const isYonetici = sessionStorage.getItem('userRole') === 'yonetici';
        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

        for (let ay = 1; ay <= 12; ay++) {
            const tr = document.createElement('tr');
            
            // 1. Standart Aidat Hesaplama
            const tanim = aidatTanimlari.find(t => t.yil === yil && t.ay === ay);
            const standartTutar = tanim ? tanim.tutar : 0;
            const stdOdemeKaydi = fiiliOdemeler.find(o => o.yil === yil && o.ay === ay && o.tur === 'aidat');
            const isStandartOdendi = stdOdemeKaydi ? stdOdemeKaydi.odendi_mi === 1 : false;
            const aidat_id = stdOdemeKaydi ? stdOdemeKaydi.id : null;

            // 2. Ekstra Ödemeler Hesaplama
            const ekstraAylar = ekstraOdemeler.filter(e => e.ay === ay);
            let ekstraOdemelerHtml = '';
            
            if (ekstraAylar.length === 0) {
                ekstraOdemelerHtml = '<span style="opacity:0.5">-</span>';
            } else {
                ekstraAylar.forEach(ekstra => {
                    const isEkstraPaidDb = fiiliOdemeler.find(o => o.yil === yil && o.ay === ay && o.tur === 'ekstra' && o.tutar === ekstra.tutar);
                    const isEkstraOdendi = isEkstraPaidDb ? isEkstraPaidDb.odendi_mi === 1 : false;
                    const ekstra_id = isEkstraPaidDb ? isEkstraPaidDb.id : null;
                    
                    const chkDisabled = !isYonetici ? 'disabled' : '';
                    const chkChecked = isEkstraOdendi ? 'checked' : '';
                    
                    let dekontBtn = '';
                    if (isEkstraOdendi && ekstra_id) {
                        const hasDekont = dosyalar.find(d => d.related_id === ekstra_id);
                        if (hasDekont) {
                            dekontBtn = `<button onclick="viewDekontAdmin('aidatlar', ${ekstra_id})" class="btn-primary" style="margin-left:5px; padding:2px 5px; font-size:10px;"><i class="fa-solid fa-eye"></i> Dekont</button> <button onclick="uploadDekont('aidatlar', ${ekstra_id})" class="btn-warning" style="padding:2px 5px; font-size:10px; color:#000;" title="Değiştir">Değiştir</button> <button onclick="deleteDekont('aidatlar', ${ekstra_id})" class="btn-danger" style="padding:2px 5px; font-size:10px; margin-left:2px;" title="Sil">Sil</button>`;
                        } else {
                            dekontBtn = `<button onclick="uploadDekont('aidatlar', ${ekstra_id})" class="btn-success" style="margin-left:5px; padding:2px 5px; font-size:10px;"><i class="fa-solid fa-upload"></i> Yükle</button>`;
                        }
                    }
                    
                    ekstraOdemelerHtml += `
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; background:rgba(0,0,0,0.2); padding:5px; border-radius:4px;">
                            <div>
                                <strong style="font-size:11px;">${ekstra.aciklama}</strong><br>
                                <span style="color:#e1b12c; font-weight:bold;">${formatMoney(ekstra.tutar)}</span>
                            </div>
                            <div style="display:flex; align-items:center;">
                                <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-size:12px;">
                                    <input type="checkbox" ${chkDisabled} ${chkChecked} onchange="toggleOdemeDurum(${daire_id}, ${yil}, ${ay}, ${ekstra.tutar}, this.checked, 'ekstra')">
                                    ${isEkstraOdendi ? '<span style="color:#2ecc71">Ödendi</span>' : '<span style="color:#e74c3c">Bekliyor</span>'}
                                </label>
                                ${dekontBtn}
                            </div>
                        </div>
                    `;
                });
            }

            // Standart Aidat HTML
            let standartHtml = '';
            if (standartTutar === 0) {
                standartHtml = '<span style="opacity:0.5">Belirlenmedi</span>';
            } else {
                const chkDisabled = !isYonetici ? 'disabled' : '';
                const chkChecked = isStandartOdendi ? 'checked' : '';
                
                let dekontBtn = '';
                if (isStandartOdendi && aidat_id) {
                    const hasDekont = dosyalar.find(d => d.related_id === aidat_id);
                    if (hasDekont) {
                        dekontBtn = `<button onclick="viewDekontAdmin('aidatlar', ${aidat_id})" class="btn-primary" style="margin-left:5px; padding:2px 5px; font-size:10px;"><i class="fa-solid fa-eye"></i> Dekont</button> <button onclick="uploadDekont('aidatlar', ${aidat_id})" class="btn-warning" style="padding:2px 5px; font-size:10px; color:#000;" title="Değiştir">Değiştir</button> <button onclick="deleteDekont('aidatlar', ${aidat_id})" class="btn-danger" style="padding:2px 5px; font-size:10px; margin-left:2px;" title="Sil">Sil</button>`;
                    } else {
                        dekontBtn = `<button onclick="uploadDekont('aidatlar', ${aidat_id})" class="btn-success" style="margin-left:5px; padding:2px 5px; font-size:10px;"><i class="fa-solid fa-upload"></i> Yükle</button>`;
                    }
                }

                standartHtml = `
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-weight:bold; color:#3498db;">${formatMoney(standartTutar)}</span>
                        <div style="display:flex; align-items:center;">
                            <label style="cursor:pointer; display:flex; align-items:center; gap:5px; font-size:12px;">
                                <input type="checkbox" ${chkDisabled} ${chkChecked} onchange="toggleOdemeDurum(${daire_id}, ${yil}, ${ay}, ${standartTutar}, this.checked, 'aidat')">
                                ${isStandartOdendi ? '<span style="color:#2ecc71">Ödendi</span>' : '<span style="color:#e74c3c">Bekliyor</span>'}
                            </label>
                            ${dekontBtn}
                        </div>
                    </div>
                `;
            }
            
            const hasAnyDebt = (standartTutar > 0 && !isStandartOdendi) || (ekstraAylar.length > 0 && ekstraAylar.some(e => !fiiliOdemeler.find(o => o.yil === yil && o.ay === ay && o.tur === 'ekstra' && o.tutar === e.tutar && o.odendi_mi === 1)));
            const hasAnyExpected = standartTutar > 0 || ekstraAylar.length > 0;
            
            let genelDurum = '<span style="opacity:0.5">-</span>';
            if (hasAnyExpected) {
                genelDurum = hasAnyDebt ? `<span class="status-badge status-unpaid" style="font-size:10px;">Borçlu</span>` : `<span class="status-badge status-paid" style="font-size:10px;">Sorunsuz</span>`;
            }

            tr.innerHTML = `
                <td style="font-weight:bold;">${aylar[ay-1]}</td>
                <td>${standartHtml}</td>
                <td>${ekstraOdemelerHtml}</td>
                <td style="text-align:center;">${genelDurum}</td>
            `;
            tbody.appendChild(tr);
        }
    } catch (err) {
        console.error("Aidat takibi yüklenemedi", err);
        alert("Hata oluştu: " + (err.message || err));
    }
}

window.toggleOdemeDurum = async function(daire_id, yil, ay, tutar, is_paid, tur) {
    try {
        await ipcRenderer.invoke('set-aidat-odeme-durumu', { daire_id, yil, ay, tutar, odendi_mi: is_paid, tur });
        loadAidatGecmisi(daire_id);
        loadDashboard(); 
        if (window.loadParcelsToMap) window.loadParcelsToMap();
    } catch (err) {
        console.error(err);
        alert('Ödeme durumu güncellenemedi.');
        loadAidatGecmisi(daire_id); 
    }
}

window.uploadDekont = async function(category, id) {
    const file = await ipcRenderer.invoke('select-file');
    if (!file) return;
    try {
        await ipcRenderer.invoke('save-file', { category, related_id: id, fileData: file.data, fileName: file.name });
        alert('Dekont başarıyla yüklendi.');
        if(typeof loadAidatGecmisi !== 'undefined' && currentDaireId) loadAidatGecmisi(currentDaireId);
    } catch (e) {
        alert('Yükleme hatası: ' + e);
    }
}

window.deleteDekont = async function(category, id) {
    if (confirm("Bu dekontu kalıcı olarak silmek istediğinize emin misiniz?")) {
        try {
            await ipcRenderer.invoke('delete-file', { category, related_id: id });
            alert('Dekont silindi.');
            if(typeof loadAidatGecmisi !== 'undefined' && currentDaireId) loadAidatGecmisi(currentDaireId);
        } catch (error) {
            console.error(error);
            alert('Dekont silinirken hata oluştu.');
        }
    }
}

window.viewDekontAdmin = async function(category, id) {
    try {
        const files = await ipcRenderer.invoke('get-file-list', category);
        const file = files.find(f => f.related_id === id);
        if (file) {
            const blob = new Blob([new Uint8Array(file.data)], {type: 'application/pdf'});
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        }
    } catch (e) {
        alert('Dosya açılamadı.');
    }
}

function initAidatAyarlari() {
    // Fill year comboboxes
    const currentYear = new Date().getFullYear();
    const selects = [
        document.getElementById('aidat-takip-yil'),
        document.getElementById('ayarlar-aidat-yil'),
        document.getElementById('ayarlar-ekstra-yil')
    ];
    
    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '';
        for (let y = 2020; y <= 2050; y++) {
            const option = document.createElement('option');
            option.value = y;
            option.innerText = y;
            if (y === currentYear) option.selected = true;
            select.appendChild(option);
        }
    });

    const takipYilSelect = document.getElementById('aidat-takip-yil');
    if (takipYilSelect) {
        takipYilSelect.addEventListener('change', () => {
            if (currentDaireId) loadAidatGecmisi(currentDaireId);
        });
    }

    // Aidat Tanımı Kaydet
    const kaydetStandartAidat = document.getElementById('kaydet-standart-aidat');
    if (kaydetStandartAidat) {
        kaydetStandartAidat.addEventListener('click', async () => {
            const yil = parseInt(document.getElementById('ayarlar-aidat-yil').value);
            const basAy = parseInt(document.getElementById('ayarlar-aidat-bas-ay').value);
            const bitisAy = parseInt(document.getElementById('ayarlar-aidat-bitis-ay').value);
            const tutar = parseFloat(document.getElementById('ayarlar-aidat-tutar').value);

            if (isNaN(tutar) || tutar <= 0) return alert("Lütfen geçerli bir tutar girin.");
            if (basAy > bitisAy) return alert("Başlangıç ayı, bitiş ayından büyük olamaz.");

            try {
                for (let ay = basAy; ay <= bitisAy; ay++) {
                    await ipcRenderer.invoke('set-aidat-tanimi', { yil, ay, tutar });
                }
                alert("Aidat tanımlamaları başarıyla kaydedildi.");
                loadAidatTanimlariListesi();
                if (currentDaireId) loadAidatGecmisi(currentDaireId);
                loadDashboard();
                if (window.loadParcelsToMap) window.loadParcelsToMap();
            } catch(e) {
                console.error(e);
                alert("Aidat kaydedilirken hata oluştu.");
            }
        });
    }

    const silTumAidat = document.getElementById('sil-tum-aidat-tanimlari');
    if (silTumAidat) {
        silTumAidat.addEventListener('click', async () => {
            if (!confirm("Tüm yıllara ait standart aidat tanımlarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) return;
            try {
                await ipcRenderer.invoke('delete-all-aidat-tanimlari');
                alert("Tüm aidat tanımlamaları başarıyla silindi.");
                loadAidatTanimlariListesi();
                if (typeof currentDaireId !== 'undefined' && currentDaireId) loadAidatGecmisi(currentDaireId);
                loadDashboard();
                if (window.loadParcelsToMap) window.loadParcelsToMap();
            } catch(e) {
                console.error(e);
                alert("Silinirken hata oluştu.");
            }
        });
    }

    // Ekstra Ödeme Kaydet
    const kaydetEkstra = document.getElementById('kaydet-ekstra-odeme');
    if (kaydetEkstra) {
        kaydetEkstra.addEventListener('click', async () => {
            const yil = parseInt(document.getElementById('ayarlar-ekstra-yil').value);
            const ay = parseInt(document.getElementById('ayarlar-ekstra-ay').value);
            const aciklama = document.getElementById('ayarlar-ekstra-aciklama').value.trim();
            const tutar = parseFloat(document.getElementById('ayarlar-ekstra-tutar').value);

            if (!aciklama) return alert("Açıklama boş olamaz.");
            if (isNaN(tutar) || tutar <= 0) return alert("Geçerli bir tutar girin.");

            try {
                await ipcRenderer.invoke('add-ekstra-odeme', { yil, ay, aciklama, tutar });
                alert("Ekstra ödeme eklendi.");
                document.getElementById('ayarlar-ekstra-aciklama').value = '';
                document.getElementById('ayarlar-ekstra-tutar').value = '';
                loadEkstraOdemelerListesi();
                if (currentDaireId) loadAidatGecmisi(currentDaireId);
                loadDashboard();
                if (window.loadParcelsToMap) window.loadParcelsToMap();
            } catch(e) {
                console.error(e);
                alert("Ekstra ödeme eklenirken hata oluştu.");
            }
        });
    }
}

async function loadAidatTanimlariListesi() {
    const container = document.getElementById('ayarlar-aidat-container');
    if (!container) return;
    
    container.innerHTML = '';
    try {
        const tanimlar = await ipcRenderer.invoke('get-aidat-tanimlari');
        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        
        // Group by year
        const grouped = {};
        tanimlar.forEach(t => {
            if (!grouped[t.yil]) grouped[t.yil] = [];
            grouped[t.yil].push(t);
        });
        
        const years = Object.keys(grouped).sort((a,b) => b - a); // descending
        
        if (years.length === 0) {
            container.innerHTML = '<p style="text-align:center; opacity:0.6; font-size:13px; padding:10px;">Henüz aidat tanımı yok.</p>';
            return;
        }

        years.forEach((yil, index) => {
            const yilsTanimlar = grouped[yil];
            yilsTanimlar.sort((a, b) => a.ay - b.ay);
            
            const div = document.createElement('div');
            div.style.background = 'rgba(255,255,255,0.02)';
            div.style.borderRadius = '6px';
            div.style.border = '1px solid rgba(255,255,255,0.05)';
            div.style.overflow = 'hidden';
            
            const isFirst = index === 0;

            let tbodyHtml = '';
            yilsTanimlar.forEach(t => {
                tbodyHtml += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding:10px;">${t.yil}</td>
                        <td style="padding:10px;">${aylar[t.ay - 1]}</td>
                        <td style="padding:10px; font-weight:bold;">${formatMoney(t.tutar)}</td>
                        <td style="padding:10px; text-align: center;">
                            <button class="btn-primary" style="padding:4px 8px; font-size:11px; margin-right:5px;" onclick="duzenleAidatTanimi(${t.yil}, ${t.ay}, ${t.tutar})">Düzelt</button>
                            <button class="btn-danger" style="padding:4px 8px; font-size:11px;" onclick="silAidatTanimi(${t.yil}, ${t.ay})">Sil</button>
                        </td>
                    </tr>
                `;
            });

            div.innerHTML = `
                <div style="padding: 10px 15px; cursor: pointer; background: rgba(255,255,255,0.03); display: flex; justify-content: space-between; align-items: center;" onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('span').innerText = this.nextElementSibling.classList.contains('hidden') ? '▼' : '▲';">
                    <h3 style="margin: 0; font-size: 15px; font-weight: 500;">${yil} Yılı Aidatları</h3>
                    <span style="opacity: 0.7; font-size: 12px;">${isFirst ? '▲' : '▼'}</span>
                </div>
                <div class="${isFirst ? '' : 'hidden'}" style="padding: 10px;">
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <th style="padding: 10px; opacity: 0.8; font-size: 13px;">Yıl</th>
                                <th style="padding: 10px; opacity: 0.8; font-size: 13px;">Ay</th>
                                <th style="padding: 10px; opacity: 0.8; font-size: 13px;">Tutar (₺)</th>
                                <th style="padding: 10px; opacity: 0.8; font-size: 13px; text-align: center;">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tbodyHtml}
                        </tbody>
                    </table>
                </div>
            `;
            container.appendChild(div);
        });
    } catch(e) {
        console.error(e);
    }
}

window.silAidatTanimi = async function(yil, ay) {
    if (!confirm("Bu aidat tanımını silmek istediğinize emin misiniz?")) return;
    try {
        await ipcRenderer.invoke('delete-aidat-tanimi', { yil, ay });
        loadAidatTanimlariListesi();
        if (currentDaireId) loadAidatGecmisi(currentDaireId);
        loadDashboard();
    } catch(e) {
        console.error(e);
        alert("Silinirken hata oluştu.");
    }
}

window.duzenleAidatTanimi = async function(yil, ay, mevcutTutar) {
    const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const yeniTutar = prompt(`${yil} yılı ${aylar[ay - 1]} ayı aidatı için yeni tutarı girin (₺):`, mevcutTutar);
    if (yeniTutar !== null) {
        const tutar = parseFloat(yeniTutar);
        if (isNaN(tutar) || tutar <= 0) return alert("Lütfen geçerli bir tutar girin.");
        try {
            await ipcRenderer.invoke('set-aidat-tanimi', { yil, ay, tutar });
            loadAidatTanimlariListesi();
            if (currentDaireId) loadAidatGecmisi(currentDaireId);
            loadDashboard();
        } catch(e) {
            console.error(e);
            alert("Düzeltilirken hata oluştu.");
        }
    }
}

async function loadEkstraOdemelerListesi() {
    const yil = parseInt(document.getElementById('ayarlar-ekstra-yil').value);
    const tbody = document.getElementById('ekstra-odemeler-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    try {
        const odemeler = await ipcRenderer.invoke('get-ekstra-odemeler', yil);
        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        
        odemeler.forEach(o => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            tr.innerHTML = `
                <td style="padding:10px;">${o.yil}</td>
                <td style="padding:10px;">${aylar[o.ay - 1]}</td>
                <td style="padding:10px;">${o.aciklama}</td>
                <td style="padding:10px; font-weight:bold;">${formatMoney(o.tutar)}</td>
                <td style="padding:10px;"><button class="btn-danger" style="padding:4px 8px; font-size:11px;" onclick="silEkstraOdeme(${o.id})">Sil</button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {
        console.error(e);
    }
}

window.silEkstraOdeme = async function(id) {
    if (!confirm("Bu ekstra ödeme tanımını silmek istediğinize emin misiniz? (Önceden ödeyenlerin kaydı silinmez)")) return;
    try {
        await ipcRenderer.invoke('delete-ekstra-odeme', id);
        loadEkstraOdemelerListesi();
        if (currentDaireId) loadAidatGecmisi(currentDaireId);
    } catch(e) {
        console.error(e);
        alert("Silinirken hata oluştu.");
    }
}

// Call init once the DOM is loaded. It will run alongside other init code.
document.addEventListener('DOMContentLoaded', () => {
    initAidatAyarlari();
    
    // When settings year changes, reload the lists
    const ekstraYilSelect = document.getElementById('ayarlar-ekstra-yil');
    if (ekstraYilSelect) {
        ekstraYilSelect.addEventListener('change', loadEkstraOdemelerListesi);
        loadEkstraOdemelerListesi();
    }
    
    const aidatYilSelect = document.getElementById('ayarlar-aidat-yil');
    if (aidatYilSelect) {
        aidatYilSelect.addEventListener('change', loadAidatTanimlariListesi);
        loadAidatTanimlariListesi();
    }

    const btnKaydetAyarlar = document.getElementById('kaydet-ayarlar');
    if (btnKaydetAyarlar) {
        btnKaydetAyarlar.addEventListener('click', async () => {
            const data = {
                site_adi: document.getElementById('ayar-site-adi').value,
                banka_adi: document.getElementById('ayar-banka-adi').value,
                iban: document.getElementById('ayar-iban').value,
                github_url: document.getElementById('ayar-github-url').value,
                github_pat: document.getElementById('ayar-github-pat').value
            };
            
            const qrInput = document.getElementById('ayar-banka-qr');
            if (qrInput && qrInput.files.length > 0) {
                const file = qrInput.files[0];
                const base64File = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });
                data.banka_qr = base64File;
            }

            try {
                await ipcRenderer.invoke('save-ayarlar', data);
                await ipcRenderer.invoke('export-local-data-json');
                alert('Banka ve Site bilgileri başarıyla kaydedildi.');
            } catch (err) {
                console.error(err);
                alert('Ayarlar kaydedilirken bir hata oluştu!');
            }
        });
    }

    const qrInput = document.getElementById('ayar-banka-qr');
    const qrPreview = document.getElementById('ayar-banka-qr-preview');
    if (qrInput && qrPreview) {
        qrInput.addEventListener('change', () => {
            if (qrInput.files.length > 0) {
                const file = qrInput.files[0];
                const reader = new FileReader();
                reader.onload = (e) => {
                    qrPreview.src = e.target.result;
                    qrPreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                qrPreview.style.display = 'none';
            }
        });
    }

    const githubPublishBtn = document.getElementById('github-publish-btn');
    const githubPublishStatus = document.getElementById('github-publish-status');
    if (githubPublishBtn) {
        githubPublishBtn.addEventListener('click', async () => {
            githubPublishStatus.style.display = 'block';
            githubPublishStatus.className = 'text-primary';
            githubPublishStatus.innerText = 'Veriler hazırlanıp GitHub\'a gönderiliyor. Lütfen bekleyin...';
            githubPublishBtn.disabled = true;

            const currentUrl = document.getElementById('ayar-github-url').value.trim();
            const currentPat = document.getElementById('ayar-github-pat').value.trim();

            try {
                const result = await ipcRenderer.invoke('publish-to-github', { url: currentUrl, pat: currentPat });
                if (result.success) {
                    githubPublishStatus.className = 'text-success';
                    githubPublishStatus.innerText = '✅ Veriler başarıyla GitHub\'a (Site Sakinleri Portalı) yüklendi!';
                } else {
                    githubPublishStatus.className = 'text-danger';
                    githubPublishStatus.innerText = '❌ Hata: ' + result.error;
                }
            } catch (err) {
                githubPublishStatus.className = 'text-danger';
                githubPublishStatus.innerText = '❌ Beklenmeyen bir hata oluştu: ' + err.message;
            } finally {
                githubPublishBtn.disabled = false;
            }
        });
    }
});

async function loadAyarlar() {
    try {
        const ayarlar = await ipcRenderer.invoke('get-ayarlar');
        if (ayarlar.site_adi) document.getElementById('ayar-site-adi').value = ayarlar.site_adi;
        if (ayarlar.banka_adi) document.getElementById('ayar-banka-adi').value = ayarlar.banka_adi;
        if (ayarlar.iban) document.getElementById('ayar-iban').value = ayarlar.iban;
        if (ayarlar.github_url) document.getElementById('ayar-github-url').value = ayarlar.github_url;
        if (ayarlar.github_pat) document.getElementById('ayar-github-pat').value = ayarlar.github_pat;
        
        if (ayarlar.banka_qr) {
            const qrPreview = document.getElementById('ayar-banka-qr-preview');
            if (qrPreview) {
                qrPreview.src = ayarlar.banka_qr;
                qrPreview.style.display = 'block';
            }
        }
    } catch (err) {
        console.error(err);
    }
}

async function sendMailToResident(daire, type) {
    const yilSelect = document.getElementById('aidat-takip-yil');
    const yil = parseInt(yilSelect ? yilSelect.value : new Date().getFullYear());
    
    // Calculate total debt for this year
    const aidatTanimlari = await ipcRenderer.invoke('get-aidat-tanimlari', yil);
    const ekstraOdemeler = await ipcRenderer.invoke('get-ekstra-odemeler', yil);
    const fiiliOdemeler = await ipcRenderer.invoke('get-aidatlar', daire.id);
    
    let totalDebt = 0;
    let unpaidMonths = [];
    
    const ayIsimleri = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    // Standart Aidatlar
    for (let i = 1; i <= 12; i++) {
        const tanim = aidatTanimlari.find(t => t.ay === i);
        if (tanim) {
            const odendi = fiiliOdemeler.find(o => o.yil === yil && o.ay === i && o.tur === 'aidat' && o.odendi_mi === 1);
            if (!odendi && (yil < new Date().getFullYear() || i <= new Date().getMonth() + 1)) {
                totalDebt += tanim.tutar;
                unpaidMonths.push(ayIsimleri[i-1]);
            }
        }
    }
    
    // Ekstra Ödemeler
    ekstraOdemeler.forEach(e => {
        const odendi = fiiliOdemeler.find(o => o.yil === yil && o.ay === e.ay && o.tur === 'ekstra' && o.tutar === e.tutar && o.odendi_mi === 1);
        if (!odendi) {
            totalDebt += e.tutar;
            if (!unpaidMonths.includes(ayIsimleri[e.ay-1])) {
                unpaidMonths.push(ayIsimleri[e.ay-1] + " (Ekstra)");
            }
        }
    });

    const ayarlar = await ipcRenderer.invoke('get-ayarlar');
    const donem = `${ayIsimleri[new Date().getMonth()]} ${yil}`;
    const sakinAd = daire.sakin_ad || 'Kat Maliki';

    let subject = "";
    let body = "";

    let borcDetayText = `${donem} dönemi itibarıyla toplam ${totalDebt} TL`;
    if (unpaidMonths.length > 0) {
        borcDetayText = `${unpaidMonths.join(', ')} aylarına ait toplam ${totalDebt} TL`;
    }

    if (type === 'borclu') {
        subject = `ÖNEMLİ: Gecikmiş Aidat Borcunuz Hakkında`;
        body = `Sayın ${sakinAd},

Sitemizin mali kayıtları üzerinde yapılan son incelemelerde, ${yil} yılı ${borcDetayText} tutarındaki aidat/gider avansı ödemenizin henüz hesaplarımıza yansımadığı tespit edilmiştir.

Sitemizde sunulan hizmetlerin (güvenlik, temizlik, peyzaj, asansör bakımı vb.) aksamadan devam edebilmesi, tüm kat maliklerimizin aidatlarını zamanında ve eksiksiz ödemesine bağlıdır. Aidatların gecikmesi, sitemizin ortak giderlerinin karşılanmasında ciddi aksaklıklara neden olmaktadır.

Bu doğrultuda, mevcut borcunuzu en geç 25 ${ayIsimleri[new Date().getMonth()]} ${new Date().getFullYear()} tarihine kadar aşağıda bilgileri verilen site yönetim hesabımıza yatırmanızı rica ederiz.

Belirtilen tarihe kadar ödemenin yapılmaması durumunda, Kat Mülkiyeti Kanunu'nun ilgili maddeleri gereğince gecikme tazminatı işletilerek hakkınızda icra takibi başlatılmak üzere yasal yollara müracaat edileceğini üzülerek bildiririz. Yasal takip sürecinde oluşacak avukatlık ücreti, icra masrafları ve diğer tüm yasal giderlerin de tarafınıza yansıtılacağını hatırlatmak isteriz.

Ödemenizi yaptıysanız veya bu e-postanın size yanlışlıkla ulaştığını düşünüyorsanız, lütfen ödeme dekontunuzu bu maile yanıt olarak iletiniz.

Gereğini bilgilerinize sunarım.

Banka Hesap Bilgilerimiz:
Banka Adı: ${ayarlar.banka_adi || '[Banka Adı]'}
Alıcı Adı: ${ayarlar.site_adi || '[Site Yönetimi Resmi Adı]'}
IBAN: ${ayarlar.iban || '[TR 0000 0000 0000 0000 0000 0000]'}

Saygılarımla,

Nevzat Ergin KUMANTAŞ
Site Yöneticisi`;
    } else {
        subject = `${donem} Dönemi Aidat/Gider Avansı Ödemeniz Hakkında Bilgilendirme`;
        body = `Sayın ${sakinAd},

Sitemizin ${donem} dönemine ait aidat/gider avansı ödemenizin hesaplarımıza sorunsuz bir şekilde ulaştığını bildirmek isteriz.

Sitemizin genel giderlerinin karşılanması, bakım ve onarım hizmetlerinin aksamadan yürütülmesi ve ortak yaşam alanlarımızın kalitesinin korunması adına gösterdiğiniz hassasiyet ve düzenli ödemeleriniz için teşekkür ederiz.

Daha huzurlu ve konforlu bir yaşam alanı için çalışmalarımıza devam ettiğimizi belirtir, iyi günler dilerim.

Saygılarımla,

Nevzat Ergin KUMANTAŞ
Site Yöneticisi`;
    }

    const mailtoLink = `mailto:${daire.sakin_mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;
}

async function sendBulkMail(type) {
    if (!window.daireListesi || window.daireListesi.length === 0) return alert("Sakin listesi boş.");
    
    // Yıllık borcu olanlar stats bilgisinden çekilebilir.
    const stats = await ipcRenderer.invoke('get-dashboard-stats', {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1
    });

    const borcluDaireIds = new Set(stats.odemeyenListesi.map(d => d.id));
    const ayarlar = await ipcRenderer.invoke('get-ayarlar');
    
    let targetDaireler = [];
    let subject = "";
    let body = "";
    
    const ayIsimleri = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const donem = `${ayIsimleri[new Date().getMonth()]} ${new Date().getFullYear()}`;

    if (type === 'borclular') {
        targetDaireler = window.daireListesi.filter(d => borcluDaireIds.has(d.id) && d.sakin_mail && d.sakin_mail.trim() !== '');
        if (targetDaireler.length === 0) return alert("Şu an borcu olan ve kayıtlı mail adresi bulunan daire sakini yok.");
        
        subject = `ÖNEMLİ: Gecikmiş Aidat Borcunuz Hakkında`;
        body = `Sayın Kat Malikimiz/Sakinimiz,

Sitemizin mali kayıtları üzerinde yapılan son incelemelerde, içinde bulunduğumuz ${donem} dönemi itibarıyla geçmiş veya güncel aidat/gider avansı ödemenizin (veya bir kısmının) henüz hesaplarımıza yansımadığı tespit edilmiştir.

Sitemizde sunulan hizmetlerin (güvenlik, temizlik, peyzaj, asansör bakımı vb.) aksamadan devam edebilmesi, tüm kat maliklerimizin aidatlarını zamanında ve eksiksiz ödemesine bağlıdır. Aidatların gecikmesi, sitemizin ortak giderlerinin karşılanmasında ciddi aksaklıklara neden olmaktadır.

Bu doğrultuda, mevcut borcunuzu en geç 25 ${ayIsimleri[new Date().getMonth()]} ${new Date().getFullYear()} tarihine kadar aşağıda bilgileri verilen site yönetim hesabımıza yatırmanızı rica ederiz. 
Güncel borç tutarınızı öğrenmek veya teyit etmek için yönetimimizle iletişime geçebilirsiniz.

Belirtilen tarihe kadar ödemenin yapılmaması durumunda, Kat Mülkiyeti Kanunu'nun ilgili maddeleri gereğince gecikme tazminatı işletilerek hakkınızda icra takibi başlatılmak üzere yasal yollara müracaat edileceğini üzülerek bildiririz. Yasal takip sürecinde oluşacak avukatlık ücreti, icra masrafları ve diğer tüm yasal giderlerin de tarafınıza yansıtılacağını hatırlatmak isteriz.

Ödemenizi yaptıysanız veya bu e-postanın size yanlışlıkla ulaştığını düşünüyorsanız, lütfen ödeme dekontunuzu bu maile yanıt olarak iletiniz.

Gereğini bilgilerinize sunarım.

Banka Hesap Bilgilerimiz:
Banka Adı: ${ayarlar.banka_adi || '[Banka Adı]'}
Alıcı Adı: ${ayarlar.site_adi || '[Site Yönetimi Resmi Adı]'}
IBAN: ${ayarlar.iban || '[TR 0000 0000 0000 0000 0000 0000]'}

Saygılarımla,

Nevzat Ergin KUMANTAŞ
Site Yöneticisi`;

    } else if (type === 'odeyenler') {
        targetDaireler = window.daireListesi.filter(d => !borcluDaireIds.has(d.id) && d.sakin_mail && d.sakin_mail.trim() !== '');
        if (targetDaireler.length === 0) return alert("Borcu olmayan ve kayıtlı mail adresi bulunan daire sakini yok.");
        
        subject = `${donem} Dönemi Aidat/Gider Avansı Ödemeniz Hakkında Bilgilendirme`;
        body = `Sayın Kat Malikimiz/Sakinimiz,

Sitemizin ${donem} dönemine ait aidat/gider avansı ödemenizin hesaplarımıza sorunsuz bir şekilde ulaştığını bildirmek isteriz.

Sitemizin genel giderlerinin karşılanması, bakım ve onarım hizmetlerinin aksamadan yürütülmesi ve ortak yaşam alanlarımızın kalitesinin korunması adına gösterdiğiniz hassasiyet ve düzenli ödemeleriniz için teşekkür ederiz.

Daha huzurlu ve konforlu bir yaşam alanı için çalışmalarımıza devam ettiğimizi belirtir, iyi günler dilerim.

Saygılarımla,

Nevzat Ergin KUMANTAŞ
Site Yöneticisi`;
    }

    const mailler = targetDaireler.map(d => d.sakin_mail);
    const bccList = mailler.join(',');
    window.location.href = `mailto:?bcc=${bccList}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// --- SAKİN PORTALI FONKSİYONLARI ---

async function loadSakinPano() {
    try {
        const ayarlar = await ipcRenderer.invoke('get-ayarlar');
        if (ayarlar.site_adi) document.getElementById('sakin-pano-site-adi').innerText = ayarlar.site_adi;
        if (ayarlar.banka_adi) document.getElementById('sakin-pano-banka-adi').innerText = ayarlar.banka_adi;
        if (ayarlar.iban) document.getElementById('sakin-pano-iban').innerText = ayarlar.iban;
        
        if (ayarlar.banka_qr) {
            document.getElementById('sakin-pano-qr').src = ayarlar.banka_qr;
            document.getElementById('sakin-pano-qr-container').classList.remove('hidden');
        }
    } catch(err) {
        console.error(err);
    }
}

async function loadSakinOdemelerim(daireId) {
    const tbody = document.getElementById('sakin-odemelerim-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    try {
        const odemeler = await ipcRenderer.invoke('get-aidatlar', daireId);
        const unpaidList = await ipcRenderer.invoke('get-daire-unpaid-details', daireId);
        
        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        const dosyalar = await ipcRenderer.invoke('get-file-list', 'aidatlar');
        
        // Ödenmiş olanlar
        const odendi_kayitlari = odemeler.filter(o => o.odendi_mi === 1);
        
        const allPayments = [];
        odendi_kayitlari.forEach(o => {
            allPayments.push({...o, is_paid: true});
        });
        unpaidList.forEach(u => {
            allPayments.push({...u, is_paid: false});
        });
        
        allPayments.sort((a,b) => {
            if (b.yil !== a.yil) return b.yil - a.yil;
            return b.ay - a.ay;
        });

        if (allPayments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; opacity: 0.6;">Hiç ödeme kaydınız bulunmuyor.</td></tr>`;
            return;
        }

        allPayments.forEach(o => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            let ayAciklama = aylar[o.ay - 1];
            let turLabel = o.tur === 'aidat' ? '<span class="status-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">Standart Aidat</span>' : '<span class="status-badge" style="background: rgba(232, 112, 42, 0.2); color: #e8702a;">Ekstra Ödeme</span>';
            
            let dekontBtn = '';
            if (o.is_paid && o.id) {
                const hasDekont = dosyalar.find(d => d.related_id === o.id);
                if (hasDekont) {
                    dekontBtn = `<button onclick="viewDekontAdmin('aidatlar', ${o.id})" class="btn-primary" style="margin-left:8px; padding:2px 6px; font-size:10px;"><i class="fa-solid fa-file-invoice"></i> Dekont</button>`;
                }
            }

            let durumHtml = o.is_paid 
                ? '<span class="status-badge status-paid"><i class="fa fa-check"></i> Ödendi</span>' + dekontBtn
                : '<span class="status-badge status-unpaid" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 20px; padding: 4px 10px; font-size: 11px;"><i class="fa fa-times"></i> Ödenmedi</span>';

            tr.innerHTML = `
                <td style="padding: 12px; font-weight: bold;">${o.yil}</td>
                <td style="padding: 12px;">${ayAciklama}</td>
                <td style="padding: 12px;">${turLabel}</td>
                <td style="padding: 12px; font-weight: bold; color: ${o.is_paid ? '#10b981' : '#ef4444'};">${formatMoney(o.tutar)}</td>
                <td style="padding: 12px;">${durumHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch(err) {
        console.error("Ödemelerim yüklenirken hata", err);
    }
}

async function loadSakinGiderler() {
    const tbody = document.getElementById('sakin-giderler-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    try {
        const stats = await ipcRenderer.invoke('get-gelir-gider-stats', new Date().getFullYear());
        const giderler = stats.giderlerListesi || [];
        
        if (giderler.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; opacity: 0.6;">Bu yıl henüz gider kaydedilmedi.</td></tr>`;
            return;
        }

        giderler.forEach(gider => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            let faturaBtn = '-';
            if (gider.fatura_dosyasi) {
                faturaBtn = `<button class="btn-primary" style="padding: 4px 10px; font-size:11px;" onclick="gosterFatura('${gider.id}')">🔍 İncele</button>`;
                if(!window.faturaCache) window.faturaCache = {};
                window.faturaCache[gider.id] = gider.fatura_dosyasi;
            }
            
            let durumSpan = gider.durum === 2 
                ? '<span class="status-badge" style="background: rgba(239,68,68,0.2); color:#ef4444;">İptal/Pasif</span>'
                : '<span class="status-badge status-paid"><i class="fa fa-check"></i> Aktif</span>';
            
            tr.style.opacity = gider.durum === 2 ? '0.5' : '1';
            
            tr.innerHTML = `
                <td style="padding: 12px;">${gider.tarih}</td>
                <td style="padding: 12px;">${gider.aciklama}</td>
                <td style="padding: 12px; font-weight: bold; color: #ef4444;">${formatMoney(gider.tutar)}</td>
                <td style="padding: 12px;">${durumSpan}</td>
                <td style="padding: 12px;">${faturaBtn}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch(err) {
        console.error("Giderler yüklenirken hata", err);
    }
}
