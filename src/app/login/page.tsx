'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth/context';
import { Dumbbell, Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login, error, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
              <Dumbbell className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">QLF Fitness</h1>
            <p className="text-muted text-sm mt-1">Plateforme de gestion</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Identifiant</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                placeholder="Nom d'utilisateur"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary transition-colors pr-10"
                  placeholder="Mot de passe"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="text-center text-muted text-xs mt-4">
          QLF Fitness &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
