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
    let isCancelled = false;

    const loadThumbnail = async () => {
      try {
        setStatus(ThumbnailStatus.Rendering);
        let sopUid = '';

        if (initialImageIds && initialImageIds.length > 0) {
          const midIdx = Math.floor(initialImageIds.length / 2);
          const match = initialImageIds[midIdx].match(/\/instances\/([^\/]+)\/file/);
          if (match) sopUid = match[1];
        }

        if (!sopUid && seriesUID && seriesUID !== 'unknown') {
          const res = await fetch(`${API_BASE_URL}/api/series/${seriesUID}/instances`);
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data?.data || []);
            if (list.length > 0) {
              const mid = list[Math.floor(list.length / 2)] || list[0];
              sopUid = mid.sop_instance_uid || mid.sopInstanceUid || '';
            }
          }
        }

        if (sopUid && !isCancelled) {
          const directPngUrl = `${API_BASE_URL}/api/instances/${sopUid}/png`;
          setImageUrl(directPngUrl);
          setStatus(ThumbnailStatus.Ready);
          return;
        }

        if (!isCancelled) {
          setStatus(ThumbnailStatus.Failed);
        }
      } catch (err) {
        if (!isCancelled) {
          setStatus(ThumbnailStatus.Failed);
        }
      }
    };

    loadThumbnail();

    return () => {
      isCancelled = true;
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
