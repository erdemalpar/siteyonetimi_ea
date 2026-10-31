// Spotlight Reveal & Login Logic
let currentUser = null; // Aktif kullanıcı bilgisi (role, daire_id vb.)

document.addEventListener('DOMContentLoaded', () => {
    // --- Spotlight Efekti (Canvas Mask) ---
    const SPOTLIGHT_R = 260;
    const canvas = document.getElementById('reveal-canvas');
    const revealDiv = document.getElementById('login-bg-reveal');
    let ctx = canvas.getContext('2d');

    let w, h;
    function resize() {
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;
    }
    window.addEventListener('resize', resize);
    resize();

    let mouse = { x: -999, y: -999 };
    let smooth = { x: -999, y: -999 };
    let rafRef;

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    function drawSpotlight() {
        if (mouse.x === -999) {
            rafRef = requestAnimationFrame(drawSpotlight);
            return;
        }

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

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(smooth.x, smooth.y, SPOTLIGHT_R, 0, Math.PI * 2);
        ctx.fill();

        const dataUrl = canvas.toDataURL();
        revealDiv.style.maskImage = `url(${dataUrl})`;
        revealDiv.style.webkitMaskImage = `url(${dataUrl})`;
        revealDiv.style.maskSize = '100% 100%';
        revealDiv.style.webkitMaskSize = '100% 100%';

        rafRef = requestAnimationFrame(drawSpotlight);
    }

    rafRef = requestAnimationFrame(drawSpotlight);

    // --- Login Logic ---
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('login-username');
    const errorMsg = document.getElementById('login-error');

    usernameInput.focus();

    const handleEnter = (e) => {
        if (e.key === 'Enter') {
            loginBtn.click();
        }
    };
    document.getElementById('login-username').addEventListener('keyup', handleEnter);
    document.getElementById('login-password').addEventListener('keyup', handleEnter);

    loginBtn.addEventListener('click', async () => {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        if (!username || !password) {
            errorMsg.textContent = "Lütfen tüm alanları doldurun!";
            errorMsg.classList.remove('hidden');
            return;
        }

        try {
            const result = await ipcRenderer.invoke('login', { username, password });

            if (result.success) {
                // Giriş Başarılı!
                errorMsg.classList.add('hidden');

                // Cleanup spotlight
                cancelAnimationFrame(rafRef);

                // Kullanıcı bilgilerini globale setle
                window.currentUser = result;

                // SessionStorage'a kaydet (main_window.js'nin okuyabilmesi için)
                sessionStorage.setItem('userRole', result.role);
                if (result.daire_id) {
                    sessionStorage.setItem('daireId', result.daire_id);
                    sessionStorage.setItem('userDaireId', result.daire_id);
                }
                if (result.sakin_ad) sessionStorage.setItem('sakin_ad', result.sakin_ad);

                // Login ekranını gizle, app container'ı aç
                const loginSection = document.getElementById('login-section');
                loginSection.style.opacity = '0';

                setTimeout(() => {
                    loginSection.style.display = 'none';
                    document.getElementById('app-container').style.display = 'flex';

                    // Main Window Başlatma Eventi Fırlat (veya direkt metod çağır)
                    if (window.initializeApp) {
                        window.initializeApp();
                    }
                }, 800); // CSS transition süresi
            } else {
                errorMsg.textContent = result.message;
                errorMsg.classList.remove('hidden');
            }
        } catch (error) {
            errorMsg.textContent = "Bir hata oluştu: " + error.message;
            errorMsg.classList.remove('hidden');
        }
    });
});
