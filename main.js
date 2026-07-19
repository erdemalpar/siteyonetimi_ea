const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { exec } = require('child_process');

const dbDir = path.join(__dirname, 'veritabani');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}
const dbPath = path.join(dbDir, 'site_yonetim.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Veritabanı bağlanırken hata oluştu: ", err.message);
    else initializeDatabase();
});

// Türkçe karakterleri temizleyen yardımcı fonksiyon
function generateUsername(name) {
    if(!name || name.trim() === 'BOŞ EV') return null;
    let username = name.toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/\s+/g, ''); // boşlukları sil
    return username;
}

function generateRandomPassword() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function initializeDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS daireler (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blok TEXT,
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
            durum TEXT DEFAULT 'aktif'
        )`);

        const sakinlerData = [
            // 1656 Sokak
            { sokak: "1656", no: "1", ad: "Mesut Aydoğan", tel: "532 544 17 97" },
            { sokak: "1656", no: "2", ad: "Ahmet Şahin Genç", tel: "532 463 76 77" },
            { sokak: "1656", no: "3", ad: "Mehmet Genli", tel: "533 518 31 41" },
            { sokak: "1656", no: "4", ad: "Kemal Boyramoğlu", tel: "532 650 67 68" },
            { sokak: "1656", no: "5", ad: "Koray Yücesoy", tel: "532 445 62 03" },
            { sokak: "1656", no: "6", ad: "Yılmaz Çetin", tel: "532 415 28 21" },
            { sokak: "1656", no: "7", ad: "Halit Erol", tel: "532 395 54 77" },
            { sokak: "1656", no: "8", ad: "Alihsan Tombak", tel: "532 613 62 24" },
            { sokak: "1656", no: "9", ad: "Nevzat Kemental", tel: "-" },
            { sokak: "1656", no: "11", ad: "Sabit Tekirdağ", tel: "532 312 94 53" },
            { sokak: "1656", no: "13", ad: "Mustafa Genli", tel: "533 168 52 52" },
            { sokak: "1656", no: "15", ad: "Oktay Yıldırım", tel: "532 544 58 95" },
            { sokak: "1656", no: "17", ad: "Zeynep Dağlı", tel: "533 421 85 91" },

            // 1657 Sokak
            { sokak: "1657", no: "1", ad: "Abdi Gezer", tel: "533 177 15 59" },
            { sokak: "1657", no: "2", ad: "İsmail Çokün", tel: "532 332 70 82" },
            { sokak: "1657", no: "3", ad: "Yılmaz Aydoğan", tel: "533 556 39 15" },
            { sokak: "1657", no: "4", ad: "Uğur Aydoğan", tel: "532 287 23 27" },
            { sokak: "1657", no: "5", ad: "Yıldırım Çetin", tel: "532 246 32 04" },
            { sokak: "1657", no: "8", ad: "Dilek Çetinkaya", tel: "533 398 19 56" },
            { sokak: "1657", no: "9", ad: "İbrahim Ölmez", tel: "532 273 53 06" },
            { sokak: "1657", no: "10", ad: "Faruk Akpınar", tel: "532 321 87 47" },
            { sokak: "1657", no: "11", ad: "Yunus Aynan", tel: "533 351 69 06" },
            { sokak: "1657", no: "12", ad: "Mustafa Deryal", tel: "532 232 96 54" },
            { sokak: "1657", no: "13", ad: "Taner Aydoğan", tel: "535 828 34 84" },
            { sokak: "1657", no: "14", ad: "Bülent Enis Şekerel", tel: "532 436 07 16" },
            { sokak: "1657", no: "15", ad: "BOŞ EV", tel: "-" },
            { sokak: "1657", no: "16", ad: "İsmet Levent Ünlü", tel: "532 256 88 44" },
            { sokak: "1657", no: "18", ad: "Hamit Küçük", tel: "530 608 97 99" },

            // 1658 Sokak
            { sokak: "1658", no: "1", ad: "Emirhan Özsoy", tel: "532 525 76 54" },
            { sokak: "1658", no: "3", ad: "Zafer Özyurt", tel: "505 270 18 70" },
            { sokak: "1658", no: "9", ad: "Ahmet Osman Boykese", tel: "533 328 04 88" },
            { sokak: "1658", no: "20", ad: "Ceyhan Aydoğan", tel: "533 420 33 90" },

            // 1660 Sokak
            { sokak: "1660", no: "1", ad: "Caner Aydoğan", tel: "533 477 17 67" },
            { sokak: "1660", no: "3", ad: "Candan Kayalar", tel: "533 430 12 68" },
            { sokak: "1660", no: "4", ad: "Mert Doğan", tel: "532 612 27 03" },
            { sokak: "1660", no: "5", ad: "Emin Eroner", tel: "532 321 55 13" },
            { sokak: "1660", no: "6", ad: "Halil Göçer", tel: "533 560 11 24" },
            { sokak: "1660", no: "8", ad: "İhsan Akif Gürsoy", tel: "532 598 23 10" }
        ];
        
        db.get("SELECT COUNT(*) as count FROM daireler", (err, row) => {
            if (!err && row.count === 0) {
                const insertQuery = db.prepare(`
                    INSERT INTO daireler 
                    (blok, daire_no, sakin_ad, sakin_telefon, sakin_mail, sakin_daire_konum, username, password, role, il, ilce, mahalle) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ankara', 'Çankaya', 'Lodumu(Me)')
                `);
                
                // Admin'i Ekle (Sanal Daire)
                insertQuery.run(null, null, "Yönetici", null, null, null, "admin", "Koycegiz+0048", "yonetici");
                
                sakinlerData.forEach(sakin => {
                    const konum = `${sakin.sokak} Sk. No: ${sakin.no}`;
                    const username = generateUsername(sakin.ad);
                    const randomPassword = username ? generateRandomPassword() : null;
                    const role = "sakin";
                    
                    insertQuery.run(
                        sakin.sokak, 
                        sakin.no, 
                        sakin.ad, 
                        sakin.tel, 
                        "-", 
                        konum,
                        username,
                        randomPassword,
                        role
                    );
                });

                insertQuery.finalize();
            }
        });
    });
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
        db.all("SELECT * FROM daireler WHERE role = 'sakin' ORDER BY blok ASC, CAST(daire_no AS INTEGER) ASC", [], (err, rows) => {
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
            LEFT JOIN aidatlar a ON a.daire_id = ? AND a.yil = eo.yil AND a.ay = eo.ay AND a.tur = 'ekstra' AND a.odendi_mi = 1
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

ipcMain.handle('get-aidat-tanimlari', (event, yil) => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM aidat_tanimlari WHERE yil = ?", [yil], (err, rows) => {
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

ipcMain.handle('delete-ekstra-odeme', (event, id) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM ekstra_odemeler WHERE id = ?", [id], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
});

ipcMain.handle('set-aidat-odeme-durumu', (event, { daire_id, yil, ay, tutar, odendi_mi, tur }) => {
    return new Promise((resolve, reject) => {
        if (odendi_mi) {
            db.get("SELECT id FROM aidatlar WHERE daire_id = ? AND yil = ? AND ay = ? AND tur = ?", [daire_id, yil, ay, tur], (err, row) => {
                if (err) return reject(err);
                if (row) {
                    db.run("UPDATE aidatlar SET odendi_mi = 1, tutar = ? WHERE id = ?", [tutar, row.id], function(err) {
                        if (err) reject(err); else resolve(this.changes);
                    });
                } else {
                    db.run("INSERT INTO aidatlar (daire_id, yil, ay, tutar, odendi_mi, tur) VALUES (?, ?, ?, ?, 1, ?)",
                        [daire_id, yil, ay, tutar, tur], function(err) {
                            if (err) reject(err); else resolve(this.lastID);
                        }
                    );
                }
            });
        } else {
            db.run("DELETE FROM aidatlar WHERE daire_id = ? AND yil = ? AND ay = ? AND tur = ?", [daire_id, yil, ay, tur], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        }
    });
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
            [tarih, aciklama, tutar, fatura_dosyasi || null, durum || 'aktif'],
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
        let params = [tarih, aciklama, tutar, durum || 'aktif'];
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
            const tumSakinler = await new Promise((res, rej) => db.all("SELECT id, blok, daire_no, sakin_ad, adano, parselno FROM daireler WHERE role = 'sakin'", [], (err, rows) => err ? rej(err) : res(rows)));
            
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
                    LEFT JOIN aidatlar a ON a.daire_id = d.id AND a.yil = eo.yil AND a.ay = eo.ay AND a.tur = 'ekstra' AND a.tutar = eo.tutar AND a.odendi_mi = 1
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
            const prevGiderRow = await getQuery("SELECT SUM(tutar) as sum FROM giderler WHERE CAST(strftime('%Y', tarih) AS INTEGER) < ? AND durum != 'pasif'", [year]);
            const oncekiYillarGider = prevGiderRow.sum || 0;
            
            const devredenBakiye = oncekiYillarGelir - oncekiYillarGider;
            
            // Bu yılın toplam geliri
            const currentGelirRow = await getQuery("SELECT SUM(tutar) as sum FROM aidatlar WHERE odendi_mi = 1 AND yil = ?", [year]);
            const buYilGelir = currentGelirRow.sum || 0;
            
            // Bu yılın toplam gideri
            const currentGiderRow = await getQuery("SELECT SUM(tutar) as sum FROM giderler WHERE strftime('%Y', tarih) = ? AND durum != 'pasif'", [year.toString()]);
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
            LEFT JOIN aidatlar a ON a.daire_id = d.id AND a.yil = eo.yil AND a.ay = eo.ay AND a.tur = 'ekstra' AND a.odendi_mi = 1
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

ipcMain.handle('get-ayarlar', () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM ayarlar", [], (err, rows) => {
            if (err) reject(err);
            else {
                const settings = {};
                rows.forEach(r => settings[r.anahtar] = r.deger);
                resolve(settings);
            }
        });
    });
});

ipcMain.handle('save-ayarlar', (event, data) => {
    return new Promise((resolve, reject) => {
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

// GitHub Publish Handler
ipcMain.handle('publish-to-github', async (event, args) => {
    return new Promise((resolve) => {
        db.all("SELECT * FROM ayarlar", [], (err, rows) => {
            if (err) return resolve({ success: false, error: err.message });
            
            const ayarlar = {};
            rows.forEach(r => { ayarlar[r.anahtar] = r.deger; });

            const githubUrl = (args && args.url) ? args.url : ayarlar['github_url'];
            const githubPat = (args && args.pat) ? args.pat : ayarlar['github_pat'];

            if (!githubUrl || !githubPat) {
                return resolve({ success: false, error: 'GitHub URL veya PAT ayarlanmamış! Lütfen Ayarlar sayfasından bilgilerinizi girin.' });
            }

            db.all("SELECT * FROM daireler", [], (err, daireler) => {
                if (err) return resolve({ success: false, error: err.message });
                db.all("SELECT * FROM aidatlar", [], (err, aidatlar) => {
                    db.all("SELECT * FROM ekstra_odemeler", [], (err, ekstralar) => {
                        db.all("SELECT * FROM giderler", [], (err, giderler) => {
                            db.all("SELECT * FROM aidat_tanimlari", [], (err, aidatTanimlari) => {
                                
                                const exportData = {
                                    site_adi: ayarlar['site_adi'] || "Site Yönetimi",
                                    banka_adi: ayarlar['banka_adi'] || "",
                                    iban: ayarlar['iban'] || "",
                                    banka_qr: ayarlar['banka_qr'] || "",
                                    daireler: daireler,
                                    aidatlar: aidatlar,
                                    ekstra_odemeler: ekstralar,
                                    giderler: giderler,
                                    aidat_tanimlari: aidatTanimlari,
                                    son_guncelleme: new Date().toISOString()
                                };

                                const docsDir = path.join(__dirname, 'docs');
                                if (!fs.existsSync(docsDir)) {
                                    fs.mkdirSync(docsDir);
                                }

                                const dataPath = path.join(docsDir, 'data.json');
                                fs.writeFileSync(dataPath, JSON.stringify(exportData, null, 2), 'utf-8');

                                const urlWithoutProtocol = githubUrl.replace(/^https?:\/\//, '');
                                const authUrl = `https://${githubPat}@${urlWithoutProtocol}`;
                                const execOptions = { cwd: __dirname };

                                const isGitExists = fs.existsSync(path.join(__dirname, '.git'));
                                
                                const runGitCommands = async () => {
                                    try {
                                        const execPromise = require('util').promisify(exec);
                                        
                                        if (!isGitExists) {
                                            await execPromise('git init', execOptions);
                                            await execPromise('git branch -M main', execOptions);
                                        }

                                        try {
                                            await execPromise('git remote remove origin', execOptions);
                                        } catch (e) { /* ignore if no origin */ }
                                        
                                        await execPromise(`git remote add origin ${authUrl}`, execOptions);
                                        await execPromise('git add docs/', execOptions);
                                        
                                        try {
                                            await execPromise('git commit -m "Sakin portalı verileri güncellendi"', execOptions);
                                        } catch (e) {
                                            // Nothing to commit is fine
                                        }
                                        
                                        await execPromise('git push -u origin main', execOptions);
                                        
                                        // Güvenlik için tokenlı url yerine normalini geri koy
                                        await execPromise(`git remote set-url origin ${githubUrl}`, execOptions);
                                        
                                        resolve({ success: true });
                                    } catch (err) {
                                        // Temizlik
                                        try { await require('util').promisify(exec)(`git remote set-url origin ${githubUrl}`, execOptions); } catch (e) {}
                                        
                                        resolve({ success: false, error: 'Git İşlem Hatası (LÜTFEN YENİDEN BAŞLATINIZ): ' + err.message + '\nNot: GitHub deponuz boş değilse önce deponuzu temizlemeniz veya eşlemeniz gerekebilir.' });
                                    }
                                };
                                
                                runGitCommands();
                            });
                        });
                    });
                });
            });
        });
    });
});
