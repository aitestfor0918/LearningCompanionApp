// State Management
const state = {
    currentScreen: 'homeScreen',
    topic: null,
    day: 1,
    chatHistory: [],
    pastChats: {},
    isGenerating: false,
    hasFinishedToday: false,
    favorites: [],
    recommendedTopics: [],
    exclusiveTopics: [],
    lastRefreshTime: 0
};

let apiSettings = JSON.parse(localStorage.getItem('learning_companion_api_settings') || '{"apiKey":"","baseUrl":"https://api.openai.com/v1","model":"gpt-4o-mini"}');

// Data
const recommendedTopics = [
    { title: "量子力學", icon: "ph-atom" },
    { title: "設計模式", icon: "ph-code" },
    { title: "個人理財", icon: "ph-coin" },
    { title: "認知心理學", icon: "ph-brain" }
];

const exclusiveTopics = [
    { title: "獨立音樂製作", icon: "ph-headphones" },
    { title: "寫歌靈感", icon: "ph-lightbulb" },
    { title: "編曲技巧", icon: "ph-piano-keys" },
    { title: "混音基礎", icon: "ph-faders" }
];

const topicPools = {
    recommended: [
        { title: "量子力學", icon: "ph-atom" },
        { title: "設計模式", icon: "ph-code" },
        { title: "個人理財", icon: "ph-coin" },
        { title: "認知心理學", icon: "ph-brain" },
        { title: "區塊鏈技術", icon: "ph-link" },
        { title: "人工智慧基礎", icon: "ph-robot" },
        { title: "烹飪科學", icon: "ph-flask" },
        { title: "天文學入門", icon: "ph-planet" },
        { title: "演算法導論", icon: "ph-function" },
        { title: "環境永續性", icon: "ph-leaf" }
    ],
    exclusive: [
        { title: "獨立音樂製作", icon: "ph-headphones" },
        { title: "寫歌靈感", icon: "ph-lightbulb" },
        { title: "編曲技巧", icon: "ph-piano-keys" },
        { title: "混音基礎", icon: "ph-faders" },
        { title: "音樂行銷", icon: "ph-megaphone" },
        { title: "舞台表演藝術", icon: "ph-microphone-stage" },
        { title: "錄音室設計", icon: "ph-waveform" },
        { title: "音樂版權管理", icon: "ph-copyright" }
    ]
};

// LLM API Logic
function getSystemPrompt() {
    return '你是一個知識教練。目前正在指導使用者學習「' + state.topic + '」。今天是 5 天學習計畫的第 ' + state.day + ' 天。\n\n' +
           '規則：\n' +
           '1. 內容厚度必須依照天數變化：\n' +
           '   Day 1: 簡單介紹，建立初步直覺，使用超生活化的例子。\n' +
           '   Day 2: 進階機制與背後原理探討。\n' +
           '   Day 3: 專業應用與專業術語。\n' +
           '   Day 4: 極限案例、邊角狀況與深論。\n' +
           '   Day 5: 知識統整與專家反思。\n' +
           '2. 你每次發言完，最後一定要主動問「一個」引導問題。請使用 Markdown 標題或是粗體來標示這個問題。\n' +
           '3. 語氣要像一個有經驗但平易近人的老師，簡單清楚，適度分段。\n' +
           '4. 如果使用者提問，請優先針對他的問題回答。回答完後，再將話題帶回今日主線，並重新問一個引導討論的問題。\n' +
           '5. 全文請用繁體中文。請直接用 markdown 格式輸出，不要包含任何開場白。';
}

async function callLLM(systemPrompt, userText = null) {
    if (!apiSettings.apiKey) {
        showToast('請先完成 API 設定');
        return null;
    }

    const isGemini = apiSettings.apiKey.startsWith('AIza');

    if (isGemini) {
        try {
            const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiSettings.apiKey;
            
            const contents = state.chatHistory.map(msg => ({
                role: msg.role === 'ai' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));
            
            if (userText) {
                contents.push({ role: 'user', parts: [{ text: userText }] });
            }
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: contents,
                    generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
                })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'Gemini API 發生錯誤');
            }
            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (e) {
            showToast('Gemini 錯誤: ' + e.message);
            return null;
        }
    } else {
        // OpenAI Format
        const messages = [
            { role: "system", content: systemPrompt }
        ];

        state.chatHistory.forEach(msg => {
            messages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.content });
        });

        if (userText) {
            messages.push({ role: "user", content: userText });
        }

        try {
            const response = await fetch(apiSettings.baseUrl + '/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiSettings.apiKey
                },
                body: JSON.stringify({
                    model: apiSettings.model,
                    messages: messages,
                    max_tokens: 1000,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'API 請求失敗');
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (e) {
            showToast('API 錯誤: ' + e.message);
            return null;
        }
    }
}

// DOM Elements
const screens = document.querySelectorAll('.screen');
const homeCurrentDay = document.getElementById('homeCurrentDay');
const homeCurrentTopic = document.getElementById('homeCurrentTopic');
const homeTopicDesc = document.getElementById('homeTopicDesc');
const homeProgressCircle = document.getElementById('homeProgressCircle');
const continueBtn = document.getElementById('continueBtn');
const newTopicBtn = document.getElementById('newTopicBtn');

const recGrid = document.getElementById('recommendedGrid');
const excGrid = document.getElementById('exclusiveGrid');
const refreshRecBtn = document.getElementById('refreshRecBtn');
const refreshExcBtn = document.getElementById('refreshExcBtn');
const customTopicInput = document.getElementById('customTopicInput');
const startCustomTopicBtn = document.getElementById('startCustomTopicBtn');

const chatTopicName = document.getElementById('chatTopicName');
const chatDaySelector = document.getElementById('chatDaySelector');
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const autoTtsBtn = document.getElementById('autoTtsBtn');
const favoriteBtn = document.getElementById('favoriteBtn');
const favoriteIcon = document.getElementById('favoriteIcon');
const finishDayBtn = document.getElementById('finishDayBtn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Settings DOM
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiBaseUrlInput = document.getElementById('apiBaseUrlInput');
const apiModelInput = document.getElementById('apiModelInput');
const themeToggleBtn = document.getElementById('themeToggleBtn');

let currentTheme = localStorage.getItem('learning_companion_theme') || 'dark';
let isAutoTtsEnabled = false;

// Initialize
function init() {
    loadState();
    checkDailyRefresh();
    renderTopicGrids();
    updateHomeUI();
    applyTheme(currentTheme);
    setupEventListeners();
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggleBtn.innerHTML = '<i class="ph-bold ph-moon"></i>';
    } else {
        document.documentElement.removeAttribute('data-theme');
        themeToggleBtn.innerHTML = '<i class="ph-bold ph-sun"></i>';
    }
}

function renderTopicGrids() {
    recGrid.innerHTML = recommendedTopics.map(t => 
        `<div class="topic-item" data-topic="${t.title}">
            <i class="ph-fill ${t.icon}" style="font-size: 1.5rem; margin-bottom: 8px; color: var(--accent-tertiary);"></i><br>
            ${t.title}
        </div>`
    ).join('');

    excGrid.innerHTML = exclusiveTopics.map(t => 
        `<div class="topic-item" data-topic="${t.title}">
            <i class="ph-fill ${t.icon}" style="font-size: 1.5rem; margin-bottom: 8px; color: var(--accent-secondary);"></i><br>
            ${t.title}
        </div>`
    ).join('');
}

function renderFavoritesGrid() {
    const favSection = document.getElementById('favoritesSection');
    const favGrid = document.getElementById('favoritesGrid');
    
    if (!state.favorites || state.favorites.length === 0) {
        favSection.style.display = 'none';
        return;
    }
    
    favSection.style.display = 'block';
    favGrid.innerHTML = state.favorites.map(f => 
        `<div class="topic-item fav-item" data-topic="${f.topic}">
            <div style="font-size: 0.8rem; color: #ffd700; margin-bottom: 4px;">Day ${f.day} / 5</div>
            <i class="ph-fill ph-book-open" style="font-size: 1.5rem; margin-bottom: 8px; color: #ffd700;"></i><br>
            ${f.topic}
        </div>`
    ).join('');
    
    document.querySelectorAll('.fav-item').forEach(item => {
        item.addEventListener('click', (e) => startTopic(e.currentTarget.dataset.topic));
    });
}

function setupEventListeners() {
    // iOS Safari Keyboard Fix
    const appEl = document.getElementById('app');
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            if (appEl) {
                appEl.style.height = window.visualViewport.height + 'px';
                if (window.visualViewport.height < window.innerHeight * 0.75) {
                    appEl.style.padding = '0px';
                } else {
                    appEl.style.padding = '16px';
                }
            }
            window.scrollTo(0, 0);
            setTimeout(scrollToBottom, 100);
        });
    }
    
    // Aggressively prevent body scrolling which displaces the fixed/absolute layout on iOS
    window.addEventListener('scroll', () => {
        window.scrollTo(0, 0);
    });

    // 確保只要手機虛擬鍵盤收合（input 失去焦點），就把整個畫面高度恢復
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('blur', () => {
            if (appEl) {
                appEl.style.height = '100%'; 
                appEl.style.padding = '16px';
            }
            setTimeout(() => window.scrollTo(0, 0), 10);
        });
        input.addEventListener('focus', () => {
            setTimeout(scrollToBottom, 300);
        });
    });

    // Navigation
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', (e) => showScreen(e.currentTarget.dataset.target));
    });

    newTopicBtn.addEventListener('click', () => {
        renderFavoritesGrid();
        showScreen('topicScreen');
    });
    
    continueBtn.addEventListener('click', () => {
        if (state.topic) {
            goToChat();
        }
    });

    // Topic Selection
    attachGridListeners();

    startCustomTopicBtn.addEventListener('click', () => {
        const val = customTopicInput.value.trim();
        if (val) startTopic(val);
    });

    // Chat
    sendBtn.addEventListener('click', handleUserMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserMessage();
    });
    micBtn.addEventListener('click', toggleRecording);

    finishDayBtn.addEventListener('click', finishDay);

    chatDaySelector.addEventListener('change', (e) => {
        const selectedDay = parseInt(e.target.value);
        renderChat(selectedDay);
    });

    // Refresh Buttons
    refreshRecBtn.addEventListener('click', refreshRecommendedTopics);
    refreshExcBtn.addEventListener('click', refreshExclusiveTopics);

    // Auto TTS Toggle
    autoTtsBtn.addEventListener('click', () => {
        isAutoTtsEnabled = !isAutoTtsEnabled;
        if (isAutoTtsEnabled) {
            autoTtsBtn.innerHTML = '<i class="ph-bold ph-speaker-high" style="color: var(--accent-tertiary);"></i>';
            autoTtsBtn.title = "關閉語音自動朗讀";
            showToast("已開啟自動朗讀");
        } else {
            autoTtsBtn.innerHTML = '<i class="ph-bold ph-speaker-slash"></i>';
            autoTtsBtn.title = "開啟語音自動朗讀";
            window.speechSynthesis.cancel();
            showToast("已關閉自動朗讀");
        }
    });

    // Favorite Toggle
    favoriteBtn.addEventListener('click', () => {
        if (!state.topic) return;
        if (!state.favorites) state.favorites = [];
        const idx = state.favorites.findIndex(f => f.topic === state.topic);
        if (idx >= 0) {
            state.favorites.splice(idx, 1);
            showToast('已移出最愛清單');
        } else {
            state.favorites.push({
                topic: state.topic,
                day: state.day,
                chatHistory: [...state.chatHistory],
                pastChats: JSON.parse(JSON.stringify(state.pastChats || {})),
                hasFinishedToday: state.hasFinishedToday
            });
            showToast('⭐ 已加入最愛！可隨時在「選擇新主題」中繼續此話題');
        }
        updateFavoriteBtnUI();
        saveState();
    });

    // Theme Toggle
    themeToggleBtn.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(currentTheme);
        localStorage.setItem('learning_companion_theme', currentTheme);
    });

    // Settings
    settingsBtn.addEventListener('click', () => {
        apiKeyInput.value = apiSettings.apiKey;
        apiBaseUrlInput.value = apiSettings.baseUrl;
        apiModelInput.value = apiSettings.model;
        settingsModal.classList.remove('hidden');
    });
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    saveSettingsBtn.addEventListener('click', () => {
        apiSettings.apiKey = apiKeyInput.value.trim();
        apiSettings.baseUrl = apiBaseUrlInput.value.trim() || 'https://api.openai.com/v1';
        apiSettings.model = apiModelInput.value.trim() || 'gpt-4o-mini';
        localStorage.setItem('learning_companion_api_settings', JSON.stringify(apiSettings));
        settingsModal.classList.add('hidden');
        showToast('API 設定已儲存');
    });
}

async function refreshRecommendedTopics(isAuto = false) {
    if (refreshRecBtn.classList.contains('spinning')) return;
    
    if (!isAuto) refreshRecBtn.classList.add('spinning');
    
    try {
        if (apiSettings.apiKey) {
            const prompt = "請推薦4個適合學習的主題。要求：\n1. 每個主題包含「title」(2-6個字)和一個對應的「icon」(從 Phosphor Icons 挑選，例如 ph-atom, ph-code, ph-globe, ph-leaf, ph-planet 等)。\n2. 請直接回傳 JSON 陣列格式，例如：[{\"title\": \"主題名\", \"icon\": \"ph-icon\"}, ...]\n3. 不要任何額外解釋文字。";
            const response = await callLLM(prompt, "給我4個隨機但有趣的主題");
            if (response) {
                try {
                    const jsonStr = response.replace(/```json|```/g, '').trim();
                    const newTopics = JSON.parse(jsonStr);
                    if (Array.isArray(newTopics) && newTopics.length >= 4) {
                        recommendedTopics.length = 0;
                        recommendedTopics.push(...newTopics.slice(0, 4));
                        renderTopicGrids();
                        attachGridListeners();
                        if (!isAuto) {
                            state.lastRefreshTime = Date.now();
                            saveState();
                        }
                        return;
                    }
                } catch (e) {
                    console.error("Failed to parse AI topics:", e);
                }
            }
        }
        
        const shuffled = [...topicPools.recommended].sort(() => 0.5 - Math.random());
        recommendedTopics.length = 0;
        recommendedTopics.push(...shuffled.slice(0, 4));
        renderTopicGrids();
        attachGridListeners();
        if (!isAuto) {
            state.lastRefreshTime = Date.now();
            saveState();
        }
    } finally {
        if (!isAuto) setTimeout(() => refreshRecBtn.classList.remove('spinning'), 600);
    }
}

function refreshExclusiveTopics(isAuto = false) {
    if (refreshExcBtn.classList.contains('spinning')) return;
    
    if (!isAuto) refreshExcBtn.classList.add('spinning');
    
    const shuffled = [...topicPools.exclusive].sort(() => 0.5 - Math.random());
    exclusiveTopics.length = 0;
    exclusiveTopics.push(...shuffled.slice(0, 4));
    
    renderTopicGrids();
    attachGridListeners();
    
    if (!isAuto) {
        state.lastRefreshTime = Date.now();
        saveState();
        setTimeout(() => refreshExcBtn.classList.remove('spinning'), 600);
    }
}

function attachGridListeners() {
    document.querySelectorAll('.topic-item').forEach(item => {
        // Remove existing if any (though innerHTML clear usually handles this)
        item.addEventListener('click', (e) => startTopic(e.currentTarget.dataset.topic));
    });
}

function showScreen(screenId) {
    // 強制將瀏覽器視窗滾動回頂部，防止 iOS 鍵盤收起後畫面卡在半空中的 Bug
    window.scrollTo(0, 0);

    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    state.currentScreen = screenId;
    saveState();
}

function startTopic(topicName) {
    // If it's a favorite, load from favorite
    const fav = state.favorites ? state.favorites.find(f => f.topic === topicName) : null;
    if (fav) {
        state.topic = fav.topic;
        state.day = fav.day;
        state.chatHistory = [...fav.chatHistory];
        state.pastChats = fav.pastChats ? JSON.parse(JSON.stringify(fav.pastChats)) : {};
        state.hasFinishedToday = fav.hasFinishedToday;
    } else {
        // Standard fresh start
        state.topic = topicName;
        state.day = 1;
        state.chatHistory = [];
        state.pastChats = {};
        state.hasFinishedToday = false;
    }
    saveState();
    updateHomeUI();
    goToChat();
}

function updateFavoriteBtnUI() {
    if (!state.topic || !state.favorites) return;
    const isFav = state.favorites.some(f => f.topic === state.topic);
    if (isFav) {
        favoriteIcon.className = 'ph-fill ph-star favorite-active';
    } else {
        favoriteIcon.className = 'ph-bold ph-star';
    }
}

function updateHomeUI() {
    if (state.topic) {
        homeCurrentTopic.textContent = state.topic;
        homeCurrentDay.textContent = state.day;
        homeTopicDesc.textContent = `你的專屬知識教練已經準備好第 ${state.day} 天的課程內容了！`;
        continueBtn.classList.remove('disabled');
        
        // Update progress circle (circumference is ~100)
        const progress = (state.day / 5) * 100;
        homeProgressCircle.setAttribute('stroke-dasharray', `${progress}, 100`);
    } else {
        homeCurrentTopic.textContent = "尚未選擇主題";
        homeCurrentDay.textContent = "-";
        homeTopicDesc.textContent = "選擇一個主題開始你為期5天的學習旅程。";
        continueBtn.classList.add('disabled');
        homeProgressCircle.setAttribute('stroke-dasharray', `0, 100`);
    }
}

function goToChat() {
    chatTopicName.textContent = state.topic;
    
    chatDaySelector.innerHTML = '';
    for (let d = 1; d < state.day; d++) {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `Day ${d}`;
        chatDaySelector.appendChild(opt);
    }
    const currentOpt = document.createElement('option');
    currentOpt.value = state.day;
    currentOpt.textContent = `Day ${state.day}`;
    currentOpt.selected = true;
    chatDaySelector.appendChild(currentOpt);

    updateFavoriteBtnUI();
    showScreen('chatScreen');
    renderChat(state.day);

    // If no history for this day, AI starts the conversation
    if (state.chatHistory.length === 0) {
        triggerAIIntro();
    }
}

async function triggerAIIntro() {
    if (state.isGenerating || state.hasFinishedToday) return;
    showTypingIndicator();
    
    if (!apiSettings.apiKey) {
        removeTypingIndicator();
        showToast('請點擊右上方齒輪圖示設定 API Key');
        return;
    }

    const replyText = await callLLM(getSystemPrompt(), '你好教練，請開始 ' + state.topic + ' 的 Day ' + state.day + ' 課程！');
    removeTypingIndicator();

    if (replyText) {
        addMessageToChat('ai', replyText);
    }
}

async function handleUserMessage() {
    const text = chatInput.value.trim();
    if (!text || state.isGenerating) return;

    chatInput.value = '';
    addMessageToChat('user', text);
    
    showTypingIndicator();

    if (!apiSettings.apiKey) {
        removeTypingIndicator();
        showToast('請點擊右上方齒輪圖示設定 API Key');
        return;
    }

    const replyText = await callLLM(getSystemPrompt(), null);
    removeTypingIndicator();

    if (replyText) {
        addMessageToChat('ai', replyText);
    }
}

function addMessageToChat(role, rawContent) {
    state.chatHistory.push({ role, content: rawContent });
    saveState();
    
    appendMessageElement(role, rawContent, false);
}

function appendMessageElement(role, rawContent, isHistory = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `message msg-${role}`;
    
    let icon = role === 'ai' ? '<i class="ph-bold ph-robot"></i>' : '<i class="ph-bold ph-user"></i>';
    const htmlContent = window.marked ? marked.parse(rawContent) : rawContent;
    
    let innerHTML = `
        <div class="msg-avatar">${icon}</div>
        <div class="msg-bubble">
            <div class="msg-content">${htmlContent}</div>
        </div>
    `;
    wrapper.innerHTML = innerHTML;

    if (role === 'ai') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'msg-actions';
        
        const playBtn = document.createElement('button');
        playBtn.className = 'icon-btn tts-btn';
        playBtn.title = '朗讀此訊息';
        playBtn.innerHTML = '<i class="ph-bold ph-speaker-high"></i>';
        
        const plainText = rawContent.replace(/[#*`_~>]/g, '');

        playBtn.addEventListener('click', () => {
            speakText(plainText, playBtn);
        });

        actionsDiv.appendChild(playBtn);
        wrapper.querySelector('.msg-bubble').appendChild(actionsDiv);

        if (isAutoTtsEnabled && !isHistory) {
            setTimeout(() => {
                speakText(plainText, playBtn);
            }, 300);
        }
    }
    
    chatContainer.appendChild(wrapper);
    scrollToBottom();
}

let currentUtterance = null;
function speakText(text, btnElement) {
    if (!('speechSynthesis' in window)) {
        showToast('您的瀏覽器不支援語音朗讀功能');
        return;
    }

    if (window.speechSynthesis.speaking && currentUtterance && currentUtterance.text === text) {
        window.speechSynthesis.cancel();
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW';
    utterance.rate = 1.2; // 加塊語速
    utterance.pitch = 1.1; // 稍微提高一點音調，聽起來更輕柔
    
    // 尋找內建的中文溫柔女聲 (macOS/iOS 常見為 Ting-Ting, Mei-Jia ; Chrome 為 Google 國語)
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        let preferredVoice = voices.find(v => {
            const n = v.name.toLowerCase();
            return v.lang.includes('zh-TW') && (n.includes('ting') || n.includes('mei') || n.includes('qiao') || n.includes('xiaoxiao') || n.includes('google'));
        });
        if (!preferredVoice) preferredVoice = voices.find(v => v.lang.includes('zh-TW'));
        if (preferredVoice) utterance.voice = preferredVoice;
    }
    
    const iconBase = '<i class="ph-bold ph-speaker-high"></i>';
    const iconPlaying = '<i class="ph-fill ph-speaker-high pulse-icon"></i>';
    
    utterance.onstart = () => {
        btnElement.innerHTML = iconPlaying;
        btnElement.classList.add('playing');
    };
    
    utterance.onend = () => {
        btnElement.innerHTML = iconBase;
        btnElement.classList.remove('playing');
        currentUtterance = null;
    };

    utterance.onerror = () => {
        btnElement.innerHTML = iconBase;
        btnElement.classList.remove('playing');
        currentUtterance = null;
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

function showTypingIndicator() {
    state.isGenerating = true;
    sendBtn.classList.add('disabled');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message msg-ai typing-wrapper';
    wrapper.innerHTML = `
        <div class="msg-avatar"><i class="ph-bold ph-robot"></i></div>
        <div class="typing-indicator">
            <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        </div>
    `;
    chatContainer.appendChild(wrapper);
    scrollToBottom();
}

function removeTypingIndicator() {
    state.isGenerating = false;
    sendBtn.classList.remove('disabled');
    const el = document.querySelector('.typing-wrapper');
    if (el) el.remove();
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function finishDay() {
    if (state.day >= 5) {
        showToast(`恭喜！你已經完成了「${state.topic}」的5天旅程！`);
        setTimeout(() => {
            state.topic = null;
            state.day = 1;
            state.chatHistory = [];
            saveState();
            updateHomeUI();
            showScreen('homeScreen');
        }, 3000);
        return;
    }

    if (!state.pastChats) state.pastChats = {};
    state.pastChats[state.day] = [...state.chatHistory];

    state.day += 1;
    state.chatHistory = []; // clear history for the next day
    state.hasFinishedToday = true;
    saveState();
    
    showToast(`Day ${state.day-1} 完成！已推進到 Day ${state.day}`);
    updateHomeUI();
    showScreen('homeScreen');
}

function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// LocalStorage Utils
function saveState() {
    if (!state.favorites) state.favorites = [];
    
    // Sync global arrays to state
    state.recommendedTopics = [...recommendedTopics];
    state.exclusiveTopics = [...exclusiveTopics];

    if (state.topic) {
        const favIdx = state.favorites.findIndex(f => f.topic === state.topic);
        if (favIdx >= 0) {
            state.favorites[favIdx] = {
                topic: state.topic,
                day: state.day,
                chatHistory: [...state.chatHistory],
                pastChats: JSON.parse(JSON.stringify(state.pastChats || {})),
                hasFinishedToday: state.hasFinishedToday
            };
        }
    }

    localStorage.setItem('learning_companion_state', JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem('learning_companion_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(state, parsed);
        if (!state.favorites) state.favorites = [];
        
        // Sync global arrays with state
        if (state.recommendedTopics && state.recommendedTopics.length > 0) {
            recommendedTopics.length = 0;
            recommendedTopics.push(...state.recommendedTopics);
        }
        if (state.exclusiveTopics && state.exclusiveTopics.length > 0) {
            exclusiveTopics.length = 0;
            exclusiveTopics.push(...state.exclusiveTopics);
        }
    }
}

async function checkDailyRefresh() {
    const now = new Date();
    // 取得當前時間點的「最近一個清晨 6 點」
    // 如果現在不到 6 點，則最近一個 6 點是昨天的 6 點
    const recent6AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
    if (now < recent6AM) {
        recent6AM.setDate(recent6AM.getDate() - 1);
    }
    
    const recent6AMTs = recent6AM.getTime();
    
    // 如果最後更新時間早於最近的 6 點，則觸發更新
    if (state.lastRefreshTime < recent6AMTs) {
        console.log("Daily refresh triggered (Last update before 6 AM)");
        await refreshRecommendedTopics(true); // pass 'true' to indicate auto-refresh
        refreshExclusiveTopics(true);
        state.lastRefreshTime = Date.now();
        saveState();
    }
}

function renderChat(dayToRender) {
    if (!dayToRender) dayToRender = parseInt(chatDaySelector.value) || state.day;
    chatContainer.innerHTML = '';
    
    let historyToRender = [];
    const chatInputArea = document.querySelector('.chat-input-area');
    
    if (dayToRender === state.day) {
        historyToRender = state.chatHistory;
        if (chatInputArea) chatInputArea.style.display = 'flex';
        finishDayBtn.style.display = 'inline-block';
    } else {
        historyToRender = state.pastChats && state.pastChats[dayToRender] ? state.pastChats[dayToRender] : [];
        if (chatInputArea) chatInputArea.style.display = 'none';
        finishDayBtn.style.display = 'none';
    }

    historyToRender.forEach(msg => {
        appendMessageElement(msg.role, msg.content, true);
    });
}

// Start
init();

// ===== VOICE INPUT LOGIC =====
let recognition = null;
let isRecording = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'cmn-Hant-TW'; // Traditional Chinese
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add('recording');
        chatInput.placeholder = "聆聽中...";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        chatInput.value += (chatInput.value ? ' ' : '') + transcript;
        // Optionally auto-send immediately, but usually better to let user review their text
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== 'no-speech') {
            showToast("語音辨識錯誤: " + event.error);
        }
        stopRecording();
    };

    recognition.onend = () => {
        stopRecording();
    };
}

function toggleRecording() {
    if (!recognition) {
        showToast('您的瀏覽器似乎不支援語音輸入功能 (請嘗試使用 Chrome)');
        return;
    }
    
    if (isRecording) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch(e) {
            console.error(e);
        }
    }
}

function stopRecording() {
    isRecording = false;
    if (micBtn) micBtn.classList.remove('recording');
    if (chatInput) chatInput.placeholder = "有什麼不懂的嗎？隨時發問...";
}
