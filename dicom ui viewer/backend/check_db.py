import sqlite3
conn = sqlite3.connect('medview_pro.db')
c = conn.cursor()
# Check studies schema
c.execute("PRAGMA table_info(studies)")
print('studies columns:', [r[1] for r in c.fetchall()])
c.execute("PRAGMA table_info(instances)")
print('instances columns:', [r[1] for r in c.fetchall()])
c.execute("PRAGMA table_info(series)")
print('series columns:', [r[1] for r in c.fetchall()])
conn.close()
