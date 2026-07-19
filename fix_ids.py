import sqlite3

conn = sqlite3.connect('veritabani/site_yonetim.sqlite')
cursor = conn.cursor()

cursor.execute("SELECT id, blok, daire_no FROM daireler")
daireler = cursor.fetchall()

def sort_key(d):
    # admin account should probably be first (id=1)
    if not d[1]: 
        return ("", 0)
        
    blok = str(d[1])
    try:
        daire_no = int(d[2])
    except:
        daire_no = 0
    return (blok, daire_no)

daireler.sort(key=sort_key)

id_mapping = {}
for i, d in enumerate(daireler):
    id_mapping[d[0]] = i + 1

# Step 1: Assign temporary IDs
for old_id, new_id in id_mapping.items():
    temp_id = old_id + 100000
    if temp_id < 0: temp_id = -temp_id + 200000 # Handle already negative ones
    cursor.execute("UPDATE daireler SET id = ? WHERE id = ?", (temp_id, old_id))
    cursor.execute("UPDATE aidatlar SET daire_id = ? WHERE daire_id = ?", (temp_id, old_id))

# Step 2: Assign final IDs
for old_id, new_id in id_mapping.items():
    temp_id = old_id + 100000
    if temp_id < 0: temp_id = -temp_id + 200000
    cursor.execute("UPDATE daireler SET id = ? WHERE id = ?", (new_id, temp_id))
    cursor.execute("UPDATE aidatlar SET daire_id = ? WHERE daire_id = ?", (new_id, temp_id))

conn.commit()
print("IDs sorted successfully!")
conn.close()
