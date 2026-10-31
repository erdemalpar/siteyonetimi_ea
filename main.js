const { app, BrowserWindow, ipcMain, dialog, net, safeStorage, shell, clipboard } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { veriOzeti, veriParmakIzi, geriYuklemeHatasi, dosyaVerisiCoz } = require('./veri_koruma');
const { depoBilgisiCoz, portalAdresi, istemciOlustur, yayinla, portaliDogrula } = require('./github_yayin');
const {
    MIN_PAROLA_UZUNLUGU, parolaUret, zayifParolalar, parolaAnahtari,
    portalDosyalariOlustur, kurtarmaAnahtariOlustur, kurtarmaArsiviniAc
} = require('./portal_sifreleme');

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

const userDataPath = app.getPath('userData');
const dbDir = path.join(userDataPath, 'veritabani');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'site_yonetim.sqlite');
const backupDir = path.join(dbDir, 'yedekler');
const MAX_YEDEK_SAYISI = 30;

// Eskiden projede var olan veritabanı taşınacaksa
const oldDbDir = path.join(__dirname, 'veritabani');
const oldDbPath = path.join(oldDbDir, 'site_yonetim.sqlite');

if (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) {
    try {
        fs.copyFileSync(oldDbPath, dbPath);
        console.log("Eski veritabanı başarıyla userData klasörüne aktarıldı.");
    } catch(e) {
        console.error("Veritabanı taşıma hatası:", e);
    }
}
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Veritabanı bağlanırken hata oluştu: ", err.message);
    else initializeDatabase();
});

// Ekstra ödeme kayıtları yıl ve ay yerine ait oldukları tanıma bağlanır,
// böylece aynı aydaki birden fazla ekstra ödeme birbirine karışmaz
const EKSTRA_BAGLA_SQL = `
    UPDATE aidatlar SET ekstra_id = COALESCE(
        (SELECT eo.id FROM ekstra_odemeler eo WHERE eo.yil = aidatlar.yil AND eo.ay = aidatlar.ay AND eo.tutar = aidatlar.tutar ORDER BY eo.id LIMIT 1),
        (SELECT eo.id FROM ekstra_odemeler eo WHERE eo.yil = aidatlar.yil AND eo.ay = aidatlar.ay ORDER BY eo.id LIMIT 1)
    )
    WHERE tur = 'ekstra' AND ekstra_id IS NULL`;

function initializeDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS daireler (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sokak TEXT,
            daire_no TEXT,
            sakin_ad TEXT,
            sakin_telefon TEXT,
            sakin_mail TEXT,
            sakin_daire_konum TEXT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            il TEXT DEFAULT 'Ankara',
            ilce TEXT DEFAULT 'Çankaya',
            mahalle TEXT DEFAULT 'Lodumu(Me)',
            adano TEXT,
            parselno TEXT,
            koordinat_formati TEXT,
            koordinat_dosyasi TEXT
        )`);

        // Migration: blok -> sokak (Veritabanında önceden varsa değiştir)
        db.run("ALTER TABLE daireler RENAME COLUMN blok TO sokak;", (err) => {
            if(err && !err.message.includes("no such column")) {
                console.log("Migration info:", err.message);
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS aidatlar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            daire_id INTEGER,
            yil INTEGER,
            ay INTEGER,
            tutar REAL,
            odendi_mi INTEGER DEFAULT 0,
            tur TEXT DEFAULT 'aidat',
            FOREIGN KEY(daire_id) REFERENCES daireler(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS aidat_tanimlari (
            yil INTEGER,
            ay INTEGER,
            tutar REAL,
            PRIMARY KEY(yil, ay)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS ekstra_odemeler (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            yil INTEGER,
            ay INTEGER,
            aciklama TEXT,
            tutar REAL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS giderler (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tarih TEXT,
            aciklama TEXT,
            tutar REAL,
            fatura_dosyasi TEXT,
            durum INTEGER DEFAULT 1
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS dosyalar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            related_table TEXT,
            related_id INTEGER,
            file_data TEXT,
            file_type TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            durum INTEGER DEFAULT 1
        )`);

        const tables = ['daireler', 'aidatlar', 'aidat_tanimlari', 'ekstra_odemeler', 'giderler', 'dosyalar', 'ayarlar'];
        tables.forEach(table => {
            db.run(`ALTER TABLE ${table} ADD COLUMN durum INTEGER DEFAULT 1`, (err) => {});
        });
        
        db.run(`ALTER TABLE aidatlar ADD COLUMN odeme_tarihi TEXT`, (err) => {});
        db.run(`ALTER TABLE aidatlar ADD COLUMN gecikme_tazminati_borcu REAL DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE aidatlar ADD COLUMN gecikme_tazminati_odendi INTEGER DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE aidatlar ADD COLUMN ekstra_id INTEGER`, (err) => {});
        db.run(EKSTRA_BAGLA_SQL);

        // Eski 'aktif' ve 'pasif' değerlerini 1 ve 2'ye çevir (giderler tablosunda kullanılıyordu)
        db.run(`UPDATE giderler SET durum = 1 WHERE durum = 'aktif'`);
        db.run(`UPDATE giderler SET durum = 2 WHERE durum = 'pasif'`);

        db.run(`CREATE TABLE IF NOT EXISTS ayarlar (
            anahtar TEXT PRIMARY KEY,
            deger TEXT,
            durum INTEGER DEFAULT 1
        )`);

        db.get("SELECT COUNT(*) as count FROM daireler", (err, row) => {
            if (!err && row.count === 0) {
                const insertQuery = db.prepare(`
                    INSERT INTO daireler 
                    (sokak, daire_no, sakin_ad, sakin_telefon, sakin_mail, sakin_daire_konum, username, password, role, il, ilce, mahalle) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ankara', 'Çankaya', 'Lodumu(Me)')
                `);
                
                // Admin'i Ekle (Sanal Daire)
                insertQuery.run(null, null, "Yönetici", null, null, null, "admin", "ilk-giris-degistirin", "yonetici");
                
                insertQuery.finalize();
            }
            createDailyBackup().catch(e => console.error("Otomatik yedek alınamadı:", e.message));
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err); else resolve(this);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

function listBackups() {
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
        .filter(name => name.endsWith('.sqlite'))
        .map(name => {
            const stat = fs.statSync(path.join(backupDir, name));
            return { name, tarih: stat.mtime.toISOString(), boyut: stat.size };
        })
        .sort((a, b) => b.tarih.localeCompare(a.tarih));
}

async function createBackup(tur) {
    fs.mkdirSync(backupDir, { recursive: true });
    const damga = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${tur}_${damga}.sqlite`;
    await dbRun("VACUUM INTO ?", [path.join(backupDir, name)]);
    listBackups().slice(MAX_YEDEK_SAYISI).forEach(yedek => fs.unlinkSync(path.join(backupDir, yedek.name)));
    return name;
}

// Boş veritabanı yedeklenmez, böylece gerçek yedekler listeden düşmez
async function createDailyBackup() {
    const [{ adet }] = await dbAll("SELECT COUNT(*) as adet FROM aidatlar");
    if (adet === 0) return;
    const bugun = new Date().toDateString();
    const bugunAlindi = listBackups().some(y => y.name.startsWith('otomatik_') && new Date(y.tarih).toDateString() === bugun);
    if (!bugunAlindi) await createBackup('otomatik');
}

async function getAyarlar() {
    const rows = await dbAll("SELECT * FROM ayarlar");
    const ayarlar = {};
    rows.forEach(r => { ayarlar[r.anahtar] = r.deger; });
    return ayarlar;
}

// Token Windows/macOS kullanıcı hesabına bağlı şifreyle saklanır
function encryptSecret(metin) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Bu bilgisayarda güvenli token saklama kullanılamıyor.');
    return safeStorage.encryptString(metin).toString('base64');
}

function decryptSecret(sifreli) {
    if (!sifreli) return null;
    try {
        return safeStorage.decryptString(Buffer.from(sifreli, 'base64'));
    } catch (e) {
        return null;
    }
}

function setAyar(anahtar, deger) {
    return dbRun("INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES (?, ?)", [anahtar, deger]);
}

// Portal şifreleme anahtarı değişmediği sürece aynı içerik aynı şifreli dosyayı üretir
async function getPortalAnaAnahtari(ayarlar) {
    const kayitli = decryptSecret(ayarlar.portal_ana_anahtar);
    if (kayitli) return Buffer.from(kayitli, 'base64');
    const yeniAnahtar = require('crypto').randomBytes(32);
    await setAyar('portal_ana_anahtar', encryptSecret(yeniAnahtar.toString('base64')));
    return yeniAnahtar;
}

// Veritabanı başka bir bilgisayardan taşındıysa token çözülemez ve yeniden girilmesi gerekir
function readGithubToken(ayarlar) {
    return decryptSecret(ayarlar.github_token_sifreli);
}

async function migrateGithubToken() {
    const { github_pat } = await getAyarlar();
    if (github_pat === undefined) return;
    if (github_pat) {
        await setAyar('github_token_sifreli', encryptSecret(github_pat));
    }
    await dbRun("DELETE FROM ayarlar WHERE anahtar = 'github_pat'");
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        fullscreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true
    });
    mainWindow.maximize();
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
    createWindow();
    migrateGithubToken().catch(e => console.error("Token taşınamadı:", e.message));
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC İşleyicileri
ipcMain.handle('login', (event, {username, password}) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM daireler WHERE username = ? AND password = ?", [username, password], (err, row) => {
            if (err) reject(err);
            else if (row) resolve({success: true, role: row.role, daire_id: row.id, sakin_ad: row.sakin_ad});
            else resolve({success: false, message: "Geçersiz kullanıcı adı veya şifre!"});
        });
    });
});

ipcMain.handle('get-daireler', () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM daireler WHERE role = 'sakin' ORDER BY sokak ASC, CAST(daire_no AS INTEGER) ASC", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('update-daire-info', (event, data) => {
    return new Promise((resolve, reject) => {
        const { id, sakin_ad, sakin_telefon, sakin_mail, il, ilce, mahalle, adano, parselno, koordinat_formati, koordinat_dosyasi, username, password } = data;
        
        let query = `UPDATE daireler SET sakin_ad = ?, sakin_telefon = ?, sakin_mail = ?, il = ?, ilce = ?, mahalle = ?, adano = ?, parselno = ?, username = ?, password = ?`;
        let params = [sakin_ad, sakin_telefon, sakin_mail, il, ilce, mahalle, adano, parselno, username || null, password || null];

        if (koordinat_formati !== undefined && koordinat_dosyasi !== undefined) {
            query += `, koordinat_formati = ?, koordinat_dosyasi = ?`;
            params.push(koordinat_formati, koordinat_dosyasi);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
});

ipcMain.handle('get-aidatlar', (event, daire_id) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM aidatlar WHERE daire_id = ? ORDER BY yil DESC, ay DESC", [daire_id], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('get-daire-unpaid-details', async (event, daire_id) => {
    return new Promise((resolve, reject) => {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;

        const query = `
            SELECT at.yil, at.ay, 'aidat' as tur, at.tutar, 'Aidat' as aciklama
            FROM aidat_tanimlari at
            LEFT JOIN aidatlar a ON a.daire_id = ? AND a.yil = at.yil AND a.ay = at.ay AND a.tur = 'aidat' AND a.odendi_mi = 1
            WHERE (at.yil < ? OR (at.yil = ? AND at.ay <= ?)) AND a.id IS NULL
            UNION
            SELECT eo.yil, eo.ay, 'ekstra' as tur, eo.tutar, eo.aciklama
            FROM ekstra_odemeler eo
            LEFT JOIN aidatlar a ON a.daire_id = ? AND a.ekstra_id = eo.id AND a.odendi_mi = 1
            WHERE (eo.yil < ? OR (eo.yil = ? AND eo.ay <= ?)) AND a.id IS NULL
            ORDER BY 1 DESC, 2 DESC
        `;
        db.all(query, [daire_id, currentYear, currentYear, currentMonth, daire_id, currentYear, currentYear, currentMonth], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('add-aidat', (event, aidat) => {
    return new Promise((resolve, reject) => {
        const { daire_id, yil, ay, tutar, odendi_mi } = aidat;
        db.run("INSERT INTO aidatlar (daire_id, yil, ay, tutar, odendi_mi) VALUES (?, ?, ?, ?, ?)",
            [daire_id, yil, ay, tutar, odendi_mi ? 1 : 0],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
});

ipcMain.handle('update-aidat-durum', (event, id, odendi_mi) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE aidatlar SET odendi_mi = ? WHERE id = ?",
            [odendi_mi ? 1 : 0, id],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
});

ipcMain.handle('get-aidat-tanimlari', (event) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM aidat_tanimlari", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('set-aidat-tanimi', (event, { yil, ay, tutar }) => {
    return new Promise((resolve, reject) => {
        db.run("INSERT OR REPLACE INTO aidat_tanimlari (yil, ay, tutar) VALUES (?, ?, ?)",
            [yil, ay, tutar],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
});

ipcMain.handle('delete-aidat-tanimi', async (event, { yil, ay }) => {
    await deleteAidatlarWithFiles("yil = ? AND ay = ? AND tur = 'aidat'", [yil, ay]);
    return (await dbRun("DELETE FROM aidat_tanimlari WHERE yil = ? AND ay = ?", [yil, ay])).changes;
});

ipcMain.handle('delete-all-aidat-tanimlari', async () => {
    await deleteAidatlarWithFiles("tur = 'aidat'", []);
    return (await dbRun("DELETE FROM aidat_tanimlari")).changes;
});

ipcMain.handle('get-ekstra-odemeler', (event, yil) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM ekstra_odemeler WHERE yil = ?", [yil], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('add-ekstra-odeme', (event, { yil, ay, aciklama, tutar }) => {
    return new Promise((resolve, reject) => {
        db.run("INSERT INTO ekstra_odemeler (yil, ay, aciklama, tutar) VALUES (?, ?, ?, ?)",
            [yil, ay, aciklama, tutar],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
});

// Silinen ödemelerin dekontları sahipsiz kalmasın diye birlikte silinir
function deleteAidatlarWithFiles(kosul, params) {
    return dbRun(`DELETE FROM dosyalar WHERE related_table = 'aidatlar' AND related_id IN (SELECT id FROM aidatlar WHERE ${kosul})`, params)
        .then(() => dbRun(`DELETE FROM aidatlar WHERE ${kosul}`, params));
}

ipcMain.handle('delete-ekstra-odeme', async (event, id) => {
    await deleteAidatlarWithFiles("ekstra_id = ?", [id]);
    return (await dbRun("DELETE FROM ekstra_odemeler WHERE id = ?", [id])).changes;
});

ipcMain.handle('set-aidat-odeme-durumu', async (event, { daire_id, yil, ay, tutar, odendi_mi, tur, gecikme_tutari = 0, ekstra_id = null, odeme_tarihi = null }) => {
    const kayitKosulu = tur === 'ekstra' ? "daire_id = ? AND ekstra_id = ?" : "daire_id = ? AND yil = ? AND ay = ? AND tur = 'aidat'";
    const kayitParametreleri = tur === 'ekstra' ? [daire_id, ekstra_id] : [daire_id, yil, ay];

    if (!odendi_mi) {
        await deleteAidatlarWithFiles(kayitKosulu, kayitParametreleri);
        return null;
    }

    const tarih = odeme_tarihi || new Date().toISOString().split('T')[0];
    const [mevcut] = await dbAll(`SELECT id FROM aidatlar WHERE ${kayitKosulu}`, kayitParametreleri);
    if (mevcut) {
        await dbRun("UPDATE aidatlar SET odendi_mi = 1, tutar = ?, odeme_tarihi = ?, gecikme_tazminati_borcu = ? WHERE id = ?", [tutar, tarih, gecikme_tutari, mevcut.id]);
        return mevcut.id;
    }
    const yeni = await dbRun("INSERT INTO aidatlar (daire_id, yil, ay, tutar, odendi_mi, tur, odeme_tarihi, gecikme_tazminati_borcu, ekstra_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)",
        [daire_id, yil, ay, tutar, tur, tarih, gecikme_tutari, ekstra_id]);
    return yeni.lastID;
});

// Gelir & Gider işlemleri
ipcMain.handle('get-giderler', () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM giderler ORDER BY id DESC", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('add-gider', (event, {tarih, aciklama, tutar, fatura_dosyasi, durum}) => {
    return new Promise((resolve, reject) => {
        db.run("INSERT INTO giderler (tarih, aciklama, tutar, fatura_dosyasi, durum) VALUES (?, ?, ?, ?, ?)",
            [tarih, aciklama, tutar, fatura_dosyasi || null, durum || 1],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
});

ipcMain.handle('update-gider', (event, {id, tarih, aciklama, tutar, fatura_dosyasi, durum}) => {
    return new Promise((resolve, reject) => {
        let query = "UPDATE giderler SET tarih = ?, aciklama = ?, tutar = ?, durum = ?";
        let params = [tarih, aciklama, tutar, durum || 1];
        if (fatura_dosyasi !== undefined) {
            query += ", fatura_dosyasi = ?";
            params.push(fatura_dosyasi);
        }
        query += " WHERE id = ?";
        params.push(id);
        
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
});

ipcMain.handle('set-gider-durum', (event, {id, durum}) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE giderler SET durum = ? WHERE id = ?", [durum, id], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
});

ipcMain.handle('delete-gider', (event, id) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM giderler WHERE id = ?", [id], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
});

// Dashboard İstatistikleri
ipcMain.handle('get-dashboard-stats', async (event, params = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            const getQuery = (query, p = []) => new Promise((res, rej) => db.get(query, p, (err, row) => err ? rej(err) : res(row)));
            
            const stats = { totalDaire: 0, odemeyen: 0, odenen: 0, toplamGelir: 0, toplamGider: 0, bakiye: 0, beklenenAidat: 0, beklenenEkstra: 0 };
            const today = new Date();
            const currentYear = params.year || today.getFullYear();
            const currentMonth = params.month || today.getMonth() + 1;
            
            const daireRow = await getQuery("SELECT COUNT(*) as count FROM daireler WHERE role = 'sakin'");
            stats.totalDaire = daireRow.count;
            
            const gelirRow = await getQuery("SELECT SUM(tutar) as gelir FROM aidatlar WHERE odendi_mi = 1 AND yil = ?", [currentYear]);
            stats.toplamGelir = gelirRow.gelir || 0;
            
            const giderRow = await getQuery("SELECT SUM(tutar) as gider FROM giderler WHERE strftime('%Y', tarih) = ?", [currentYear.toString()]);
            stats.toplamGider = giderRow.gider || 0;
            stats.bakiye = stats.toplamGelir - stats.toplamGider;
            
            // Calculate who owes aidat for the ENTIRE currentYear (up to current month if it is the current year)
            stats.odemeyenListesi = [];
            const tumSakinler = await new Promise((res, rej) => db.all("SELECT id, sokak, daire_no, sakin_ad, adano, parselno FROM daireler WHERE role = 'sakin'", [], (err, rows) => err ? rej(err) : res(rows)));
            
            // Check if there are any aidat definitions for the year
            const yearTanimCount = await getQuery("SELECT COUNT(*) as count FROM aidat_tanimlari WHERE yil = ?", [currentYear]);
            if (yearTanimCount.count > 0) {
                const todayForQuery = new Date();
                const actualYear = todayForQuery.getFullYear();
                const actualMonth = todayForQuery.getMonth() + 1;
                const limitMonth = (currentYear === actualYear) ? actualMonth : 12;

                // Find flats that have at least one UNPAID aidat for the year up to the limitMonth
                const flatsWithDebtRows = await new Promise((res, rej) => db.all(`
                    SELECT DISTINCT d.id 
                    FROM daireler d
                    JOIN aidat_tanimlari at ON at.yil = ?
                    LEFT JOIN aidatlar a ON a.daire_id = d.id AND a.yil = at.yil AND a.ay = at.ay AND a.tur = 'aidat' AND a.odendi_mi = 1
                    WHERE d.role = 'sakin' AND a.id IS NULL AND at.ay <= ?
                    UNION
                    SELECT DISTINCT d.id
                    FROM daireler d
                    JOIN ekstra_odemeler eo ON eo.yil = ?
                    LEFT JOIN aidatlar a ON a.daire_id = d.id AND a.ekstra_id = eo.id AND a.odendi_mi = 1
                    WHERE d.role = 'sakin' AND a.id IS NULL AND eo.ay <= ?
                `, [currentYear, limitMonth, currentYear, limitMonth], (err, rows) => err ? rej(err) : res(rows)));
                
                const flatsWithDebtSet = new Set(flatsWithDebtRows.map(r => r.id));
                stats.odemeyenListesi = tumSakinler.filter(d => flatsWithDebtSet.has(d.id));
                stats.odemeyen = stats.odemeyenListesi.length;
                stats.odenen = stats.totalDaire - stats.odemeyen;
            } else {
                stats.odenen = 0;
                stats.odemeyen = 0;
            }
            
            const aidatTanimRow = await getQuery("SELECT SUM(tutar) as sum FROM aidat_tanimlari WHERE yil = ?", [currentYear]);
            stats.beklenenAidat = (aidatTanimRow.sum || 0) * stats.totalDaire;
            
            const ekstraTanimRow = await getQuery("SELECT SUM(tutar) as sum FROM ekstra_odemeler WHERE yil = ?", [currentYear]);
            stats.beklenenEkstra = (ekstraTanimRow.sum || 0) * stats.totalDaire;
            
            resolve(stats);
        } catch (err) {
            reject(err);
        }
    });
});

ipcMain.handle('get-gelir-gider-stats', async (event, year) => {
    return new Promise(async (resolve, reject) => {
        try {
            const getQuery = (query, p = []) => new Promise((res, rej) => db.get(query, p, (err, row) => err ? rej(err) : res(row)));
            
            // Önceki yılların toplam geliri
            const prevGelirRow = await getQuery("SELECT SUM(tutar) as sum FROM aidatlar WHERE odendi_mi = 1 AND yil < ?", [year]);
            const oncekiYillarGelir = prevGelirRow.sum || 0;
            
            // Önceki yılların toplam gideri
            const prevGiderRow = await getQuery("SELECT SUM(tutar) as sum FROM giderler WHERE CAST(strftime('%Y', tarih) AS INTEGER) < ? AND durum != 2", [year]);
            const oncekiYillarGider = prevGiderRow.sum || 0;
            
            const devredenBakiye = oncekiYillarGelir - oncekiYillarGider;
            
            // Bu yılın toplam geliri
            const currentGelirRow = await getQuery("SELECT SUM(tutar) as sum FROM aidatlar WHERE odendi_mi = 1 AND yil = ?", [year]);
            const buYilGelir = currentGelirRow.sum || 0;
            
            // Bu yılın toplam gideri
            const currentGiderRow = await getQuery("SELECT SUM(tutar) as sum FROM giderler WHERE strftime('%Y', tarih) = ? AND durum != 2", [year.toString()]);
            const buYilGider = currentGiderRow.sum || 0;
            
            const guncelBakiye = devredenBakiye + buYilGelir - buYilGider;
            
            // Bu yıla ait giderler listesi
            const giderlerListesi = await new Promise((res, rej) => {
                db.all("SELECT * FROM giderler WHERE strftime('%Y', tarih) = ? ORDER BY tarih DESC", [year.toString()], (err, rows) => {
                    if (err) rej(err);
                    else res(rows);
                });
            });
            
            resolve({
                devredenBakiye,
                buYilGelir,
                buYilGider,
                guncelBakiye,
                giderlerListesi
            });
        } catch (err) {
            reject(err);
        }
    });
});

ipcMain.handle('get-all-daire-payment-status', async () => {
    return new Promise((resolve, reject) => {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;

        const aidatQuery = `
            SELECT DISTINCT d.id FROM daireler d
            JOIN aidat_tanimlari at ON (at.yil < ? OR (at.yil = ? AND at.ay <= ?))
            LEFT JOIN aidatlar a ON a.daire_id = d.id AND a.yil = at.yil AND a.ay = at.ay AND a.tur = 'aidat' AND a.odendi_mi = 1
            WHERE d.role = 'sakin' AND a.id IS NULL
            UNION
            SELECT daire_id FROM aidatlar WHERE tur = 'aidat' AND odendi_mi = 0 AND (yil < ? OR (yil = ? AND ay <= ?))
        `;
        
        const ekstraQuery = `
            SELECT DISTINCT d.id FROM daireler d
            JOIN ekstra_odemeler eo ON (eo.yil < ? OR (eo.yil = ? AND eo.ay <= ?))
            LEFT JOIN aidatlar a ON a.daire_id = d.id AND a.ekstra_id = eo.id AND a.odendi_mi = 1
            WHERE d.role = 'sakin' AND a.id IS NULL
            UNION
            SELECT daire_id FROM aidatlar WHERE tur = 'ekstra' AND odendi_mi = 0 AND (yil < ? OR (yil = ? AND ay <= ?))
        `;

        db.all(aidatQuery, [currentYear, currentYear, currentMonth, currentYear, currentYear, currentMonth], (err, aidatBorcluRows) => {
            if (err) return reject(err);
            
            db.all(ekstraQuery, [currentYear, currentYear, currentMonth, currentYear, currentYear, currentMonth], (err, ekstraBorcluRows) => {
                if (err) return reject(err);
                
                const aidatBorclular = new Set(aidatBorcluRows.map(r => r.id || r.daire_id));
                const ekstraBorclular = new Set(ekstraBorcluRows.map(r => r.id || r.daire_id));
                
                db.all("SELECT id FROM daireler WHERE role = 'sakin'", (err, tumDaireler) => {
                    if (err) return reject(err);
                    
                    const result = {};
                    tumDaireler.forEach(d => {
                        const hasAidatBorc = aidatBorclular.has(d.id);
                        const hasEkstraBorc = ekstraBorclular.has(d.id);
                        
                        if (hasAidatBorc && hasEkstraBorc) result[d.id] = '#a855f7'; // Mor
                        else if (hasAidatBorc) result[d.id] = '#ef4444'; // Kırmızı
                        else if (hasEkstraBorc) result[d.id] = '#e8702a'; // Turuncu
                        else result[d.id] = '#10b981'; // Yeşil
                    });
                    
                    resolve(result);
                });
            });
        });
    });
});

ipcMain.handle('get-ayarlar', async () => {
    const { github_pat, github_token_sifreli, portal_ana_anahtar, kurtarma_anahtari, ...settings } = await getAyarlar();
    settings.github_token_var = Boolean(github_token_sifreli);
    settings.kurtarma_var = Boolean(decryptSecret(kurtarma_anahtari));
    return settings;
});

ipcMain.handle('save-ayarlar', (event, { github_pat, ...data }) => {
    return new Promise((resolve, reject) => {
        if (github_pat) data.github_token_sifreli = encryptSecret(github_pat);
        const keys = Object.keys(data);
        if (keys.length === 0) return resolve();
        
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare("INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES (?, ?)");
            for (const key of keys) {
                stmt.run([key, data[key]]);
            }
            stmt.finalize();
            db.run("COMMIT", err => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
});

// Portala yayınlanacak veri; yönetici hesabı portalda kullanılmadığı için dahil edilmez
async function buildPortalData() {
    const ayarlar = await getAyarlar();
    return {
        site_adi: ayarlar['site_adi'] || "Site Yönetimi",
        banka_adi: ayarlar['banka_adi'] || "",
        iban: ayarlar['iban'] || "",
        banka_qr: ayarlar['banka_qr'] || "",
        daireler: await dbAll("SELECT * FROM daireler WHERE role != 'yonetici'"),
        aidatlar: await dbAll("SELECT * FROM aidatlar"),
        ekstra_odemeler: await dbAll("SELECT * FROM ekstra_odemeler"),
        giderler: await dbAll("SELECT * FROM giderler"),
        aidat_tanimlari: await dbAll("SELECT * FROM aidat_tanimlari"),
        dosyalar: await dbAll("SELECT * FROM dosyalar"),
        son_guncelleme: new Date().toISOString()
    };
}

function githubIstemcisi(url, token) {
    const depoBilgisi = depoBilgisiCoz(url);
    return {
        depoBilgisi,
        istemci: istemciOlustur({ fetchFn: (...args) => net.fetch(...args), token, ...depoBilgisi })
    };
}

ipcMain.handle('get-yayin-durumu', async () => {
    const ayarlar = await getAyarlar();
    const yapilandirildi = Boolean(ayarlar.github_url && ayarlar.github_token_sifreli);
    return {
        yapilandirildi,
        degisiklikVar: veriParmakIzi(await buildPortalData()) !== ayarlar.son_yayin_parmak_izi,
        sonYayin: ayarlar.son_yayin_tarihi || null
    };
});

ipcMain.handle('github-baglanti-test', async (event, { url, token }) => {
    try {
        const kayitliToken = token || readGithubToken(await getAyarlar());
        if (!url || !kayitliToken) return { success: false, error: 'Depo adresi ve token girilmelidir.' };
        const { istemci, depoBilgisi } = githubIstemcisi(url, kayitliToken);
        await istemci.baglantiyiDogrula();
        return { success: true, portalAdresi: portalAdresi(depoBilgisi) };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

let yayinDevamEdiyor = false;

ipcMain.handle('publish-to-github', async (event, { force = false } = {}) => {
    if (yayinDevamEdiyor) return { success: false, error: 'Yayınlama zaten devam ediyor.' };
    yayinDevamEdiyor = true;

    const ilerleme = mesaj => {
        if (!event.sender.isDestroyed()) event.sender.send('yayin-ilerleme', mesaj);
    };

    try {
        const ayarlar = await getAyarlar();
        const token = readGithubToken(ayarlar);
        if (!ayarlar.github_url || !token) {
            return { success: false, error: 'Portal bağlantısı kurulmamış. Ayarlar sayfasından depo adresini ve token bilgisini girin.' };
        }

        const kurtarmaMetni = decryptSecret(ayarlar.kurtarma_anahtari);
        if (!kurtarmaMetni) {
            return { success: false, error: 'Kurtarma parolası belirlenmemiş. Ayarlar > Sakin Parolaları ve Güvenlik bölümünden belirleyin.' };
        }

        const { istemci, depoBilgisi } = githubIstemcisi(ayarlar.github_url, token);
        const veri = await buildPortalData();

        const zayiflar = zayifParolalar(veri.daireler);
        if (zayiflar.length > 0) {
            return { success: false, error: `${zayiflar.length} sakinin parolası zayıf veya boş. Ayarlar > Sakin Parolaları ve Güvenlik bölümünden yenileyin.` };
        }

        const anaAnahtar = await getPortalAnaAnahtari(ayarlar);
        const sonuc = await yayinla({
            istemci,
            veri,
            force,
            ilerleme,
            dosyalariHazirla: () => portalDosyalariOlustur({ veri, anaAnahtar, kurtarma: JSON.parse(kurtarmaMetni) })
        });
        if (sonuc.blocked) return sonuc;

        const adres = portalAdresi(depoBilgisi);
        await setAyar('son_yayin_parmak_izi', sonuc.parmakIzi);
        if (sonuc.durum === 'degisiklik-yok') return { success: true, durum: 'degisiklik-yok', portalAdresi: adres };

        await setAyar('son_yayin_tarihi', veri.son_guncelleme);

        ilerleme('Portalın güncellenmesi bekleniyor...');
        const portaldaGorundu = await portaliDogrula({
            fetchFn: (...args) => net.fetch(...args),
            adres,
            parmakIzi: sonuc.parmakIzi
        });
        return { success: true, durum: portaldaGorundu ? 'yayinda' : 'bekleniyor', portalAdresi: adres };
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        yayinDevamEdiyor = false;
    }
});

// Yedekleme ve geri yükleme işlemleri
ipcMain.handle('list-backups', () => listBackups());

ipcMain.handle('create-backup', async () => {
    try {
        return { success: true, name: await createBackup('elle') };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('restore-backup', async (event, name) => {
    try {
        const kaynak = path.join(backupDir, path.basename(name));
        if (!fs.existsSync(kaynak)) return { success: false, error: 'Yedek dosyası bulunamadı.' };

        const yedekVerisi = fs.readFileSync(kaynak);
        await createBackup('geri_donus_oncesi');
        await new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
        fs.writeFileSync(dbPath, yedekVerisi);

        app.relaunch();
        app.exit(0);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('select-import-file', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Geri yüklenecek data.json dosyasını seçin',
        defaultPath: path.join(__dirname, 'docs', 'data.json'),
        properties: ['openFile'],
        filters: [{ name: 'Portal Verisi', extensions: ['json'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    try {
        const veri = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const hata = geriYuklemeHatasi(veri);
        if (hata) return { success: false, error: hata };

        const mevcut = {};
        for (const { anahtar } of veriOzeti(veri)) {
            const [{ adet }] = await dbAll(`SELECT COUNT(*) as adet FROM ${anahtar}`);
            mevcut[anahtar] = adet;
        }
        return { success: true, filePath, ozet: veriOzeti(veri), mevcut, son_guncelleme: veri.son_guncelleme || null };
    } catch (e) {
        return { success: false, error: 'Dosya okunamadı: ' + e.message };
    }
});

async function insertRows(table, rows) {
    const kolonlar = (await dbAll(`PRAGMA table_info(${table})`)).map(k => k.name);
    for (const row of rows) {
        const anahtarlar = kolonlar.filter(k => row[k] !== undefined);
        const yerTutucular = anahtarlar.map(() => '?').join(', ');
        await dbRun(`INSERT INTO ${table} (${anahtarlar.join(', ')}) VALUES (${yerTutucular})`, anahtarlar.map(k => row[k]));
    }
}

async function restoreVeri(veri) {
    const yedekAdi = await createBackup('geri_yukleme_oncesi');

    // Portal verisi yönetici satırını içermez, giriş yapılabilmesi için korunur
    const yoneticiVar = veri.daireler.some(d => d.role === 'yonetici');
    const yoneticiler = yoneticiVar ? [] : await dbAll("SELECT * FROM daireler WHERE role = 'yonetici'");

    await dbRun("BEGIN TRANSACTION");
    try {
        for (const { anahtar } of veriOzeti(veri)) {
            await dbRun(`DELETE FROM ${anahtar}`);
            const satirlar = anahtar === 'dosyalar'
                ? veri.dosyalar.map(d => ({ ...d, file_data: dosyaVerisiCoz(d.file_data) }))
                : veri[anahtar];
            await insertRows(anahtar, satirlar);
        }
        await dbRun(EKSTRA_BAGLA_SQL);
        await insertRows('daireler', yoneticiler.map(y => ({ ...y, id: undefined })));
        for (const anahtar of ['site_adi', 'banka_adi', 'iban', 'banka_qr']) {
            if (veri[anahtar]) await setAyar(anahtar, veri[anahtar]);
        }
        await dbRun("COMMIT");
    } catch (e) {
        await dbRun("ROLLBACK");
        throw e;
    }
    return yedekAdi;
}

ipcMain.handle('import-data-json', async (event, filePath) => {
    try {
        const veri = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const hata = geriYuklemeHatasi(veri);
        if (hata) return { success: false, error: hata };
        return { success: true, yedekAdi: await restoreVeri(veri) };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Yeni bilgisayarda portal adresindeki şifreli arşiv kurtarma parolasıyla açılır
ipcMain.handle('portaldan-geri-yukle', async (event, { url, parola }) => {
    try {
        const adres = portalAdresi(depoBilgisiCoz(url));
        const indir = async yol => {
            const yanit = await net.fetch(`${adres}${yol}?v=${Date.now()}`, { cache: 'no-store' });
            if (!yanit.ok) throw new Error('Portal dosyası indirilemedi: ' + yol);
            return Buffer.from(await yanit.arrayBuffer());
        };

        const arsiv = JSON.parse((await indir('veri/yonetici.json')).toString('utf8'));
        const { veri, anaAnahtar } = await kurtarmaArsiviniAc({ arsiv, parola, belgeOku: indir });
        const hata = geriYuklemeHatasi(veri);
        if (hata) return { success: false, error: hata };

        const yedekAdi = await restoreVeri(veri);

        const anahtar = await parolaAnahtari(parola, Buffer.from(arsiv.tuz, 'base64'), arsiv.tekrar);
        await setAyar('portal_ana_anahtar', encryptSecret(anaAnahtar.toString('base64')));
        await setAyar('kurtarma_anahtari', encryptSecret(JSON.stringify({ tuz: arsiv.tuz, anahtar: anahtar.toString('base64') })));
        return { success: true, yedekAdi };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Parola ve güvenlik işlemleri
ipcMain.handle('get-parola-listesi', async () => {
    const ayarlar = await getAyarlar();
    let adres = '';
    try {
        adres = portalAdresi(depoBilgisiCoz(ayarlar.github_url));
    } catch (e) {
        // Bağlantı henüz kurulmadıysa adres boş kalır
    }
    const sakinler = await dbAll("SELECT id, sokak, daire_no, sakin_ad, sakin_telefon, username, password FROM daireler WHERE role = 'sakin' ORDER BY sokak ASC, CAST(daire_no AS INTEGER) ASC");
    return {
        siteAdi: ayarlar.site_adi || 'Site Yönetimi',
        portalAdresi: adres,
        sakinler: sakinler.map(s => ({ ...s, zayif: zayifParolalar([s]).length > 0 }))
    };
});

ipcMain.handle('parola-yenile', async (event, daireId = null) => {
    const hedefler = daireId === null
        ? await dbAll("SELECT id FROM daireler WHERE role = 'sakin' AND username IS NOT NULL")
        : [{ id: daireId }];
    for (const { id } of hedefler) {
        await dbRun("UPDATE daireler SET password = ? WHERE id = ?", [parolaUret(), id]);
    }
    return { success: true, adet: hedefler.length };
});

ipcMain.handle('set-kurtarma-parolasi', async (event, parola) => {
    if (!parola || parola.length < 12) return { success: false, error: 'Kurtarma parolası en az 12 karakter olmalıdır.' };
    await setAyar('kurtarma_anahtari', encryptSecret(JSON.stringify(await kurtarmaAnahtariOlustur(parola))));
    return { success: true };
});

ipcMain.handle('yonetici-parola-degistir', async (event, { mevcut, yeni }) => {
    if (!yeni || yeni.length < MIN_PAROLA_UZUNLUGU) {
        return { success: false, error: `Yeni parola en az ${MIN_PAROLA_UZUNLUGU} karakter olmalıdır.` };
    }
    if (yeni === mevcut) return { success: false, error: 'Yeni parola mevcut paroladan farklı olmalıdır.' };
    const sonuc = await dbRun("UPDATE daireler SET password = ? WHERE role = 'yonetici' AND password = ?", [yeni, mevcut]);
    return sonuc.changes > 0 ? { success: true } : { success: false, error: 'Mevcut parola hatalı.' };
});

// Parola adres satırına yazılmasın diye mesaj panoya kopyalanır, sohbet ayrı açılır
ipcMain.handle('whatsapp-ac', async (event, { telefon, mesaj }) => {
    const rakamlar = (telefon || '').replace(/\D/g, '').replace(/^0+/, '');
    const numara = rakamlar.length === 10 ? '90' + rakamlar : rakamlar;
    if (numara.length !== 12) return { success: false, error: 'Bu sakinin telefon numarası geçerli değil.' };
    clipboard.writeText(mesaj);
    await shell.openExternal(`https://wa.me/${numara}`);
    return { success: true };
});

// Dosyalar işlemleri (Dekont vs.)
ipcMain.handle('select-file', async () => {
    const result = await require('electron').dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Dekont/Dosya', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    
    const filePath = result.filePaths[0];
    const fileData = fs.readFileSync(filePath);
    const fileName = require('path').basename(filePath);
    
    return { data: fileData, name: fileName };
});

ipcMain.handle('save-file', (event, { category, related_id, fileData, fileName }) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM dosyalar WHERE related_table = ? AND related_id = ?", [category, related_id], function(err) {
            if (err) return reject(err);
            db.run("INSERT INTO dosyalar (related_table, related_id, file_data, file_type) VALUES (?, ?, ?, ?)",
                [category, related_id, fileData, fileName], function(err2) {
                    if (err2) reject(err2); else resolve(this.lastID);
                });
        });
    });
});

ipcMain.handle('delete-file', (event, { category, related_id }) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM dosyalar WHERE related_table = ? AND related_id = ?", [category, related_id], function(err) {
            if (err) reject(err); else resolve();
        });
    });
});

ipcMain.handle('get-file', (event, { related_table, related_id }) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT file_data, file_type FROM dosyalar WHERE related_table = ? AND related_id = ?", [related_table, related_id], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
});

// Ödeme kaydı silinmiş eski dekontlar
ipcMain.handle('get-sahipsiz-dekontlar', () => dbAll(`
    SELECT id, file_type as name, created_at FROM dosyalar
    WHERE related_table = 'aidatlar' AND related_id NOT IN (SELECT id FROM aidatlar)
    ORDER BY id`));

ipcMain.handle('get-dosya', async (event, id) => {
    const [dosya] = await dbAll("SELECT file_type as name, file_data as data FROM dosyalar WHERE id = ?", [id]);
    return dosya || null;
});

ipcMain.handle('delete-dosya', async (event, id) => (await dbRun("DELETE FROM dosyalar WHERE id = ?", [id])).changes);

ipcMain.handle('get-file-list', (event, related_table) => {
    return new Promise((resolve, reject) => {
        // file_data kolonunu 'data' olarak map ediyoruz çünkü frontend 'file.data' bekliyor
        db.all("SELECT related_id, file_type as name, file_data as data FROM dosyalar WHERE related_table = ?", [related_table], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
});

