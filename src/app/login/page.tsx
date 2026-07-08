'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth/context';
import { Loader2, Eye, EyeOff, User, Lock } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const { login, error, loading } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login(identifier, password);
  };

  const isEmail = identifier.includes('@');

  return (
    <div className="min-h-screen flex relative bg-background">
      <div className="hidden lg:block absolute inset-0 w-full h-full">
        <Image
          src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1920&q=80"
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-black/70 via-black/40 to-black/10" />
      </div>

      <div className="lg:hidden absolute inset-0 w-full h-full">
        <Image
          src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1920&q=80"
          alt=""
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      <div className="relative w-full lg:w-[480px] lg:ml-auto min-h-screen flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-10">
            <div className="relative w-20 h-20 mb-5 rounded-full overflow-hidden ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
              <Image
                src="/logo.png"
                alt="QLF GYM"
                fill
                className="object-contain p-2"
                priority
              />
            </div>
            <h1 className="text-2xl font-bold text-foreground">QLF GYM</h1>
            <p className="text-muted text-sm mt-1">Gestion de votre salle</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Email ou nom d&apos;utilisateur
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder={isEmail ? "exemple@email.com" : "Nom d'utilisateur"}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="Mot de passe"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                  tabIndex={-1}
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

          <p className="text-center text-muted text-xs mt-8">
            QLF GYM &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
