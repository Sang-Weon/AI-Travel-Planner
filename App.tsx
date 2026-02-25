import * as gemini from './services/geminiService';
import MapView from './components/MapView';
import { db, auth } from './services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const App: React.FC = () => {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("AI 분석 중...");
  const [error, setError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number, longitude: number } | undefined>();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [config, setConfig] = useState<TravelConfig>({
    purpose: '',
    duration: 3,
    pax: 2,
    totalBudget: 3000000,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 172800000).toISOString().split('T')[0],
    hotelPerNight: 200000,
    foodPerPerson: 50000,
    golfPerRound: 150000,
    golfRounds: 0,
    rentalPerDay: 80000,
    rentalDays: 3
  });

  const [options, setOptions] = useState<TravelOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<TravelOption | null>(null);
  const [recs, setRecs] = useState<{ [key: string]: Recommendation[] }>({});
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string, text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      }, (err) => console.log("Geolocation blocked", err));
    }
  }, []);

  useEffect(() => {
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
    if (diffDays !== config.duration) {
      setConfig(prev => ({ ...prev, duration: diffDays, rentalDays: diffDays }));
    }
  }, [config.startDate, config.endDate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  const currentSpent = useMemo(() => {
    return selectedItems.reduce((acc, curr) => acc + curr.actualCost, 0);
  }, [selectedItems]);

  const estimatedTotalFromConfig = useMemo(() => {
    const flightEst = 500000 * config.pax;
    const hotelEst = config.hotelPerNight * (config.duration - 1);
    const foodEst = config.foodPerPerson * config.pax * config.duration;
    const golfEst = config.golfPerRound * config.pax * config.golfRounds;
    const rentalEst = config.rentalPerDay * config.rentalDays;
    return flightEst + hotelEst + foodEst + golfEst + rentalEst;
  }, [config]);

  const handleStartDateChange = (val: string) => {
    const newStart = new Date(val);
    const currentEnd = new Date(config.endDate);
    let nextEnd = config.endDate;
    if (newStart > currentEnd) nextEnd = val;
    setConfig(prev => ({ ...prev, startDate: val, endDate: nextEnd }));
  };

  const handleStartPlanning = async () => {
    if (!config.purpose) {
      alert("여행 목적을 입력해주세요.");
      return;
    }
    setLoading(true);
    setLoadingMsg(`${config.pax}인 규모에 가장 적합한 전 세계 여행지 5곳을 엄선하고 있습니다...`);
    setError(null);
    try {
      const suggestedOptions = await gemini.getTravelOptions(config);
      setLoadingMsg("추천된 도시의 현지 랜드마크 이미지를 생성 중입니다...");
      const withImages = await Promise.all(suggestedOptions.map(async opt => ({
        ...opt,
        imageUrl: await gemini.generateDestinationImage(opt.destination)
      })));
      setOptions(withImages);
      setStep(2);

      // Firestore에 검색 기록 저장 (비동기)
      addDoc(collection(db, "searches"), {
        config,
        suggestedDestinations: withImages.map(o => o.destination),
        timestamp: serverTimestamp()
      }).catch(err => console.error("Firestore save error:", err));

    } catch (e: any) {
      setError(e.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = async (option: TravelOption) => {
    setSelectedOption(option);
    setLoading(true);
    setLoadingMsg(`${option.destination}행 ${config.pax}인 최저가 왕복 항공권을 실시간 조회 중입니다...`);
    setError(null);
    try {
      const flights = await gemini.getFlights(option.destination, config);
      setRecs(prev => ({ ...prev, flight: flights }));
      setStep(2.5);
    } catch (e: any) {
      setError("항공 정보를 가져오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleToRentals = async () => {
    setLoading(true);
    setLoadingMsg(`${selectedOption?.destination} 공항 인근 최적의 렌터카 업체를 검색 중입니다...`);
    setError(null);
    try {
      const rentals = await gemini.getMappedPlaces(selectedOption!, config, 'rental', userCoords);
      setRecs(prev => ({ ...prev, rental: rentals }));
      setStep(2.7);
    } catch (e: any) {
      setError("렌터카 정보를 가져오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const proceedToPlaces = async () => {
    setLoading(true);
    setLoadingMsg(`Luxury부터 Budget까지, ${config.pax}인 일행을 위한 다양한 숙소를 분석 중입니다...`);
    setError(null);
    try {
      const promises = [
        gemini.getMappedPlaces(selectedOption!, config, 'hotel', userCoords),
        gemini.getMappedPlaces(selectedOption!, config, 'attraction', userCoords)
      ];
      if (config.golfRounds > 0) promises.push(gemini.getMappedPlaces(selectedOption!, config, 'golf', userCoords));
      const results = await Promise.all(promises);
      setRecs(prev => ({
        ...prev,
        hotel: results[0],
        attraction: results[1],
        golf: results[2] || []
      }));
      setStep(3);
    } catch (e: any) {
      setError("장소 정보를 가져오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleToRestaurants = async () => {
    setLoading(true);
    setLoadingMsg(`${config.pax}명이 함께 즐기기 좋은 검증된 로컬 맛집 리스트를 구성하고 있습니다...`);
    setError(null);
    try {
      const restaurants = await gemini.getMappedPlaces(selectedOption!, config, 'restaurant', userCoords);
      setRecs(prev => ({ ...prev, restaurant: restaurants }));
      setStep(4);
    } catch (e: any) {
      setError("맛집 정보를 가져오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (item: Recommendation) => {
    const exists = selectedItems.find(i => i.id === item.id);
    if (exists) {
      setSelectedItems(selectedItems.filter(i => i.id !== item.id));
    } else {
      let actualCost = item.price;
      if (item.type === 'flight') actualCost = item.price * config.pax;
      else if (item.type === 'hotel') actualCost = item.price * (config.duration - 1);
      else if (item.type === 'restaurant') actualCost = item.price * config.pax;
      else if (item.type === 'golf') actualCost = item.price * config.pax * config.golfRounds;
      else if (item.type === 'rental') actualCost = item.price * config.rentalDays;
      setSelectedItems([...selectedItems, { ...item, actualCost }]);
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text }]);
    try {
      if (!chatRef.current) chatRef.current = gemini.startChat([]);
      const response = await chatRef.current.sendMessage({ message: text });
      setChatHistory(prev => [...prev, { role: 'model', text: response.text || '' }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: "오류가 발생했습니다." }]);
    }
  };

  const currentMapPlaces = useMemo(() => {
    // Recommendation[] 타입을 명시적으로 지정하여 하위 브랜치에서의 타입 추론 충돌 및 overlap 에러 방지
    let results: Recommendation[] = [];
    if (step === 2) {
      results = options.map(o => ({
        id: o.id,
        name: o.destination,
        type: 'attraction' as const,
        rating: 5,
        price: 0,
        location: o.destination,
        bookingUrl: '',
        description: o.summary
      }));
    } else if (step === 2.7) {
      results = recs.rental || [];
    } else if (step === 3) {
      results = [...(recs.hotel || []), ...(recs.attraction || []), ...(recs.golf || [])];
    } else if (step === 4) {
      results = recs.restaurant || [];
    } else if (step === 5) {
      results = selectedItems.filter(i => i.type !== 'flight');
    }
    return results;
  }, [step, options, recs, selectedItems]);

  const getHotelGrade = (desc: string) => {
    if (desc.includes('[Luxury]')) return { label: 'Luxury', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (desc.includes('[Comfort]')) return { label: 'Comfort', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
    if (desc.includes('[Budget]')) return { label: 'Budget', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    return { label: 'Standard', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-10 selection:bg-indigo-500/30">
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-white/5 px-4 md:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.4)] animate-pulse">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2.5 2.5 0 012.5-2.5h1.5m-6 3h.01M9 16h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tighter uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">ANTIGRAVITY TRAVEL</h1>
            <p className="text-[9px] font-bold text-slate-500 tracking-[0.2em] uppercase">AI Powered Luxury Planner</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Budget Goal</span>
            <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (currentSpent / config.totalBudget) * 100)}%` }}></div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4 px-3 py-1.5 bg-white rounded-full border border-slate-200 shadow-sm">
            <div className="text-right flex flex-col items-end">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">확정 지출</span>
              <span className="text-xs md:text-sm font-black text-indigo-600">₩{formatCurrency(currentSpent)}</span>
            </div>
            <div className="w-px h-6 bg-slate-200"></div>
            <div className="text-right flex flex-col items-end">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">잔여 예산</span>
              <span className={`text-xs md:text-sm font-black ${config.totalBudget - currentSpent < 0 ? 'text-rose-500' : 'text-slate-700'}`}>₩{formatCurrency(config.totalBudget - currentSpent)}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-start md:justify-center mb-10 overflow-x-auto pb-4 no-scrollbar gap-2 md:gap-4">
          {[1, 2, 2.5, 2.7, 3, 4, 5].map((s, idx) => (
            <div key={idx} className="flex items-center shrink-0">
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition-all ${step === s ? 'bg-indigo-600 text-white scale-110' : step > s ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                {step > s ? '✓' : idx + 1}
              </div>
              {idx < 6 && <div className={`w-4 md:w-8 h-0.5 mx-1 md:mx-2 ${step > s ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-8 p-4 bg-rose-50 border-2 border-rose-100 rounded-2xl text-rose-600 text-sm font-bold flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setStep(1)} className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs">다시 시도</button>
          </div>
        )}

        {step === 1 && (
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-500">
            <div className="bg-white p-8 md:p-12 rounded-[40px] shadow-2xl border border-slate-100 space-y-8">
              <div className="text-center mb-10">
                <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">당신만의 여정을 설계하세요</h2>
                <p className="text-slate-500 font-medium italic">인원과 예산에 최적화된 맞춤형 글로벌 여행을 제안합니다.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">여행 키워드</label>
                    <input type="text" value={config.purpose} onChange={e => setConfig({ ...config, purpose: e.target.value })} placeholder="예: 치앙마이 한달살기, 이탈리아 미식 투어" className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">목표 총 예산 (₩)</label>
                      <input type="number" step="100000" value={config.totalBudget} onChange={e => setConfig({ ...config, totalBudget: Number(e.target.value) || 0 })} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-black text-indigo-600 text-xl" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">여행 인원 (명)</label>
                      <input type="number" min="1" value={config.pax} onChange={e => setConfig({ ...config, pax: Number(e.target.value) || 1 })} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-black text-slate-700 text-xl" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">출발일</label>
                      <input type="date" value={config.startDate} onChange={e => handleStartDateChange(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">도착일</label>
                      <input type="date" value={config.endDate} min={config.startDate} onChange={e => setConfig({ ...config, endDate: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-sm outline-none" />
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="p-8 bg-slate-900 rounded-[32px] text-white space-y-6 shadow-xl relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>
                    <div className="flex justify-between items-center border-b border-white/10 pb-4">
                      <span className="text-xs font-bold text-slate-400">설정 기준 예상 총 비용</span>
                      <span className="text-2xl font-black text-emerald-400 tracking-tighter">₩{formatCurrency(estimatedTotalFromConfig)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-4 text-[11px] font-medium text-slate-300">
                      <div className="flex flex-col"><span className="text-slate-500 mb-1">인원</span><span className="text-white font-black">{config.pax}명</span></div>
                      <div className="flex flex-col"><span className="text-slate-500 mb-1">기간</span><span className="text-white font-black">{config.duration}일</span></div>
                      <div className="flex flex-col"><span className="text-slate-500 mb-1">1인 평균 식비</span><span className="text-white font-black">₩{formatCurrency(config.foodPerPerson)}</span></div>
                      <div className="flex flex-col"><span className="text-slate-500 mb-1">목표 대비</span><span className={`font-black ${config.totalBudget - estimatedTotalFromConfig < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>₩{formatCurrency(config.totalBudget - estimatedTotalFromConfig)}</span></div>
                    </div>
                  </div>
                  <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-black text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-2">
                    {showAdvanced ? '세부 설정 닫기' : '세부 비용 옵션 설정하기'}
                    <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showAdvanced && (
                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                      <div><label className="text-[9px] font-black text-slate-400 mb-1 block">1박 숙소 예산 (₩)</label><input type="number" step="10000" value={config.hotelPerNight} onChange={e => setConfig({ ...config, hotelPerNight: Number(e.target.value) || 0 })} className="w-full px-3 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black" /></div>
                      <div><label className="text-[9px] font-black text-slate-400 mb-1 block">1인 1일 식비 (₩)</label><input type="number" step="5000" value={config.foodPerPerson} onChange={e => setConfig({ ...config, foodPerPerson: Number(e.target.value) || 0 })} className="w-full px-3 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black" /></div>
                      <div><label className="text-[9px] font-black text-slate-400 mb-1 block">골프 1회 비용 (₩)</label><input type="number" step="10000" value={config.golfPerRound} onChange={e => setConfig({ ...config, golfPerRound: Number(e.target.value) || 0 })} className="w-full px-3 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black" /></div>
                      <div><label className="text-[9px] font-black text-slate-400 mb-1 block">골프 라운딩 횟수</label><input type="number" value={config.golfRounds} onChange={e => setConfig({ ...config, golfRounds: Number(e.target.value) || 0 })} className="w-full px-3 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black" /></div>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={handleStartPlanning} disabled={loading} className="w-full py-6 bg-slate-900 text-white font-black rounded-3xl shadow-xl hover:bg-indigo-600 transition-all text-xl active:scale-95 disabled:opacity-50">여행지 추천 받기</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-12 animate-in fade-in duration-700">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-black text-slate-900 tracking-tighter">RECOMMENDED DESTINATIONS</h2>
              <p className="text-slate-500 font-bold">{config.pax}인 규모와 {formatCurrency(config.totalBudget)}원 예산에 최적화된 추천지</p>
            </div>
            <div className="grid grid-cols-1 gap-12">
              {options.map((opt) => (
                <div key={opt.id} className="bg-white rounded-[48px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col lg:flex-row group transition-all hover:ring-8 hover:ring-indigo-50">
                  <div className="lg:w-2/5 h-80 lg:h-auto relative overflow-hidden bg-slate-200 shrink-0">
                    {opt.imageUrl && <img src={opt.imageUrl} alt={opt.destination} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    <div className="absolute bottom-10 left-10 right-10 text-white">
                      <span className="px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-xl text-[10px] font-black uppercase tracking-widest mb-4 inline-block">{opt.theme}</span>
                      <h3 className="text-4xl font-black mb-2">{opt.destination}</h3>
                      <p className="text-sm font-medium text-slate-300 line-clamp-2 italic leading-relaxed">{opt.summary}</p>
                    </div>
                  </div>
                  <div className="p-8 lg:p-14 flex-grow flex flex-col gap-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-8">
                        <div><h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-2"><span className="w-4 h-[1px] bg-indigo-500"></span>AI ANALYSIS</h4><p className="text-slate-600 text-sm leading-relaxed font-medium">{opt.detailedDescription}</p></div>
                        <div><h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4">KEY PLACES</h4><div className="flex flex-wrap gap-2">{opt.keyPlaces.map((p, i) => (<span key={i} className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold text-slate-700 shadow-sm transition-all hover:bg-white hover:shadow-md">📍 {p}</span>))}</div></div>
                      </div>
                      <div className="space-y-8">
                        <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 shadow-inner">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">GROUP ESTIMATED COST ({config.pax} PAX)</h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-end"><span className="text-4xl font-black text-slate-900 tracking-tighter">₩{formatCurrency(opt.estimatedCost)}</span><span className="text-[10px] font-bold text-slate-400 mb-1">항공권 제외</span></div>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full mt-6 overflow-hidden flex"><div className="h-full bg-indigo-500" style={{ width: '40%' }}></div><div className="h-full bg-emerald-500" style={{ width: '30%' }}></div><div className="h-full bg-amber-500" style={{ width: '20%' }}></div><div className="h-full bg-rose-500" style={{ width: '10%' }}></div></div>
                          </div>
                        </div>
                        <div><h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4">ACTIVITIES</h4><ul className="grid grid-cols-1 gap-3">{opt.activities.map((a, i) => (<li key={i} className="flex items-center gap-3 text-xs font-bold text-slate-600"><span className="w-2 h-2 bg-indigo-500 rounded-full ring-4 ring-indigo-50"></span>{a}</li>))}</ul></div>
                      </div>
                    </div>
                    <button onClick={() => handleSelectOption(opt)} className="w-full py-5 bg-slate-900 text-white font-black rounded-[24px] shadow-2xl hover:bg-indigo-600 transition-all text-xl active:scale-95 group/btn">{opt.destination} 계획 고도화하기<span className="ml-2 group-hover/btn:translate-x-1 transition-transform inline-block">→</span></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2.5 && (
          <div className="space-y-8 animate-in fade-in">
            <div className="text-center mb-10"><h2 className="text-3xl font-black text-slate-900 leading-tight">항공편 실시간 검색</h2><p className="text-slate-500 font-bold italic text-sm">{config.startDate} ~ {config.endDate} ({config.pax}인 왕복 기준)</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recs.flight?.map(f => (
                <div key={f.id} className={`bg-white p-8 rounded-[32px] border-2 transition-all group ${selectedItems.find(i => i.id === f.id) ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-xl scale-[1.02]' : 'border-slate-100 hover:border-indigo-200'}`}>
                  <div className="flex justify-between items-start mb-4"><div><h4 className="font-black text-lg text-slate-800 leading-tight truncate mr-2">{f.name}</h4><p className="text-[10px] font-bold text-slate-400 uppercase mt-1">PER PAX</p></div><span className="text-indigo-600 font-black shrink-0 text-sm">₩{formatCurrency(f.price)}</span></div>
                  <div className="bg-slate-50 p-4 rounded-2xl mb-6"><p className="text-[11px] font-bold text-slate-500 leading-relaxed italic">"{f.description}"</p></div>
                  <div className="flex justify-between items-center mb-6"><span className="text-[10px] font-black text-slate-400">TOTAL ({config.pax}인)</span><span className="text-xl font-black text-slate-900">₩{formatCurrency(f.price * config.pax)}</span></div>
                  <button onClick={() => toggleSelection(f)} className={`w-full py-4 rounded-2xl font-black text-sm transition-all ${selectedItems.find(i => i.id === f.id) ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}>{selectedItems.find(i => i.id === f.id) ? '선택 완료 ✓' : '이 항공편으로 확정'}</button>
                </div>
              ))}
            </div>
            <div className="flex justify-center pt-8"><button onClick={handleToRentals} disabled={!selectedItems.some(i => i.type === 'flight')} className="w-full max-w-md py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-2xl disabled:opacity-30 hover:scale-[1.02] active:scale-95 transition-all text-xl flex items-center justify-center gap-3">렌터카 업체 검색하기<span>→</span></button></div>
          </div>
        )}

        {step === 2.7 && (
          <div className="space-y-8 animate-in fade-in">
            <div className="text-center mb-10"><h2 className="text-3xl font-black text-slate-900 leading-tight">렌터카 업체 추천</h2><p className="text-slate-500 font-bold italic text-sm">{selectedOption?.destination} 공항 인근 최적 업체</p></div>
            <div className="w-full h-[400px] mb-8 relative rounded-[40px] overflow-hidden shadow-2xl border-4 border-white">
              <MapView places={currentMapPlaces} center={selectedOption ? { lat: selectedOption.lat, lng: selectedOption.lng } : undefined} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recs.rental?.map(r => (
                <div key={r.id} className={`bg-white p-8 rounded-[32px] border-2 transition-all group ${selectedItems.find(i => i.id === r.id) ? 'border-emerald-600 ring-4 ring-emerald-50 shadow-xl scale-[1.02]' : 'border-slate-100 hover:border-emerald-200'}`}>
                  <div className="flex justify-between items-start mb-4"><div><h4 className="font-black text-lg text-slate-800 leading-tight truncate mr-2">{r.name}</h4><span className="text-amber-500 text-xs font-black">★ {r.rating.toFixed(1)}</span></div><span className="text-emerald-600 font-black shrink-0 text-sm">₩{formatCurrency(r.price)}/일</span></div>
                  <p className="text-[11px] font-bold text-slate-500 mb-6 line-clamp-2">"{r.description}"</p>
                  <div className="flex justify-between items-center mb-6"><span className="text-[10px] font-black text-slate-400">TOTAL ({config.rentalDays}일)</span><span className="text-xl font-black text-slate-900">₩{formatCurrency(r.price * config.rentalDays)}</span></div>
                  <button onClick={() => toggleSelection(r)} className={`w-full py-4 rounded-2xl font-black text-sm transition-all ${selectedItems.find(i => i.id === r.id) ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-900 text-white hover:bg-emerald-600'}`}>{selectedItems.find(i => i.id === r.id) ? '선택 완료 ✓' : '이 업체로 예약'}</button>
                </div>
              ))}
            </div>
            <div className="flex justify-center pt-8"><button onClick={proceedToPlaces} className="w-full max-w-md py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-2xl hover:scale-[1.02] active:scale-95 transition-all text-xl flex items-center justify-center gap-3">숙소 및 현지 명소 찾기<span>→</span></button></div>
          </div>
        )}

        {(step >= 3 && step <= 5) && (
          <div className="space-y-10 animate-in fade-in">
            <div className="w-full h-[400px] md:h-[600px] mb-8 relative rounded-[40px] overflow-hidden shadow-2xl border-4 border-white group/map">
              <MapView places={currentMapPlaces} center={selectedOption ? { lat: selectedOption.lat, lng: selectedOption.lng } : undefined} />
              <div className="absolute top-6 left-6 z-10 bg-slate-900/80 backdrop-blur-md text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/20">{selectedOption?.destination} Interactive Map</div>
            </div>

            {step === 3 && (
              <div className="space-y-16">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="space-y-1 text-center md:text-left"><h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Selection Hub</h2><p className="text-slate-500 font-bold italic">당신과 {config.pax - 1}명의 일행을 위한 최고의 장소들</p></div>
                  <button onClick={handleToRestaurants} className="w-full md:w-auto px-12 py-5 bg-indigo-600 text-white font-black rounded-3xl shadow-2xl hover:bg-indigo-700 hover:scale-105 transition-all text-lg flex items-center justify-center gap-3">미식 코스 확인하기<span>→</span></button>
                </div>
                <section>
                  <h3 className="text-2xl font-black mb-8 text-slate-800 flex items-center gap-4"><span className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">🏨</span>추천 숙소 (Luxury to Budget)</h3>
                  <div className="flex overflow-x-auto pb-8 gap-8 no-scrollbar px-1">
                    {recs.hotel?.map(h => {
                      const grade = getHotelGrade(h.description);
                      return (
                        <div key={h.id} className={`flex-shrink-0 w-80 bg-white p-8 rounded-[40px] border-2 transition-all ${selectedItems.find(i => i.id === h.id) ? 'border-indigo-600 ring-8 ring-indigo-50 shadow-2xl scale-[1.02]' : 'border-slate-100 shadow-sm hover:border-indigo-200'}`}>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border mb-2 inline-block ${grade.color}`}>{grade.label}</span>
                              <h4 className="font-black text-lg text-slate-900 truncate leading-tight">{h.name}</h4>
                            </div>
                            <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg text-[10px] font-black">★ {h.rating.toFixed(1)}</span>
                          </div>
                          <div className="space-y-2 mb-6 text-sm">
                            <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-400">1박 요금 ({config.pax}인)</span><span className="text-indigo-600 font-black">₩{formatCurrency(h.price)}</span></div>
                            <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-400">총 {config.duration - 1}박 요금</span><span className="text-slate-900 font-black">₩{formatCurrency(h.price * (config.duration - 1))}</span></div>
                          </div>
                          <button onClick={() => toggleSelection(h)} className={`w-full py-4 rounded-[20px] font-black text-xs transition-all ${selectedItems.find(i => i.id === h.id) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{selectedItems.find(i => i.id === h.id) ? '이 숙소로 확정 ✓' : '일정에 숙소 추가'}</button>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <h3 className="text-2xl font-black mb-8 text-slate-800 flex items-center gap-4"><span className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg">🎡</span>머스트 비지트 (Must-Visit)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                    {recs.attraction?.map(a => (
                      <div key={a.id} className={`bg-white p-8 rounded-[40px] border-2 transition-all group ${selectedItems.find(i => i.id === a.id) ? 'border-indigo-600 ring-8 ring-indigo-50 shadow-2xl' : 'border-slate-100 shadow-sm'}`}>
                        <h4 className="font-black text-xl mb-3 text-slate-900">{a.name}</h4>
                        <p className="text-[11px] font-medium text-slate-500 mb-8 line-clamp-3 leading-relaxed italic">"{a.description}"</p>
                        <button onClick={() => toggleSelection(a)} className={`w-full py-4 rounded-[20px] font-black text-xs transition-all ${selectedItems.find(i => i.id === a.id) ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}>{selectedItems.find(i => i.id === a.id) ? '방문지 추가됨 ✓' : '일정에 장소 추가'}</button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-16">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left"><div className="space-y-1"><h2 className="text-4xl font-black text-slate-900 tracking-tighter">LOCAL GASTRONOMY</h2><p className="text-slate-500 font-bold italic">{config.pax}인의 입맛을 사로잡을 검증된 맛집</p></div><button onClick={() => setStep(5)} className="w-full md:w-auto px-16 py-6 bg-slate-900 text-white font-black rounded-3xl shadow-2xl hover:bg-indigo-600 text-xl transition-all flex items-center justify-center gap-3">최종 여정표 완성<span>→</span></button></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {recs.restaurant?.map(r => (
                    <div key={r.id} className={`bg-white p-10 rounded-[48px] border-2 transition-all ${selectedItems.find(i => i.id === r.id) ? 'border-orange-600 ring-8 ring-orange-50 shadow-2xl' : 'border-slate-100 shadow-sm hover:border-orange-200'}`}>
                      <div className="flex justify-between items-start mb-6"><h4 className="font-black text-2xl text-slate-900 leading-tight">{r.name}</h4><span className="text-amber-500 font-black">★ {r.rating}</span></div>
                      <div className="bg-slate-50 p-6 rounded-3xl mb-8 border border-slate-100"><p className="text-[11px] font-bold text-slate-500 italic leading-relaxed">"{r.reviews || r.description}"</p></div>
                      <div className="flex justify-between items-center mb-8"><div className="flex flex-col"><span className="text-[10px] font-black text-slate-400">1인 예상</span><span className="text-orange-600 font-black">₩{formatCurrency(r.price)}</span></div><div className="flex flex-col items-end"><span className="text-[10px] font-black text-slate-400">TOTAL ({config.pax}인)</span><span className="text-slate-900 font-black">₩{formatCurrency(r.price * config.pax)}</span></div></div>
                      <button onClick={() => toggleSelection(r)} className={`w-full py-5 rounded-[24px] font-black text-sm transition-all ${selectedItems.find(i => i.id === r.id) ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-white hover:bg-orange-600'}`}>{selectedItems.find(i => i.id === r.id) ? '방문 예정 ✓' : '일정에 식당 추가'}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="max-w-5xl mx-auto space-y-12 animate-in zoom-in-95 duration-500">
                <div className="bg-white p-12 md:p-20 rounded-[64px] shadow-2xl border border-slate-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" /></svg></div>
                  <div className="border-b-2 border-slate-100 pb-12 mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-10">
                    <div className="space-y-4">
                      <h2 className="text-5xl font-black text-slate-900 tracking-tighter uppercase">{selectedOption?.destination} 여정표</h2>
                      <div className="flex flex-wrap gap-3">
                        <span className="px-5 py-2 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-200">{selectedOption?.theme}</span>
                        <span className="px-5 py-2 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-200">{config.pax} PAX · {config.duration} DAYS</span>
                      </div>
                    </div>
                    <div className="text-left md:text-right space-y-2">
                      <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">FINAL TOTAL COST</p>
                      <p className="text-6xl font-black text-indigo-600 tracking-tighter">₩{formatCurrency(currentSpent)}</p>
                      <p className={`text-sm font-black ${config.totalBudget - currentSpent < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{config.totalBudget - currentSpent < 0 ? '예산 초과: ₩' : '잔여 예산: ₩'}{formatCurrency(Math.abs(config.totalBudget - currentSpent))}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                    <div className="space-y-10">
                      <h3 className="text-2xl font-black text-slate-900 border-l-8 border-indigo-600 pl-6 mb-8 uppercase tracking-tight">Booking List</h3>
                      <div className="space-y-6">
                        {selectedItems.map(item => (
                          <div key={item.id} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col gap-6 transition-all hover:bg-white hover:shadow-xl group">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-[10px] font-black text-indigo-500 uppercase mb-1 tracking-widest">{item.type}</p>
                                <p className="font-black text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{item.name}</p>
                              </div>
                              <p className="font-black text-slate-900 text-xl tracking-tighter">₩{formatCurrency(item.actualCost)}</p>
                            </div>
                            <div className="flex gap-2">
                              <a href={item.bookingUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-center text-[11px] font-black hover:bg-indigo-600 transition-colors shadow-lg">예약/상세 정보 사이트</a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-10">
                      <h3 className="text-2xl font-black text-slate-900 border-l-8 border-orange-500 pl-6 mb-8 uppercase tracking-tight">Summary Details</h3>
                      <div className="p-8 bg-slate-900 rounded-[32px] text-white shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/10 to-transparent"></div>
                        <div className="relative z-10 space-y-6">
                          <div className="flex justify-between border-b border-white/10 pb-4"><span className="text-slate-400 text-xs">일정</span><span className="font-bold">{config.startDate} ~ {config.endDate}</span></div>
                          <div className="flex justify-between border-b border-white/10 pb-4"><span className="text-slate-400 text-xs">인원 규모</span><span className="font-bold">{config.pax}명</span></div>
                          <div className="flex justify-between border-b border-white/10 pb-4"><span className="text-slate-400 text-xs">목표 예산</span><span className="font-bold text-emerald-400">₩{formatCurrency(config.totalBudget)}</span></div>
                          <div className="pt-6"><p className="text-xs text-slate-400 mb-2 italic">"{selectedOption?.summary}"</p></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-24 pt-12 border-t-2 border-slate-100 flex flex-col sm:flex-row gap-6">
                    <button onClick={() => setStep(1)} className="flex-1 py-6 bg-slate-100 text-slate-900 font-black rounded-[24px] hover:bg-slate-200 transition-all text-xl">여정 다시 설계하기</button>
                    <button onClick={() => window.print()} className="flex-1 py-6 bg-indigo-600 text-white font-black rounded-[24px] shadow-2xl hover:bg-indigo-700 transition-all text-xl flex items-center justify-center gap-3">계획서 인쇄/PDF 저장</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <div className={`fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 transition-all duration-500 ${chatOpen ? 'w-[calc(100vw-48px)] sm:w-[400px] h-[600px]' : 'w-20 h-20'}`}>
        {!chatOpen ? (
          <button onClick={() => setChatOpen(true)} className="w-full h-full bg-slate-900 text-white rounded-[28px] shadow-2xl flex items-center justify-center hover:bg-indigo-600 transition-all scale-100 active:scale-90 relative group"><div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-500 rounded-full border-4 border-white animate-pulse"></div><svg className="w-10 h-10 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg></button>
        ) : (
          <div className="bg-white w-full h-full rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom-5 duration-500">
            <div className="bg-slate-900 p-8 flex justify-between items-center relative overflow-hidden"><div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div><div><h4 className="text-white font-black text-lg tracking-tight">AI CONCIERGE</h4><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">24/7 Smart Travel Assistant</p></div><button onClick={() => setChatOpen(false)} className="w-10 h-10 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-white/20 transition-all">✕</button></div>
            <div className="flex-grow p-8 overflow-y-auto space-y-6 bg-slate-50 custom-scrollbar"><div className="flex justify-start"><div className="max-w-[85%] p-5 rounded-[24px] text-xs font-bold leading-relaxed bg-white text-slate-700 rounded-tl-none border border-slate-100 shadow-sm italic">안녕하세요! {config.pax}인 규모의 여정 계획에 대해 궁금한 점이 있으신가요?</div></div>{chatHistory.map((m, i) => (<div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] p-5 rounded-[24px] text-xs font-bold leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'}`}>{m.text}</div></div>))}<div ref={chatEndRef} /></div>
            <div className="p-6 bg-white border-t border-slate-100 flex gap-3"><input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="예산을 어떻게 더 줄일 수 있을까?" className="flex-grow px-5 py-4 bg-slate-50 rounded-2xl border-none outline-none text-xs font-bold focus:ring-2 focus:ring-indigo-100 transition-all" /><button onClick={sendMessage} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs hover:bg-indigo-600 transition-all active:scale-95 shadow-lg">ASK</button></div>
          </div>
        )}
      </div>
      {loading && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white p-14 md:p-20 rounded-[64px] shadow-2xl text-center max-w-md w-full animate-in zoom-in-95 duration-500 relative overflow-hidden border border-white/20"><div className="absolute top-0 left-0 w-full h-2 bg-slate-50"><div className="h-full bg-indigo-600 animate-[loading-bar_2s_infinite]"></div></div><div className="w-24 h-24 md:w-32 md:h-32 relative mx-auto mb-10"><div className="absolute inset-0 border-8 border-slate-50 rounded-full"></div><div className="absolute inset-0 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin"></div><div className="absolute inset-4 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-black text-xl">AI</div></div><h3 className="text-3xl font-black text-slate-900 mb-6 tracking-tighter uppercase">Analyzing Data</h3><p className="text-sm text-slate-500 font-bold leading-relaxed italic px-4">"{loadingMsg}"</p><div className="mt-10 flex justify-center gap-2"><span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-0"></span><span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-150"></span><span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-300"></span></div></div>
        </div>
      )}
      <style>{`
        @keyframes loading-bar { 0% { width: 0%; left: 0%; } 50% { width: 100%; left: 0%; } 100% { width: 0%; left: 100%; } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .glass { background: rgba(255, 255, 255, 0.75); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        @media print { .fixed, header, button { display: none !important; } main { padding: 0 !important; } .max-w-6xl, .max-w-5xl { max-width: 100% !important; } }
      `}</style>
    </div>
  );
};

export default App;
