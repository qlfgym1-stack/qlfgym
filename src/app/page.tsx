'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        if (user) {
          router.push(user.role === 'admin' ? '/admin' : '/reception');
        } else {
          router.push('/login');
        }
      }, 2500);
      setReady(true);
      return () => clearTimeout(timer);
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      <div className="relative z-10 flex flex-col items-center" style={{ perspective: '800px' }}>
        <div
          className="relative w-48 h-48 sm:w-56 sm:h-56 md:w-72 md:h-72 mb-6"
          style={{
            animation: 'splashFloat 6s ease-in-out infinite',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="w-full h-full"
            style={{
              animation: 'splashRotate 8s ease-in-out infinite',
              transformStyle: 'preserve-3d',
            }}
          >
            <Image
              src="/qlf-3d.png"
              alt="QLF GYM"
              fill
              className="object-contain drop-shadow-[0_0_80px_rgba(59,130,246,0.4)]"
              priority
              sizes="288px"
            />
          </div>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white text-center">
          QLF <span className="text-primary">GYM</span>
        </h1>
        <p className="text-gray-400 text-sm sm:text-base mt-2 mb-8">Gestion &amp; Suivi</p>
        <div className="flex items-center gap-2 text-primary">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm text-gray-400">Chargement...</span>
        </div>
      </div>

      <style>{`
        @keyframes splashFloat {
          0%, 100% { transform: translateY(0px) rotateX(0deg); }
          25% { transform: translateY(-10px) rotateX(2deg); }
          50% { transform: translateY(-16px) rotateX(0deg); }
          75% { transform: translateY(-10px) rotateX(-2deg); }
        }
        @keyframes splashRotate {
          0%, 100% { transform: rotateY(0deg) rotateZ(0deg); }
          25% { transform: rotateY(8deg) rotateZ(1.5deg); }
          50% { transform: rotateY(0deg) rotateZ(0deg); }
          75% { transform: rotateY(-8deg) rotateZ(-1.5deg); }
        }
      `}</style>
    </div>
  );
}
