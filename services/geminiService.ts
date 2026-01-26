
import { GoogleGenAI, Type } from "@google/genai";
import { TravelConfig, TravelOption, Recommendation } from "../types";

const MODELS = {
  SEARCH: 'gemini-3-flash-preview',
  MAPS: 'gemini-2.5-flash',
  IMAGE: 'gemini-2.5-flash-image',
  CHAT: 'gemini-3-pro-preview'
};

/**
 * 여행지 옵션 5가지 추천
 */
export const getTravelOptions = async (config: TravelConfig): Promise<TravelOption[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    여행 목적/키워드: ${config.purpose}
    여행 기간: ${config.startDate} ~ ${config.endDate} (${config.duration}일)
    인원: ${config.pax}명 (중요: 모든 예산은 ${config.pax}인 그룹 전체를 기준으로 산출하세요)
    사용자 설정 단가: 1박 숙소비 ₩${config.hotelPerNight}, 1인 1일 식비 ₩${config.foodPerPerson}, 골프 ₩${config.golfPerRound}/회
    총 가용 예산: ${config.totalBudget.toLocaleString()}원

    위 정보를 바탕으로 최적의 여행지 옵션 5가지를 제안해주세요.
    각 옵션은 JSON 배열 형태여야 하며, 다음을 포함해야 합니다:
    - destination: 도시/국가명
    - theme: 여행 테마
    - summary: 인원과 목적에 맞는 짧은 추천 사유
    - detailedDescription: 5줄 내외의 상세 설명
    - keyPlaces: 해당 도시에서 꼭 가봐야 할 주요 장소 3~4개
    - activities: 추천 액티비티 3개
    - estimatedCost: 위 설정 단가를 반영한 ${config.pax}인 그룹 전체의 예상 총 비용 (항공권 제외)
    - costBreakdown: 항목별 세부 비용 (hotel, food, transport, activity)
    - lat, lng: 대표 좌표
    - dailyRoutes: 일자별 간단한 동선 계획
    - id: 고유 ID
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.SEARCH,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              destination: { type: Type.STRING },
              theme: { type: Type.STRING },
              summary: { type: Type.STRING },
              detailedDescription: { type: Type.STRING },
              keyPlaces: { type: Type.ARRAY, items: { type: Type.STRING } },
              activities: { type: Type.ARRAY, items: { type: Type.STRING } },
              dailyRoutes: { type: Type.ARRAY, items: { type: Type.STRING } },
              estimatedCost: { type: Type.NUMBER },
              costBreakdown: {
                type: Type.OBJECT,
                properties: {
                  hotel: { type: Type.NUMBER },
                  food: { type: Type.NUMBER },
                  transport: { type: Type.NUMBER },
                  activity: { type: Type.NUMBER }
                }
              },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER }
            },
            required: ["id", "destination", "theme", "detailedDescription", "keyPlaces", "activities", "estimatedCost", "costBreakdown", "lat", "lng"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini API Error (getTravelOptions):", error);
    throw error;
  }
};

/**
 * 실제 장소 추천 (구글 맵 기반)
 */
export const getMappedPlaces = async (
  option: TravelOption, 
  config: TravelConfig, 
  type: 'hotel' | 'restaurant' | 'attraction' | 'golf' | 'rental',
  userCoords?: { latitude: number, longitude: number }
): Promise<Recommendation[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const typeLabel = {
    hotel: '숙소/호텔',
    restaurant: '맛집/식당',
    attraction: '관광지/名所',
    golf: '골프장/클럽',
    rental: '렌터카 업체'
  }[type];
  
  let typePrompt = "";
  if (type === 'hotel') {
    typePrompt = `
      - Luxury (5성급, 고가): 2곳
      - Comfort (3-4성급, 합리적): 2곳
      - Budget (가성비, 실속형): 2곳
      총 6곳을 균형 있게 추천하세요. description 필드 시작 부분에 [Luxury], [Comfort], [Budget] 중 하나를 명시하세요.
    `;
  } else if (type === 'rental') {
    typePrompt = `도착 공항(${option.destination}) 인근에서 가장 저렴하고 평점이 높은 렌터카 업체 5곳을 추천하세요. price 필드에는 1일(24시간) 기준 렌트 비용을 넣으세요.`;
  } else {
    typePrompt = `구글 평점 4.0 이상인 ${typeLabel} 6곳 추천.`;
  }

  const prompt = `
    위치: ${option.destination} (좌표: ${option.lat}, ${option.lng})
    인원수: ${config.pax}명
    요청 사항: ${typePrompt}
    주의사항: 
    - 식당/골프/명소: '1인당 평균 단가'를 price로 제공.
    - 호텔: '그룹 전체(${config.pax}인)가 머물 수 있는 1박 총 요금'을 price로 제공.
    - 렌터카: '차량 1대당 1일 렌트 요금'을 price로 제공.
    각 장소별로 이름, 예상 가격(₩), 평점(1-5), 상세 설명, 위치 주소, 구글 맵 또는 실제 예약 가능한 URL(bookingUrl), 좌표(lat, lng), 실제 리뷰 요약을 포함하세요.
    결과는 반드시 JSON 배열이어야 합니다.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.MAPS,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              price: { type: Type.NUMBER },
              rating: { type: Type.NUMBER },
              description: { type: Type.STRING },
              location: { type: Type.STRING },
              bookingUrl: { type: Type.STRING },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
              reviews: { type: Type.STRING }
            },
            required: ["id", "name", "price", "rating", "lat", "lng", "bookingUrl", "description"]
          }
        }
      }
    });
    // Recommendation[] 타입 안전성을 보장하기 위해 명시적으로 type 캐스팅 수행
    return JSON.parse(response.text || "[]").map((item: any) => ({ 
      ...item, 
      type: type as Recommendation['type']
    }));
  } catch (error) {
    console.error(`Gemini API Error (getMappedPlaces - ${type}):`, error);
    throw error;
  }
};

export const getFlights = async (destination: string, config: TravelConfig): Promise<Recommendation[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `${config.startDate}부터 ${config.endDate}까지 서울에서 ${destination}으로 가는 '1인당 왕복 항공권' 최저가 정보 5개 리스트업. JSON 형식으로 가격, 항공사명, 그리고 예약 페이지 URL(bookingUrl)을 포함하세요. (총 인원: ${config.pax}명)`;
  
  try {
    const response = await ai.models.generateContent({
      model: MODELS.SEARCH,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              price: { type: Type.NUMBER },
              description: { type: Type.STRING },
              bookingUrl: { type: Type.STRING }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || "[]").map((item: any) => ({ 
      ...item, 
      type: 'flight' as const, 
      rating: 5, 
      location: 'ICN' 
    }));
  } catch (error) {
    return [];
  }
};

export const generateDestinationImage = async (destination: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: MODELS.IMAGE,
      contents: { parts: [{ text: `${destination} landmark, beautiful scenery, professional travel photography, highly detailed` }] }
    });
    // 가이드라인에 따라 모든 parts를 순회하여 inlineData 탐색
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return "";
  } catch {
    return "";
  }
};

export const startChat = (history: any[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.chats.create({
    model: MODELS.CHAT,
    config: { systemInstruction: "당신은 세계 최고의 여행 가이드입니다. 사용자의 예산과 인원수에 맞춰 가장 합리적이고 즐거운 여행을 추천합니다." }
  });
};
