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
    <div className="min-h-screen flex flex-col relative bg-background overflow-hidden">
      <Image
        src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1920&q=80"
        alt=""
        fill
        className="object-cover"
        priority
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/40" />

      <div className="relative z-10 flex flex-col w-full h-screen">
        <div className="pt-4 pb-0 flex justify-center" style={{ perspective: '800px' }}>
          <div
            className="relative w-40 h-40 sm:w-48 sm:h-48 lg:w-52 lg:h-52"
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
                alt="QLF"
                fill
                className="object-contain drop-shadow-[0_0_60px_rgba(59,130,246,0.3)]"
                priority
                sizes="208px"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row w-full min-h-0">
          <div className="flex-1 flex flex-col items-center px-6 lg:px-12 xl:px-16 pb-2 lg:pb-4 overflow-y-auto">
            <div className="w-full max-w-xl flex flex-col items-center lg:items-start">
              <div className="flex items-center gap-3 mb-2">
                <div className="relative w-10 h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden ring-2 ring-white/20 shrink-0">
                  <Image
                    src="/logo.png"
                    alt="QLF GYM"
                    fill
                    className="object-contain p-1"
                    priority
                  />
                </div>
                <div>
                  <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
                    <span className="text-blue-500">QLF</span>{' '}
                    <span className="text-white">GYM</span>
                  </h1>
                  <p className="text-gray-400 text-sm lg:text-base">Gestion &amp; Suivi</p>
                </div>
              </div>

              <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold text-white leading-tight mb-2">
                La solution compl&egrave;te pour<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-gray-300">
                  la gestion de votre salle de sport
                </span>
              </h2>

              <p className="text-gray-300 text-base lg:text-lg leading-relaxed mb-4">
                Pilotez votre salle en toute simplicit&eacute; : abonnements, acc&egrave;s, 
                suivi des membres, encaissements, et statistiques en temps r&eacute;el.
              </p>

              <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                {[
                  { icon: Users, label: 'Gestion membres', sub: 'Profils & abonnements' },
                  { icon: TrendingUp, label: 'Statistiques', sub: 'Rapports & analytics' },
                  { icon: Dumbbell, label: 'Accès', sub: 'Tourniquets & check-in' },
                  { icon: ShieldCheck, label: 'Sécurisé', sub: 'Données protégées' },
                ].map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="flex items-center gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-medium truncate">{label}</p>
                      <p className="text-gray-500 text-[10px] truncate">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[420px] xl:w-[460px] flex items-center justify-center p-4 lg:p-6 lg:pr-10 xl:pr-12">
            <div className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex lg:hidden flex-col items-center mb-3">
                <div className="relative w-20 h-20 mb-2">
                  <Image
                    src="/qlf-3d.png"
                    alt="QLF"
                    fill
                    className="object-contain drop-shadow-[0_0_30px_rgba(59,130,246,0.3)]"
                    priority
                    sizes="80px"
                  />
                </div>
                <h1 className="text-xl font-bold">
                  <span className="text-blue-500">QLF</span>{' '}
                  <span className="text-white">GYM</span>
                </h1>
                <p className="text-gray-400 text-sm">Gestion &amp; Suivi</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Email ou nom d&apos;utilisateur
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-gray-500 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder={isEmail ? "exemple@email.com" : "Nom d'utilisateur"}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">Mot de passe</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-gray-500 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="Mot de passe"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </form>

              <p className="text-center text-gray-500 text-xs mt-4">
                QLF GYM &copy; {new Date().getFullYear()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes logoFloat3D {
          0%, 100% { transform: translateY(0px) rotateX(0deg); }
          25% { transform: translateY(-6px) rotateX(2deg); }
          50% { transform: translateY(-10px) rotateX(0deg); }
          75% { transform: translateY(-6px) rotateX(-2deg); }
        }
        @keyframes logoRotate {
          0%, 100% { transform: rotateY(0deg) rotateZ(0deg); }
          25% { transform: rotateY(5deg) rotateZ(1deg); }
          50% { transform: rotateY(0deg) rotateZ(0deg); }
          75% { transform: rotateY(-5deg) rotateZ(-1deg); }
        }
      `}</style>
    </div>
  );
}
