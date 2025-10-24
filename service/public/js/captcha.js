// Captcha management
async function loadCaptcha(type) {
    const canvas = document.getElementById(`${type}-captcha-canvas`);
    const ctx = canvas.getContext('2d');
    
    try {
        // Fetch captcha image from server
        const response = await fetch('/api/captcha/generate', {
            credentials: 'include' // Important: include cookies
        });
        
        if (!response.ok) {
            throw new Error('Failed to load captcha');
        }
        
        // Get image blob
        const blob = await response.blob();
        const img = new Image();
        
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        
        img.src = URL.createObjectURL(blob);
    } catch (error) {
        console.error('Failed to load captcha:', error);
        // Display error message on canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#dc3545';
        ctx.font = '14px Arial';
        ctx.fillText('Failed to load captcha', 10, 30);
    }
}

async function refreshCaptcha(type) {
    await loadCaptcha(type);
    document.getElementById(`${type}-captcha`).value = '';
}

// Initialize captchas on page load
document.addEventListener('DOMContentLoaded', () => {
    loadCaptcha('login');
    loadCaptcha('register');
});
