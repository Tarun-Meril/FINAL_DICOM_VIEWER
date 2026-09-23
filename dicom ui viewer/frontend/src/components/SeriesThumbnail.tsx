import React, { useEffect, useRef, useState } from 'react';
import { ThumbnailService, ThumbnailStatus, ThumbnailPriority } from '../services/Thumbnail/ThumbnailService';
import { API_BASE_URL } from '../config';

interface SeriesThumbnailProps {
  studyUID: string;
  seriesUID: string;
  imageIds: string[];
  modality: string;
  imagesCount: number;
}

export function SeriesThumbnail({ studyUID, seriesUID, imageIds: initialImageIds, modality, imagesCount }: SeriesThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ThumbnailStatus>(ThumbnailStatus.Idle);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageIds, setImageIds] = useState<string[]>(initialImageIds || []);

  // Request ID specific to this component instance
  const reqIdRef = useRef(Math.random().toString(36).substring(7));

  useEffect(() => {
    const config = { width: 96, height: 96, format: 'image/webp', version: 2 };

    const handleVisibility = (entries: IntersectionObserverEntry[]) => {
      const isVisible = entries[0].isIntersecting;
      
      // Request thumbnail with priority based on visibility
      ThumbnailService.getThumbnail({
        id: reqIdRef.current,
        studyUID,
        seriesUID,
        imageIds: initialImageIds,
        fetchImageIds: async () => {
          const res = await fetch(`${API_BASE_URL}/api/series/${seriesUID}/instances`);
          const data = await res.json();
          if (Array.isArray(data)) {
             return data.map(inst => `wadouri:${API_BASE_URL}/api/instances/${inst.sop_instance_uid || inst.sopInstanceUid}/file`);
          }
          return [];
        },
        modality,
        config,
        priority: isVisible ? ThumbnailPriority.Visible : ThumbnailPriority.Prefetch,
        onStatusChange: (newStatus, url) => {
          setStatus(newStatus);
          if (url && newStatus === ThumbnailStatus.Ready) {
            setImageUrl(url);
          }
        }
      });
    };

    const observer = new IntersectionObserver(handleVisibility, {
      root: null, // viewport
      rootMargin: '100px', // start loading slightly before it enters screen
      threshold: 0.1
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      // Cancel pending request if unmounted
      ThumbnailService.cancelRequest(reqIdRef.current);
      // Release reference counted Object URL
      ThumbnailService.releaseThumbnail(studyUID, seriesUID, modality, config);
    };
  }, [studyUID, seriesUID, initialImageIds, modality]);

  const renderContent = () => {
    if (status === ThumbnailStatus.Failed) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-[#15181E]">
          <span className="text-[11px] font-sans font-bold text-red-500">ERR</span>
        </div>
      );
    }

    if (status === ThumbnailStatus.Ready && imageUrl) {
      return (
        <img 
          src={imageUrl} 
          alt="Series Thumbnail" 
          className="w-full h-full object-cover"
        />
      );
    }

    // Skeleton/Loading states
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-[#15181E] relative overflow-hidden">
        {/* Shimmer effect */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <span className="text-[11px] font-sans font-bold text-[#3B82F6] opacity-50">{modality || 'IMG'}</span>
        {status === ThumbnailStatus.Rendering && <span className="absolute bottom-1 text-[8px] text-[#8B949E]">Render</span>}
      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      className="w-[54px] h-[54px] bg-black border border-[#353C48] rounded-[4px] shrink-0 flex items-center justify-center relative overflow-hidden"
    >
      {renderContent()}
      
      {/* Overlays */}
      <span className="absolute top-[2px] left-[3px] text-[7px] text-[#3B82F6] font-bold z-10">{modality}</span>
      <span className="absolute bottom-[2px] right-[3px] text-[7px] text-green-500 font-mono-numbers z-10">{imagesCount}</span>
    </div>
  );
}
