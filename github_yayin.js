// GitHub API ile portal verisini yayınlar (Git kurulumu gerektirmez)
const crypto = require('crypto');
const { eksikVeriBul, eksikVeriMesaji, listeSayilari, veriParmakIzi } = require('./veri_koruma');

const API_ADRESI = 'https://api.github.com';
const VERI_YOLU = 'docs/data.json'; // Şifresiz eski biçim, ilk şifreli yayında silinir
const SIFRELI_KLASOR = 'docs/veri/';
const OZET_YOLU = 'docs/yayin.json';
const RAW_KABUL = 'application/vnd.github.raw+json';
const MAX_DENEME = 3;

class GithubHatasi extends Error {
    constructor(mesaj, durum = 0) {
        super(mesaj);
        this.durum = durum;
    }
}

function durumMesaji(durum) {
    if (durum === 401) return 'GitHub token geçersiz veya süresi dolmuş. Ayarlardan yeni token girin.';
    if (durum === 403) return 'GitHub token bu depoya yazma yetkisine sahip değil veya istek sınırı aşıldı.';
    if (durum === 404) return 'GitHub deposu bulunamadı. Depo adresini ve token yetkisini kontrol edin.';
    if (durum >= 500) return 'GitHub şu anda yanıt vermiyor. Biraz sonra tekrar deneyin.';
    return `GitHub isteği başarısız oldu (hata kodu: ${durum}).`;
}

function gitBlobSha(baytlar) {
    const baslik = Buffer.concat([Buffer.from(`blob ${baytlar.length}`), Buffer.from([0])]);
    return crypto.createHash('sha1').update(baslik).update(baytlar).digest('hex');
}

function depoBilgisiCoz(url) {
    const eslesme = (url || '').trim().match(/^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
    if (!eslesme) throw new GithubHatasi('GitHub depo adresi geçersiz. Örnek: https://github.com/kullanici/depo');
    return { sahip: eslesme[1], depo: eslesme[2] };
}

function portalAdresi({ sahip, depo }) {
    const anaAdres = `${sahip.toLowerCase()}.github.io`;
    return depo.toLowerCase() === anaAdres ? `https://${anaAdres}/` : `https://${anaAdres}/${depo}/`;
}

function istemciOlustur({ fetchFn, token, sahip, depo, apiAdresi = API_ADRESI }) {
    const depoAdresi = `${apiAdresi}/repos/${sahip}/${depo}`;

    async function istek(yol, { method = 'GET', govde, kabul = 'application/vnd.github+json' } = {}) {
        let yanit;
        try {
            yanit = await fetchFn(depoAdresi + yol, {
                method,
                headers: {
                    Accept: kabul,
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'site-yonetim-paneli',
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                body: govde ? JSON.stringify(govde) : undefined
            });
        } catch (e) {
            throw new GithubHatasi("GitHub'a ulaşılamadı. İnternet bağlantınızı kontrol edin.");
        }
        if (!yanit.ok) throw new GithubHatasi(durumMesaji(yanit.status), yanit.status);
        return yanit;
    }

    const jsonIstek = async (yol, secenekler) => (await istek(yol, secenekler)).json();

    async function dosyaOku(yol, dal) {
        try {
            const yanit = await istek(`/contents/${yol}?ref=${encodeURIComponent(dal)}`, { kabul: RAW_KABUL });
            return await yanit.json();
        } catch (e) {
            if (e.durum === 404) return null;
            throw e;
        }
    }

    // Yalnızca değişen dosyalar yüklenir, listede olmayan eski portal verileri silinir
    async function agacDegisiklikleri(agacSha, dosyalar) {
        const uzakAgac = await jsonIstek(`/git/trees/${agacSha}?recursive=1`);
        const uzakDosyalar = new Map(uzakAgac.tree.filter(o => o.type === 'blob').map(o => [o.path, o.sha]));
        const istenenYollar = new Set(dosyalar.map(d => d.yol));

        const degisenler = [];
        for (const dosya of dosyalar) {
            const baytlar = Buffer.from(dosya.icerik);
            if (uzakDosyalar.get(dosya.yol) === gitBlobSha(baytlar)) continue;
            const blob = await jsonIstek('/git/blobs', {
                method: 'POST',
                govde: { content: baytlar.toString('base64'), encoding: 'base64' }
            });
            degisenler.push({ path: dosya.yol, mode: '100644', type: 'blob', sha: blob.sha });
        }

        const silinecekler = [...uzakDosyalar.keys()]
            .filter(yol => (yol === VERI_YOLU || yol.startsWith(SIFRELI_KLASOR)) && !istenenYollar.has(yol))
            .map(path => ({ path, mode: '100644', type: 'blob', sha: null }));

        return [...degisenler, ...silinecekler];
    }

    async function dosyalariGonder(dal, dosyalar, mesaj) {
        // Bu sırada depoya başka commit gelirse güncel uç üzerinden yeniden denenir
        for (let deneme = 1; ; deneme++) {
            const ref = await jsonIstek(`/git/ref/heads/${dal}`);
            const ucCommit = await jsonIstek(`/git/commits/${ref.object.sha}`);
            const degisiklikler = await agacDegisiklikleri(ucCommit.tree.sha, dosyalar);
            if (degisiklikler.length === 0) return ref.object.sha;

            const agac = await jsonIstek('/git/trees', {
                method: 'POST',
                govde: { base_tree: ucCommit.tree.sha, tree: degisiklikler }
            });
            const commit = await jsonIstek('/git/commits', {
                method: 'POST',
                govde: { message: mesaj, tree: agac.sha, parents: [ref.object.sha] }
            });
            try {
                await jsonIstek(`/git/refs/heads/${dal}`, { method: 'PATCH', govde: { sha: commit.sha, force: false } });
                return commit.sha;
            } catch (e) {
                const cakisma = e.durum === 409 || e.durum === 422;
                if (!cakisma || deneme >= MAX_DENEME) throw e;
            }
        }
    }

    async function baglantiyiDogrula() {
        const bilgi = await jsonIstek('');
        if (!bilgi.permissions || !bilgi.permissions.push) {
            throw new GithubHatasi('GitHub token bu depoya yazma yetkisine sahip değil.', 403);
        }
        return { varsayilanDal: bilgi.default_branch };
    }

    // İlk yayında özet dosyası olmadığı için veri dosyasından sayılır
    async function yayinOzetiOku(dal) {
        const ozet = await dosyaOku(OZET_YOLU, dal);
        if (ozet) return ozet;
        const veri = await dosyaOku(VERI_YOLU, dal);
        return veri ? { parmak_izi: null, sayilar: listeSayilari(veri) } : null;
    }

    return { baglantiyiDogrula, yayinOzetiOku, dosyalariGonder };
}

async function yayinla({ istemci, veri, dosyalariHazirla, force = false, ilerleme = () => {} }) {
    ilerleme('GitHub bağlantısı kontrol ediliyor...');
    const { varsayilanDal } = await istemci.baglantiyiDogrula();

    ilerleme('Yayındaki veriler karşılaştırılıyor...');
    const parmakIzi = veriParmakIzi(veri);
    const sayilar = listeSayilari(veri);
    const yayindaki = await istemci.yayinOzetiOku(varsayilanDal);

    if (yayindaki && yayindaki.parmak_izi === parmakIzi) {
        return { durum: 'degisiklik-yok', parmakIzi };
    }
    if (yayindaki && !force) {
        const eksikler = eksikVeriBul(sayilar, yayindaki.sayilar);
        if (eksikler.length > 0) {
            return { blocked: true, success: false, eksikler, error: eksikVeriMesaji(eksikler) };
        }
    }

    ilerleme('Veriler şifreleniyor...');
    const dosyalar = await dosyalariHazirla();

    ilerleme("Veriler GitHub'a gönderiliyor...");
    const ozet = { son_guncelleme: veri.son_guncelleme, parmak_izi: parmakIzi, sayilar };
    await istemci.dosyalariGonder(varsayilanDal, [
        ...dosyalar,
        { yol: OZET_YOLU, icerik: JSON.stringify(ozet) }
    ], 'Sakin portalı verileri güncellendi');

    return { durum: 'gonderildi', parmakIzi };
}

// GitHub Pages yayını bir süre aldığı için canlı özet dosyası yeni veriyi gösterene kadar beklenir
async function portaliDogrula({ fetchFn, adres, parmakIzi, deneme = 36, aralik = 5000 }) {
    for (let i = 0; i < deneme; i++) {
        try {
            const yanit = await fetchFn(`${adres}yayin.json?v=${Date.now()}`, { cache: 'no-store' });
            if (yanit.ok && (await yanit.json()).parmak_izi === parmakIzi) return true;
        } catch (e) {
            // Geçici ağ hataları sonraki denemede tekrar kontrol edilir
        }
        if (i < deneme - 1) await new Promise(resolve => setTimeout(resolve, aralik));
    }
    return false;
}

module.exports = { GithubHatasi, gitBlobSha, depoBilgisiCoz, portalAdresi, istemciOlustur, yayinla, portaliDogrula };
