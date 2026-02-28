from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os
import datetime
import re
import time

app = Flask(__name__)

DB_NAME = 'database.db'

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    # Таблица пользователей
    cursor.execute('''CREATE TABLE IF NOT EXISTS users 
                      (username TEXT PRIMARY KEY, password TEXT)''')
    # Таблица сообщений (добавили поля для Reply)
    cursor.execute('''CREATE TABLE IF NOT EXISTS messages 
                      (id INTEGER PRIMARY KEY AUTOINCREMENT,
                       sender TEXT, receiver TEXT, text TEXT, 
                       time TEXT, is_read INTEGER DEFAULT 0, 
                       mentioned_user TEXT, 
                       reply_sender TEXT, reply_text TEXT)''')
    # Таблица друзей
    cursor.execute('''CREATE TABLE IF NOT EXISTS friends 
                      (u1 TEXT, u2 TEXT, UNIQUE(u1, u2))''')
    conn.commit()
    conn.close()

init_db()

# Оперативное хранилище (в памяти)
user_typing = {} 
user_last_seen = {}

# --- СТАТУСЫ ---
@app.route('/api/ping/<username>', methods=['POST'])
def ping(username):
    user_last_seen[username] = time.time()
    return jsonify({"status": "ok"})

@app.route('/api/users_status', methods=['GET'])
def get_users_status():
    now = time.time()
    return jsonify({u: ("online" if (now - t) < 15 else "offline") for u, t in user_last_seen.items()})

@app.route('/api/typing/<username>/<target>', methods=['POST'])
def set_typing(username, target):
    user_typing[username] = {"target": target, "time": time.time()}
    return jsonify({"status": "ok"})

@app.route('/api/get_typing/<current_user>/<chat_with>', methods=['GET'])
def get_typing(current_user, chat_with):
    data = user_typing.get(chat_with)
    if data and data['target'] == current_user and (time.time() - data['time']) < 4:
        return jsonify({"typing": True})
    return jsonify({"typing": False})

# --- АВТОРИЗАЦИЯ ---
@app.route('/register', methods=['POST'])
def register():
    data = request.json
    u, p = data.get('username'), data.get('password')
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password) VALUES (?, ?)', (u, p))
        conn.commit()
        return jsonify({"message": "OK"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"message": "Логин уже занят"}), 400
    finally:
        conn.close()

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    u, p = data.get('username'), data.get('password')
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ? AND password = ?', (u, p)).fetchone()
    conn.close()
    if user: return jsonify({"message": "OK"}), 200
    return jsonify({"message": "Ошибка"}), 401

@app.route('/api/users', methods=['GET'])
def get_users():
    conn = get_db_connection()
    users = conn.execute('SELECT username FROM users').fetchall()
    conn.close()
    return jsonify([u['username'] for u in users])

# --- ЛОГИКА СООБЩЕНИЙ ---
@app.route('/api/send', methods=['POST'])
def send_message():
    data = request.json
    sender, receiver, text = data.get('sender'), data.get('receiver'), data.get('text')
    reply = data.get('reply_to') or {}

    if not text: return jsonify({"status": "error"}), 400

    mentioned = None
    if receiver == "GLOBAL_CHAT":
        m = re.findall(r'@(\w+)', text)
        if m: mentioned = m[0]

    conn = get_db_connection()
    conn.execute('''INSERT INTO messages 
                    (sender, receiver, text, time, mentioned_user, reply_sender, reply_text) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)''', 
                 (sender, receiver, text, datetime.datetime.now().strftime("%H:%M:%S"), 
                  mentioned, reply.get('sender'), reply.get('text')))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})

@app.route('/api/messages/<user1>/<user2>', methods=['GET'])
def get_messages(user1, user2):
    conn = get_db_connection()
    # Получаем историю
    if user2 == "GLOBAL_CHAT":
        msgs = conn.execute('SELECT * FROM messages WHERE receiver = "GLOBAL_CHAT"').fetchall()
        # Помечаем прочитанными упоминания
        conn.execute('UPDATE messages SET is_read = 1 WHERE receiver = "GLOBAL_CHAT" AND mentioned_user = ?', (user1,))
    else:
        msgs = conn.execute('''SELECT * FROM messages WHERE 
                               (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)''', 
                            (user1, user2, user2, user1)).fetchall()
        # Помечаем прочитанными входящие сообщения
        conn.execute('UPDATE messages SET is_read = 1 WHERE sender = ? AND receiver = ?', (user2, user1))
    
    conn.commit()
    
    result = []
    for m in msgs:
        # Важно: конвертируем 0/1 из БД обратно в True/False для JS
        result.append({
            "sender": m['sender'],
            "receiver": m['receiver'],
            "text": m['text'],
            "time": m['time'],
            "read": bool(m['is_read']),
            "mentioned_user": m['mentioned_user'],
            "reply_to": {"sender": m['reply_sender'], "text": m['reply_text']} if m['reply_sender'] else None
        })
    conn.close()
    return jsonify(result)

@app.route('/api/messages_all/<username>', methods=['GET'])
def get_all_messages(username):
    conn = get_db_connection()
    # Нужно для корректной работы баджей (счетчиков непрочитанных) в JS
    msgs = conn.execute('''SELECT sender, receiver, is_read, mentioned_user 
                           FROM messages 
                           WHERE receiver = ? OR mentioned_user = ? OR receiver = "GLOBAL_CHAT"''', 
                        (username, username)).fetchall()
    result = []
    for m in msgs:
        result.append({
            "sender": m['sender'],
            "receiver": m['receiver'],
            "read": bool(m['is_read']),
            "mentioned_user": m['mentioned_user']
        })
    conn.close()
    return jsonify(result)

@app.route('/api/edit_message', methods=['POST'])
def edit_message():
    data = request.json
    s, t, old, new = data.get('sender'), data.get('time'), data.get('old_text'), data.get('new_text')
    conn = get_db_connection()
    conn.execute('UPDATE messages SET text = ? WHERE sender = ? AND time = ? AND text = ?', 
                 (new + " (ред.)", s, t, old))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})

@app.route('/api/delete_message', methods=['POST'])
def delete_message():
    data = request.json
    s, t, txt = data.get('sender'), data.get('time'), data.get('text')
    conn = get_db_connection()
    conn.execute('DELETE FROM messages WHERE sender = ? AND time = ? AND text = ?', (s, t, txt))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})

@app.route('/api/clear_chat', methods=['POST'])
def clear_chat():
    data = request.json
    me, target = data.get('me'), data.get('with_user')
    conn = get_db_connection()
    conn.execute('DELETE FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)', 
                 (me, target, target, me))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})

# --- ЛОГИКА ДРУЗЕЙ ---
@app.route('/api/add_friend', methods=['POST'])
def add_friend():
    data = request.json
    me, fr = data.get('me'), data.get('friend')
    u1, u2 = sorted([me, fr])
    conn = get_db_connection()
    conn.execute('INSERT OR IGNORE INTO friends (u1, u2) VALUES (?, ?)', (u1, u2))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})

@app.route('/api/delete_friend', methods=['POST'])
def delete_friend():
    data = request.json
    me, fr = data.get('me'), data.get('friend')
    u1, u2 = sorted([me, fr])
    conn = get_db_connection()
    conn.execute('DELETE FROM friends WHERE u1 = ? AND u2 = ?', (u1, u2))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})

@app.route('/api/get_friends/<username>', methods=['GET'])
def get_friends(username):
    conn = get_db_connection()
    rows = conn.execute('SELECT u1, u2 FROM friends WHERE u1 = ? OR u2 = ?', (username, username)).fetchall()
    conn.close()
    friends = [ (r['u2'] if r['u1'] == username else r['u1']) for r in rows ]
    return jsonify(list(set(friends)))

# --- СТАТИЧЕСКИЕ ФАЙЛЫ ---
@app.route('/')
def home(): return send_from_directory('.', 'login.html')

@app.route('/<path:filename>.html')
def send_html(filename): return send_from_directory('.', f'{filename}.html')

@app.route('/src/<path:path>')
def send_src(path): return send_from_directory('src', path)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'OK',
        'message': 'Your API is running',
        'timestamp': datetime.utcnow().isoformat()
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)