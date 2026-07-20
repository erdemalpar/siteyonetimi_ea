document.addEventListener('DOMContentLoaded', () => {
    const unInput = document.getElementById('username');
    if (unInput) setTimeout(() => unInput.focus(), 100);
    // --- Spotlight Efekti (Canvas Mask) ---
    const SPOTLIGHT_R = 260;
    const canvas = document.getElementById('reveal-canvas');
    const revealDiv = document.getElementById('login-bg-reveal');
    let ctx = canvas.getContext('2d');
    let w, h;
    function resize() {
        w = window.innerWidth; h = window.innerHeight;
        if (canvas) { canvas.width = w; canvas.height = h; }
    }
    window.addEventListener('resize', resize);
    resize();

    let mouse = { x: -999, y: -999 };
    let smooth = { x: -999, y: -999 };
    window.rafRef = null;

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX; mouse.y = e.clientY;
    });

    function drawSpotlight() {
        if (!canvas || !ctx) return;
        if (mouse.x === -999) { window.rafRef = requestAnimationFrame(drawSpotlight); return; }
        smooth.x += (mouse.x - smooth.x) * 0.1;
        smooth.y += (mouse.y - smooth.y) * 0.1;
        ctx.clearRect(0, 0, w, h);

        const gradient = ctx.createRadialGradient(smooth.x, smooth.y, 0, smooth.x, smooth.y, SPOTLIGHT_R);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.6, 'rgba(255,255,255,0.75)');
        gradient.addColorStop(0.75, 'rgba(255,255,255,0.4)');
        gradient.addColorStop(0.88, 'rgba(255,255,255,0.12)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.fillStyle = gradient; ctx.beginPath();
        ctx.arc(smooth.x, smooth.y, SPOTLIGHT_R, 0, Math.PI * 2); ctx.fill();

        const dataUrl = canvas.toDataURL();
        if (revealDiv) {
            revealDiv.style.maskImage = `url(${dataUrl})`;
            revealDiv.style.webkitMaskImage = `url(${dataUrl})`;
            revealDiv.style.maskSize = '100% 100%';
            revealDiv.style.webkitMaskSize = '100% 100%';
        }
        window.rafRef = requestAnimationFrame(drawSpotlight);
    }
    if (canvas) window.rafRef = requestAnimationFrame(drawSpotlight);

    const loginSection = document.getElementById('login-section');
    const dashSection = document.getElementById('dashboard-section');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');

    let siteData = null;
    let currentUser = null;

    const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    // --- SESSION INACTIVITY TIMER (15 Min) ---
    let inactivityTimer = null;
    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 dakika

    function resetInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        if (currentUser) {
            inactivityTimer = setTimeout(() => {
                alert("15 dakikadan uzun süre işlem yapmadığınız için oturumunuz sonlandırıldı.");
                performLogout();
            }, INACTIVITY_LIMIT);
        }
    }

    ['mousemove', 'mousedown', 'keypress', 'touchmove', 'scroll'].forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, true);
    });
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
                    login(user, true); // true = Otomatik giriş
                }
            }
        } catch (err) {
            console.error(err);
            loginError.innerText = "Sistemdeki veriler doğruyu göstermiyorsa Site Yöneticisi ile irtibata geçiniz.";
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

    function login(user, isAutoLogin = false) {
        currentUser = user;
        localStorage.setItem('sakin_user', user.username);

        loginError.classList.add('hidden');

        if (isAutoLogin) {
            // Otomatik girişte animasyon gösterme, direkt panele geç
            if (window.rafRef) cancelAnimationFrame(window.rafRef);
            loginSection.style.transition = 'none';
            loginSection.style.opacity = '0';
            loginSection.style.display = 'none';
            dashSection.classList.remove('hidden');
            if (window.sakinMap) {
                window.sakinMap.invalidateSize();
            }
        } else {
            // Normal girişte Lithos transition efektini oynat
            if (window.rafRef) cancelAnimationFrame(window.rafRef);
            loginSection.style.transition = 'opacity 0.8s ease';
            loginSection.style.opacity = '0';
            setTimeout(() => {
                loginSection.style.display = 'none';
                dashSection.classList.remove('hidden');
                if (window.sakinMap) {
                    window.sakinMap.invalidateSize();
                }
            }, 800);
        }

        renderDashboard();
        resetInactivityTimer();
    }

    function performLogout() {
        currentUser = null;
        localStorage.removeItem('sakin_user');

        document.getElementById('username').value = '';
        document.getElementById('password').value = '';

        dashSection.classList.add('hidden');
        loginSection.style.display = 'flex';
        setTimeout(() => {
            loginSection.style.opacity = '1';
            if (canvas) window.rafRef = requestAnimationFrame(drawSpotlight);
        }, 50);
        if (inactivityTimer) clearTimeout(inactivityTimer);
    }

    logoutBtn.addEventListener('click', () => {
        performLogout();
    });

    function renderDashboard() {
        // Üst Bilgiler
        document.getElementById('dash-user-name').innerText = currentUser.sakin_ad || 'Kayıtsız Sakin';
        document.getElementById('dash-apartment').innerText = `Sokak: ${currentUser.sokak || '-'} | Daire: ${currentUser.daire_no || '-'}`;

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


        const tbody = document.getElementById('dash-payments-body');
        tbody.innerHTML = '';

        let toplamBorc = 0;
        let unpaidPaymentsList = []; // Ödenmeyen borçları haritada göstermek için toplayacağız

        if (siteData.aidatlar) {
            const myAidats = siteData.aidatlar.filter(a => a.daire_id === currentUser.id && a.odendi_mi === 1);

            const allPayments = [];
            myAidats.forEach(o => {
                let isDefined = true;
                if (o.tur === 'aidat' && siteData.aidat_tanimlari) {
                    isDefined = siteData.aidat_tanimlari.some(t => t.yil === o.yil && t.ay === o.ay);
                } else if (o.tur === 'ekstra' && siteData.ekstra_odemeler) {
                    isDefined = siteData.ekstra_odemeler.some(e => e.yil === o.yil && e.ay === o.ay);
                }

                if (isDefined) {
                    allPayments.push({ ...o, is_paid: true });
                }
            });

            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth() + 1;

            let buYilGelir = 0;
            let buYilGider = 0;

            if (siteData.aidatlar) {
                siteData.aidatlar.forEach(a => {
                    if (a.odendi_mi === 1 && a.yil === currentYear) buYilGelir += a.tutar;
                });
            }

            if (siteData.giderler) {
                siteData.giderler.forEach(g => {
                    if (g.durum == 1 && g.tarih && g.tarih.startsWith(currentYear.toString())) buYilGider += g.tutar;
                });
            }

            const eDashIncomes = document.getElementById('dash-site-incomes');
            if (eDashIncomes) eDashIncomes.innerText = buYilGelir.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

            const eDashExpenses = document.getElementById('dash-site-expenses');
            if (eDashExpenses) eDashExpenses.innerText = buYilGider.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';


            if (siteData.aidat_tanimlari) {
                siteData.aidat_tanimlari.forEach(t => {
                    if (t.yil < currentYear || (t.yil === currentYear && t.ay <= currentMonth)) {
                        const isPaid = myAidats.some(o => o.yil === t.yil && o.ay === t.ay && o.tur === 'aidat');
                        if (!isPaid) {
                            allPayments.push({ ...t, tur: 'aidat', aciklama: 'Aidat', is_paid: false });
                        }
                    }
                });
            }
            if (siteData.ekstra_odemeler) {
                siteData.ekstra_odemeler.forEach(e => {
                    if (e.yil < currentYear || (e.yil === currentYear && e.ay <= currentMonth)) {
                        const isPaid = myAidats.some(o => o.yil === e.yil && o.ay === e.ay && o.tur === 'ekstra');
                        if (!isPaid) {
                            allPayments.push({ ...e, tur: 'ekstra', aciklama: e.aciklama, is_paid: false });
                        }
                    }
                });
            }

            allPayments.sort((a, b) => {
                if (a.yil !== b.yil) return b.yil - a.yil;
                return b.ay - a.ay;
            });

            if (allPayments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">Ödeme kaydı bulunamadı.</td></tr>';
            }

            allPayments.forEach(aidat => {
                const tr = document.createElement('tr');
                const durumClass = aidat.is_paid ? 'status-paid' : 'status-unpaid';
                const durumText = aidat.is_paid ? 'Ödendi' : 'Ödenmedi';

                if (!aidat.is_paid) {
                    toplamBorc += aidat.tutar;
                    unpaidPaymentsList.push(aidat);
                }

                let dekontButonu = '';
                if (aidat.is_paid && siteData.dosyalar) {
                    const dekont = siteData.dosyalar.find(d => d.related_table === 'aidatlar' && d.related_id === aidat.id);
                    if (dekont) {
                        dekontButonu = `<button onclick="window.viewDekont('${dekont.file_data}')" style="margin-left:10px; padding:4px 8px; font-size:11px; background:#3498db; color:white; border:none; border-radius:3px; cursor:pointer;"><i class="fa-solid fa-eye"></i> Dekont</button>`;
                    }
                }

                tr.innerHTML = `
                    <td><i class="fa-solid ${aidat.tur === 'ekstra' ? 'fa-tools' : 'fa-home'}"></i> ${aidat.tur === 'ekstra' ? (aidat.aciklama || 'Ekstra Gider') : 'Aidat'}</td>
                    <td>${AYLAR[aidat.ay - 1] || aidat.ay} ${aidat.yil}</td>
                    <td>${aidat.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                    <td><span class="status-badge ${durumClass}">${durumText}</span>${dekontButonu}</td>
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
                if (g.durum == 1) {
                    const dateParts = g.tarih.split('-'); // YYYY-MM-DD
                    const year = dateParts[0];
                    if (!groupedExpenses[year]) groupedExpenses[year] = [];
                    groupedExpenses[year].push(g);
                }
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
                        <span style="font-size:14px; margin-right:10px; font-weight:bold;">${totalYearExpense.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
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

                groupedExpenses[year].sort((a, b) => new Date(b.tarih) - new Date(a.tarih)).forEach(g => {
                    const formattedDate = new Date(g.tarih).toLocaleDateString('tr-TR');
                    tableHTML += `
                        <tr>
                            <td style="opacity:0.8;">${formattedDate}</td>
                            <td>${g.aciklama}</td>
                            <td style="text-align:right; font-weight:bold;">${g.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
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

            // Harita Zoom Seviyesi Kontrolü
            L.Control.ZoomLevel = L.Control.extend({
                onAdd: function (map) {
                    var div = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
                    div.style.backgroundColor = 'rgba(0,0,0,0.6)';
                    div.style.color = '#fff';
                    div.style.padding = '4px 8px';
                    div.style.fontSize = '12px';
                    div.style.fontWeight = 'bold';
                    div.style.border = '1px solid rgba(255,255,255,0.2)';
                    div.style.borderRadius = '4px';
                    div.innerHTML = 'Zoom: ' + map.getZoom();

                    map.on('zoomend', function () {
                        div.innerHTML = 'Zoom: ' + map.getZoom();
                    });

                    return div;
                }
            });
            new L.Control.ZoomLevel({ position: 'topright' }).addTo(window.sakinMap);

            let hasAidatDebt = false;
            let hasEkstraDebt = false;
            unpaidPaymentsList.forEach(p => {
                if (p.tur === 'ekstra') hasEkstraDebt = true;
                else hasAidatDebt = true;
            });

            let mapColor = '#2ecc71'; // Borcu Yok
            // Legend Control Ekleme
            L.Control.Legend = L.Control.extend({
                onAdd: function (map) {
                    var div = L.DomUtil.create('div', 'leaflet-control leaflet-bar legend');
                    div.style.backgroundColor = 'rgba(30, 40, 50, 0.95)';
                    div.style.color = '#fff';
                    div.style.padding = '12px 16px';
                    div.style.fontSize = '14px';
                    div.style.border = 'none';
                    div.style.borderRadius = '12px';
                    div.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
                    div.style.fontFamily = "'Inter', sans-serif";

                    div.innerHTML = `
                        <div style="display:flex; align-items:center; margin-bottom:10px;">
                            <span style="display:inline-block; width:16px; height:16px; border-radius:4px; background-color:#2ecc71; margin-right:12px;"></span> Borcu Yok
                        </div>
                        <div style="display:flex; align-items:center; margin-bottom:10px;">
                            <span style="display:inline-block; width:16px; height:16px; border-radius:4px; background-color:#ef4444; margin-right:12px;"></span> Aidat Borcu Var
                        </div>
                        <div style="display:flex; align-items:center; margin-bottom:10px;">
                            <span style="display:inline-block; width:16px; height:16px; border-radius:4px; background-color:#f97316; margin-right:12px;"></span> Ekstra Ödeme Borcu Var
                        </div>
                        <div style="display:flex; align-items:center;">
                            <span style="display:inline-block; width:16px; height:16px; border-radius:4px; background-color:#a855f7; margin-right:12px;"></span> Hem Aidat Hem Ekstra Borcu Var
                        </div>
                    `;
                    return div;
                }
            });
            new L.Control.Legend({ position: 'bottomright' }).addTo(window.sakinMap);

            const getDaireInfo = function (feature) {
                const lblSokak = feature.properties ? (feature.properties.sokak || feature.properties.blok || currentUser.sokak || '-') : (currentUser.sokak || '-');
                const lblDaire = feature.properties ? (feature.properties.daire_no || currentUser.daire_no || '-') : (currentUser.daire_no || '-');

                let daire = null;
                if (siteData && siteData.daireler) {
                    daire = siteData.daireler.find(d => d.sokak === lblSokak && d.daire_no === lblDaire);
                }
                if (!daire) {
                    daire = { sokak: lblSokak, daire_no: lblDaire, id: -1, sakin_ad: 'Bilinmiyor', adano: '-', parselno: '-', sakin_telefon: '-', sakin_mail: '-' };
                }

                let hasAidatDebt = false;
                let hasEkstraDebt = false;
                let popupBorcHTML = `<div style="margin-top:10px; border-top:1px solid #ddd; padding-top:10px;">
                    <strong style="color:#e8702a; font-size:14px; font-family:'Outfit', sans-serif;">Ödenmemiş Borçlar:</strong>
                    <ul style="margin:8px 0 0 0; padding-left:18px; font-size:13px; color:#333;">`;

                let hasAnyDebt = false;

                if (daire.id !== -1) {
                    const daireAidats = (siteData.aidatlar || []).filter(a => a.daire_id === daire.id && a.odendi_mi === 1);
                    const today = new Date();
                    const currentYear = today.getFullYear();
                    const currentMonth = today.getMonth() + 1;

                    if (siteData.aidat_tanimlari) {
                        siteData.aidat_tanimlari.forEach(t => {
                            if (t.yil < currentYear || (t.yil === currentYear && t.ay <= currentMonth)) {
                                const isPaid = daireAidats.some(o => o.yil === t.yil && o.ay === t.ay && o.tur === 'aidat');
                                if (!isPaid) {
                                    hasAidatDebt = true;
                                    hasAnyDebt = true;
                                    const monthName = typeof AYLAR !== 'undefined' ? AYLAR[t.ay - 1] : t.ay;
                                    popupBorcHTML += `<li style="margin-bottom:4px;">${monthName} ${t.yil} Aidat: <b>${t.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</b></li>`;
                                }
                            }
                        });
                    }
                    if (siteData.ekstra_odemeler) {
                        siteData.ekstra_odemeler.forEach(e => {
                            if (e.yil < currentYear || (e.yil === currentYear && e.ay <= currentMonth)) {
                                const isPaid = daireAidats.some(o => o.yil === e.yil && o.ay === e.ay && o.tur === 'ekstra');
                                if (!isPaid) {
                                    hasEkstraDebt = true;
                                    hasAnyDebt = true;
                                    popupBorcHTML += `<li style="margin-bottom:4px;">${e.yil} ${e.aciklama || 'Ekstra'}: <b>${e.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</b></li>`;
                                }
                            }
                        });
                    }
                }

                if (!hasAnyDebt) {
                    popupBorcHTML += `<li style="color:#10b981; list-style-type:none; margin-left:-18px; font-weight:500;">Ödenmemiş borç bulunmamaktadır.</li>`;
                }
                popupBorcHTML += `</ul></div>`;

                let mapColor = '#2ecc71';
                if (hasAidatDebt && hasEkstraDebt) mapColor = '#a855f7';
                else if (hasAidatDebt) mapColor = '#ef4444';
                else if (hasEkstraDebt) mapColor = '#f97316';

                const popupContent = `<div style="min-width: 200px; font-family:'Inter', sans-serif;">
                    <b style="font-size:15px; color:#111;">Sakin: ${daire.sakin_ad || 'Bilinmiyor'}</b><br>
                    <span style="color:#555;">Ada: ${daire.adano || '-'} | Parsel: ${daire.parselno || '-'}</span><br>
                    <span style="color:#555;">Sokak: ${daire.sokak} | Daire: ${daire.daire_no}</span><br>
                    <span style="color:#555;">Telefon: ${daire.sakin_telefon || '-'}</span><br>
                    <span style="color:#555;">Email: ${daire.sakin_mail || '-'}</span><br>
                    ${popupBorcHTML}
                </div>`;

                return { popupContent, mapColor, lblSokak: daire.sokak, lblDaire: daire.daire_no };
            };

            const customLayer = L.geoJson(null, {
                style: function (feature) {
                    const info = getDaireInfo(feature);
                    return { color: info.mapColor, weight: 4, fillColor: info.mapColor, fillOpacity: 0.4 };
                },
                onEachFeature: function (feature, l) {
                    const info = getDaireInfo(feature);
                    l.bindPopup(info.popupContent);
                    l.bindTooltip(`${info.lblSokak}/${info.lblDaire}`, { permanent: true, direction: 'center', className: 'parcel-label' });
                }
            });

            try {
                if (currentUser.koordinat_formati === 'KML') {
                    layer = omnivore.kml.parse(text, null, customLayer);
                } else if (currentUser.koordinat_formati === 'Geo JSON') {
                    layer = L.geoJSON(JSON.parse(text), {
                        style: function (feature) {
                            const info = getDaireInfo(feature);
                            return { color: info.mapColor, weight: 4, fillColor: info.mapColor, fillOpacity: 0.4 };
                        },
                        onEachFeature: function (feature, l) {
                            const info = getDaireInfo(feature);
                            l.bindPopup(info.popupContent);
                            l.bindTooltip(`${info.lblSokak}/${info.lblDaire}`, { permanent: true, direction: 'center', className: 'parcel-label' });
                        }
                    });
                }

                if (layer) {
                    layer.addTo(window.sakinMap);
                    layer.on('ready', function () {
                        try { window.sakinMap.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 20 }); } catch (e) { }
                    });

                    // Zaman aşımı ile bounds fit garantisi (login transition 800ms)
                    setTimeout(() => {
                        if (window.sakinMap) window.sakinMap.invalidateSize();
                        if (layer.getBounds && Object.keys(layer.getBounds()).length > 0) {
                            try { window.sakinMap.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 20 }); } catch (e) { }
                        }
                    }, 900);
                }
            } catch (err) {
                console.error("Harita render hatası:", err);
            }
        }
    }

    loadData();
});
