document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const dashSection = document.getElementById('dashboard-section');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');

    let siteData = null;
    let currentUser = null;

    const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    // Verileri Yükle
    async function loadData() {
        try {
            const res = await fetch('data.json?v=' + new Date().getTime());
            if (!res.ok) throw new Error('Veri dosyası bulunamadı. Yönetici henüz verileri yüklememiş olabilir.');
            siteData = await res.json();
            
            document.title = (siteData.site_adi || "Sakin Portalı") + " - Yönetim Sistemi";
            document.getElementById('brand-site-name').innerText = siteData.site_adi || 'Sakin Portalı';

            // LocalStorage'da oturum var mı?
            const savedUser = localStorage.getItem('sakin_user');
            if (savedUser) {
                const user = siteData.daireler.find(d => d.username === savedUser);
                if (user) {
                    login(user);
                }
            }
        } catch (err) {
            console.error(err);
            loginError.innerText = "Sistem verisi yüklenemedi. Yönetici verileri güncellememiş olabilir.";
            loginError.classList.remove('hidden');
        }
    }

    // Login İşlemi
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const uName = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;

        if (!siteData) {
            loginError.innerText = "Sistem verileri henüz yüklenmedi.";
            loginError.classList.remove('hidden');
            return;
        }

        const user = siteData.daireler.find(d => d.username === uName && d.password === pass);

        if (user) {
            login(user);
        } else {
            loginError.innerText = "Kullanıcı adı veya şifre hatalı.";
            loginError.classList.remove('hidden');
        }
    });

    function login(user) {
        currentUser = user;
        localStorage.setItem('sakin_user', user.username);
        
        loginError.classList.add('hidden');
        
        // Hide login, show dashboard
        loginSection.classList.add('hidden');
        dashSection.classList.remove('hidden');
        
        renderDashboard();
    }

    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('sakin_user');
        
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        
        dashSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
    });

    function renderDashboard() {
        // Üst Bilgiler
        document.getElementById('dash-user-name').innerText = currentUser.sakin_ad || 'Kayıtsız Sakin';
        document.getElementById('dash-apartment').innerText = `Blok: ${currentUser.blok || '-'} | Daire: ${currentUser.daire_no || '-'}`;

        // Banka Bilgileri
        document.getElementById('bank-name').innerText = siteData.banka_adi || '-';
        document.getElementById('bank-receiver').innerText = siteData.site_adi || '-';
        document.getElementById('bank-iban').innerText = siteData.iban || '-';

        const qrBox = document.getElementById('qr-container');
        const qrImg = document.getElementById('bank-qr-img');
        if (siteData.banka_qr && siteData.banka_qr.startsWith('data:image')) {
            qrImg.src = siteData.banka_qr;
            qrBox.classList.remove('hidden');
        } else {
            qrBox.classList.add('hidden');
        }

        // Kasa Bakiyesi Hesaplama
        let toplamGelir = 0;
        let toplamGider = 0;

        if (siteData.aidatlar) {
            siteData.aidatlar.forEach(a => {
                if (a.odendi_mi === 1) toplamGelir += a.tutar;
            });
        }

        if (siteData.giderler) {
            siteData.giderler.forEach(g => {
                if (g.durum === 'aktif') toplamGider += g.tutar;
            });
        }

        const kasaBakiyesi = toplamGelir - toplamGider;
        document.getElementById('dash-site-balance').innerText = kasaBakiyesi.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

        // Kişisel Borç Hesaplama & Tablo
        const tbody = document.getElementById('dash-payments-body');
        tbody.innerHTML = '';

        let toplamBorc = 0;

        if (siteData.aidatlar) {
            const myAidats = siteData.aidatlar.filter(a => a.daire_id === currentUser.id);
            
            myAidats.sort((a, b) => {
                if (a.yil !== b.yil) return b.yil - a.yil;
                return b.ay - a.ay;
            });

            if (myAidats.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">Ödeme kaydı bulunamadı.</td></tr>';
            }

            myAidats.forEach(aidat => {
                const tr = document.createElement('tr');
                const durumClass = aidat.odendi_mi === 1 ? 'status-paid' : 'status-unpaid';
                const durumText = aidat.odendi_mi === 1 ? 'Ödendi' : 'Ödenmedi';
                
                if (aidat.odendi_mi === 0) {
                    toplamBorc += aidat.tutar;
                }

                tr.innerHTML = `
                    <td><i class="fa-solid ${aidat.tur === 'ekstra' ? 'fa-tools' : 'fa-home'}"></i> ${aidat.tur === 'ekstra' ? 'Ekstra Gider' : 'Aidat'}</td>
                    <td>${AYLAR[aidat.ay - 1] || aidat.ay} ${aidat.yil}</td>
                    <td>${aidat.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                    <td><span class="status-badge ${durumClass}">${durumText}</span></td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Veri bulunamadı.</td></tr>';
        }

        document.getElementById('dash-total-debt').innerText = toplamBorc.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

        // GİDERLERİ YILLARA GÖRE GRUPLAYIP AKORDİYON OLARAK ÇİZDİR
        const expensesContainer = document.getElementById('dash-expenses');
        expensesContainer.innerHTML = '';
        if (siteData.giderler && siteData.giderler.length > 0) {
            const groupedExpenses = {};
            siteData.giderler.forEach(g => {
                if (g.durum !== 'aktif') return;
                const dateParts = g.tarih.split('-'); // YYYY-MM-DD
                const year = dateParts[0];
                if (!groupedExpenses[year]) groupedExpenses[year] = [];
                groupedExpenses[year].push(g);
            });

            const years = Object.keys(groupedExpenses).sort((a, b) => b - a); // Yeni yıldan eskiye sıralama
            
            if (years.length === 0) {
                expensesContainer.innerHTML = '<p style="text-align:center; opacity:0.6; font-size:13px;">Kayıtlı harcama bulunmuyor.</p>';
            }

            years.forEach((year, index) => {
                const totalYearExpense = groupedExpenses[year].reduce((sum, g) => sum + g.tutar, 0);

                const accItem = document.createElement('div');
                accItem.style.marginBottom = '10px';
                accItem.style.border = '1px solid rgba(255,255,255,0.1)';
                accItem.style.borderRadius = '6px';
                accItem.style.overflow = 'hidden';

                const accHeader = document.createElement('div');
                accHeader.style.padding = '12px 15px';
                accHeader.style.background = 'rgba(255,255,255,0.05)';
                accHeader.style.cursor = 'pointer';
                accHeader.style.display = 'flex';
                accHeader.style.justifyContent = 'space-between';
                accHeader.style.alignItems = 'center';
                
                const isOpen = index === 0; // İlk yıl açık gelsin
                accHeader.innerHTML = `
                    <h3 style="margin:0; font-size:15px; color:#38bdf8;">${year} Yılı</h3>
                    <div style="text-align:right;">
                        <span style="font-size:14px; margin-right:10px; font-weight:bold;">${totalYearExpense.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</span>
                        <span class="acc-icon" style="opacity:0.7; font-size:12px;">${isOpen ? '▼' : '▲'}</span>
                    </div>
                `;

                const accContent = document.createElement('div');
                accContent.className = isOpen ? '' : 'hidden';
                accContent.style.padding = '15px';
                accContent.style.background = 'rgba(0,0,0,0.1)';
                accContent.style.borderTop = '1px solid rgba(255,255,255,0.05)';

                let tableHTML = `
                    <table class="modern-table" style="font-size:13px;">
                        <thead>
                            <tr>
                                <th>Tarih</th>
                                <th>Açıklama</th>
                                <th style="text-align:right;">Tutar</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                groupedExpenses[year].sort((a,b) => new Date(b.tarih) - new Date(a.tarih)).forEach(g => {
                    const formattedDate = new Date(g.tarih).toLocaleDateString('tr-TR');
                    tableHTML += `
                        <tr>
                            <td style="opacity:0.8;">${formattedDate}</td>
                            <td>${g.aciklama}</td>
                            <td style="text-align:right; font-weight:bold;">${g.tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</td>
                        </tr>
                    `;
                });
                
                tableHTML += `</tbody></table>`;
                accContent.innerHTML = tableHTML;

                accHeader.addEventListener('click', () => {
                    accContent.classList.toggle('hidden');
                    const icon = accHeader.querySelector('.acc-icon');
                    icon.innerText = accContent.classList.contains('hidden') ? '▲' : '▼';
                });

                accItem.appendChild(accHeader);
                accItem.appendChild(accContent);
                expensesContainer.appendChild(accItem);
            });
        } else {
            expensesContainer.innerHTML = '<p style="text-align:center; opacity:0.6; font-size:13px;">Kayıtlı harcama bulunmuyor.</p>';
        }

        // HARİTAYI YÜKLE
        const mapContainer = document.getElementById('dash-map');
        
        if (window.sakinMap) {
            window.sakinMap.remove();
            window.sakinMap = null;
            mapContainer.innerHTML = '<div id="dash-map-empty" style="text-align:center; padding-top:100px; opacity:0.5; font-size:13px;">Konum (KML) verisi yöneticiniz tarafından girilmemiş.</div>';
        }

        if (currentUser.koordinat_dosyasi && currentUser.koordinat_formati) {
            const emptyLabel = document.getElementById('dash-map-empty');
            if (emptyLabel) emptyLabel.remove();
            
            const centerLatLng = [39.8662, 32.7215]; 
            window.sakinMap = L.map('dash-map').setView(centerLatLng, 18);
            
            L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 21,
                attribution: '© Google Maps'
            }).addTo(window.sakinMap);

            let text = currentUser.koordinat_dosyasi;
            if (text.startsWith('data:')) {
                const base64Data = text.split(',')[1];
                text = decodeURIComponent(escape(atob(base64Data)));
            }

            const customStyle = { color: '#3b82f6', weight: 4, fillColor: '#3b82f6', fillOpacity: 0.4 };
            const popupContent = `<b>Benim Konumum</b><br>Blok: ${currentUser.blok}<br>Daire: ${currentUser.daire_no}`;

            let layer;
            const customLayer = L.geoJson(null, {
                style: () => customStyle,
                onEachFeature: function(feature, l) {
                    l.bindPopup(popupContent);
                    l.bindTooltip(`${currentUser.blok}/${currentUser.daire_no}`, {permanent: true, direction: 'center', className: 'parcel-label'});
                }
            });

            try {
                if (currentUser.koordinat_formati === 'KML') {
                    layer = omnivore.kml.parse(text, null, customLayer);
                } else if (currentUser.koordinat_formati === 'Geo JSON') {
                    layer = L.geoJSON(JSON.parse(text), {
                        style: () => customStyle,
                        onEachFeature: function(feature, l) {
                            l.bindPopup(popupContent);
                            l.bindTooltip(`${currentUser.blok}/${currentUser.daire_no}`, {permanent: true, direction: 'center', className: 'parcel-label'});
                        }
                    });
                }
                
                if (layer) {
                    layer.addTo(window.sakinMap);
                    layer.on('ready', function() {
                        window.sakinMap.fitBounds(layer.getBounds());
                    });
                    
                    // Zaman aşımı ile bounds fit garantisi
                    setTimeout(() => {
                        if (layer.getBounds && Object.keys(layer.getBounds()).length > 0) {
                            try { window.sakinMap.fitBounds(layer.getBounds()); } catch(e){}
                        }
                        window.sakinMap.invalidateSize();
                    }, 500);
                }
            } catch (err) {
                console.error("Harita render hatası:", err);
            }
        }
    }

    loadData();
});
