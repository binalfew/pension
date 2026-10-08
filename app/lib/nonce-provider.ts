import { createContext, useContext } from "react";

// The request's CSP nonce, for inline scripts rendered on the server. Only
// provided on the server: browsers hide nonce attributes once the page has
// loaded, so the client has nothing to compare against.
export const NonceContext = createContext<string | undefined>(undefined);
export const NonceProvider = NonceContext.Provider;
export const useNonce = () => useContext(NonceContext);
