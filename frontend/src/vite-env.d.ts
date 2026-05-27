/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_REALM: string;
  readonly VITE_KEYCLOAK_CLIENT_ID: string;
  /** Endpoint GraphQL, по умолчанию /graphql (прокси в api-gateway) */
  readonly VITE_GRAPHQL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
