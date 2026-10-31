const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('veritabani/site_yonetim.sqlite');

db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.all("SELECT * FROM daireler", [], (err, daireler) => {
        if (err) throw err;

        // Sort the daireler
        daireler.sort((a, b) => {
            if (a.blok !== b.blok) return a.blok.localeCompare(b.blok);
            return parseInt(a.daire_no) - parseInt(b.daire_no);
        });

        // Create a mapping from old id to new id
        const idMapping = {};
        let newId = 1;
        
        for (const daire of daireler) {
            idMapping[daire.id] = newId++;
        }

        // 1. Move daireler to temporary negative IDs to avoid unique constraint violations
        for (const daire of daireler) {
            const oldId = daire.id;
            const tempId = -oldId;
            db.run("UPDATE daireler SET id = ? WHERE id = ?", [tempId, oldId]);
            db.run("UPDATE aidatlar SET daire_id = ? WHERE daire_id = ?", [tempId, oldId]);
        }

        // 2. Move from temporary IDs to final IDs
        for (const daire of daireler) {
            const oldId = daire.id;
            const tempId = -oldId;
            const finalId = idMapping[oldId];
            
            db.run("UPDATE daireler SET id = ? WHERE id = ?", [finalId, tempId]);
            db.run("UPDATE aidatlar SET daire_id = ? WHERE daire_id = ?", [finalId, tempId]);
        }

        db.run("COMMIT", (err) => {
            if (err) {
                console.error("COMMIT FAILED:", err);
            } else {
                console.log("IDs successfully sorted and updated!");
            }
            db.close();
        });
    });
});
