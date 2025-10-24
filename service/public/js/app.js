const API_BASE = '/api';
let authToken = localStorage.getItem('authToken');

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// Show message
function showMessage(message, type = 'info') {
    const messageBox = document.getElementById('message-box');
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    messageEl.textContent = message;
    
    messageBox.appendChild(messageEl);
    
    setTimeout(() => {
        messageEl.remove();
    }, 5000);
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const captcha = document.getElementById('login-captcha').value;
    
    if (!captcha) {
        showMessage('请输入验证码', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // Include cookies for captcha session
            body: JSON.stringify({ email, password, captcha })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            showMessage('登录成功！', 'success');
            showDashboard();
        } else {
            showMessage(data.error || '登录失败', 'error');
            await refreshCaptcha('login'); // Refresh captcha on error
        }
    } catch (error) {
        showMessage('网络错误，请重试', 'error');
        await refreshCaptcha('login');
    }
});

// Register form
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    const captcha = document.getElementById('register-captcha').value;
    
    if (password !== passwordConfirm) {
        showMessage('两次密码输入不一致', 'error');
        return;
    }
    
    if (!captcha) {
        showMessage('请输入验证码', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // Include cookies for captcha session
            body: JSON.stringify({ email, password, captcha })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            showMessage('注册成功！请查看邮箱验证您的账户。', 'success');
            showDashboard();
        } else {
            showMessage(data.error || '注册失败', 'error');
            await refreshCaptcha('register'); // Refresh captcha on error
        }
    } catch (error) {
        showMessage('网络错误，请重试', 'error');
        await refreshCaptcha('register');
    }
});

// OAuth login
function oauthLogin(provider) {
    window.location.href = `${API_BASE}/auth/${provider}`;
}

// Show dashboard
async function showDashboard() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    
    await loadUserProfile();
    await loadSyncStatus();
}

// Load user profile
async function loadUserProfile() {
    try {
        const response = await fetch(`${API_BASE}/auth/profile`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('user-email').textContent = data.email;
            document.getElementById('email-status').innerHTML = data.emailVerified 
                ? '<span class="status-badge status-verified">已验证 ✓</span>'
                : '<span class="status-badge status-unverified">未验证</span>';
            document.getElementById('auth-provider').textContent = data.authProvider === 'local' ? '邮箱密码' : data.authProvider;
            document.getElementById('created-at').textContent = new Date(data.createdAt).toLocaleString('zh-CN');
            
            if (!data.emailVerified) {
                document.getElementById('verification-alert').style.display = 'block';
            }
        } else {
            showMessage('加载用户信息失败', 'error');
        }
    } catch (error) {
        showMessage('网络错误', 'error');
    }
}

// Load sync status
async function loadSyncStatus() {
    try {
        const response = await fetch(`${API_BASE}/sync/status`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const content = document.getElementById('sync-status-content');
            
            if (data.synced) {
                content.innerHTML = `
                    <div class="sync-stat">
                        <span>最后同步时间:</span>
                        <strong>${new Date(data.lastSyncAt).toLocaleString('zh-CN')}</strong>
                    </div>
                    <div class="sync-stat">
                        <span>标注总数:</span>
                        <strong>${data.highlightsCount}</strong>
                    </div>
                    <div class="sync-stat">
                        <span>同步状态:</span>
                        <strong style="color: #28a745;">已同步 ✓</strong>
                    </div>
                `;
                
                await loadSyncHistory();
            } else {
                content.innerHTML = '<p style="color: #999;">尚未进行同步</p>';
                document.getElementById('sync-history-content').innerHTML = '<p style="color: #999;">暂无同步历史</p>';
            }
        } else if (response.status === 403) {
            const content = document.getElementById('sync-status-content');
            content.innerHTML = '<p style="color: #dc3545;">请先验证邮箱后才能使用同步功能</p>';
            document.getElementById('sync-history-content').innerHTML = '<p style="color: #999;">暂无同步历史</p>';
        } else {
            showMessage('加载同步状态失败', 'error');
        }
    } catch (error) {
        showMessage('网络错误', 'error');
    }
}

// Load sync history
async function loadSyncHistory() {
    try {
        const response = await fetch(`${API_BASE}/sync/highlights`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const historyContent = document.getElementById('sync-history-content');
            const highlights = Object.values(data.highlights);
            
            if (highlights.length > 0) {
                const recentHighlights = highlights
                    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
                    .slice(0, 5);
                
                historyContent.innerHTML = recentHighlights.map(h => `
                    <div class="history-item">
                        <p><strong>URL:</strong> ${h.url}</p>
                        <p><strong>文本:</strong> ${h.text.substring(0, 100)}${h.text.length > 100 ? '...' : ''}</p>
                        <p><strong>时间:</strong> ${new Date(h.updatedAt || h.createdAt).toLocaleString('zh-CN')}</p>
                    </div>
                `).join('');
            } else {
                historyContent.innerHTML = '<p style="color: #999;">暂无标注记录</p>';
            }
        }
    } catch (error) {
        console.error('Failed to load sync history:', error);
    }
}

// Refresh sync status
async function refreshSyncStatus() {
    showMessage('正在刷新...', 'info');
    await loadSyncStatus();
}

// Resend verification
async function resendVerification() {
    try {
        const response = await fetch(`${API_BASE}/auth/resend-verification`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('验证邮件已重新发送，请查看邮箱', 'success');
        } else {
            showMessage(data.error || '发送失败', 'error');
        }
    } catch (error) {
        showMessage('网络错误', 'error');
    }
}

// Logout
function logout() {
    localStorage.removeItem('authToken');
    authToken = null;
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('dashboard-section').style.display = 'none';
    showMessage('已退出登录', 'info');
}

// Check if already logged in on page load
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showDashboard();
    }
    
    // Handle OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        authToken = token;
        localStorage.setItem('authToken', authToken);
        showMessage('登录成功！', 'success');
        window.history.replaceState({}, document.title, '/');
        showDashboard();
    }
});
