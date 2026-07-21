/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';
import { compressImageFile } from '../lib/imageCompressor';

interface ImageInputCompressorProps {
  id: string;
  label: string;
  onCompressedImage: (base64: string) => void;
  onClear: () => void;
}

export const ImageInputCompressor: React.FC<ImageInputCompressorProps> = ({
  id,
  label,
  onCompressedImage,
  onClear
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = async (file: File) => {
    setCompressing(true);
    try {
      const compressedDataUrl = await compressImageFile(file);
      setPreview(compressedDataUrl);
      onCompressedImage(compressedDataUrl);
    } catch (err) {
      console.error("Görsel sıkıştırma hatası:", err);
    } finally {
      setCompressing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      compressImage(file);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onClear();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <span className="block text-xs font-semibold text-slate-400 mb-2 font-mono uppercase">{label}</span>
      
      {preview ? (
        <div className="relative group aspect-video rounded-xl overflow-hidden border border-slate-700/60 bg-slate-900/40">
          <img 
            src={preview} 
            alt="Seçilen görsel" 
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            id={`${id}-remove-btn`}
            className="absolute top-2 right-2 p-1.5 bg-rose-500/90 text-white rounded-full transition hover:bg-rose-600 shadow cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-emerald-500/95 text-[10px] text-white font-mono uppercase tracking-wider">
            Sıkıştırıldı (&lt;500kb)
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          id={`${id}-uploader`}
          className="aspect-video rounded-xl border-2 border-dashed border-slate-700/70 hover:border-violet-500 bg-slate-900/30 hover:bg-slate-900/60 transition cursor-pointer flex flex-col items-center justify-center p-4 text-center select-none"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          
          {compressing ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-slate-400 animate-pulse">Küçültülüyor...</span>
            </div>
          ) : (
            <>
              <div className="p-3 bg-slate-800/80 rounded-full text-slate-300 mb-2 group-hover:text-violet-500 transition">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-200">Görsel Seç veya Sürükle</p>
              <p className="text-[10px] text-slate-400 mt-1 font-sans">En iyi görünüm: 9:16 dikey (Örn: 1080x1920)</p>
              <p className="text-[8px] text-indigo-400/85 font-mono mt-0.5">Otomatik optimize edilir (&lt;500KB)</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
