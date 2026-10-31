const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'veritabani', 'site_yonetim.sqlite'));

db.all("SELECT id FROM daireler WHERE role = 'sakin'", (err, daireler) => {
    if (err) throw err;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const stmt = db.prepare("INSERT INTO aidatlar (daire_id, yil, ay, tutar, tur, odendi_mi) VALUES (?, ?, ?, ?, 'aidat', 1)");
        for (const d of daireler) {
            for (let ay = 1; ay <= 12; ay++) {
                stmt.run(d.id, 2025, ay, 9000.0);
            }
        }
        stmt.finalize();
        db.run("COMMIT", (err) => {
            if (err) console.error("Error committing:", err);
            else console.log("Success");
        });
    });
});
