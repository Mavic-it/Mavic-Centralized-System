'use client';
import { useState } from 'react';
import { DoorOpen, Laptop } from 'lucide-react';
import type { Space } from '@/types/booking';

export function SpaceVisual({ space, index }: { space: Space; index: number }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return <div className={`space-visual visual-${index % 3}`}>
    {space.imageData && failedImage !== space.imageData ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="space-photo" src={space.imageData} alt={space.name} loading="lazy" onError={() => setFailedImage(space.imageData ?? null)} />
    ) : <div className="space-placeholder" aria-hidden="true">
      {space.type === 'COWORKING_DESK' ? <Laptop size={68} strokeWidth={1} /> : <DoorOpen size={68} strokeWidth={1} />}
      <span>{space.type === 'COWORKING_DESK' ? 'SHARED SPACE' : 'A ROOM FOR YOUR IDEAS'}</span>
    </div>}
  </div>;
}
