// State Management
// Version: 1.5
const state = {
    currentScreen: 'learningScreen', // Default to learning
    topic: null,
    day: 1,
    chatHistory: [],
    pastChats: {},
    isGenerating: false,
    hasFinishedToday: false,
    favorites: [], // Note: renamed internally to activeTopics in some contexts but kept as 'favorites' for LS compatibility
    recommendedTopics: [],
    exclusiveTopics: [],
    lastRefreshTime: 0
};

let apiSettings = JSON.parse(localStorage.getItem('learning_companion_api_settings') || '{"apiKey":"","baseUrl":"","model":""}');

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
    { title: "混音基礎", icon: "ph-faders" },
    { title: "隨興聊天", icon: "ph-chat-circle-dots" }
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
        { title: "環境永續性", icon: "ph-leaf" },
        { title: "行為經濟學", icon: "ph-chart-line-up" },
        { title: "中世紀歷史", icon: "ph-shield" },
        { title: "現代藝術導賞", icon: "ph-palette" },
        { title: "神經科學", icon: "ph-dna" }
    ],
    exclusive: [
        { title: "獨立音樂製作", icon: "ph-headphones" },
        { title: "寫歌靈感", icon: "ph-lightbulb" },
        { title: "編曲技巧", icon: "ph-piano-keys" },
        { title: "混音基礎", icon: "ph-faders" },
        { title: "音樂行銷", icon: "ph-megaphone" },
        { title: "舞台表演藝術", icon: "ph-microphone-stage" },
        { title: "錄音室設計", icon: "ph-waveform" },
        { title: "音樂版權管理", icon: "ph-copyright" },
        { title: "爵士樂歷史", icon: "ph-trumpet" },
        { title: "隨興聊天", icon: "ph-chat-circle-dots" }
    ]
};

// LLM API Logic
function getSystemPrompt(isClosing = false) {
    if (state.topic === '隨興聊天') {
        let prompt = '你是一個親切的聊天夥伴。目前正在陪使用者進行「隨興聊天」。\n\n' +
               '規則：\n' +
               '1. 保持輕鬆、自然且溫暖的語氣，就像好朋友一樣。\n' +
               '2. 這次沒有特定的 5 天學習計畫，隨意聊任何使用者感興趣的話題。\n';
        
        if (isClosing) {
            prompt += '3. 使用者表示聊天可以結束了。請提供一個溫馨的結尾，並鼓勵他們隨時回來聊天。\n';
        } else {
            prompt += '3. 每次發言完，最後都要延續話題或是問一個有趣的小問題來維持互動。\n';
        }
        
        prompt += '4. 全文請用繁體中文。請直接用 markdown 格式輸出，不要包含任何開場白。';
        return prompt;
    }

    let prompt = '你是一個知識教練。目前正在指導使用者學習「' + state.topic + '」。今天是 5 天學習計畫的第 ' + state.day + ' 天。\n\n' +
           '規則：\n' +
           '1. 內容厚度必須依照天數變化：\n' +
           '   Day 1: 簡單介紹，建立初步直覺，使用超生活化的例子。\n' +
           '   Day 2: 進階機制與背後原理探討。\n' +
           '   Day 3: 專業應用與專業術語。\n' +
           '   Day 4: 極限案例、邊角狀況與深論。\n' +
           '   Day 5: 知識統整與專家反思。\n';
    
    if (isClosing) {
        prompt += '2. 使用者表示今天的討論可以結束了。請依照以下格式提供一個精簡的總結：\n' +
               '   - **今日討論重點整理**：列出 2-3 個今天學到的核心觀念。\n' +
               '   - **教練小提醒**：給予一句溫馨的鼓勵或總結。\n' +
               '   - 最後提醒使用者可以點擊下方的「完成今日進度」按鈕。\n' +
               '   - **絕對不要再提出任何引導問題**。\n';
    } else {
        prompt += '2. 你每次發言完，最後一定要主動問「一個」引導問題。請使用 Markdown 標題或是粗體來標示這個問題。\n';
    }
    
    prompt += '3. 語氣要像一個有經驗但平易近人的老師，簡單清楚，適度分段。\n' +
           '4. 如果使用者提問，請優先針對他的問題回答。回答完後，再將話題帶回今日主線，並重新問一個引導討論的問題。\n' +
           '5. 全文請用繁體中文。請直接用 markdown 格式輸出，不要包含任何開場白。';
    return prompt;
}

async function callLLM(systemPrompt, userText = null) {
    if (!apiSettings.apiKey) {
        showToast('請先完成 API 設定');
        return null;
    }

    const isGemini = apiSettings.apiKey.startsWith('AIza');
    console.log('Detecting API type - isGemini:', isGemini, 'Key starts with:', apiSettings.apiKey.substring(0, 4));

    if (isGemini) {
        try {
            // Using Gemini 1.5 Flash (Stable and fast)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiSettings.apiKey}`;
            
            // Native Gemini requires alternating roles (user/model)
            let lastRole = null;
            const cleanedContents = [];
            
            const historyToProcess = state.chatHistory.slice(-20); // Cap history to last 20 messages for speed
            if (userText) {
                historyToProcess.push({ role: 'user', content: userText });
            }

            historyToProcess.forEach(msg => {
                const role = msg.role === 'ai' ? 'model' : 'user';
                if (role !== lastRole) {
                    cleanedContents.push({
                        role: role,
                        parts: [{ text: msg.content || " " }]
                    });
                    lastRole = role;
                } else {
                    // Merge consecutive same-role messages
                    cleanedContents[cleanedContents.length - 1].parts[0].text += "\n" + (msg.content || " ");
                }
            });

            if (cleanedContents.length === 0) {
                cleanedContents.push({ role: 'user', parts: [{ text: 'Hello' }] });
            }
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: cleanedContents,
                    generationConfig: { 
                        temperature: 0.7, 
                        maxOutputTokens: 2048
                    }
                })
            });
            
            if (!response.ok) {
                const rawText = await response.text();
                let errMsg = response.statusText;
                try {
                    const err = JSON.parse(rawText);
                    errMsg = err.error?.message || errMsg;
                } catch(e) { errMsg = rawText || errMsg; }
                throw new Error(`(HTTP ${response.status}) ${errMsg}`);
            }
            const data = await response.json();
            if (data.candidates && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Gemini 未能生成內容 (可能是安全過濾或空回應)');
            }
        } catch (e) {
            console.error('Gemini Fetch Error:', e);
            addErrorToChat('Gemini 錯誤: ' + e.message);
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
                    max_tokens: 2048,
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
            console.error('OpenAI Fetch Error:', e);
            addErrorToChat('OpenAI/API 錯誤: ' + e.message);
            return null;
        }
    }
}

// DOM Elements
const screens = document.querySelectorAll('.screen');
const activeTopicsContainer = document.getElementById('activeTopicsContainer');
const favoriteTopicsContainer = document.getElementById('favoriteTopicsContainer');

const recGrid = document.getElementById('recommendedGrid');
const excGrid = document.getElementById('exclusiveGrid');
const exclusiveThemeInput = document.getElementById('exclusiveThemeInput');
const generateExclusiveBtn = document.getElementById('generateExclusiveBtn');
const exclusiveResults = document.getElementById('exclusiveResults');
const exclusiveResultsGrid = document.getElementById('exclusiveResultsGrid');

const chatTopicName = document.getElementById('chatTopicName');
const chatDaySelector = document.getElementById('chatDaySelector');
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const favoriteBtn = document.getElementById('favoriteBtn');
const favoriteIcon = document.getElementById('favoriteIcon');
const finishDayBtn = document.getElementById('finishDayBtn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// Bottom Nav
const navItems = document.querySelectorAll('.nav-item');
const bottomNav = document.querySelector('.bottom-nav');

// Settings DOM
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
let currentTheme = localStorage.getItem('learning_companion_theme') || 'dark';

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
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.innerHTML = '<i class="ph-bold ph-moon"></i>';
        });
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.innerHTML = '<i class="ph-bold ph-sun"></i>';
        });
    }
}

function renderTopicGrids() {
    recGrid.innerHTML = recommendedTopics.map(t => 
        `<div class="topic-item" data-topic="${t.title}">
            <i class="ph-fill ${t.icon}" style="font-size: 1.5rem; margin-bottom: 8px; color: var(--accent-tertiary);"></i><br>
            ${t.title}
        </div>`
    ).join('');

    // Render Exclusive Topics (from dynamic list + permanent Casual Chat)
    let excHTML = exclusiveTopics.map(t => 
        `<div class="topic-item" data-topic="${t.title}">
            <i class="ph-fill ${t.icon}" style="font-size: 1.5rem; margin-bottom: 8px; color: var(--accent-secondary);"></i><br>
            ${t.title}
        </div>`
    ).join('');
    
    // Always add "Casual Chat" if it's not already in the list
    if (!exclusiveTopics.find(t => t.title === '隨興聊天')) {
        excHTML += `
            <div class="topic-item permanent-topic" data-topic="隨興聊天">
                <i class="ph-fill ph-chat-circle-dots" style="font-size: 1.5rem; margin-bottom: 8px; color: var(--accent-secondary);"></i><br>
                隨興聊天
            </div>
        `;
    }
    excGrid.innerHTML = excHTML;
}

function renderFavoritesGrid() {
    // This function is still used by updateHomeUI for the favoritesScreen
    const favGrid = document.getElementById('favoriteTopicsContainer');
    if (!favGrid) return;
    
    if (!state.favorites || state.favorites.filter(f => f.isStarred).length === 0) {
        favGrid.innerHTML = `
            <div class="empty-topics-hint">
                <i class="ph-fill ph-star"></i>
                <p>目前還沒有收藏的主題。<br>在聊天室中點擊星星圖示來收藏吧！</p>
            </div>
        `;
        return;
    }
    
    const starred = state.favorites.filter(f => f.isStarred);
    favGrid.innerHTML = starred.map(f => renderTopicCard(f)).join('');

    // Re-attach listeners to the new cards
    favGrid.querySelectorAll('.active-topic-card').forEach(card => {
        card.addEventListener('click', () => startTopic(card.dataset.topic));
    });
}

function setupEventListeners() {
    // Basic navigation links
    document.querySelectorAll('[data-target]').forEach(el => {
        el.onclick = () => showScreen(el.dataset.target);
    });
    // Navigation
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', (e) => showScreen(e.currentTarget.dataset.target));
    });

    // Bottom Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            showScreen(target);
        });
    });

    // Topic Selection (Delegation for robustness)
    [activeTopicsContainer, favoriteTopicsContainer].forEach(container => {
        if (container) {
            container.onclick = (e) => {
                const card = e.target.closest('.active-topic-card');
                if (card && card.dataset.topic) {
                    startTopic(card.dataset.topic);
                }
            };
        }
    });

    attachGridListeners();

    generateExclusiveBtn.addEventListener('click', generateExclusiveTopics);
    exclusiveThemeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') generateExclusiveTopics();
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

    // Favorite Toggle
    favoriteBtn.addEventListener('click', () => {
        if (!state.topic) return;
        if (!state.favorites) state.favorites = [];
        const fav = state.favorites.find(f => f.topic === state.topic);
        if (fav) {
            fav.isStarred = !fav.isStarred;
            if (fav.isStarred) {
                showToast('⭐ 已加入最愛！');
            } else {
                showToast('已移出最愛清單');
            }
        } else {
            state.favorites.push({
                topic: state.topic,
                day: state.day,
                chatHistory: [...state.chatHistory],
                pastChats: JSON.parse(JSON.stringify(state.pastChats || {})),
                hasFinishedToday: state.hasFinishedToday,
                isStarred: true
            });
            showToast('⭐ 已加入最愛！');
        }
        updateFavoriteBtnUI();
        saveState();
        updateHomeUI(); // Refresh both tabs
    });

    // Theme Toggle
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(currentTheme);
            localStorage.setItem('learning_companion_theme', currentTheme);
        });
    });

    // Settings
    document.querySelectorAll('.settings-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            apiKeyInput.value = apiSettings.apiKey;
            settingsModal.classList.remove('hidden');
        });
    });
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    saveSettingsBtn.addEventListener('click', () => {
        apiSettings.apiKey = apiKeyInput.value.trim();
        apiSettings.baseUrl = 'https://api.openai.com/v1';
        apiSettings.model = 'gpt-4o-mini';
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
            const currentTitles = recommendedTopics.map(t => t.title).join('、');
            const prompt = `請推薦4個「完全不同領域」且「適合學習」的新主題。要求：
1. 領域要多元，例如涵蓋：藝術設計、前沿科學、日常生活技巧、哲學歷史、軟實力、旅遊文化等。
2. 絕對不要推薦以下已經出現過的主題：${currentTitles}。
3. 每個主題包含「title」(2-6個字)和一個對應的「icon」(從 Phosphor Icons 挑選，例如 ph-atom, ph-code, ph-globe, ph-leaf, ph-planet, ph-camera, ph-music-notes 等)。
4. 請直接回傳 JSON 陣列格式，例如：[{"title": "主題名", "icon": "ph-icon"}]
5. 不要任何額外解釋文字。`;
            const response = await callLLM(prompt, "請給我4個跟之前完全不同的、有趣的多元學習主題。");
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
    // We already use delegation in some places, but let's ensure these containers work
    const containers = [recGrid, excGrid];
    containers.forEach(container => {
        if (!container) return;
        // Use delegation for better reliability
        container.onclick = (e) => {
            const card = e.target.closest('.topic-item');
            if (card && card.dataset.topic) {
                console.log('Starting topic:', card.dataset.topic);
                startTopic(card.dataset.topic);
            }
        };
    });
}

function showScreen(screenId) {
    window.scrollTo(0, 0);

    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    state.currentScreen = screenId;

    // Update Bottom Nav Active State
    navItems.forEach(item => {
        if (item.dataset.target === screenId) {
            item.classList.add('active');
            const icon = item.querySelector('i');
            if (icon) icon.className = icon.className.replace('ph-bold', 'ph-fill');
        } else {
            item.classList.remove('active');
            const icon = item.querySelector('i');
            if (icon) icon.className = icon.className.replace('ph-fill', 'ph-bold');
        }
    });

    // Hide Bottom Nav in Chat Screen
    if (screenId === 'chatScreen') {
        bottomNav.style.display = 'none';
    } else {
        bottomNav.style.display = 'flex';
    }

    // Special Rendering for specific screens
    if (screenId === 'learningScreen' || screenId === 'favoritesScreen') {
        updateHomeUI();
    }
    if (screenId === 'exploreScreen') {
        renderTopicGrids();
    }

    saveState();
}

function startTopic(topicName) {
    // If it's a favorite/active, load from state
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
        
        // Auto-add to active topics
        if (!state.favorites) state.favorites = [];
        state.favorites.push({
            topic: state.topic,
            day: state.day,
            chatHistory: [],
            pastChats: {},
            hasFinishedToday: false,
            isStarred: false
        });
    }
    saveState();
    updateHomeUI();
    goToChat();
}

function updateFavoriteBtnUI() {
    if (!state.topic || !state.favorites) return;
    const fav = state.favorites.find(f => f.topic === state.topic);
    if (fav && fav.isStarred) {
        favoriteIcon.className = 'ph-fill ph-star favorite-active';
        favoriteIcon.style.color = '#ffd700';
    } else {
        favoriteIcon.className = 'ph-bold ph-star';
        favoriteIcon.style.color = '';
    }
}

async function generateExclusiveTopics() {
    const theme = exclusiveThemeInput.value.trim();
    if (!theme) {
        showToast('請輸入一個大方向');
        return;
    }
    
    if (!apiSettings.apiKey) {
        showToast('請先設定 API Key');
        return;
    }

    generateExclusiveBtn.innerHTML = '<i class="ph-bold ph-circle-notch spinning"></i>';
    generateExclusiveBtn.classList.add('disabled');
    
    try {
        const prompt = `使用者目前想學習「${theme}」。請針對此方向生成 4 個專屬子話題。要求：
1. 每個主題包含「title」(2-6個字)和一個對應的「icon」(從 Phosphor Icons 挑選)。
2. 直接回傳 JSON 陣列：[{"title": "話題名", "icon": "ph-icon"}]。
3. 不要任何額外解釋。`;

        const response = await callLLM(prompt, `我想學習 ${theme}，請給我 4 個專屬话题。`);
        if (response) {
            const jsonStr = response.replace(/```json|```/g, '').trim();
            const newTopics = JSON.parse(jsonStr);
            if (Array.isArray(newTopics) && newTopics.length >= 4) {
                // Merge/Replace the exclusiveTopics
                exclusiveTopics.length = 0;
                exclusiveTopics.push(...newTopics.slice(0, 4));
                
                renderTopicGrids();
                attachGridListeners();
                
                state.exclusiveTopics = [...exclusiveTopics];
                saveState();
                
                showToast(`已為您生成關於「${theme}」的專屬主題！`);
                return;
            }
        }
        throw new Error('AI 返回內容無法解析');
    } catch (e) {
        console.error("Failed to generate custom topics:", e);
        showToast('生成專屬主題失敗，請檢查 API 設定');
    } finally {
        generateExclusiveBtn.innerHTML = '生成';
        generateExclusiveBtn.classList.remove('disabled');
    }
}

function updateHomeUI() {
    if (!state.favorites) state.favorites = [];
    
    // 1. Render Active Topics (Learning Screen) - Only those NOT finished
    const activeTopics = state.favorites.filter(f => !f.isFinishedCycle);
    if (activeTopics.length > 0) {
        activeTopicsContainer.innerHTML = activeTopics.map(f => renderTopicCard(f)).join('');
    } else {
        activeTopicsContainer.innerHTML = `
            <div class="empty-topics-hint">
                <i class="ph-fill ph-chat-centered-dots"></i>
                <p>目前還沒有正在學習中的主題。<br>到「探索」分頁開始你的第一課吧！</p>
            </div>
        `;
    }

    // 2. Render Starred Topics (Favorites Screen) - Keep even if finished
    const starredTopics = state.favorites.filter(f => f.isStarred);
    if (starredTopics.length > 0) {
        favoriteTopicsContainer.innerHTML = starredTopics.map(f => renderTopicCard(f)).join('');
    } else {
        favoriteTopicsContainer.innerHTML = `
            <div class="empty-topics-hint">
                <i class="ph-fill ph-star"></i>
                <p>目前還沒有收藏的主題。<br>在聊天室中點擊星星圖示來收藏吧！</p>
            </div>
        `;
    }
}

function renderTopicCard(f) {
    const progress = (f.day / 5) * 100;
    const isDone = f.isFinishedCycle;
    return `
        <div class="active-topic-card glass-panel ${isDone ? 'finished-card' : ''}" data-topic="${f.topic}">
            <div class="topic-info">
                <div class="progress-badge" style="${isDone ? 'background: linear-gradient(135deg, #00f0ff, #8a2be2); color: white;' : ''}">
                    ${isDone ? '<i class="ph-fill ph-check-circle"></i> 已光榮完成' : `Day ${f.day} / 5`}
                </div>
                <h3>${f.topic}</h3>
                <p class="topic-desc">${isDone ? '查看過往學習精華或繼續複習' : '點擊繼續學習此主題...'}</p>
            </div>
            <div class="progress-ring">
                <svg viewBox="0 0 36 36">
                    <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path class="circle" style="stroke-dasharray: ${progress}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <i class="ph-fill ${isDone ? 'ph-trophy' : 'ph-book-open'} ring-icon" style="${isDone ? 'color: #ffd700;' : ''}"></i>
            </div>
        </div>
    `;
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

    // Comprehensive natural language ending detection
    const endingKeywords = [
        '可以了', '夠了', '結束', '到這裡', '不說了', '就這樣', 
        '不聊了', '差不多了', '沒問題了', '不需要了', 
        '我們今天這樣就可以了', '話題已經夠了', '到此為止',
        'bye', 'goodbye', 'enough', 'stop', 'finished'
    ];
    const isClosing = endingKeywords.some(keyword => text.toLowerCase().includes(keyword));

    const replyText = await callLLM(getSystemPrompt(isClosing), text);
    removeTypingIndicator();

    if (replyText) {
        addMessageToChat('ai', replyText, isClosing);
    }
}

function addErrorToChat(errMsg) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message msg-error';
    wrapper.innerHTML = `
        <div class="msg-bubble">
            <div class="msg-content"><strong><i class="ph-bold ph-warning-circle"></i> API 錯誤發生</strong><br>${errMsg}</div>
        </div>
    `;
    chatContainer.appendChild(wrapper);
    scrollToBottom();
}

function addMessageToChat(role, rawContent, isClosing = false) {
    state.chatHistory.push({ role, content: rawContent });
    saveState();
    
    appendMessageElement(role, rawContent, false, isClosing);
}

function appendMessageElement(role, rawContent, isHistory = false, isClosing = false) {
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
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'icon-btn copy-btn';
        copyBtn.title = '複製此訊息';
        copyBtn.innerHTML = '<i class="ph-bold ph-copy"></i>';
        
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(rawContent);
            showToast('已複製到剪貼簿');
        });

        actionsDiv.appendChild(copyBtn);
        wrapper.querySelector('.msg-bubble').appendChild(actionsDiv);

        if (isClosing) {
            const finishBtnWrapper = document.createElement('div');
            finishBtnWrapper.style.marginTop = '16px';
            finishBtnWrapper.innerHTML = `
                <button class="btn btn-primary" style="width: 100%; padding: 12px; border-radius: 16px;">
                    <i class="ph-bold ph-check-circle"></i> 完成今日進度
                </button>
            `;
            finishBtnWrapper.querySelector('button').addEventListener('click', finishDay);
            wrapper.querySelector('.msg-bubble').appendChild(finishBtnWrapper);
        }
    }
    
    chatContainer.appendChild(wrapper);
    scrollToBottom();
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
    const favIdx = state.favorites ? state.favorites.findIndex(f => f.topic === state.topic) : -1;

    if (state.day >= 5) {
        showToast(`恭喜！你已經完成了「${state.topic}」的5天旅程！`);
        
        if (favIdx >= 0) {
            const fav = state.favorites[favIdx];
            if (fav.isStarred) {
                // If starred, keep it but mark as finished
                fav.isFinishedCycle = true;
                fav.hasFinishedToday = true;
                fav.day = 5;
            } else {
                // Not starred, remove it
                state.favorites.splice(favIdx, 1);
            }
        }

        setTimeout(() => {
            state.topic = null;
            state.day = 1;
            state.chatHistory = [];
            saveState();
            updateHomeUI();
            showScreen('learningScreen');
        }, 3000);
        return;
    }

    state.day += 1;
    state.chatHistory = []; // clear history for the next day
    state.hasFinishedToday = true;
    
    // Update the record in favorites
    if (favIdx >= 0) {
        state.favorites[favIdx].day = state.day;
        state.favorites[favIdx].hasFinishedToday = true;
    }

    saveState();
    
    showToast(`Day ${state.day-1} 完成！已推進到 Day ${state.day}`);
    updateHomeUI();
    showScreen('learningScreen');
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
            const oldFav = state.favorites[favIdx];
            state.favorites[favIdx] = {
                ...oldFav, // Preserve isStarred and other existing properties
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
        // Migration: Ensure all favorites have isStarred property
        if (state.favorites) {
            state.favorites.forEach(f => {
                if (f.isStarred === undefined) f.isStarred = false;
            });
        }
        
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
