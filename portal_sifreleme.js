// Portal verisini GitHub Pages'te herkese açık durabilecek şifreli dosyalara dönüştürür
const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2 = promisify(crypto.pbkdf2);

const PAROLA_TEKRARI = 600000;
const MIN_PAROLA_UZUNLUGU = 8;
const PAROLA_KARAKTERLERI = 'abcdefghjkmnpqrstuvwxyz23456789'; // Karışan karakterler (l, i, o, 0, 1) yok

const MIME_TURLERI = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

function hmac(anahtar, veri) {
    return crypto.createHmac('sha256', anahtar).update(veri).digest();
}

function altAnahtar(anaAnahtar, etiket) {
    return Buffer.from(crypto.hkdfSync('sha256', anaAnahtar, Buffer.alloc(0), etiket, 32));
}

// IV içerikten türetilir: aynı içerik aynı şifreli dosyayı verir ve depoda boşuna yer kaplamaz
function sifrele(anahtar, veri) {
    const iv = hmac(anahtar, veri).subarray(0, 12);
    const cipher = crypto.createCipheriv('aes-256-gcm', anahtar, iv);
    return Buffer.concat([iv, cipher.update(veri), cipher.final(), cipher.getAuthTag()]);
}

function coz(anahtar, kutu) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', anahtar, kutu.subarray(0, 12));
    decipher.setAuthTag(kutu.subarray(kutu.length - 16));
    return Buffer.concat([decipher.update(kutu.subarray(12, kutu.length - 16)), decipher.final()]);
}

const jsonSifrele = (anahtar, nesne) => sifrele(anahtar, Buffer.from(JSON.stringify(nesne), 'utf8'));
const jsonCoz = (anahtar, kutu) => JSON.parse(coz(anahtar, kutu).toString('utf8'));
const parolaAnahtari = (parola, tuz, tekrar = PAROLA_TEKRARI) => pbkdf2(parola, tuz, tekrar, 32, 'sha256');

function kullaniciKimligi(kullaniciAdi) {
    const ad = kullaniciAdi.trim().toLocaleLowerCase('tr-TR');
    return crypto.createHash('sha256').update('site-portal:' + ad).digest('hex');
}

function parolaUret() {
    const secim = uzunluk => Array.from({ length: uzunluk }, () => PAROLA_KARAKTERLERI[crypto.randomInt(PAROLA_KARAKTERLERI.length)]).join('');
    return `${secim(5)}-${secim(5)}`;
}

function zayifParolalar(daireler) {
    return daireler.filter(d => d.username && (!d.password || d.password.length < MIN_PAROLA_UZUNLUGU));
}

function mimeTuru(dosyaAdi) {
    const uzanti = (dosyaAdi || '').split('.').pop().toLowerCase();
    return MIME_TURLERI[uzanti] || 'application/octet-stream';
}

function dataUrlCoz(dataUrl) {
    const eslesme = dataUrl.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
    if (!eslesme) return null;
    const baytlar = eslesme[2] ? Buffer.from(eslesme[3], 'base64') : Buffer.from(decodeURIComponent(eslesme[3]));
    return { tip: eslesme[1] || 'application/octet-stream', baytlar };
}

// Gider kaydında tek dosya veya dosya listesi tutuluyor olabilir
function faturaListesi(faturaDosyasi) {
    if (!faturaDosyasi) return [];
    if (faturaDosyasi.startsWith('[')) {
        try {
            return JSON.parse(faturaDosyasi);
        } catch (e) {
            return [];
        }
    }
    return [faturaDosyasi];
}

function daireAnahtarYolu(anaAnahtar, daireId) {
    return `veri/k/${hmac(anaAnahtar, `dosya:${daireId}`).toString('hex').slice(0, 24)}.enc`;
}

async function portalDosyalariOlustur({ veri, anaAnahtar, kurtarma }) {
    const dosyalar = new Map();
    const ortakAnahtar = altAnahtar(anaAnahtar, 'ortak');
    const arsivAnahtar = altAnahtar(anaAnahtar, 'arsiv');
    const kisiselAnahtar = daireId => altAnahtar(anaAnahtar, `daire:${daireId}`);

    const belgeEkle = (anahtar, baytlar, ad, tip) => {
        const kutu = sifrele(anahtar, baytlar);
        const yol = `veri/b/${crypto.createHash('sha256').update(kutu).digest('hex').slice(0, 24)}.enc`;
        dosyalar.set(yol, kutu);
        return { yol, ad, tip };
    };

    const hesapliDaireler = veri.daireler.filter(d => d.username && d.password);
    const hesapliIdler = new Set(hesapliDaireler.map(d => d.id));

    const giderler = veri.giderler.map(gider => {
        const { fatura_dosyasi, ...alanlar } = gider;
        const faturalar = faturaListesi(fatura_dosyasi).map(dataUrlCoz).filter(Boolean).map((f, sira) =>
            belgeEkle(ortakAnahtar, f.baytlar, `fatura-${gider.id}-${sira + 1}`, f.tip));
        return { ...alanlar, faturalar };
    });

    const gelirler = {};
    veri.aidatlar.filter(a => a.odendi_mi === 1).forEach(a => {
        gelirler[a.yil] = (gelirler[a.yil] || 0) + a.tutar;
    });

    const parseller = veri.daireler.filter(d => d.koordinat_dosyasi && d.koordinat_formati).map(d => ({
        sokak: d.sokak,
        daire_no: d.daire_no,
        bicim: d.koordinat_formati,
        koordinat: d.koordinat_dosyasi
    }));

    dosyalar.set('veri/ortak.enc', jsonSifrele(ortakAnahtar, {
        site_adi: veri.site_adi,
        banka_adi: veri.banka_adi,
        iban: veri.iban,
        banka_qr: veri.banka_qr,
        aidat_tanimlari: veri.aidat_tanimlari,
        ekstra_odemeler: veri.ekstra_odemeler,
        giderler,
        gelirler,
        parseller,
        son_guncelleme: veri.son_guncelleme
    }));

    // Dekont yalnızca ödemenin sahibi olan dairenin anahtarıyla açılır; sahibi bulunamayanlar arşivde kalır
    const aidatSahipleri = new Map(veri.aidatlar.map(a => [a.id, a.daire_id]));
    const dekontlar = new Map();
    const arsivDosyalari = veri.dosyalar.map(dosya => {
        const baytlar = Buffer.isBuffer(dosya.file_data) ? dosya.file_data : Buffer.from(dosya.file_data.data);
        const sahip = dosya.related_table === 'aidatlar' ? aidatSahipleri.get(dosya.related_id) : undefined;
        const sahipli = hesapliIdler.has(sahip);
        const anahtar = sahipli ? kisiselAnahtar(sahip) : arsivAnahtar;
        const belge = belgeEkle(anahtar, baytlar, dosya.file_type, mimeTuru(dosya.file_type));
        if (sahipli) {
            if (!dekontlar.has(sahip)) dekontlar.set(sahip, []);
            dekontlar.get(sahip).push({ ...belge, aidat_id: dosya.related_id });
        }
        const { file_data, ...alanlar } = dosya;
        return { ...alanlar, yol: belge.yol, anahtar: anahtar.toString('base64') };
    });

    const hesaplar = {};
    for (const daire of hesapliDaireler) {
        const anahtar = kisiselAnahtar(daire.id);
        const yol = daireAnahtarYolu(anaAnahtar, daire.id);
        dosyalar.set(yol, jsonSifrele(anahtar, {
            daire: {
                id: daire.id,
                sokak: daire.sokak,
                daire_no: daire.daire_no,
                sakin_ad: daire.sakin_ad,
                adano: daire.adano,
                parselno: daire.parselno
            },
            aidatlar: veri.aidatlar.filter(a => a.daire_id === daire.id),
            dekontlar: dekontlar.get(daire.id) || []
        }));

        const tuz = hmac(anaAnahtar, `tuz:${daire.id}:${daire.password}`).subarray(0, 16);
        const hesapAnahtari = await parolaAnahtari(daire.password, tuz);
        hesaplar[kullaniciKimligi(daire.username)] = {
            tuz: tuz.toString('base64'),
            kutu: jsonSifrele(hesapAnahtari, {
                ortak: ortakAnahtar.toString('base64'),
                kisisel: anahtar.toString('base64'),
                dosya: yol
            }).toString('base64')
        };
    }

    dosyalar.set('veri/hesaplar.json', Buffer.from(JSON.stringify({
        site_adi: veri.site_adi,
        tekrar: PAROLA_TEKRARI,
        hesaplar
    }), 'utf8'));

    // Faturalar arşivde de saklanır, böylece yeni bilgisayara tüm veri geri yüklenebilir
    const arsivGiderleri = veri.giderler.map(({ fatura_dosyasi, ...alanlar }) => ({
        ...alanlar,
        fatura_liste: Boolean(fatura_dosyasi) && fatura_dosyasi.startsWith('['),
        faturalar: giderler.find(g => g.id === alanlar.id).faturalar
    }));

    dosyalar.set('veri/yonetici.json', Buffer.from(JSON.stringify({
        tekrar: PAROLA_TEKRARI,
        tuz: kurtarma.tuz,
        kutu: jsonSifrele(Buffer.from(kurtarma.anahtar, 'base64'), {
            ana_anahtar: anaAnahtar.toString('base64'),
            veri: { ...veri, giderler: arsivGiderleri, dosyalar: arsivDosyalari }
        }).toString('base64')
    }), 'utf8'));

    return [...dosyalar].map(([yol, icerik]) => ({ yol: `docs/${yol}`, icerik }));
}

async function kurtarmaAnahtariOlustur(parola) {
    const tuz = crypto.randomBytes(16);
    const anahtar = await parolaAnahtari(parola, tuz);
    return { tuz: tuz.toString('base64'), anahtar: anahtar.toString('base64') };
}

// Şifreli arşivi çözer ve belgeleri `belgeOku(yol)` ile indirip özgün kayıtlara dönüştürür
async function kurtarmaArsiviniAc({ arsiv, parola, belgeOku }) {
    const anahtar = await parolaAnahtari(parola, Buffer.from(arsiv.tuz, 'base64'), arsiv.tekrar);
    let icerik;
    try {
        icerik = jsonCoz(anahtar, Buffer.from(arsiv.kutu, 'base64'));
    } catch (e) {
        throw new Error('Kurtarma parolası hatalı.');
    }

    const anaAnahtar = Buffer.from(icerik.ana_anahtar, 'base64');
    const ortakAnahtar = altAnahtar(anaAnahtar, 'ortak');
    const veri = icerik.veri;

    veri.dosyalar = await Promise.all(veri.dosyalar.map(async ({ yol, anahtar: dosyaAnahtari, ...alanlar }) => ({
        ...alanlar,
        file_data: coz(Buffer.from(dosyaAnahtari, 'base64'), await belgeOku(yol))
    })));

    veri.giderler = await Promise.all(veri.giderler.map(async ({ faturalar, fatura_liste, ...alanlar }) => {
        const dataUrller = await Promise.all(faturalar.map(async f =>
            `data:${f.tip};base64,${coz(ortakAnahtar, await belgeOku(f.yol)).toString('base64')}`));
        const fatura_dosyasi = fatura_liste ? JSON.stringify(dataUrller) : (dataUrller[0] || alanlar.fatura_dosyasi || null);
        return { ...alanlar, fatura_dosyasi };
    }));

    return { veri, anaAnahtar };
}

module.exports = {
    MIN_PAROLA_UZUNLUGU,
    coz,
    jsonCoz,
    altAnahtar,
    parolaAnahtari,
    kullaniciKimligi,
    parolaUret,
    zayifParolalar,
    portalDosyalariOlustur,
    kurtarmaAnahtariOlustur,
    kurtarmaArsiviniAc
};
