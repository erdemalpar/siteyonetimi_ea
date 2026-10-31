// Şifreli portal dosyalarını tarayıcıda çözer (portal_sifreleme.js ile aynı biçim)
window.PortalSifre = (function () {
    const metinKodlayici = new TextEncoder();
    const metinCozucu = new TextDecoder();

    function base64Bayt(metin) {
        return Uint8Array.from(atob(metin), c => c.charCodeAt(0));
    }

    async function kullaniciKimligi(kullaniciAdi) {
        const ad = kullaniciAdi.trim().toLocaleLowerCase('tr-TR');
        const ozet = await crypto.subtle.digest('SHA-256', metinKodlayici.encode('site-portal:' + ad));
        return Array.from(new Uint8Array(ozet), b => b.toString(16).padStart(2, '0')).join('');
    }

    async function parolaAnahtari(parola, tuz, tekrar) {
        const temel = await crypto.subtle.importKey('raw', metinKodlayici.encode(parola), 'PBKDF2', false, ['deriveBits']);
        return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: tuz, iterations: tekrar }, temel, 256));
    }

    async function coz(anahtarBaytlari, kutu) {
        const anahtar = await crypto.subtle.importKey('raw', anahtarBaytlari, 'AES-GCM', false, ['decrypt']);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: kutu.subarray(0, 12) }, anahtar, kutu.subarray(12));
    }

    async function dosyaIndir(yol) {
        const yanit = await fetch(`${yol}?v=${Date.now()}`);
        if (!yanit.ok) throw new Error('Dosya bulunamadı: ' + yol);
        return new Uint8Array(await yanit.arrayBuffer());
    }

    // Hesap yoksa veya parola hatalıysa null döner
    async function hesapAc(hesaplar, kullaniciAdi, parola) {
        const hesap = hesaplar.hesaplar[await kullaniciKimligi(kullaniciAdi)];
        if (!hesap) return null;
        try {
            const anahtar = await parolaAnahtari(parola, base64Bayt(hesap.tuz), hesaplar.tekrar);
            return JSON.parse(metinCozucu.decode(await coz(anahtar, base64Bayt(hesap.kutu))));
        } catch (e) {
            return null;
        }
    }

    async function jsonIndir(anahtarBase64, yol) {
        return JSON.parse(metinCozucu.decode(await coz(base64Bayt(anahtarBase64), await dosyaIndir(yol))));
    }

    async function belgeIndir(anahtarBase64, yol, tip) {
        return new Blob([await coz(base64Bayt(anahtarBase64), await dosyaIndir(yol))], { type: tip });
    }

    return { hesapAc, jsonIndir, belgeIndir };
})();
