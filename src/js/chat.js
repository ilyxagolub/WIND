document.addEventListener('DOMContentLoaded', async () => {
    const myUsername = localStorage.getItem('currentUser');
    if (!myUsername) { window.location.href = 'login.html'; return; }

    const els = {
        myUser: document.getElementById('myUsername'),
        contacts: document.getElementById('contactsList'),
        search: document.getElementById('userSearch'),
        display: document.getElementById('messagesDisplay'),
        input: document.getElementById('messageInput'),
        send: document.getElementById('sendBtn'),
        mentions: document.getElementById('mentionList'),
        context: document.getElementById('contextMenu'),
        replyPreview: document.getElementById('replyPreview'),
        replyUser: document.getElementById('replyUser'),
        replyText: document.getElementById('replyText')
    };

    els.myUser.textContent = myUsername;
    let allU = [], myF = [], curChat = null, lastCount = "", lastTyping = 0;
    let selMsg = null, selEl = null, currentReplyData = null;

    // --- СЕРВИСНЫЕ ФУНКЦИИ ---
    async function sync() {
        try {
            const uR = await fetch('/api/users'); allU = await uR.json();
            const fR = await fetch(`/api/get_friends/${myUsername}`); const nF = await fR.json();
            if (JSON.stringify(nF.sort()) !== JSON.stringify(myF.sort())) {
                myF = nF; if (els.search.value === "") render(myF);
            }
        } catch(e){}
    }

    function render(list, isSearch = false) {
        els.contacts.innerHTML = '';
        list.forEach(u => {
            if (u === myUsername) return;
            const isF = myF.includes(u);
            const div = document.createElement('div');
            div.className = `contact-item ${curChat === u ? 'active' : ''}`;
            const color = ['#0088cc','#4caf50','#ff9800','#9c27b0','#f44336'][u.length % 5];
            div.innerHTML = `
                <div class="contact-item-info" onclick="openChat('${u}')">
                    <div class="avatar" style="background:${color}">${u[0].toUpperCase()}</div>
                    <span>${u}</span>
                </div>
                ${isSearch && !isF ? `<button onclick="addFriend(event,'${u}')" class="add-friend-btn">+</button>` : `<button onclick="deleteFriend(event,'${u}')" class="delete-friend-btn">×</button>`}
            `;
            els.contacts.appendChild(div);
        });
        updateBadges(); updateStatuses();
    }

    // --- ОТВЕТЫ (REPLY) ---
    window.prepareReply = () => {
        currentReplyData = { sender: selMsg.sender, text: selMsg.text };
        els.replyUser.textContent = selMsg.sender;
        els.replyText.textContent = selMsg.text.substring(0, 50);
        els.replyPreview.style.display = 'flex';
        els.input.focus();
    };

    window.cancelReply = () => {
        currentReplyData = null;
        els.replyPreview.style.display = 'none';
    };

    window.scrollToMessage = (searchText) => {
        const messages = els.display.querySelectorAll('.msg');
        for (let m of messages) {
            const span = m.querySelector('span');
            if (span && span.textContent.includes(searchText)) {
                m.scrollIntoView({ behavior: 'smooth', block: 'center' });
                m.style.transition = 'background 0.5s';
                m.style.background = 'rgba(255, 235, 59, 0.4)';
                setTimeout(() => m.style.background = '', 1500);
                break;
            }
        }
    };

    // --- ЧАТ И СООБЩЕНИЯ ---
    window.openChat = (u) => {
        if (curChat === u) return; curChat = u; lastCount = ""; els.display.innerHTML = '';
        cancelReply();
        document.getElementById('chatHeader').innerHTML = `
            <button class="back-btn" onclick="closeChat()">←</button>
            <div class="header-text-container">
                <span id="chatTitle">${u === "GLOBAL_CHAT" ? '🌍 Общая мусорка' : 'Чат с '+u}</span>
                <div id="typingIndicator" class="typing-text" style="display:none;">печатает...</div>
            </div>
            ${u !== "GLOBAL_CHAT" ? `<button class="clear-chat-btn" onclick="clearCurrentChat()">Очистить</button>` : ''}
        `;
        if (window.innerWidth <= 768) document.querySelector('.sidebar').classList.add('mobile-hidden');
        triggerAnim(); loadMessages(); render(myF);
    };

    window.selectGlobalChat = () => window.openChat("GLOBAL_CHAT");

    async function loadMessages() {
        if (!curChat) return;
        try {
            const r = await fetch(`/api/messages/${myUsername}/${curChat}`);
            const msgs = await r.json();
            const lastM = msgs[msgs.length - 1];
            const check = msgs.length + (lastM ? lastM.text + lastM.read : "");
            if (check === lastCount) return;
            
            const isBottom = els.display.scrollHeight - els.display.scrollTop <= els.display.clientHeight + 100;
            lastCount = check; els.display.innerHTML = '';

            msgs.forEach(m => {
                const div = document.createElement('div');
                div.className = `msg ${m.sender === myUsername ? 'my-msg' : 'guest-msg'}`;
                
                // Контекстное меню для ВСЕХ сообщений (для ответа)
                div.oncontextmenu = (e) => showContext(e, m, div);
                let timer;
                div.addEventListener('touchstart', (e) => {
                    timer = setTimeout(() => {
                        const t = e.touches[0];
                        showContext({preventDefault:()=>e.preventDefault(), pageX:t.pageX, pageY:t.pageY}, m, div);
                        if (navigator.vibrate) navigator.vibrate(50);
                    }, 600);
                }, {passive: false});
                div.addEventListener('touchend', () => clearTimeout(timer));
                div.addEventListener('touchmove', () => clearTimeout(timer));

                let replyHtml = '';
                if (m.reply_to) {
                    replyHtml = `<div class="msg-reply-quote" onclick="scrollToMessage('${m.reply_to.text}')">
                                    <small>${m.reply_to.sender}</small>
                                    <span>${m.reply_to.text.substring(0,30)}...</span>
                                 </div>`;
                }

                let txt = m.text.replace(`@${myUsername}`, `<span class="mention-highlight">@${myUsername}</span>`);
                const status = m.sender === myUsername ? `<span class="read-status ${m.read ? 'is-read':''}">${m.read ? '✓✓':'✓'}</span>` : '';

                div.innerHTML = `
                    ${replyHtml}
                    ${curChat === "GLOBAL_CHAT" && m.sender !== myUsername ? `<b style="font-size:11px;color:#0088cc;display:block">${m.sender}</b>` : ''}
                    <span>${txt}</span>
                    <div class="msg-meta"><small>${m.time.substring(0,5)}</small>${status}</div>
                `;
                els.display.appendChild(div);
            });
            if (isBottom) els.display.scrollTop = els.display.scrollHeight;
        } catch(e){}
    }

    async function send() {
        const val = els.input.value.trim(); if (!val || !curChat) return;
        els.input.value = ''; els.mentions.style.display = 'none';
        
        await fetch('/api/send', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                sender: myUsername, 
                receiver: curChat, 
                text: val, 
                reply_to: currentReplyData 
            })
        });
        
        cancelReply();
        lastCount = ""; await loadMessages();
        els.display.scrollTop = els.display.scrollHeight;
    }

    // --- КОНТЕКСТНОЕ МЕНЮ ---
    function showContext(e, m, el) {
        e.preventDefault(); selMsg =m; selEl = el;
        els.context.style.display = 'block';
        let x = e.pageX, y = e.pageY;
        if (x + 160 > window.innerWidth) x = window.innerWidth - 170;
        els.context.style.left = x + 'px'; els.context.style.top = y + 'px';
        
        // Показывать Ред/Удалить только для своих
        document.querySelector('[onclick="prepareEdit()"]').style.display = m.sender === myUsername ? 'block' : 'none';
        document.querySelector('[onclick="confirmDelete()"]').style.display = m.sender === myUsername ? 'block' : 'none';

        document.querySelectorAll('.msg').forEach(msg => msg.classList.remove('context-active'));
        el.classList.add('context-active');
    }

    window.confirmDelete = async () => {
        if (!confirm("Удалить сообщение?")) return;
        await fetch('/api/delete_message', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({sender: myUsername, time: selMsg.time, text: selMsg.text})
        });
        lastCount = ""; loadMessages();
    };

    window.prepareEdit = () => {
        const t = prompt("Редактировать:", selMsg.text.replace(" (ред.)", ""));
        if (t && t !== selMsg.text) {
            fetch('/api/edit_message', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({sender: myUsername, time: selMsg.time, old_text: selMsg.text, new_text: t})
            }).then(() => { lastCount = ""; loadMessages(); });
        }
    };

    window.clearCurrentChat = async () => {
        if (!confirm("Очистить переписку?")) return;
        await fetch('/api/clear_chat', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({me: myUsername, with_user: curChat})
        });
        els.display.innerHTML = ''; lastCount = "";
    };

    // --- ИНТЕРФЕЙСНЫЕ ФУНКЦИИ ---
    function triggerAnim() {
        els.display.classList.remove('chat-appear-active');
        void els.display.offsetWidth;
        els.display.classList.add('chat-appear-active');
    }

    async function updateBadges() {
        try {
            const r = await fetch(`/api/messages_all/${myUsername}`); const msgs = await r.json();
            let c = {}, gm = 0;
            msgs.forEach(m => {
                if (m.receiver === myUsername && !m.read && m.sender !== curChat) c[m.sender] = (c[m.sender] || 0) + 1;
                if (m.receiver === "GLOBAL_CHAT" && m.mentioned_user === myUsername && !m.read && curChat !== "GLOBAL_CHAT") gm++;
            });
            document.querySelectorAll('.contact-item').forEach(i => {
                const n = i.querySelector('span').textContent;
                let b = i.querySelector('.unread-badge');
                if (c[n]) { if(!b){b=document.createElement('div');b.className='unread-badge';i.appendChild(b);} b.textContent=c[n]; }
                else if(b) b.remove();
            });
            const gBtn = document.querySelector('.global-chat-btn');
            let gb = gBtn.querySelector('.unread-badge');
            if (gm > 0) {
                if(!gb){const n=document.createElement('div');n.className='unread-badge mention';n.textContent='@';gBtn.appendChild(n);}
            } else if(gb) gb.remove();
        } catch(e){}
    }

    async function updateStatuses() {
        try {
            const r = await fetch('/api/users_status'); const s = await r.json();
            document.querySelectorAll('.contact-item').forEach(i => {
                const n = i.querySelector('span').textContent;
                let d = i.querySelector('.status-dot'); if(d)d.remove();
                if (s[n] === "online") { const dot=document.createElement('div');dot.className='status-dot';i.appendChild(dot); }
            });
        } catch(e){}
    }

    // --- СОБЫТИЯ ---
    els.input.addEventListener('input', e => {
        if (curChat) {
            const now = Date.now();
            if (now - lastTyping > 2000) { fetch(`/api/typing/${myUsername}/${curChat}`, {method:'POST'}); lastTyping = now; }
        }
        const words = e.target.value.split(' '); const last = words[words.length-1];
        if (last.startsWith('@')) {
            const f = last.substring(1);
            const list = myF.filter(n => n.toLowerCase().includes(f.toLowerCase()));
            if (list.length) {
                els.mentions.innerHTML = '';
                list.forEach(u => {
                    const d = document.createElement('div'); d.className='mention-item'; d.textContent=u;
                    d.onclick = () => {
                        words[words.length-1] = '@'+u+' '; els.input.value = words.join(' ');
                        els.mentions.style.display='none'; els.input.focus();
                    };
                    els.mentions.appendChild(d);
                });
                els.mentions.style.display='block';
            } else els.mentions.style.display='none';
        } else els.mentions.style.display='none';
    });

    els.search.addEventListener('input', e => {
        const t = e.target.value.toLowerCase();
        if (t === "") render(myF); else render(allU.filter(u => u !== myUsername && u.toLowerCase().includes(t)), true);
    });

    els.send.onclick = send;
    els.input.onkeypress = e => { if (e.key === 'Enter') send(); };
    window.closeChat = () => { document.querySelector('.sidebar').classList.remove('mobile-hidden'); curChat = null; };
    document.addEventListener('click', (e) => { 
        if (!els.context.contains(e.target)) els.context.style.display = 'none'; 
        els.mentions.style.display = 'none'; 
    });

    // --- ЦИКЛ ---
    await sync();
    setInterval(async () => {
        await fetch(`/api/ping/${myUsername}`, {method:'POST'});
        sync(); loadMessages(); updateBadges(); updateStatuses();
        if (curChat && curChat !== "GLOBAL_CHAT") {
            const r = await fetch(`/api/get_typing/${myUsername}/${curChat}`);
            const d = await r.json();
            const el = document.getElementById('typingIndicator');
            if (el) el.style.display = d.typing ? 'block' : 'none';
        }
    }, 2000);
});

function logout() { localStorage.removeItem('currentUser'); window.location.href='login.html'; }
window.addFriend = async (e, n) => {
    e.stopPropagation();
    await fetch('/api/add_friend', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({me: localStorage.getItem('currentUser'), friend: n})});
    location.reload(); 
};
window.deleteFriend = async (e, n) => {
    e.stopPropagation(); if (!confirm("Удалить друга?")) return;
    await fetch('/api/delete_friend', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({me: localStorage.getItem('currentUser'), friend: n})});
    location.reload();
};

// Фикс для мобильных браузеров (пересчет высоты)
function resetHeight() {
    document.body.style.height = window.innerHeight + "px";
    document.documentElement.style.height = window.innerHeight + "px";
}
window.addEventListener("resize", resetHeight);
window.addEventListener("orientationchange", resetHeight);
resetHeight();