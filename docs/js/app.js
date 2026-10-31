function calculateGecikmeTazminati(tutar, yil, ay, is_paid = false, odeme_tarihi = null, db_kayitli_faiz = 0) {
    if (is_paid && db_kayitli_faiz > 0) return db_kayitli_faiz;
    if (is_paid && !db_kayitli_faiz) return 0;
    
    const vadeTarihi = new Date(yil, ay, 0); // O ayın son günü
    vadeTarihi.setHours(23, 59, 59, 999);
    
    const bitisTarihi = odeme_tarihi ? new Date(odeme_tarihi) : new Date();
    
    let gunFarki = Math.floor((bitisTarihi - vadeTarihi) / (1000 * 60 * 60 * 24));
    if (gunFarki <= 0) return 0;
    
    const gunlukFaizOrani = 0.05 / 30;
    const gecikmeTazminati = tutar * gunlukFaizOrani * gunFarki;
    
    return Math.round(gecikmeTazminati * 100) / 100;
}

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

    let hesaplar = null;
    let anahtarlar = null;
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
    // Hesap listesini yükle (kişisel veri içermez, veriler girişten sonra çözülür)
    async function loadData() {
        localStorage.removeItem('sakin_user'); // Önceki sürümün parolasız oturum kaydı
        try {
            const res = await fetch('veri/hesaplar.json?v=' + new Date().getTime());
            if (!res.ok) throw new Error('Veri dosyası bulunamadı. Yönetici henüz verileri yüklememiş olabilir.');
            hesaplar = await res.json();

            document.title = (hesaplar.site_adi || "Sakin Portalı") + " - Yönetim Sistemi";
        } catch (err) {
            console.error(err);
            loginError.innerText = "Sistemdeki veriler doğruyu göstermiyorsa Site Yöneticisi ile irtibata geçiniz.";
            loginError.classList.remove('hidden');
        }
    }

    // Login İşlemi
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uName = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;
        const girisBtn = document.getElementById('login-btn');

        if (!hesaplar) {
            loginError.innerText = "Sistem verileri henüz yüklenmedi.";
            loginError.classList.remove('hidden');
            return;
        }

        const girisYazisi = girisBtn.innerText;
        girisBtn.disabled = true;
        girisBtn.innerText = 'Kontrol ediliyor...';
        loginError.classList.add('hidden');

        try {
            const hesap = await window.PortalSifre.hesapAc(hesaplar, uName, pass);
            if (!hesap) {
                loginError.innerText = "Kullanıcı adı veya şifre hatalı.";
                loginError.classList.remove('hidden');
                return;
            }

            const [ortak, kisisel] = await Promise.all([
                window.PortalSifre.jsonIndir(hesap.ortak, 'veri/ortak.enc'),
                window.PortalSifre.jsonIndir(hesap.kisisel, hesap.dosya)
            ]);
            anahtarlar = hesap;
            siteData = { ...ortak, aidatlar: kisisel.aidatlar, dekontlar: kisisel.dekontlar };
            login(kisisel.daire);
        } catch (err) {
            console.error(err);
            loginError.innerText = "Veriler yüklenemedi. Lütfen daha sonra tekrar deneyin.";
            loginError.classList.remove('hidden');
        } finally {
            girisBtn.disabled = false;
            girisBtn.innerText = girisYazisi;
        }
    });

    // Dekont ve fatura düğmeleri şifreli belgeyi indirip yeni sekmede açar
    document.addEventListener('click', async (e) => {
        const dugme = e.target.closest('[data-belge-yol]');
        if (!dugme) return;
        e.preventDefault();

        const sekme = window.open('', '_blank');
        try {
            const anahtar = dugme.dataset.belgeKapsam === 'dekont' ? anahtarlar.kisisel : anahtarlar.ortak;
            const belge = await window.PortalSifre.belgeIndir(anahtar, dugme.dataset.belgeYol, dugme.dataset.belgeTip);
            sekme.location.href = URL.createObjectURL(belge);
        } catch (err) {
            console.error(err);
            if (sekme) sekme.close();
            alert('Belge açılamadı.');
        }
    });

    function login(user) {
        currentUser = user;

        loginError.classList.add('hidden');

        // Lithos transition efektini oynat
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

        renderDashboard();
        resetInactivityTimer();
    }

    function performLogout() {
        currentUser = null;
        siteData = null;
        anahtarlar = null;

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

            const buYilGelir = (siteData.gelirler && siteData.gelirler[currentYear]) || 0;
            let buYilGider = 0;

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

                const gecikme = calculateGecikmeTazminati(aidat.tutar, aidat.yil, aidat.ay, aidat.is_paid, aidat.odeme_tarihi, aidat.gecikme_tazminati_borcu);
                aidat.gecikmeTutari = gecikme;

                if (!aidat.is_paid) {
                    toplamBorc += (aidat.tutar + gecikme);
                    unpaidPaymentsList.push(aidat);
                }

                let dekontButonu = '';
                if (aidat.is_paid && siteData.dekontlar) {
                    const dekont = siteData.dekontlar.find(d => d.aidat_id === aidat.id);
                    if (dekont) {
                        dekontButonu = `<button data-belge-kapsam="dekont" data-belge-yol="${dekont.yol}" data-belge-tip="${dekont.tip}" style="margin-left:10px; padding:4px 8px; font-size:11px; background:#3498db; color:white; border:none; border-radius:3px; cursor:pointer;"><i class="fa-solid fa-eye"></i> Dekont</button>`;
                    }
                }

                tr.innerHTML = `
                    <td><i class="fa-solid ${aidat.tur === 'ekstra' ? 'fa-tools' : 'fa-home'}"></i> ${aidat.tur === 'ekstra' ? (aidat.aciklama || 'Ekstra Gider') : 'Aidat'}</td>
                    <td>${AYLAR[aidat.ay - 1] || aidat.ay} ${aidat.yil}</td>
                    <td>${aidat.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        ${gecikme > 0 ? `<br><small style="color:#ef4444;">+${gecikme.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ Faiz</small>` : ''}
                    </td>
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
                    const faturaDugmeleri = (g.faturalar || []).map((f, sira) =>
                        `<button data-belge-kapsam="fatura" data-belge-yol="${f.yol}" data-belge-tip="${f.tip}" style="margin-left:6px; padding:2px 6px; font-size:11px; background:#3498db; color:white; border:none; border-radius:3px; cursor:pointer;">Fatura${g.faturalar.length > 1 ? ' ' + (sira + 1) : ''}</button>`).join('');
                    tableHTML += `
                        <tr>
                            <td style="opacity:0.8;">${formattedDate}</td>
                            <td>${g.aciklama}${faturaDugmeleri}</td>
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

        if (siteData.parseller && siteData.parseller.length > 0) {
            const emptyLabel = document.getElementById('dash-map-empty');
            if (emptyLabel) emptyLabel.remove();

            const centerLatLng = [39.8662, 32.7215];
            window.sakinMap = L.map('dash-map').setView(centerLatLng, 18);

            L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 21,
                attribution: '© Google Maps'
            }).addTo(window.sakinMap);

            const hasAidatDebt = unpaidPaymentsList.some(p => p.tur !== 'ekstra');
            const hasEkstraDebt = unpaidPaymentsList.some(p => p.tur === 'ekstra');

            let mapColor = '#2ecc71'; // Borcu Yok
            if (hasAidatDebt && hasEkstraDebt) mapColor = '#a855f7';
            else if (hasAidatDebt) mapColor = '#ef4444';
            else if (hasEkstraDebt) mapColor = '#f97316';

            const NOTR_RENK = '#94a3b8';

            L.Control.Legend = L.Control.extend({
                onAdd: function () {
                    const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar legend');
                    div.style.backgroundColor = 'rgba(30, 40, 50, 0.95)';
                    div.style.color = '#fff';
                    div.style.padding = '10px 14px';
                    div.style.fontSize = '13px';
                    div.style.border = 'none';
                    div.style.borderRadius = '12px';
                    div.style.fontFamily = "'Inter', sans-serif";
                    div.innerHTML = `
                        <div style="display:flex; align-items:center; margin-bottom:8px;">
                            <span style="display:inline-block; width:14px; height:14px; border-radius:4px; background-color:${mapColor}; margin-right:10px;"></span> Sizin Parseliniz
                        </div>
                        <div style="display:flex; align-items:center;">
                            <span style="display:inline-block; width:14px; height:14px; border-radius:4px; background-color:${NOTR_RENK}; margin-right:10px;"></span> Diğer Parseller
                        </div>
                    `;
                    return div;
                }
            });
            new L.Control.Legend({ position: 'bottomright' }).addTo(window.sakinMap);

            const borcSatirlari = unpaidPaymentsList.map(p => {
                const etiket = p.tur === 'ekstra' ? (p.aciklama || 'Ekstra') : 'Aidat';
                const faiz = p.gecikmeTutari > 0 ? ` <span style="color:#ef4444; font-size:11px;">(+${p.gecikmeTutari.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ Faiz)</span>` : '';
                return `<li style="margin-bottom:4px;">${AYLAR[p.ay - 1] || p.ay} ${p.yil} ${etiket}: <b>${p.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</b>${faiz}</li>`;
            }).join('');

            const kendiPopup = `<div style="min-width: 200px; font-family:'Inter', sans-serif;">
                <b style="font-size:15px; color:#111;">${currentUser.sakin_ad || ''}</b><br>
                <span style="color:#555;">Ada: ${currentUser.adano || '-'} | Parsel: ${currentUser.parselno || '-'}</span><br>
                <span style="color:#555;">Sokak: ${currentUser.sokak} | Daire: ${currentUser.daire_no}</span>
                <div style="margin-top:10px; border-top:1px solid #ddd; padding-top:10px;">
                    <strong style="color:#e8702a; font-size:14px;">Ödenmemiş Borçlar:</strong>
                    <ul style="margin:8px 0 0 0; padding-left:18px; font-size:13px; color:#333;">
                        ${borcSatirlari || '<li style="color:#10b981; list-style-type:none; margin-left:-18px; font-weight:500;">Ödenmemiş borç bulunmamaktadır.</li>'}
                    </ul>
                </div>
            </div>`;

            // Komşu parselleri yalnızca sokak ve numara ile, borç bilgisi olmadan çizilir
            const parselGrubu = L.featureGroup().addTo(window.sakinMap);
            siteData.parseller.forEach(parsel => {
                const kendi = parsel.sokak === currentUser.sokak && parsel.daire_no === currentUser.daire_no;
                const renk = kendi ? mapColor : NOTR_RENK;
                const katman = L.geoJson(null, {
                    style: () => ({ color: renk, weight: kendi ? 4 : 2, fillColor: renk, fillOpacity: kendi ? 0.4 : 0.15 }),
                    onEachFeature: (feature, l) => {
                        if (kendi) l.bindPopup(kendiPopup);
                        l.bindTooltip(`${parsel.sokak}/${parsel.daire_no}`, { permanent: true, direction: 'center', className: 'parcel-label' });
                    }
                });

                let metin = parsel.koordinat;
                if (metin.startsWith('data:')) {
                    metin = decodeURIComponent(escape(atob(metin.split(',')[1])));
                }

                try {
                    if (parsel.bicim === 'KML') omnivore.kml.parse(metin, null, katman);
                    else if (parsel.bicim === 'Geo JSON') katman.addData(JSON.parse(metin));
                    katman.addTo(parselGrubu);
                } catch (err) {
                    console.error("Harita render hatası:", err);
                }
            });

            // Zaman aşımı ile bounds fit garantisi (login transition 800ms)
            setTimeout(() => {
                if (!window.sakinMap) return;
                window.sakinMap.invalidateSize();
                try { window.sakinMap.fitBounds(parselGrubu.getBounds(), { padding: [30, 30], maxZoom: 20 }); } catch (e) { }
            }, 900);
        }
    }

    loadData();
});
