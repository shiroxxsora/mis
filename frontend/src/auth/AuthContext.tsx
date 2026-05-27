import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import keycloak from './keycloak';
import { disposeGraphqlSubscriptionClient } from '../api/graphqlSubscription';
import {
  hasDualMisRoles,
  isDoctorRole,
  isRegistrarRole,
  resolveMisRole,
  type MisRole,
} from './roles';
import { getUserDisplayName } from './tokenClaims';

type AuthContextValue = {
  initialized: boolean;
  authenticated: boolean;
  username: string | null;
  displayName: string | null;
  misRole: MisRole | null;
  isDoctor: boolean;
  isRegistrar: boolean;
  login: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string>;
  getHasuraRole: () => MisRole | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readUsername(): string | null {
  return (
    keycloak.tokenParsed?.preferred_username ??
    keycloak.tokenParsed?.name ??
    null
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [misRole, setMisRole] = useState<MisRole | null>(null);
  const initStarted = useRef(false);

  const syncIdentityFromToken = useCallback(() => {
    setUsername(readUsername());
    setDisplayName(getUserDisplayName(keycloak.tokenParsed));
    setMisRole(resolveMisRole(keycloak.tokenParsed));
  }, []);

  useEffect(() => {
    if (initStarted.current) {
      return;
    }
    initStarted.current = true;

    keycloak
      .init({
        onLoad: 'login-required',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      .then((auth) => {
        setAuthenticated(auth);
        if (auth) {
          syncIdentityFromToken();
        }
        setInitialized(true);
      })
      .catch(() => {
        setAuthenticated(false);
        setUsername(null);
        setDisplayName(null);
        setMisRole(null);
        setInitialized(true);
      });

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        keycloak.login();
      });
    };

    keycloak.onAuthRefreshSuccess = () => {
      syncIdentityFromToken();
    };

    keycloak.onAuthLogout = () => {
      setUsername(null);
      setDisplayName(null);
      setMisRole(null);
    };
  }, [syncIdentityFromToken]);

  const login = useCallback(() => {
    keycloak.login();
  }, []);

  const logout = useCallback(() => {
    disposeGraphqlSubscriptionClient();
    keycloak.logout({ redirectUri: window.location.origin });
  }, []);

  const getAccessToken = useCallback(async (): Promise<string> => {
    await keycloak.updateToken(30);
    syncIdentityFromToken();
    const token = keycloak.token;
    if (!token) {
      throw new Error('Не удалось получить токен доступа');
    }
    return token;
  }, [syncIdentityFromToken]);

  const getHasuraRole = useCallback((): MisRole | null => {
    return resolveMisRole(keycloak.tokenParsed);
  }, []);

  const isDoctor = isDoctorRole(misRole);
  const isRegistrar = isRegistrarRole(misRole);

  const value = useMemo(
    () => ({
      initialized,
      authenticated,
      username,
      displayName,
      misRole,
      isDoctor,
      isRegistrar,
      login,
      logout,
      getAccessToken,
      getHasuraRole,
    }),
    [
      initialized,
      authenticated,
      username,
      displayName,
      misRole,
      isDoctor,
      isRegistrar,
      login,
      logout,
      getAccessToken,
      getHasuraRole,
    ],
  );

  if (!initialized) {
    return (
      <div className="auth-loading">
        <p>Загрузка…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="auth-loading">
        <p>Требуется вход в систему</p>
        <button type="button" className="btn-primary" onClick={login}>
          Войти
        </button>
      </div>
    );
  }

  if (!misRole) {
    const dualRoles = hasDualMisRoles(keycloak.tokenParsed);
    return (
      <div className="auth-loading">
        <p>
          {dualRoles
            ? 'У учётной записи назначены обе роли MIS (user и registrar). Должна быть только одна — обратитесь к администратору.'
            : 'У учётной записи нет роли MIS (user или registrar). Обратитесь к администратору.'}
        </p>
        <button type="button" className="btn-primary" onClick={logout}>
          Выйти
        </button>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth должен использоваться внутри AuthProvider');
  }
  return ctx;
}
