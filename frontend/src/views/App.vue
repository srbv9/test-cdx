<template>
  <div>
    <div class="topbar">{{ headerLabel }}</div>
    <div v-if="!session.user" class="container">
      <div class="panel">
        <div class="header">
          <div>{{ modeLabel }}</div>
          <button @click="toggleMode">Switch to {{ modeToggleLabel }}</button>
        </div>
        <div class="form">
          <div style="margin-bottom:12px;">
            <label>Username</label>
            <div><input v-model="authForm.username" placeholder="username" /></div>
          </div>
          <div style="margin-bottom:12px;">
            <label>Password</label>
            <div><input type="password" v-model="authForm.password" placeholder="********" /></div>
          </div>
          <div v-if="mode === 'register'" style="margin-bottom:12px;">
            <label>Confirm Password</label>
            <div><input type="password" v-model="authForm.confirm" placeholder="********" /></div>
          </div>
          <div><button @click="submitAuth">{{ modeLabel }}</button></div>
          <div v-if="error" style="color:#f87171;margin-top:12px;">{{ error }}</div>
        </div>
      </div>
    </div>
    <div v-else class="container">
      <div class="panel">
        <div class="header">
          <div>Welcome, {{ session.user.username }}</div>
          <div style="display:flex;gap:8px;">
            <button @click="activeView = 'home'">Home</button>
            <button @click="activeView = 'profile'">Profile</button>
            <button @click="logout">Logout</button>
          </div>
        </div>
        <div v-if="activeView === 'home'">
          <div style="margin-bottom:12px;">
            <div style="font-weight:700;">Conversations</div>
            <div v-if="conversations.length === 0" style="color:var(--muted);">No conversations yet.</div>
            <ul>
              <li v-for="c in conversations" :key="c.id" style="margin-bottom:8px;">
                <button @click="openConversation(c.id)">{{ c.peer.username }}</button>
              </li>
            </ul>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:16px;">
            <div style="font-weight:700;">Start new conversation</div>
            <input v-model="newProfileId" placeholder="Contact profile ID" style="width:100%;margin:8px 0;" />
            <button @click="startConversation">Start</button>
          </div>
        </div>
        <div v-if="activeView === 'chat' && activeConversation">
          <div style="margin-bottom:12px;font-weight:700;">Chat with {{ activeConversation.peer.username }}</div>
          <div style="min-height:200px;border:1px solid var(--border);padding:12px;margin-bottom:12px;">
            <div v-for="m in messages" :key="m.id" style="margin-bottom:8px;">
              <div style="color:var(--muted);font-size:12px;">{{ formatSender(m.senderId) }} — {{ formatDate(m.createdAt) }}</div>
              <div>{{ m.ciphertext }}</div>
            </div>
          </div>
          <textarea v-model="draft" rows="3" style="width:100%;" placeholder="Encrypted message text"></textarea>
          <div style="margin-top:8px;"><button @click="sendMessage">Send</button></div>
        </div>
        <div v-if="activeView === 'profile'">
          <div style="font-weight:700;margin-bottom:8px;">Profile</div>
          <div>Username: {{ session.user.username }}</div>
          <div style="margin-top:8px;">Secret Profile ID:</div>
          <div style="font-weight:700;">{{ profile?.profileId }}</div>
          <div style="color:var(--muted);margin-top:8px;">Share this only offline. Anyone with this ID can start a conversation with you.</div>
        </div>
        <div v-if="error" style="color:#f87171;margin-top:12px;">{{ error }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api, setAccessToken } from '../services/api';

type SessionUser = { id: string; username: string };
type SessionState = { user: SessionUser | null; accessToken: string | null; refreshToken: string | null };
type Conversation = { id: string; peer: { id: string; username: string; publicKey: string | null } };
type Message = { id: string; senderId: string; recipientId: string; ciphertext: string; createdAt: string };
type Profile = { profileId: string };

type WsMessage = { type: string; conversationId: string; senderId: string; recipientId: string; ciphertext: string; createdAt: string };

const session = reactive<SessionState>({ user: null, accessToken: null, refreshToken: null });
const profile = ref<Profile | null>(null);
const mode = ref<'login' | 'register'>('login');
const authForm = reactive({ username: '', password: '', confirm: '' });
const conversations = ref<Conversation[]>([]);
const newProfileId = ref('');
const activeConversation = ref<Conversation | null>(null);
const messages = ref<Message[]>([]);
const draft = ref('');
const error = ref('');
const socket = ref<WebSocket | null>(null);
const activeView = ref<'home' | 'chat' | 'profile'>('home');

const headerLabel = computed(() => {
  return session.user ? `${session.user.username}@secure-terminal` : 'secure-terminal';
});

const modeLabel = computed(() => (mode.value === 'login' ? 'Login' : 'Register'));
const modeToggleLabel = computed(() => (mode.value === 'login' ? 'Register' : 'Login'));

function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  error.value = '';
}

async function submitAuth() {
  error.value = '';
  if (mode.value === 'register' && authForm.password !== authForm.confirm) {
    error.value = 'Passwords do not match';
    return;
  }
  const endpoint = mode.value === 'login' ? '/api/login' : '/api/register';
  try {
    const response = await api.post(endpoint, { username: authForm.username, password: authForm.password });
    session.user = response.data.user;
    session.accessToken = response.data.accessToken;
    session.refreshToken = response.data.refreshToken;
    setAccessToken(session.accessToken);
    await fetchProfile();
    await fetchConversations();
  } catch {
    error.value = 'Authentication failed';
  }
}

async function fetchProfile() {
  if (!session.accessToken) return;
  const response = await api.get('/api/users/me');
  profile.value = { profileId: response.data.profileId };
}

async function fetchConversations() {
  const response = await api.get('/api/conversations');
  conversations.value = response.data;
}

async function startConversation() {
  try {
    const response = await api.post('/api/conversations/by-profile-id', { profileId: newProfileId.value });
    const existing = conversations.value.find((c) => c.id === response.data.conversationId);
    if (!existing) {
      conversations.value.push(response.data);
    }
    openConversation(response.data.conversationId);
    newProfileId.value = '';
  } catch {
    error.value = 'Unable to start conversation';
  }
}

async function openConversation(id: string) {
  activeConversation.value = conversations.value.find((c) => c.id === id) || null;
  activeView.value = 'chat';
  if (activeConversation.value) {
    const response = await api.get(`/api/conversations/${id}/messages`);
    messages.value = response.data;
    connectSocket();
  }
}

function connectSocket() {
  if (!session.accessToken) return;
  if (socket.value) {
    socket.value.close();
  }
  const base = ((import.meta.env.VITE_WS_BASE as string | undefined) || 'wss://api.vendadummydomain.com/ws').replace(/\/$/, '');
  const wsUrl = `${base}?token=${encodeURIComponent(session.accessToken)}`;
  const ws = new WebSocket(wsUrl, []);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data) as WsMessage;
    if (data.type === 'message' && activeConversation.value && data.conversationId === activeConversation.value.id) {
      messages.value.push({ id: `${Date.now()}`, senderId: data.senderId, recipientId: data.recipientId, ciphertext: data.ciphertext, createdAt: data.createdAt });
    }
  };
  socket.value = ws;
}

function formatSender(senderId: string) {
  if (!session.user) return 'unknown';
  return senderId === session.user.id ? 'you' : 'contact';
}

function formatDate(input: string) {
  return new Date(input).toLocaleString();
}

async function sendMessage() {
  if (!socket.value || !activeConversation.value || !draft.value) return;
  const payload = { type: 'message', conversationId: activeConversation.value.id, ciphertext: draft.value };
  socket.value.send(JSON.stringify(payload));
  draft.value = '';
}

function logout() {
  session.user = null;
  session.accessToken = null;
  session.refreshToken = null;
  setAccessToken(null);
  activeConversation.value = null;
  conversations.value = [];
  messages.value = [];
  activeView.value = 'home';
}

onMounted(() => {
  const storedToken = localStorage.getItem('secure-terminal-access');
  const storedUser = localStorage.getItem('secure-terminal-user');
  if (storedToken && storedUser) {
    session.accessToken = storedToken;
    session.user = JSON.parse(storedUser);
    setAccessToken(session.accessToken);
    fetchProfile();
    fetchConversations();
  }
});

watchSession();

function watchSession() {
  const stop = setInterval(() => {
    if (session.accessToken && session.user) {
      localStorage.setItem('secure-terminal-access', session.accessToken);
      localStorage.setItem('secure-terminal-user', JSON.stringify(session.user));
    } else {
      localStorage.removeItem('secure-terminal-access');
      localStorage.removeItem('secure-terminal-user');
    }
  }, 1000);
  window.addEventListener('beforeunload', () => clearInterval(stop));
}
</script>
