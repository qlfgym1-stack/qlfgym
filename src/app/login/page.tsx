'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth/context';
import { Loader2, Eye, EyeOff, User, Lock, Dumbbell, TrendingUp, Users, ShieldCheck } from 'lucide-react';
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
    <div className="min-h-screen flex relative bg-background overflow-hidden">
      <Image
        src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1920&q=80"
        alt=""
        fill
        className="object-cover"
        priority
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/50" />

      <div className="relative z-10 flex flex-col lg:flex-row w-full h-screen">
        <div className="relative flex-1 flex flex-col justify-between p-8 lg:p-14 xl:p-18 overflow-hidden">
          <div className="absolute -top-20 -left-20 w-80 h-80 opacity-15" style={{ perspective: '800px' }}>
            <div
              className="w-full h-full"
              style={{
                animation: 'logoFloat3D 6s ease-in-out infinite',
                transformStyle: 'preserve-3d',
              }}
            >
              <div
                className="w-full h-full"
                style={{
                  animation: 'logoRotate 8s ease-in-out infinite',
                  transformStyle: 'preserve-3d',
                }}
              >
                <Image
                  src="/qlf-3d.png"
                  alt=""
                  fill
                  className="object-contain"
                  priority
                  sizes="320px"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden ring-2 ring-white/15 shrink-0">
              <Image
                src="/logo.png"
                alt="QLF GYM"
                fill
                className="object-contain p-1"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-none">
                <span className="text-blue-400">QLF</span>{' '}
                <span className="text-white/90">GYM</span>
              </h1>
              <p className="text-gray-500 text-xs lg:text-sm mt-0.5">Gestion &amp; Suivi</p>
            </div>
          </div>

          <div className="max-w-lg">
            <h2 className="text-3xl lg:text-4xl xl:text-5xl font-bold text-white leading-[1.1] mb-5">
              La solution compl&egrave;te pour<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-gray-300">
                la gestion de votre salle de sport
              </span>
            </h2>
            <p className="text-gray-400 text-base lg:text-lg leading-relaxed max-w-md">
              Pilotez votre salle en toute simplicit&eacute; : abonnements, acc&egrave;s, 
              suivi des membres, encaissements, et statistiques en temps r&eacute;el.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Users, label: 'Gestion membres', sub: 'Profils & abonnements' },
              { icon: TrendingUp, label: 'Statistiques', sub: 'Rapports & analytics' },
              { icon: Dumbbell, label: 'Accès', sub: 'Tourniquets & check-in' },
              { icon: ShieldCheck, label: 'Sécurisé', sub: 'Données protégées' },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-xs font-medium truncate">{label}</p>
                  <p className="text-gray-600 text-[10px] truncate">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-gray-700 text-[11px]">QLF GYM &copy; {new Date().getFullYear()}</p>
        </div>

        <div className="w-full lg:w-[440px] xl:w-[500px] flex items-center justify-center p-6 lg:p-10">
          <div className="w-full bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 lg:p-10 shadow-2xl">
            <div className="flex lg:hidden flex-col items-center mb-6">
              <div className="relative w-20 h-20 mb-3">
                <Image
                  src="/qlf-3d.png"
                  alt="QLF"
                  fill
                  className="object-contain drop-shadow-[0_0_30px_rgba(59,130,246,0.2)]"
                  priority
                  sizes="80px"
                />
              </div>
              <h1 className="text-xl font-bold"><span className="text-blue-400">QLF</span> <span className="text-white/90">GYM</span></h1>
              <p className="text-gray-500 text-sm">Gestion &amp; Suivi</p>
            </div>

            <h2 className="text-white/90 text-xl font-semibold mb-1">Connexion</h2>
            <p className="text-gray-500 text-sm mb-7">Acc&eacute;dez &agrave; votre espace</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Email ou nom d&apos;utilisateur
                </label>
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-focus-within:text-blue-400 transition-colors" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] border border-white/[0.10] rounded-xl text-white placeholder:text-gray-600 text-sm focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 focus:bg-white/[0.08] transition-all outline-none"
                    placeholder={isEmail ? "exemple@email.com" : "Nom d'utilisateur"}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Mot de passe</label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-focus-within:text-blue-400 transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-white/[0.06] border border-white/[0.10] rounded-xl text-white placeholder:text-gray-600 text-sm focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 focus:bg-white/[0.08] transition-all outline-none"
                    placeholder="Mot de passe"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-blue-500 hover:bg-blue-500/90 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes logoFloat3D {
          0%, 100% { transform: translateY(0px) rotateX(0deg) scale(1); }
          25% { transform: translateY(-8px) rotateX(2deg) scale(1.02); }
          50% { transform: translateY(-14px) rotateX(0deg) scale(1.05); }
          75% { transform: translateY(-8px) rotateX(-2deg) scale(1.02); }
        }
        @keyframes logoRotate {
          0%, 100% { transform: rotateY(0deg) rotateZ(0deg); }
          25% { transform: rotateY(6deg) rotateZ(1deg); }
          50% { transform: rotateY(0deg) rotateZ(0deg); }
          75% { transform: rotateY(-6deg) rotateZ(-1deg); }
        }
      `}</style>
    </div>
  );
}
