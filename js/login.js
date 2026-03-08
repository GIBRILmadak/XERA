/* ========================================
   LOGIQUE DE LA PAGE LOGIN
   ======================================== */

let isSignUpMode = false;

// Éléments DOM
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const usernameInput = document.getElementById('username');
const confirmPasswordInput = document.getElementById('confirm-password');
const usernameGroup = document.getElementById('username-group');
const confirmPasswordGroup = document.getElementById('confirm-password-group');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');
const toggleLink = document.getElementById('toggle-link');
const toggleText = document.getElementById('toggle-text');
const formTitle = document.getElementById('form-title');
const formSubtitle = document.getElementById('form-subtitle');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const forgotPassword = document.getElementById('forgot-password');
const googleSigninBtn = document.getElementById('google-signin-btn');
const passwordToggle = document.getElementById('password-toggle');
const confirmPasswordToggle = document.getElementById('confirm-password-toggle');
const rememberMeContainer = document.getElementById('remember-me-container');
const rememberMeCheckbox = document.getElementById('remember-me');

// Fonctions pour gérer "Se souvenir de moi"
function saveRememberMe(email, remember) {
    if (remember) {
        localStorage.setItem('rize-remember-email', email);
        localStorage.setItem('rize-remember-me', 'true');
    } else {
        localStorage.removeItem('rize-remember-email');
        localStorage.removeItem('rize-remember-me');
    }
}

function loadRememberMe() {
    const rememberMe = localStorage.getItem('rize-remember-me') === 'true';
    const savedEmail = localStorage.getItem('rize-remember-email');
    
    if (rememberMe && savedEmail) {
        emailInput.value = savedEmail;
        rememberMeCheckbox.checked = true;
        return { email: savedEmail, remember: true };
    }

    if (localStorage.getItem('rize-remember-me') === null) {
        localStorage.setItem('rize-remember-me', 'true');
        rememberMeCheckbox.checked = true;
        return { email: '', remember: true };
    }
    
    return { email: '', remember: false };
}

// Vérifier si l'utilisateur est déjà connecté
async function checkExistingSession() {
    try {
        // Vérifier si checkAuth existe
        if (typeof checkAuth !== 'function') {
            console.error('checkAuth n\'est pas disponible');
            return null;
        }
        
        const user = await checkAuth();
        if (user) {
            // Rediriger vers la page principale
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Erreur verification session:', error);
    }
}

// Afficher un message d'erreur
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    successMessage.style.display = 'none';
    
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Afficher un message de succès
function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    errorMessage.style.display = 'none';
    
    setTimeout(() => {
        successMessage.style.display = 'none';
    }, 5000);
}

// Afficher un message de succès persistant avec bouton de fermeture
function showPersistentSuccess(message) {
    successMessage.innerHTML = '';
    
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; justify-content: space-between; align-items: start;';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.style.cssText = 'background: none; border: none; color: inherit; cursor: pointer; padding: 0; margin-left: 10px; opacity: 0.7; min-width: 24px; display: flex; align-items: center; justify-content: center;';
    closeBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `;
    
    closeBtn.onclick = function() {
        successMessage.style.display = 'none';
    };
    
    container.appendChild(textSpan);
    container.appendChild(closeBtn);
    successMessage.appendChild(container);
    
    successMessage.style.display = 'block';
    errorMessage.style.display = 'none';
}

// Toggle entre connexion et inscription
function toggleMode(keepMessages = false) {
    try {
        isSignUpMode = !isSignUpMode;
        
        console.log('Toggling mode to:', isSignUpMode ? 'SignUp' : 'Login');
        
        if (isSignUpMode) {
            // Mode inscription
            if (formTitle) formTitle.textContent = 'Créer votre compte';
            if (formSubtitle) formSubtitle.textContent = 'Rejoignez la communauté XERA';
            if (usernameGroup) usernameGroup.style.display = 'block';
            if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
            if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
            if (rememberMeContainer) rememberMeContainer.style.display = 'none';
            if (btnText) btnText.textContent = 'Créer mon compte';
            if (toggleText) toggleText.textContent = 'Déjà un compte ?';
            if (toggleLink) toggleLink.textContent = 'Se connecter';
            if (usernameInput) usernameInput.required = true;
            if (confirmPasswordInput) confirmPasswordInput.required = true;
        } else {
            // Mode connexion
            if (formTitle) formTitle.textContent = 'Bienvenue sur XERA';
            if (formSubtitle) formSubtitle.textContent = 'Connectez-vous pour continuer';
            if (usernameGroup) usernameGroup.style.display = 'none';
            if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'none';
            if (forgotPasswordLink) forgotPasswordLink.style.display = 'block';
            if (rememberMeContainer) rememberMeContainer.style.display = 'block';
            if (btnText) btnText.textContent = 'Se connecter';
            if (toggleText) toggleText.textContent = 'Pas encore de compte ?';
            if (toggleLink) toggleLink.textContent = 'Créer un compte';
            if (usernameInput) usernameInput.required = false;
            if (confirmPasswordInput) confirmPasswordInput.required = false;
        }
        
        // Reset form
        if (authForm) authForm.reset();
        if (!keepMessages) {
            if (errorMessage) errorMessage.style.display = 'none';
            if (successMessage) successMessage.style.display = 'none';
        }
        resetPasswordVisibility();
    } catch (error) {
        console.error('Error in toggleMode:', error);
    }
}

// Gérer la soumission du formulaire
async function handleSubmit(e) {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const username = usernameInput.value.trim();
    const confirmPassword = confirmPasswordInput.value;
    
    // Validation
    if (!email || !password) {
        showError('Veuillez remplir tous les champs obligatoires.');
        return;
    }
    
    if (isSignUpMode) {
        if (!username) {
            showError('Veuillez entrer un nom d\'utilisateur.');
            return;
        }
        
        if (username.length < 3) {
            showError('Le nom d\'utilisateur doit contenir au moins 3 caractères.');
            return;
        }
        
        if (password.length < 6) {
            showError('Le mot de passe doit contenir au moins 6 caractères.');
            return;
        }
        
        if (password !== confirmPassword) {
            showError('Les mots de passe ne correspondent pas.');
            return;
        }
    }
    
    // Désactiver le bouton et afficher le loader
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';
    
    try {
        if (isSignUpMode) {
            // Inscription
            const result = await signUp(email, password, username);
            
            if (result.success) {
                // NE PAS créer le profil utilisateur immédiatement
                // L'utilisateur doit d'abord confirmer son email
                // Le profil sera créé lors de la première connexion
                
                // Afficher un message persistant
                showPersistentSuccess('Compte créé avec succès ! Vérifiez votre email pour confirmer votre compte.');
                
                // Attendre 2 secondes puis basculer en mode connexion
                setTimeout(() => {
                    toggleMode(true); // true pour garder le message
                    emailInput.value = email;
                }, 2000);
            } else {
                showError(result.error || 'Erreur lors de la création du compte.');
            }
        } else {
            // Login
            const result = await signIn(email, password);
            
            if (result.success) {
                // Sauvegarder les préférences "Se souvenir de moi"
                const rememberMe = rememberMeCheckbox.checked;
                saveRememberMe(email, rememberMe);
                
                // Reconfigurer le stockage de session
                if (typeof updateSessionStorage === 'function') {
                    updateSessionStorage(rememberMe);
                }
                
                // Le profil sera créé automatiquement par ensureUserProfile() dans app-supabase.js
                
                showSuccess('Login successful! Redirecting...');
                
                // Rediriger vers la page principale après 1 seconde
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } else {
                showError(result.error || 'Email ou mot de passe incorrect.');
            }
        }
    } catch (error) {
        console.error('Erreur:', error);
        showError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
        // Réactiver le bouton
        submitBtn.disabled = false;
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
    }
}



// Fonctions pour toggle password visibility
function togglePasswordVisibility(inputId, toggleBtnId) {
    const input = document.getElementById(inputId);
    const toggleBtn = document.getElementById(toggleBtnId);
    
    if (input.type === 'password') {
        input.type = 'text';
        toggleBtn.setAttribute('data-visible', 'true');
    } else {
        input.type = 'password';
        toggleBtn.setAttribute('data-visible', 'false');
    }
}

function resetPasswordVisibility() {
    passwordInput.type = 'password';
    confirmPasswordInput.type = 'password';
    passwordToggle.setAttribute('data-visible', 'false');
    confirmPasswordToggle.setAttribute('data-visible', 'false');
}

// Gérer le reset de mot de passe
async function handleForgotPassword() {
    const email = emailInput.value.trim();
    
    if (!email) {
        showError('Veuillez entrer votre adresse email.');
        return;
    }
    
    try {
        const result = await resetPassword(email);
        
        if (result.success) {
            showSuccess('Un email de réinitialisation a été envoyé à votre adresse email.');
        } else {
            showError(result.error || 'Erreur lors de l\'envoi de l\'email de réinitialisation.');
        }
    } catch (error) {
        console.error('Erreur reset password:', error);
        showError('Une erreur est survenue. Veuillez réessayer.');
    }
}

// Gérer la connexion avec Google
async function handleGoogleSignIn() {
    try {
        googleSigninBtn.disabled = true;
        googleSigninBtn.innerHTML = '<svg class="btn-loader" style="animation: spin 1s linear infinite;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg><span>Signing in...</span>';
        
        const result = await signInWithGoogle();
        
        if (result.success) {
            // La redirection sera gérée automatiquement par Supabase
            showSuccess('Redirection vers Google...');
        } else {
            showError(result.error || 'Erreur lors de la connexion avec Google.');
        }
    } catch (error) {
        console.error('Erreur Google signin:', error);
        showError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
        // Reset button state
        googleSigninBtn.disabled = false;
        googleSigninBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg><span>Continuer avec Google</span>';
    }
}

// Event listeners
if (toggleLink) {
    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleMode();
    });
}

if (authForm) {
    authForm.addEventListener('submit', handleSubmit);
}

// Password toggle listeners
if (passwordToggle) {
    passwordToggle.addEventListener('click', () => {
        togglePasswordVisibility('password', 'password-toggle');
    });
}

if (confirmPasswordToggle) {
    confirmPasswordToggle.addEventListener('click', () => {
        togglePasswordVisibility('confirm-password', 'confirm-password-toggle');
    });
}

// Forgot password listener
if (forgotPassword) {
    forgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        handleForgotPassword();
    });
}

// Google signin listener
if (googleSigninBtn) {
    googleSigninBtn.addEventListener('click', handleGoogleSignIn);
}

// Initialisation de la page
document.addEventListener('DOMContentLoaded', () => {
    // Charger les préférences "Se souvenir de moi"
    const savedData = loadRememberMe();
    
    // Vérifier si on revient d'un reset de mot de passe
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === 'true') {
        // Si on a un token de reset, afficher une interface pour le nouveau mot de passe
        // Pour l'instant, on affiche juste un message
        showSuccess('Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.');
    }
    
    // Afficher le lien "mot de passe oublié" et la checkbox par défaut en mode connexion
    if (!isSignUpMode) {
        forgotPasswordLink.style.display = 'block';
        rememberMeContainer.style.display = 'block';
    }
});

// Vérifier la session au chargement
checkExistingSession();
