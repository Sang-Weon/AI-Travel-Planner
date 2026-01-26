
export interface TravelConfig {
  purpose: string;
  duration: number;
  pax: number;
  totalBudget: number;
  startDate: string;
  endDate: string;
  hotelPerNight: number;
  foodPerPerson: number;
  golfPerRound: number;
  golfRounds: number;
  rentalPerDay: number;
  rentalDays: number;
}

export interface TravelOption {
  id: string;
  destination: string;
  theme: string;
  summary: string;
  detailedDescription: string;
  dailyRoutes: string[];
  keyPlaces: string[]; // 추가: 주요 방문지
  activities: string[]; // 추가: 추천 액티비티
  estimatedCost: number;
  costBreakdown: {
    hotel: number;
    food: number;
    transport: number;
    activity: number;
  };
  lat: number;
  lng: number;
  imageUrl?: string;
}

export interface Recommendation {
  id: string;
  name: string;
  // 'rental' 타입을 추가하여 App.tsx 및 geminiService.ts와의 타입 불일치 해결
  type: 'hotel' | 'restaurant' | 'golf' | 'attraction' | 'flight' | 'rental';
  price: number;
  rating: number;
  description: string;
  location: string;
  bookingUrl: string;
  lat?: number;
  lng?: number;
  reviews?: string;
}

export interface SelectedItem extends Recommendation {
  actualCost: number;
}
