
import React from 'react';

interface PlaceCardProps {
  name: string;
  description: string;
  url?: string;
  type: 'hotel' | 'restaurant';
}

const PlaceCard: React.FC<PlaceCardProps> = ({ name, description, url, type }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
          type === 'hotel' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
        }`}>
          {type === 'hotel' ? '숙소' : '식당'}
        </span>
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">{name}</h3>
      <p className="text-slate-600 text-sm leading-relaxed mb-4">{description}</p>
      {url && (
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center text-blue-600 font-medium text-sm hover:underline"
        >
          구글 맵에서 보기
          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )}
    </div>
  );
};

export default PlaceCard;
