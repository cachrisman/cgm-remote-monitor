"use client";

import { useState, useCallback, useEffect } from "react";

import { 
  clearStoredToken, 
  authenticateAndGetSession 
} from "@/lib/auth-token";

type AuthPromptProps = {
  isOpen: boolean;
  onAuthenticated: () => void;
  onCancel?: () => void;
  errorMessage?: string | null;
};

/**
 * Check if a string looks like an access token (format: name-hexdigits)
 * Access tokens are: abbrev-16hexchars (e.g., "admin-abc123def456789")
 */
function looksLikeAccessToken(value: string): boolean {
  const parts = value.split("-");
  if (parts.length < 2) return false;
  const lastPart = parts[parts.length - 1];
  // Access token suffixes are 16 hex characters
  return lastPart.length >= 16 && /^[a-f0-9]+$/i.test(lastPart);
}

export function AuthPrompt({ isOpen, onAuthenticated, onCancel, errorMessage }: AuthPromptProps) {
  const [token, setToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(errorMessage ?? null);
  const [showHelp, setShowHelp] = useState(false);

  // Reset error when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(errorMessage ?? null);
      setToken("");
    }
  }, [isOpen, errorMessage]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError("Please enter your API secret or access token");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Try different token formats and exchange for session JWT
      const tokensToTry: string[] = [];
      
      // If it looks like an access token, try it first
      if (looksLikeAccessToken(trimmedToken)) {
        tokensToTry.push(trimmedToken);
      }
      
      // Try SHA-1 hashed version (for API_SECRET)
      const hashedToken = await hashWithSha1(trimmedToken);
      tokensToTry.push(hashedToken);
      
      // Try raw token as fallback
      if (!looksLikeAccessToken(trimmedToken) && trimmedToken !== hashedToken) {
        tokensToTry.push(trimmedToken);
      }
      
      // Try each token format
      for (const tokenToTry of tokensToTry) {
        const success = await authenticateAndGetSession(tokenToTry);
        if (success) {
          onAuthenticated();
          return;
        }
      }

      setError("Invalid API secret or access token. Please check and try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsValidating(false);
    }
  }, [token, onAuthenticated]);

  const handleContinueReadOnly = useCallback(() => {
    clearStoredToken();
    onCancel?.();
  }, [onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">Authentication Required</h2>
          <p className="mt-2 text-sm text-slate-400">
            Enter your API secret or access token to access your data
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="api-secret" className="block text-sm font-medium text-slate-300">
              API Secret or Access Token
            </label>
            <input
              id="api-secret"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your API secret or access token..."
              className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              autoFocus
              autoComplete="current-password"
              disabled={isValidating}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isValidating || !token.trim()}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isValidating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Authenticating...
              </span>
            ) : (
              "Authenticate"
            )}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={handleContinueReadOnly}
              className="w-full rounded-lg border border-slate-600 bg-transparent px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              Continue with limited access
            </button>
          )}
        </form>

        <div className="mt-6 border-t border-slate-700 pt-4">
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="flex w-full items-center justify-between text-sm text-slate-500 hover:text-slate-300"
          >
            <span>Where do I find my API secret?</span>
            <svg 
              className={`h-4 w-4 transition-transform ${showHelp ? "rotate-180" : ""}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showHelp && (
            <div className="mt-3 rounded-lg bg-slate-800/50 p-4 text-sm text-slate-400">
              <p className="mb-2">
                <strong className="text-slate-300">API Secret:</strong> Your main admin password, set in your Nightscout configuration as the <code className="rounded bg-slate-700 px-1 text-emerald-400">API_SECRET</code> environment variable. It should be at least 12 characters long.
              </p>
              <p className="mb-2">
                <strong className="text-slate-300">Access Token:</strong> If you have configured subjects in your Nightscout Admin panel, you can use an access token (e.g., <code className="rounded bg-slate-700 px-1 text-emerald-400">admin-abc123def456789</code>). These tokens have specific permissions based on their assigned roles.
              </p>
              <p>
                Find these in your hosting provider&apos;s settings (Heroku, Railway, Azure, etc.) or in the Nightscout Admin &gt; Subjects panel.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Hash a string with SHA-1 (browser-compatible)
 */
async function hashWithSha1(text: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await window.crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
  
  // Fallback - return lowercase (server will handle)
  return text.toLowerCase();
}

