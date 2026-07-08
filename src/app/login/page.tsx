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
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/40" />

      <div className="relative z-10 flex flex-col lg:flex-row w-full min-h-screen">
        <div className="flex-1 flex flex-col items-center px-8 lg:px-16 xl:px-24 py-8 lg:py-12">
          <div className="w-full max-w-xl flex flex-col items-center lg:items-start" style={{ perspective: '800px' }}>
            <div
              className="relative w-64 h-64 sm:w-72 sm:h-72 lg:w-80 lg:h-80"
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
                  className="object-contain drop-shadow-[0_0_80px_rgba(59,130,246,0.3)]"
                  priority
                  sizes="320px"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-full overflow-hidden ring-2 ring-white/20 shrink-0">
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
          </div>

          <div className="w-full max-w-xl mt-10 lg:mt-12">
            <h2 className="text-2xl lg:text-3xl xl:text-4xl font-bold text-white leading-tight mb-6">
              La solution compl&egrave;te pour<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-gray-300">
                la gestion de votre salle de sport
              </span>
            </h2>

            <p className="text-gray-300 text-base lg:text-lg leading-relaxed mb-10">
              Pilotez votre salle en toute simplicit&eacute; : abonnements, acc&egrave;s, 
              suivi des membres, encaissements, et statistiques en temps r&eacute;el.
              Un tableau de bord puissant pour une gestion optimale.
            </p>

            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Gestion membres</p>
                  <p className="text-gray-500 text-xs">Profils &amp; abonnements</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Statistiques</p>
                  <p className="text-gray-500 text-xs">Rapports &amp; analytics</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Dumbbell className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Acc&egrave;s</p>
                  <p className="text-gray-500 text-xs">Tourniquets &amp; check-in</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">S&eacute;curis&eacute;</p>
                  <p className="text-gray-500 text-xs">Donn&eacute;es prot&eacute;g&eacute;es</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[440px] xl:w-[480px] flex items-center justify-center p-6 lg:p-8 lg:pr-12 xl:pr-16">
          <div className="w-full max-w-sm bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="flex lg:hidden flex-col items-center mb-8">
              <div
                className="relative w-32 h-32 mb-4"
                style={{
                  perspective: '800px',
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
                    className="object-contain drop-shadow-[0_0_40px_rgba(59,130,246,0.3)]"
                    priority
                    sizes="128px"
                  />
                </div>
              </div>
              <h1 className="text-xl font-bold"><span className="text-blue-500">QLF</span> <span className="text-white">GYM</span></h1>
              <p className="text-gray-400 text-sm">Gestion &amp; Suivi</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-gray-500 focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
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
                    className="w-full pl-10 pr-10 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-gray-500 focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    placeholder="Mot de passe"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2.5">
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

            <p className="text-center text-gray-500 text-xs mt-8">
              QLF GYM &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes logoFloat3D {
          0%, 100% { transform: translateY(0px) rotateX(0deg); }
          25% { transform: translateY(-8px) rotateX(2deg); }
          50% { transform: translateY(-14px) rotateX(0deg); }
          75% { transform: translateY(-8px) rotateX(-2deg); }
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
