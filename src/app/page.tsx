'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push(user.role === 'admin' ? '/admin' : '/reception');
      } else {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="relative w-40 h-40 lg:w-52 lg:h-52" style={{ perspective: '800px' }}>
        <div
          className="w-full h-full"
          style={{ animation: 'logoFloat3D 6s ease-in-out infinite', transformStyle: 'preserve-3d' }}
        >
          <div
            className="w-full h-full"
            style={{ animation: 'logoRotate 8s ease-in-out infinite', transformStyle: 'preserve-3d' }}
          >
            <Image
              src="/qlg-3d.png"
              alt="QLF GYM"
              fill
              className="object-contain drop-shadow-[0_0_60px_rgba(59,130,246,0.4)]"
              priority
              sizes="208px"
            />
          </div>
        </div>
      </div>
      <p className="mt-6 text-muted text-sm animate-pulse">Chargement...</p>
    </div>
  );
}
