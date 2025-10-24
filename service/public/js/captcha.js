// Captcha generation
let captchaAnswers = {
    login: '',
    register: ''
};

function generateCaptcha(type) {
    const canvas = document.getElementById(`${type}-captcha-canvas`);
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Generate random text
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let captchaText = '';
    for (let i = 0; i < 6; i++) {
        captchaText += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    captchaAnswers[type] = captchaText;
    
    // Background with gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#f0f0f0');
    gradient.addColorStop(1, '#e0e0e0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add noise lines
    for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.3)`;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
    }
    
    // Draw text with random colors and positions
    ctx.font = 'bold 30px Arial';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < captchaText.length; i++) {
        const x = 20 + i * 30;
        const y = 30 + (Math.random() - 0.5) * 10;
        const angle = (Math.random() - 0.5) * 0.4;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = `rgb(${Math.random() * 100}, ${Math.random() * 100}, ${Math.random() * 100})`;
        ctx.fillText(captchaText[i], 0, 0);
        ctx.restore();
    }
    
    // Add noise dots
    for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.5)`;
        ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
    }
}

function refreshCaptcha(type) {
    generateCaptcha(type);
    document.getElementById(`${type}-captcha`).value = '';
}

function validateCaptcha(type, userInput) {
    return userInput.toLowerCase() === captchaAnswers[type].toLowerCase();
}

// Initialize captchas on page load
document.addEventListener('DOMContentLoaded', () => {
    generateCaptcha('login');
    generateCaptcha('register');
});
