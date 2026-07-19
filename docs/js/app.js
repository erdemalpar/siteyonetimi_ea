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
    }

    loadData();
});
