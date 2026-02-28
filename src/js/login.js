document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('LoginButton');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Удаляем уведомление из DOM через 3 секунды
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    loginButton.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            alert("Введите логин и пароль!");
            return;
        }

        // Хешируем введенный пароль, чтобы сравнить его с тем, что в базе
        const hashedPassword = CryptoJS.SHA256(password).toString();

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: hashedPassword // Отправляем хеш
                })
            });

            const result = await response.json();

            if (response.ok) {
                showToast("Добро пожаловать!", "success");
                
                // Сохраняем ник в память браузера (для чата)
                localStorage.setItem('currentUser', username);
                
                // Переходим на главную
                window.location.href = 'index.html'; 
            } else {
                showToast(result.message, "error");
            }
        } catch (error) {
            console.error("Ошибка:", error);
            alert("Ошибка соединения с сервером");
        }
    });
});