import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize or reuse Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Scopes required for Google Sheets integration
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));

// Token storage across memory, sessionStorage and localStorage with expiration check
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = cachedAccessToken || await getAccessToken();
      if (token) {
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('لم نتمكن من الحصول على تصريح الوصول من حساب Google.');
    }

    cachedAccessToken = credential.accessToken;
    try {
      sessionStorage.setItem('google_access_token', credential.accessToken);
      localStorage.setItem('google_access_token', credential.accessToken);
    } catch {}

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error with Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    const saved = sessionStorage.getItem('google_access_token') || localStorage.getItem('google_access_token');
    if (saved) {
      cachedAccessToken = saved;
      return saved;
    }
  } catch {}
  return null;
};

export const setAccessTokenInMemory = (token: string | null) => {
  cachedAccessToken = token;
  if (token) {
    try {
      sessionStorage.setItem('google_access_token', token);
      localStorage.setItem('google_access_token', token);
    } catch {}
  }
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  try {
    sessionStorage.removeItem('google_access_token');
    sessionStorage.removeItem('google_access_token_exp');
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_access_token_exp');
  } catch {}
};

export const getCurrentGoogleUser = (): User | null => {
  return auth.currentUser;
};
