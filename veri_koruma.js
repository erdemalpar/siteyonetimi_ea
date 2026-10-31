// Yayın ve geri yükleme öncesi veri kontrolleri (Electron ve veritabanından bağımsız)
const crypto = require('crypto');

const KONTROL_LISTELERI = [
    { anahtar: 'daireler', etiket: 'Daire' },
    { anahtar: 'aidatlar', etiket: 'Ödeme kaydı' },
    { anahtar: 'ekstra_odemeler', etiket: 'Ekstra ödeme' },
    { anahtar: 'giderler', etiket: 'Gider' },
    { anahtar: 'aidat_tanimlari', etiket: 'Aidat tanımı' },
    { anahtar: 'dosyalar', etiket: 'Dekont' }
];

const PORTAL_BICIMI = 'sifreli-1'; // Biçim değişince veri aynı olsa da yeniden yayınlanır
const MIN_EKSILME = 5;
const EKSILME_ORANI = 0.2;

function veriOzeti(veri) {
    return KONTROL_LISTELERI.map(({ anahtar, etiket }) => ({
        anahtar,
        etiket,
        adet: Array.isArray(veri[anahtar]) ? veri[anahtar].length : 0
    }));
}

function listeSayilari(veri) {
    const sayilar = {};
    veriOzeti(veri).forEach(({ anahtar, adet }) => { sayilar[anahtar] = adet; });
    return sayilar;
}

// Yayın zamanı hariç tutulur, böylece yalnızca gerçek veri değişiklikleri fark edilir
function veriParmakIzi(veri) {
    const { son_guncelleme, ...icerik } = veri;
    return crypto.createHash('sha256').update(PORTAL_BICIMI).update(JSON.stringify(icerik)).digest('hex');
}

// Normal silme işlemleri engellenmesin diye küçük azalmalar yok sayılır
function eksikVeriBul(yeniSayilar, yayindakiSayilar) {
    const eksikler = [];
    KONTROL_LISTELERI.forEach(({ anahtar, etiket }) => {
        const yeni = yeniSayilar[anahtar] || 0;
        const yayindaki = yayindakiSayilar[anahtar] || 0;
        const esik = Math.max(MIN_EKSILME, Math.ceil(yayindaki * EKSILME_ORANI));
        if (yayindaki - yeni >= esik) {
            eksikler.push({ anahtar, etiket, yeni, yayindaki });
        }
    });
    return eksikler;
}

function eksikVeriMesaji(eksikler) {
    const satirlar = eksikler.map(e => `${e.etiket}: yayında ${e.yayindaki}, bu bilgisayarda ${e.yeni}`);
    return `Bu bilgisayardaki veriler yayındaki verilerden eksik görünüyor:\n${satirlar.join('\n')}`;
}

function geriYuklemeHatasi(veri) {
    if (!veri || typeof veri !== 'object') return 'Dosya geçerli bir veri dosyası değil.';
    const eksikListe = KONTROL_LISTELERI.find(({ anahtar }) => !Array.isArray(veri[anahtar]));
    if (eksikListe) return `Dosyada "${eksikListe.anahtar}" listesi bulunamadı.`;
    if (veri.daireler.length === 0) return 'Dosyada hiç daire kaydı yok.';
    return null;
}

// JSON içindeki Buffer nesnesini tekrar ikili veriye çevirir
function dosyaVerisiCoz(fileData) {
    if (fileData && fileData.type === 'Buffer' && Array.isArray(fileData.data)) {
        return Buffer.from(fileData.data);
    }
    return fileData;
}

module.exports = { veriOzeti, listeSayilari, veriParmakIzi, eksikVeriBul, eksikVeriMesaji, geriYuklemeHatasi, dosyaVerisiCoz };
