// script.js
import { 
    auth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    database, 
    set, 
    databaseRef  
} from './firebase.js';

// Elementos
const signInForm = document.getElementById('sign-in');
const signUpForm = document.getElementById('sign-up');
const btnSignIn = document.getElementById('btn-sign-in');
const btnSignUp = document.getElementById('btn-sign-up');
const linkToSignUp = document.getElementById('link-to-sign-up');
const linkToSignIn = document.getElementById('link-to-sign-in');
const loadingOverlay = document.getElementById('loading');

// Funções de exibição
function toggleForm(showSignUp = false) {
    if (showSignUp) {
        signUpForm.style.display = 'flex';
        signInForm.style.display = 'none';
    } else {
        signUpForm.style.display = 'none';
        signInForm.style.display = 'flex';
    }
}

// Controle do loading
function setLoading(isLoading) {
    loadingOverlay.style.display = isLoading ? 'flex' : 'none';
}

// Salvar dados do usuário no banco
async function saveUserData(user, name) {
    const userRef = databaseRef(database, `users/${user.uid}`);
    await set(userRef, {
        details: {
            uid: user.uid,
            email: user.email,
            display_name: name,
            created_on: user.metadata.creationTime
        },
        bucks: 100,
        activeBets: [],
        selectedLeagues: []
    });
}

// Registrar novo usuário
async function handleSignUp(event) {
    event.preventDefault();
    const name = document.querySelector('.sign-up-name').value.trim();
    const email = document.querySelector('.sign-up-email').value.trim();
    const password = document.querySelector('.sign-up-password').value.trim();
    const confirmPassword = document.querySelector('.sign-up-check').value.trim();

    if (!name || !email || !password || !confirmPassword) {
        return alert('Preencha todos os campos.');
    }

    if (password !== confirmPassword) {
        return alert('Senhas não coincidem.');
    }

    try {
        setLoading(true);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await saveUserData(userCredential.user, name);
        window.location.href = '/';
    } catch (error) {
        console.error('Erro ao cadastrar:', error.message);
        alert('Erro ao cadastrar. Verifique seus dados.');
    } finally {
        setLoading(false);
    }
}

// Login de usuário
async function handleSignIn(event) {
    event.preventDefault();
    const email = document.querySelector('.sign-in-email').value.trim();
    const password = document.querySelector('.sign-in-password').value.trim();

    if (!email || !password) {
        return alert('Preencha todos os campos.');
    }

    try {
        setLoading(true);
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = './index.html';
    } catch (error) {
        console.error('Erro ao entrar:', error.message);
        alert('Email ou senha incorretos.');
    } finally {
        setLoading(false);
    }
}

// Configuração inicial
function init() {
    // Evento para mudar para cadastro
    linkToSignUp.addEventListener('click', () => toggleForm(true));

    // Evento para mudar para login
    linkToSignIn.addEventListener('click', () => toggleForm(false));

    // Evento de cadastro
    btnSignUp.addEventListener('click', handleSignUp);

    // Evento de login
    btnSignIn.addEventListener('click', handleSignIn);

    // Aplicar tema escuro salvo
    if ((localStorage.getItem('dark') || 'light') === 'dark') {
        document.documentElement.classList.add('dark');
    }
}
  
// Inicializar tudo quando o DOM carregar
document.addEventListener('DOMContentLoaded', init);  