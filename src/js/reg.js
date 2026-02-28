document.addEventListener('DOMContentLoaded', () => {
    const regButton = document.getElementById('regButton');
    const usernameInput = document.getElementById('usernameReg');
    const passwordInput = document.getElementById('passwordReg');
    const repeatPassInput = document.getElementById('repeatPassReg');

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

    regButton.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const repeatPass = repeatPassInput.value;

        // Валидация
        if (!username || !password || !repeatPass) {
            showToast("Пожалуйста, заполните все поля!", "error");
            return;
        }

        if (password !== repeatPass) {
            showToast("Пароли не совпадают!", "error");;
            return;
        }

        if (password.length < 6) {
            showToast("Пароль должен быть не менее 6 символов!", "error");
            return;
        }

        // Хешируем пароль перед отправкой
        const hashedPassword = CryptoJS.SHA256(password).toString();

        try {
            const response = await fetch('/register', {
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
                showToast("Регистрация успешна!", "success");
                window.location.href = 'login.html';
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error("Ошибка:", error);
            showToast("Ошибка соединения с сервером", "error");
        }
    });
});