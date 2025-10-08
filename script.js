// Supabase setup
const supabaseUrl = "https://ckjcxyvxurfhszvcsurc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNramN4eXZ4dXJmaHN6dmNzdXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMzEzNzksImV4cCI6MjA3MDgwNzM3OX0.RaYzSAhQ2lJ5Nj8A8Dj6ziybVump30FmzcRoOt_FwPY";
const client = supabase.createClient(supabaseUrl, supabaseKey);

// EmailJS setup
emailjs.init("c2jhjvUhhL6Yx9EpS");

let confirmationCode = 0;
let currentUser = null;
let currentUserId = null;
let currentGroup = "";
let tempUserData = null;
let realtimeSubscription = null;
let isVoiceChatActive = false;
let recognition = null;

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

async function sendCode() {
    const email = document.getElementById('signupEmail').value.trim();
    const pass = document.getElementById('signupPass').value.trim();
    const user = document.getElementById('signupUser').value.trim();

    if (!email || !pass || !user) {
        alert('Barcha maydonlarni to\'ldiring!');
        return;
    }
    if (pass.length < 6) {
        alert('Parol kamida 6 ta belgidan iborat bo\'lishi kerak!');
        return;
    }
    if (user.length < 3) {
        alert('Foydalanuvchi nomi kamida 3 ta belgidan iborat bo\'lishi kerak!');
        return;
    }

    const { data: existingUsers, error: checkError } = await client
        .from('users')
        .select('email')
        .eq('email', email);

    if (checkError) {
        alert('Xatolik: ' + checkError.message);
        return;
    }

    if (existingUsers && existingUsers.length > 0) {
        alert('Bu email allaqachon ro\'yxatdan o\'tgan!');
        return;
    }

    confirmationCode = Math.floor(10000 + Math.random() * 99999);
    tempUserData = { email, pass, user };

    try {
        await emailjs.send('service_q6k4l8p', 'template_hbvpolj', {
            to_email: email,
            code: confirmationCode
        });
        alert('Tasdiqlash kodi emailingizga yuborildi!');
        showPage('verifyPage');
    } catch (error) {
        console.error('Email xatosi:', error);
        alert('Kod yuborishda muammo! Test uchun kod: ' + confirmationCode);
        showPage('verifyPage');
    }
}

async function verifyCode() {
    const code = document.getElementById('verifyCode').value.trim();
    if (!code) {
        alert('Iltimos, kodni kiriting!');
        return;
    }
    if (parseInt(code) !== confirmationCode) {
        alert('Kod noto\'g\'ri!');
        return;
    }

    const { email, pass, user } = tempUserData;

    const { data, error } = await client
        .from('users')
        .insert([{ username: user, email, password: pass }])
        .select('id, username')
        .single();

    if (error) {
        alert('Xatolik: ' + error.message);
        return;
    }

    currentUser = data.username;
    currentUserId = data.id;

    localStorage.setItem('signedIn', 'true');
    localStorage.setItem('currentUser', currentUser);
    localStorage.setItem('currentUserId', currentUserId);

    tempUserData = null;
    showPage('chatPage');
    await loadGroups();
    startRealtime();
}

async function signIn() {
    const email = document.getElementById('signinEmail').value.trim();
    const pass = document.getElementById('signinPass').value.trim();

    if (!email || !pass) {
        alert('Iltimos, email va parolni kiriting!');
        return;
    }

    const { data, error } = await client
        .from('users')
        .select('id, username, email, password')
        .eq('email', email)
        .eq('password', pass)
        .single();

    if (error) {
        alert('Email yoki parol noto\'g\'ri!');
        return;
    }

    currentUser = data.username;
    currentUserId = data.id;

    localStorage.setItem('signedIn', 'true');
    localStorage.setItem('currentUser', currentUser);
    localStorage.setItem('currentUserId', currentUserId);

    showPage('chatPage');
    await loadGroups();
    startRealtime();
}

async function createGroup() {
    const nameInput = document.getElementById('groupName');
    const name = nameInput.value.trim();

    if (!name) {
        alert('Iltimos, guruh nomini kiriting!');
        nameInput.focus();
        return;
    }

    const { error } = await client
        .from('groups')
        .insert([{ name }]);

    if (error) {
        alert('Guruh yaratishda xatolik: ' + error.message);
        return;
    }

    nameInput.value = '';
    await loadGroups();
}

async function loadGroups() {
    const { data, error } = await client
        .from('groups')
        .select('*')
        .order('name');

    if (error) {
        console.error('Guruhlarni yuklashda xatolik:', error);
        return;
    }

    const select = document.getElementById('groupSelect');
    select.innerHTML = '<option value="">— Guruh tanlang —</option>';

    if (data) {
        data.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            select.appendChild(option);
        });
    }
}

function changeGroup(groupId) {
    if (realtimeSubscription) {
        client.removeChannel(realtimeSubscription);
    }
    
    currentGroup = groupId;
    loadMessages();
    startRealtime();
}

async function deleteSelectedGroup() {
    const groupId = document.getElementById('groupSelect').value;

    if (!groupId) {
        alert('Iltimos, o\'chirish uchun guruh tanlang!');
        return;
    }

    if (!confirm('Haqiqatan ham bu guruhni o\'chirmoqchimisiz?')) {
        return;
    }

    await client.from('messages').delete().eq('group_id', groupId);
    const { error } = await client.from('groups').delete().eq('id', groupId);

    if (error) {
        alert('Guruhni o\'chirishda xatolik: ' + error.message);
        return;
    }

    currentGroup = '';
    await loadGroups();
    document.getElementById('chatBox').innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">💬</div>
            <h3>LuminChat ga xush kelibsiz!</h3>
            <p>Guruh tanlang yoki yangi guruh yarating</p>
        </div>
    `;
}

async function loadMessages() {
    if (!currentGroup) {
        document.getElementById('chatBox').innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">💬</div>
                <h3>LuminChat ga xush kelibsiz!</h3>
                <p>Guruh tanlang yoki yangi guruh yarating</p>
            </div>
        `;
        return;
    }

    const { data, error } = await client
        .from('messages')
        .select(`
            id,
            message,
            created_at,
            user_id,
            users (username)
        `)
        .eq('group_id', currentGroup)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Xabarlarni yuklashda xatolik:', error);
        return;
    }

    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML = '';

    if (!data || data.length === 0) {
        chatBox.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">💬</div>
                <h3>Bu guruhda hali xabar yo'q</h3>
                <p>Birinchi xabarni siz yuboring!</p>
            </div>
        `;
        return;
    }

    data.forEach(msg => {
        const username = msg.users?.username || 'Anon';
        const time = new Date(msg.created_at).toLocaleTimeString('uz-UZ', {
            hour: '2-digit',
            minute: '2-digit'
        });
        addMessageToChat(username, msg.message, time, msg.user_id === currentUserId, false);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
    const messageInput = document.getElementById('chatMessage');
    const text = messageInput.value.trim();

    if (!text) {
        alert('Iltimos, xabar matnini kiriting!');
        messageInput.focus();
        return;
    }
    if (!currentUserId) {
        alert('Xabar yuborish uchun avval tizimga kiring!');
        return;
    }
    if (!currentGroup) {
        alert('Xabar yuborish uchun guruh tanlang!');
        return;
    }

    const time = new Date().toLocaleTimeString('uz-UZ', {
        hour: '2-digit',
        minute: '2-digit'
    });
    addMessageToChat(currentUser, text, time, true, true);

    const { error } = await client.from('messages').insert([{
        group_id: currentGroup,
        message: text,
        user_id: currentUserId
    }]);

    if (error) {
        console.error('Xabar yuborishda xatolik:', error);
        alert('Xabar yuborishda xatolik: ' + error.message);
        return;
    }

    messageInput.value = '';
}

function addMessageToChat(username, text, timestamp = null, isSelf = false, scroll = true) {
    const chatBox = document.getElementById('chatBox');
    
    const welcomeMsg = chatBox.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    const messageDiv = document.createElement('div');

    const time = timestamp || new Date().toLocaleTimeString('uz-UZ', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.className = `message ${isSelf ? 'self' : 'other'}`;
    messageDiv.innerHTML = `
        <div class="message-header">
            <strong>${username}</strong>
            <span class="time">${time}</span>
        </div>
        <div class="message-text">${text}</div>
    `;

    chatBox.appendChild(messageDiv);

    if (scroll) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function startRealtime() {
    if (!currentGroup) return;

    if (realtimeSubscription) {
        client.removeChannel(realtimeSubscription);
    }

    realtimeSubscription = client
        .channel('public:messages')
        .on(
            'postgres_changes',
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages',
                filter: `group_id=eq.${currentGroup}`
            },
            async (payload) => {
                console.log('Yangi xabar qabul qilindi:', payload);
                
                if (payload.new.user_id === currentUserId) {
                    return;
                }

                const { data: userData, error } = await client
                    .from('users')
                    .select('username')
                    .eq('id', payload.new.user_id)
                    .single();

                if (error) {
                    console.error('Foydalanuvchi ma\'lumotlarini olishda xato:', error);
                    return;
                }

                const username = userData?.username || 'Anon';
                const time = new Date(payload.new.created_at).toLocaleTimeString('uz-UZ', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                addMessageToChat(username, payload.new.message, time, false, true);
            }
        )
        .subscribe((status) => {
            console.log('Realtime status:', status);
        });
}

function logout() {
    if (isVoiceChatActive) {
        stopVoiceChat();
    }
    
    if (realtimeSubscription) {
        client.removeChannel(realtimeSubscription);
        realtimeSubscription = null;
    }

    localStorage.removeItem('signedIn');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentUserId');

    currentUser = null;
    currentUserId = null;
    currentGroup = '';

    document.getElementById('signinEmail').value = '';
    document.getElementById('signinPass').value = '';
    document.getElementById('signupUser').value = '';
    document.getElementById('signupEmail').value = '';
    document.getElementById('signupPass').value = '';
    document.getElementById('verifyCode').value = '';
    document.getElementById('chatMessage').value = '';
    document.getElementById('groupName').value = '';

    showPage('signinPage');
}

document.addEventListener('DOMContentLoaded', function() {
    const signedIn = localStorage.getItem('signedIn');
    const savedUser = localStorage.getItem('currentUser');
    const savedUserId = localStorage.getItem('currentUserId');

    if (signedIn === 'true' && savedUser && savedUserId) {
        currentUser = savedUser;
        currentUserId = savedUserId;
        showPage('chatPage');
        loadGroups();
    } else {
        showPage('signinPage');
    }
});

window.addEventListener('error', function(e) {
    console.error('Global xato:', e.error);
});

window.addEventListener('online', function() {
    console.log('Internet ulandi');
});

window.addEventListener('offline', function() {
    alert('Internet ulanmadi! Iltimos, internet aloqasini tekshiring.');
});