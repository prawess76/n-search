import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Phone,
  Bookmark,
  Share2,
  Copy,
  Check,
  ChevronRight,
  RefreshCw,
  Building2,
  Info,
  MapPin,
  ExternalLink,
  PhoneCall,
  Menu,
  X,
  Star,
  Users,
  Grid,
  Sparkles,
  HelpCircle
} from "lucide-react";

interface Department {
  code: string;
  name: string;
  level: number;
}

interface Employee {
  department: string;
  team?: string;
  position: string;
  phone: string;
  task: string;
}

interface SavedBookmark {
  id: string; // generated from dept+position+phone
  department: string;
  position: string;
  phone: string;
  task: string;
}

export default function App() {
  // State variables
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptCode, setSelectedDeptCode] = useState<string>("");
  const [selectedDeptName, setSelectedDeptName] = useState<string>("");
  const [deptSearchQuery, setDeptSearchQuery] = useState<string>("");
  const [searchWord, setSearchWord] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [deptsLoading, setDeptsLoading] = useState<boolean>(false);
  const [searchMode, setSearchMode] = useState<"keyword" | "department">("keyword");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [extractedInfo, setExtractedInfo] = useState<{
    original: string;
    extracted: string;
    method: "gemini" | "heuristic" | "direct" | "fallback";
  } | null>(null);

  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Record<string, boolean>>({});
  const [extractionMethod, setExtractionMethod] = useState<"gemini" | "heuristic" | "direct" | "fallback" | "">("");
  const [originalSentence, setOriginalSentence] = useState<string>("");
  
  // Local storage bookmarks for frequent contacts
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>(() => {
    const saved = localStorage.getItem("nyj_bookmarks");
    return saved ? JSON.parse(saved) : [];
  });

  const [activeTab, setActiveTab] = useState<"search" | "favorites" | "guide">("search");
  const [selectedOffice, setSelectedOffice] = useState<"office1" | "office2">("office1");
  const [addressCopied, setAddressCopied] = useState<boolean>(false);

  // Load departments on startup
  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    setDeptsLoading(true);
    try {
      const res = await fetch("/api/departments");
      const data = await res.json();
      if (data.success) {
        setDepartments(data.departments);
      }
    } catch (err) {
      console.error("Failed to fetch departments", err);
    } finally {
      setDeptsLoading(false);
    }
  };

  // Run dynamic search to extract candidate keywords first without immediately selecting or searching them
  const handleKeywordSearch = async (kw: string) => {
    if (!kw.trim()) return;
    
    // Automatic redirection for location & mapping related queries
    if (["위치", "지도", "주소", "가는길", "가는 길", "오시는길", "오시는 길", "약도", "오오는길", "청사"].some(term => kw.toLowerCase().includes(term))) {
      setActiveTab("guide");
      setSearchWord(kw);
      return;
    }

    setLoading(true);
    setSearchMode("keyword");
    setActiveTab("search");
    setExtractedInfo(null); // Clear single keyword fallback context

    try {
      // 1. First extract candidate keywords from sentence
      const extractRes = await fetch(`/api/extract-keywords?text=${encodeURIComponent(kw)}`);
      const extractData = await extractRes.json();
      
      if (extractData.success && extractData.extracted && extractData.extracted.length > 0) {
        setOriginalSentence(kw);
        setExtractedKeywords(extractData.extracted);
        setExtractionMethod(extractData.method);
        
        // Fulfilling "키워드 선택이 먼저 이루어지지 말고": start with NO pre-selected keywords
        setSelectedKeywords({});
        // Clear results list so they can choose and click search
        setSearchResults([]);
      } else {
        // Fallback or direct input handling
        setOriginalSentence(kw);
        setExtractedKeywords([kw]);
        setExtractionMethod("fallback");
        // Start with no elements selected
        setSelectedKeywords({});
        setSearchResults([]);
      }
    } catch (err) {
      console.error("Failed to extract or search keywords", err);
    } finally {
      setLoading(false);
    }
  };

  // Only toggle checkbox status without running search on click
  const toggleKeyword = (word: string) => {
    setSelectedKeywords((prev) => ({
      ...prev,
      [word]: !prev[word]
    }));
  };

  // Perform actual search with chosen keywords when search button is clicked
  const handleSelectedKeywordsSearch = async () => {
    const activeKeywords = Object.keys(selectedKeywords).filter(k => selectedKeywords[k]);
    if (activeKeywords.length === 0) {
      return;
    }

    setLoading(true);
    try {
      const queryStr = activeKeywords.join(",");
      const res = await fetch(`/api/search?keyword=${encodeURIComponent(queryStr)}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error("Failed to search with updated keywords", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeptSearch = async (code: string, name: string) => {
    setSelectedDeptCode(code);
    setSelectedDeptName(name);
    setSearchMode("department");
    setExtractedInfo(null);
    setExtractedKeywords([]);
    setSelectedKeywords({});
    setOriginalSentence("");
    setLoading(true);
    setActiveTab("search");
    try {
      const res = await fetch(`/api/search?deptCode=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error("Failed to search department", err);
    } finally {
      setLoading(false);
    }
  };

  // Trigger search on submit
  const handleFormSearch = (e: React.FormEvent) => {
    e.preventDefault();
    handleKeywordSearch(searchWord);
  };

  // Favorites/bookmark logic
  const toggleBookmark = (emp: Employee) => {
    const id = `${emp.department}-${emp.position}-${emp.phone}`;
    const exists = bookmarks.some((b) => b.id === id);

    let updated: SavedBookmark[];
    if (exists) {
      updated = bookmarks.filter((b) => b.id !== id);
    } else {
      updated = [
        ...bookmarks,
        {
          id,
          department: emp.department,
          position: emp.position,
          phone: emp.phone,
          task: emp.task
        }
      ];
    }
    setBookmarks(updated);
    localStorage.setItem("nyj_bookmarks", JSON.stringify(updated));
  };

  // Copy to clipboard helper
  const copyContact = (emp: Employee | SavedBookmark, event: React.MouseEvent) => {
    event.stopPropagation();
    const id = `${emp.department}-${emp.position}-${emp.phone}`;
    const text = `[남양주시청 연락처]\n소속: ${emp.department}\n직위: ${emp.position}\n전화번호: ${emp.phone}\n담당업무: ${emp.task}`;
    
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Filter departments list on the client side
  const filteredDepartments = useMemo(() => {
    if (!deptSearchQuery.trim()) return departments;
    return departments.filter((d) =>
      d.name.toLowerCase().includes(deptSearchQuery.toLowerCase())
    );
  }, [departments, deptSearchQuery]);

  // Frequently used keywords for easy tagging
  const quickTags = ["여권", "주차", "지방세", "세무", "복지", "기획", "예산", "체육", "건축", "도로", "교통", "농업", "보건소", "청년"];

  return (
    <div className="min-h-screen bg-brand-bg text-slate-800 font-sans flex flex-col" id="app_root">
      
      {/* Top Header conforming to Professional Polish theme */}
      <header className="bg-primary-brand text-white px-6 md:px-8 h-[70px] flex items-center justify-between shadow-md shrink-0 sticky top-0 z-35" id="app_header">
        <div className="flex items-center gap-3">
          {/* Logo item in professional design */}
          <div className="w-8 h-8 bg-white rounded-xs flex items-center justify-center text-primary-brand font-bold text-[20px] select-none shadow-sm">
            N
          </div>
          <div className="font-bold text-[18px] tracking-tight hidden sm:block">
            남양주시청 직원 찾기
          </div>
          <div className="font-bold text-[15px] tracking-tight sm:hidden">
            남양주 직원찾기
          </div>
        </div>

        {/* Search header bar - directly binding to search state */}
        <form onSubmit={handleFormSearch} className="hidden md:flex items-center bg-white/15 hover:bg-white/20 focus-within:bg-white/20 transition-colors duration-150 rounded px-3 py-1.5 w-[330px] lg:w-[450px]" id="header_search_form">
          <input
            type="text"
            className="bg-transparent border-0 text-white w-full px-2 py-1 outline-hidden text-sm placeholder-white/70 font-medium"
            placeholder="부서명, 이름, 또는 담당 업무를 입력하세요..."
            value={searchWord}
            onChange={(e) => setSearchWord(e.target.value)}
          />
          <button type="submit" className="text-white hover:scale-110 active:scale-95 transition-transform p-1 cursor-pointer" title="검색">
            <Search className="w-4 h-4" />
          </button>
        </form>

        {/* Right action control */}
        <div className="flex items-center gap-4 text-xs md:text-sm font-medium">
          <button
            onClick={() => {
              setActiveTab("favorites");
            }}
            className={`flex items-center gap-1.5 hover:opacity-100 transition-opacity cursor-pointer ${
              activeTab === "favorites" ? "opacity-100 text-amber-300 font-bold" : "opacity-85 text-slate-100"
            }`}
          >
            <Star className={`w-4 h-4 ${bookmarks.length > 0 ? "fill-amber-300 text-amber-300" : ""}`} />
            <span>즐겨찾기 ({bookmarks.length})</span>
          </button>
          
          <button
            onClick={() => {
              setActiveTab("guide");
            }}
            className={`hover:opacity-100 transition-opacity cursor-pointer hidden sm:inline ${
              activeTab === "guide" ? "opacity-100 text-white font-bold underline" : "opacity-85 text-slate-100"
            }`}
          >
            이용안내
          </button>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-1.5 bg-white/15 hover:bg-white/20 rounded-md text-white transition-colors"
            title="조직도 메뉴"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main layout: Sidebar + Stage */}
      <div className="flex-1 flex overflow-hidden relative" id="layout_body">
        
        {/* Sidebar Organization list */}
        <aside
          id="sidebar"
          className={`absolute md:relative top-0 left-0 bottom-0 w-[260px] bg-white border-r border-[#cbd5e1] flex flex-col z-20 transition-transform duration-300 md:translate-x-0 shrink-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          } h-[calc(100vh-70px)] md:h-auto`}
        >

        {/* Quick Filter Section */}
        <div className="p-4 border-b border-[#cbd5e1]" id="dept_search_box">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-bold text-[#64748b] tracking-wider uppercase">조직도 안내</span>
            {deptSearchQuery && (
              <button
                onClick={() => setDeptSearchQuery("")}
                className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
              >
                필터해제
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="부서 필터 (예: 홍보, 안전)..."
              value={deptSearchQuery}
              onChange={(e) => setDeptSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-2 bg-[#f4f7f9] border border-[#cbd5e1] rounded focus:outline-hidden focus:border-primary-brand focus:bg-white transition-all text-slate-800 font-medium"
            />
          </div>
        </div>

        {/* Scrolling department directory */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1" id="dept_list_scroller">
          {deptsLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-primary-brand" />
              <span className="text-xs">데이터 로딩 중...</span>
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              매칭 부서 없음
            </div>
          ) : (
            <ul className="space-y-1 list-none p-0 m-0">
              {/* Reset button inside list */}
              <li
                onClick={() => {
                  setSelectedDeptCode("");
                  setSelectedDeptName("");
                  setSearchResults([]);
                  setSearchWord("");
                  setActiveTab("search");
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                className={`px-3 py-2 rounded text-xs font-semibold cursor-pointer flex items-center gap-2 transition-colors duration-150 ${
                  !selectedDeptCode && searchMode !== "keyword"
                    ? "bg-[#e0e7ff] text-primary-brand font-bold"
                    : "text-[#333] hover:bg-slate-100"
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>전체보기</span>
              </li>

              {filteredDepartments.map((dept, index) => {
                const isSelected = selectedDeptCode === dept.code;
                // Formatting indentation or styles depending on hierarchy level
                const indentStyle =
                  dept.level === 1
                    ? "font-semibold border-l-2 border-slate-300"
                    : dept.level === 2
                    ? "pl-4 text-[13px] border-l-2 border-slate-100"
                    : "pl-6 text-xs";

                return (
                  <li
                    key={`${dept.code}-${index}`}
                    onClick={() => {
                      handleDeptSearch(dept.code, dept.name);
                      if (window.innerWidth < 768) {
                        setSidebarOpen(false);
                      }
                    }}
                    className={`px-3 py-2 rounded text-xs cursor-pointer flex items-center justify-between transition-colors duration-150 ${indentStyle} ${
                      isSelected
                        ? "bg-[#e0e7ff] text-primary-brand font-bold"
                        : "text-[#333] hover:bg-slate-100"
                    }`}
                  >
                    <span className="truncate flex items-center gap-1.5">
                      {dept.level === 1 && <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      {dept.name}
                    </span>
                    <ChevronRight className={`w-3 h-3 text-slate-300 shrink-0 ${isSelected ? "text-primary-brand" : ""}`} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Quick link tags label */}
        <div className="p-4 border-t border-[#cbd5e1] bg-slate-50 text-[11px] text-[#64748b]">
          <div className="font-semibold text-slate-700 mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            시청 대표 민원 센터
          </div>
          <div className="font-bold text-[#004c98] text-sm font-mono p-1 bg-slate-100/50 rounded inline-block">031-590-2114</div>
          <a
            href="https://www.nyj.go.kr/www/contents.do?key=2534"
            target="_blank"
            rel="noreferrer"
            className="text-primary-brand hover:underline inline-flex items-center gap-0.5 mt-2 font-semibold"
          >
            공식 직원조회 바로가기 <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </aside>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-5 md:p-6 flex flex-col gap-5 min-w-0 bg-[#f4f7f9]" id="content_stage">
          
          {/* Breadcrumb path displaying current location */}
          <div className="breadcrumb text-xs text-[#64748b]" id="current_breadcrumb">
            조직도 &gt; {selectedDeptName ? `${selectedDeptName}` : "전체보기"}
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-[#cbd5e1] pb-3" id="stage_title">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 m-0">
                {selectedDeptName ? selectedDeptName : "부서 및 민원 담당자 찾기"}
                {searchResults.length > 0 && (
                  <span className="font-medium text-sm text-[#64748b] ml-2">
                    총 {searchResults.length}명 검색됨
                  </span>
                )}
              </h2>
            </div>
            
            {/* Quick action info badge */}
            <div className="text-[13px] text-[#004c98] font-bold select-none bg-blue-50 border border-blue-200 px-3 py-1 rounded">
              내선번호 안내 (031-590-XXXX)
            </div>
          </div>

          {/* Sub Navigation Panel */}
          <div className="flex border-b border-[#cbd5e1] gap-1 md:gap-2 overflow-x-auto shrink-0 scrollbar-none" id="sub_navigation_panel">
            <button
              onClick={() => setActiveTab("search")}
              className={`px-4 py-2.5 text-xs font-bold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeTab === "search"
                  ? "text-slate-900 border-b-2 border-primary-brand bg-white/70 rounded-t"
                  : "text-[#64748b] hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-[#004c98]" />
                <span>연락처 검색 & 임직원 조직도</span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab("favorites")}
              className={`px-4 py-2.5 text-xs font-bold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeTab === "favorites"
                  ? "text-slate-900 border-b-2 border-primary-brand bg-white/70 rounded-t"
                  : "text-[#64748b] hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Star className={`w-3.5 h-3.5 ${bookmarks.length > 0 ? "text-amber-500 fill-amber-500" : "text-[#64748b]"}`} />
                <span>자주 쓰는 연락처 ({bookmarks.length})</span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab("guide")}
              className={`px-4 py-2.5 text-xs font-bold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeTab === "guide"
                  ? "text-slate-900 border-b-2 border-primary-brand bg-white/70 rounded-t"
                  : "text-[#64748b] hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-[#004c98]" />
                <span>시청 안내 및 가이드</span>
              </span>
            </button>
          </div>

          <AnimatePresence mode="wait">
            
            {/* TAB 1: Search View */}
            {activeTab === "search" && (
              <motion.div
                key="search_view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-5 flex-1 flex flex-col"
              >
                {/* Search Bar section */}
                <div className="bg-white rounded-lg border border-[#cbd5e1] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] relative overflow-hidden" id="workspace_search_pane">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#004c98]" />
                  
                  <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#004c98]" />
                    <span>필요하신 민원 업무를 입력해 어시스턴트를 활용해 보세요</span>
                  </h3>
                  <p className="text-xs text-[#64748b] mb-4 leading-relaxed">
                    여권 발급, 주차 딱지, 주민등록등본, 환경정화, 자동차 등록, 체육시설 대여 등 담당 주무관의 정확한 내선 연락처를 파악할 수 있습니다.
                  </p>

                  <form onSubmit={handleFormSearch} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="찾으실 업무 키워드를 입력해 전화번호를 찾아보세요..."
                        value={searchWord}
                        onChange={(e) => setSearchWord(e.target.value)}
                        className="w-full text-xs pl-10 pr-4 py-2.5 bg-[#f4f7f9] border border-[#cbd5e1] focus:border-primary-brand focus:bg-white rounded focus:outline-hidden transition-all text-slate-800 font-medium"
                      />
                      {searchWord && (
                        <button
                          type="button"
                          onClick={() => setSearchWord("")}
                          className="absolute right-3.5 top-2.5 text-xs text-[#64748b] hover:text-slate-800 font-bold"
                        >
                          지우기
                        </button>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !searchWord.trim()}
                      className="px-5 py-2.5 bg-[#004c98] hover:bg-[#003b75] disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-semibold rounded cursor-pointer transition-colors flex items-center justify-center gap-1"
                    >
                      {loading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>부서원 검색</span>
                    </button>
                  </form>

                  {/* Frequently encountered hashtags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-slate-100">
                    <span className="text-xs text-[#64748b] font-medium whitespace-nowrap mr-1 flex items-center gap-0.5 select-none">
                      <Grid className="w-3.5 h-3.5 text-slate-400" />
                      자주 찾는 가이드 태그:
                    </span>
                    {quickTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => {
                          setSearchWord(tag);
                          handleKeywordSearch(tag);
                        }}
                        className="text-xs font-medium px-2 py-1 bg-slate-100 hover:bg-blue-100/50 text-slate-600 hover:text-primary-brand rounded transition-colors cursor-pointer"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>

                </div>

                {/* Main results board */}
                <div className="flex-1 flex flex-col min-h-[300px]">
                  
                  {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
                      <div className="relative">
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-primary-brand rounded-full animate-spin"></div>
                        <Building2 className="w-5 h-5 text-[#004c98] absolute top-3.5 left-3.5 animate-pulse" />
                      </div>
                      <div className="text-center font-sans">
                        <p className="text-sm font-bold text-slate-800">남양주시청 통신망 원격 연결 중...</p>
                        <p className="text-xs text-[#64748b] mt-1">실시간 공식 부서 및 담당자 데이터베이스를 동기화하고 있습니다.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 flex-1 flex flex-col">
                      
                      {/* Interactive Multi-Keyword Selection Control Panel */}
                      {extractedKeywords.length > 0 && (
                        <div id="ai-multikeyword-panel" className="bg-[#f0f9ff] border border-blue-200 rounded-xl px-5 py-4 text-xs text-slate-700 space-y-3.5 shadow-xs text-left mb-1">
                          <div className="flex items-center justify-between gap-1 border-b border-blue-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base select-none">✨</span>
                              <div>
                                <p className="font-bold text-[#1e40af] text-sm">
                                  AI 문장 분석 &amp; 키워드 복수 선택
                                </p>
                                {originalSentence && (
                                  <p className="text-[10.5px] text-[#2563eb] font-medium leading-normal mt-0.5 max-w-[280px] sm:max-w-md md:max-w-xl truncate">
                                    &ldquo;{originalSentence}&rdquo;
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className="text-[9.5px] font-extrabold px-2 py-0.5 bg-[#dbeafe] text-[#1d4ed8] rounded-full uppercase tracking-wider scale-90 font-sans">
                              {extractionMethod === "gemini" ? "Gemini NLP" : extractionMethod === "heuristic" ? "Dynamic NLP" : "Custom"}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <p className="text-[11.5px] font-semibold text-slate-700 m-0">
                              💡 아래 추출된 추천 단어들을 직접 선택(중복 가능)하고 검색 버튼을 눌러 정확한 내선 연락처를 불러오세요:
                            </p>
                            
                            <div className="flex flex-wrap gap-2 pt-1">
                              {extractedKeywords.map((word) => {
                                const isChecked = !!selectedKeywords[word];
                                return (
                                  <button
                                    key={word}
                                    type="button"
                                    onClick={() => toggleKeyword(word)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-150 ${
                                      isChecked
                                        ? "bg-[#1d4ed8] text-white hover:bg-[#1e40af] shadow-xs active:scale-95"
                                        : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 active:scale-95"
                                    }`}
                                  >
                                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                                      isChecked ? "bg-white text-[#1d4ed8]" : "border border-slate-300 text-transparent"
                                    }`}>
                                      ✓
                                    </span>
                                    <span>{word}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-blue-100/60">
                            <div className="text-[11px] text-[#4b5563]">
                              현재 선택된 키워드: <strong className="text-[#1d4ed8]">{Object.keys(selectedKeywords).filter(k => selectedKeywords[k]).join(", ") || "(없음)"}</strong>
                            </div>
                            
                            <button
                              type="button"
                              onClick={handleSelectedKeywordsSearch}
                              disabled={loading || Object.keys(selectedKeywords).filter(k => selectedKeywords[k]).length === 0}
                              className="px-4 py-2 bg-[#004c98] hover:bg-[#003b75] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-lg cursor-pointer disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md"
                            >
                              <Search className="w-3 text-white" />
                              <span>선택 키워드로 부서원 통합 검색</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {searchResults.length > 0 ? (
                        <div className="space-y-4">
                          {/* Search Results Summary Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white px-4 py-3 rounded border border-[#cbd5e1] gap-2 text-left">
                            <span className="text-[13px] text-[#333] font-medium flex items-center gap-1.5">
                              {searchMode === "keyword" ? (
                                <>
                                  <Search className="w-4 h-4 text-primary-brand" />
                                  <span>선택 키워드 통합 검색 결과: <strong className="text-primary-brand font-bold">{searchResults.length}건</strong></span>
                                </>
                              ) : (
                                <>
                                  <Building2 className="w-4 h-4 text-primary-brand text-slate-500" />
                                  <span>부서 소속 직원 명단: <strong className="text-primary-brand font-bold">{searchResults.length}명</strong></span>
                                </>
                              )}
                            </span>
                            
                            {(selectedDeptCode || searchWord || extractedKeywords.length > 0) && (
                              <button
                                onClick={() => {
                                  setSelectedDeptCode("");
                                  setSelectedDeptName("");
                                  setSearchResults([]);
                                  setSearchWord("");
                                  setExtractedInfo(null);
                                  setExtractedKeywords([]);
                                  setSelectedKeywords({});
                                  setOriginalSentence("");
                                }}
                                className="text-xs text-red-500 hover:text-red-700 hover:underline font-semibold cursor-pointer"
                              >
                                초기 상태로 리셋
                              </button>
                            )}
                          </div>

                          {/* Contact cards Grid list */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="employee_results_grid">
                            {searchResults.map((emp, index) => {
                              const contactId = `${emp.department}-${emp.position}-${emp.phone}`;
                              const isBookmarked = bookmarks.some((b) => b.id === contactId);
                              const isCopied = copiedId === contactId;

                              return (
                                <motion.div
                                  key={contactId + index}
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.1, delay: Math.min(index * 0.015, 0.15) }}
                                  className="bg-white border border-[#cbd5e1] rounded-lg p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md hover:border-slate-300 transition-all duration-150 flex flex-col justify-between gap-4 text-left"
                                >
                                  <div>
                                    <div className="flex justify-between items-start gap-2">
                                      <div className="space-y-1">
                                        <h3 className="text-md font-bold text-slate-800 m-0 tracking-tight flex items-center gap-1">
                                          {emp.position.split(" ")[0]}
                                          {emp.position.includes("(") && (
                                            <span className="text-xs text-[#64748b] font-normal">
                                              {emp.position.slice(emp.position.indexOf("("))}
                                            </span>
                                          )}
                                        </h3>
                                        <span className="text-[11px] font-semibold text-primary-brand bg-[#e0e7ff] px-2 py-0.5 rounded border border-[#cbd5e1] inline-block font-sans">
                                          {emp.department}
                                        </span>
                                      </div>

                                      {/* Quick Star & Copy Action */}
                                      <div className="flex gap-1 shrink-0">
                                        <button
                                          onClick={() => toggleBookmark(emp)}
                                          className={`p-1.5 rounded border transition-colors cursor-pointer ${
                                            isBookmarked
                                              ? "bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-500"
                                              : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-600"
                                          }`}
                                          title={isBookmarked ? "즐겨찾기에서 제거" : "즐겨찾기에 등록"}
                                        >
                                          <Star className={`w-3.5 h-3.5 ${isBookmarked ? "fill-amber-400 text-amber-500" : ""}`} />
                                        </button>

                                        <button
                                          onClick={(e) => copyContact(emp, e)}
                                          className={`p-1.5 rounded border transition-colors cursor-pointer ${
                                            isCopied
                                              ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                              : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-800"
                                          }`}
                                          title="정보 복사"
                                        >
                                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                                        </button>
                                      </div>
                                    </div>

                                    {/* Contact lines with icon boxes */}
                                    <div className="space-y-2 mt-4">
                                      {emp.phone && emp.phone !== "-" ? (
                                        <a
                                          href={`tel:${emp.phone}`}
                                          className="flex items-center gap-2 text-[13px] text-slate-600 hover:text-primary-brand transition-colors group/link"
                                        >
                                          <div className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded text-xs text-slate-500 group-hover/link:bg-blue-50 group-hover/link:text-primary-brand shrink-0 select-none font-sans font-medium">
                                            📞
                                          </div>
                                          <span className="font-mono font-bold text-slate-700">{emp.phone}</span>
                                        </a>
                                      ) : (
                                        <div className="flex items-center gap-2 text-[13px] text-slate-400">
                                          <div className="w-6 h-6 flex items-center justify-center bg-slate-50 rounded text-xs shrink-0 select-none">
                                            📞
                                          </div>
                                          <span className="italic font-sans">연락처 미등록</span>
                                        </div>
                                      )}

                                      <div className="flex items-center gap-2 text-[13px] text-slate-600">
                                        <div className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded text-xs text-slate-500 shrink-0 select-none">
                                          📍
                                        </div>
                                        <span className="truncate text-slate-600 font-medium">
                                          {emp.department} {emp.team ? `> ${emp.team}` : ""}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Task Badge description block to fill background */}
                                  <div className="mt-2 bg-[#f8fafc] border border-[#e2e8f0] rounded p-3 text-xs text-[#64748b] leading-relaxed font-sans min-h-[56px] flex items-center">
                                    {emp.task || "부서 행정 총업무 지원 및 관할 민원 상담"}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        // Initial State or No Results View
                        <div className="flex-1 flex flex-col items-center justify-center bg-white border border-dashed border-[#cbd5e1] rounded-lg py-16 px-6 text-slate-400 text-center gap-3">
                          <div className="w-12 h-12 bg-[#f4f7f9] border border-[#cbd5e1] rounded-full flex items-center justify-center text-slate-300 shadow-inner">
                            <Users className="w-6 h-6 text-[#004c98]" />
                          </div>
                          <div>
                            {extractedKeywords.length > 0 ? (
                              <>
                                <h4 className="font-bold text-slate-700 text-sm">추천 검색 키워드가 준비되었습니다</h4>
                                <p className="text-xs text-[#64748b] mt-1.5 max-w-sm mx-auto leading-relaxed">
                                  위의 푸른색 분석 패널 단어 중 원하는 부서 검색 대상 단어들을 체크한 후, <strong className="text-primary-brand font-bold">[선택 키워드로 부서원 통합 검색]</strong> 버튼을 클릭하시면 실시간 행정 연락 구좌 검색을 조회하실 수 있습니다.
                                </p>
                              </>
                            ) : searchWord ? (
                              <>
                                <h4 className="font-bold text-slate-700 text-sm">일치하는 연락처 정보를 찾을 수 없습니다.</h4>
                                <p className="text-xs text-[#64748b] mt-1 max-w-sm mx-auto">
                                  다른 검색어를 입력해 보시거나, 왼쪽의 조직도 부서 목록 필터에서 원하시는 부서를 클릭해 자세한 전체 소속 팀 목록을 확인해 보세요.
                                </p>
                              </>
                            ) : (
                              <>
                                <h4 className="font-bold text-slate-700 text-sm">남양주시청 연락처 검색 어시스턴트</h4>
                                <p className="text-xs text-[#64748b] mt-1 max-w-md mx-auto leading-relaxed">
                                  검색 상단바에 찾고 계신 민원(예: "주택소유", "취득세") 혹은 이름을 직접 기입하시거나, 왼편 조직도 트리 구조에서 특정 과명을 찾아 클릭하시면 실시간 연락 구좌가 바인딩됩니다.
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </motion.div>
            )}

            {/* TAB 2: Favorites / Bookmark view */}
            {activeTab === "favorites" && (
              <motion.div
                key="favorites_tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="bg-amber-50/40 border border-amber-200 p-4 rounded flex items-start gap-3 text-left animate-fade-in">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-500 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">자주 이용하시는 남양주시청 연락 메모처</h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      매번 검색하거나 부서를 브라우징할 필요 없이, 해당 담당관 카드의 별 ★ 아이콘을 누르면 기기 내부 저장소에 안전하게 즐겨찾기로 정형 연계됩니다.
                    </p>
                  </div>
                </div>

                {bookmarks.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 border border-dashed border-[#cbd5e1] rounded bg-white flex flex-col items-center gap-2 animate-fade-in">
                    <Star className="w-10 h-10 text-slate-200" />
                    <div>
                      <p className="text-slate-600 font-bold text-sm">등록된 즐겨찾는 연락처가 존재하지 않습니다.</p>
                      <p className="text-xs text-[#64748b] mt-0.5">원하는 매칭 카드 주무관 우측의 별표를 클릭하세요.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="employee_favorites_grid">
                    {bookmarks.map((bm) => {
                      const isCopied = copiedId === bm.id;

                      return (
                        <div
                          key={bm.id}
                          className="bg-white border-l-[4px] border-l-amber-400 border-y border-r border-[#cbd5e1] rounded-r p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col justify-between gap-4 text-left animate-fade-in"
                        >
                          <div>
                            <div className="flex justify-between items-start gap-2">
                              <div className="space-y-1">
                                <h3 className="text-md font-bold text-slate-800 m-0 tracking-tight flex items-center gap-1">
                                  {bm.position.split(" ")[0]}
                                  {bm.position.includes("(") && (
                                    <span className="text-xs text-[#64748b] font-normal">
                                      {bm.position.slice(bm.position.indexOf("("))}
                                    </span>
                                  )}
                                </h3>
                                <span className="text-[11px] font-semibold text-primary-brand bg-[#e0e7ff] px-2 py-0.5 rounded border border-[#cbd5e1] inline-block font-sans">
                                  {bm.department}
                                </span>
                              </div>

                              {/* Remove and Copy Actions */}
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => toggleBookmark(bm as any)}
                                  className="p-1.5 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-500 cursor-pointer"
                                  title="즐겨찾기 삭제"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={(e) => copyContact(bm, e)}
                                  className={`p-1.5 rounded border transition-colors cursor-pointer ${
                                    isCopied
                                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-800"
                                  }`}
                                  title="정보 복사"
                                >
                                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                                </button>
                              </div>
                            </div>

                            {/* Info Rows */}
                            <div className="space-y-2 mt-4">
                              {bm.phone && bm.phone !== "-" ? (
                                <a
                                  href={`tel:${bm.phone}`}
                                  className="flex items-center gap-2 text-[13px] text-slate-600 hover:text-primary-brand transition-colors group/link"
                                >
                                  <div className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded text-xs text-slate-500 group-hover/link:bg-blue-50 group-hover/link:text-primary-brand shrink-0 select-none font-sans font-medium">
                                    📞
                                  </div>
                                  <span className="font-mono font-bold text-slate-700">{bm.phone}</span>
                                </a>
                              ) : (
                                <div className="flex items-center gap-2 text-[13px] text-slate-400">
                                  <div className="w-6 h-6 flex items-center justify-center bg-slate-50 rounded text-xs shrink-0 select-none">
                                    📞
                                  </div>
                                  <span className="italic font-sans">연락처 미등록</span>
                                </div>
                              )}

                              <div className="flex items-center gap-2 text-[13px] text-slate-600">
                                <div className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded text-xs text-slate-500 shrink-0 select-none">
                                  📍
                                </div>
                                <span className="truncate text-slate-600 font-medium">
                                  {bm.department} {bm.team ? `> ${bm.team}` : ""}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 bg-[#f8fafc] border border-[#e2e8f0] rounded p-3 text-xs text-[#64748b] leading-relaxed font-sans min-h-[56px] flex items-center">
                            {bm.task || "부서 행정 총업무 지원 및 관할 민원 상담"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: Guide info view */}
            {activeTab === "guide" && (
              <motion.div
                key="guide_tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white rounded border border-[#cbd5e1] p-6 space-y-6 text-left animate-fade-in"
              >
                <div>
                  <h3 className="text-md font-bold text-slate-900 border-b border-slate-200 pb-3 flex items-center gap-2">
                    <Info className="w-5 h-5 text-[#004c98]" />
                    <span>남양주시청 직원 연락처 검색 도우미 가이드</span>
                  </h3>
                  <div className="mt-4 space-y-4 text-xs text-slate-600 leading-relaxed font-sans">
                    
                    <div className="flex gap-2.5">
                      <div className="w-5 h-5 rounded bg-blue-50 border border-blue-200 text-[#004c98] text-[11px] font-bold flex items-center justify-center shrink-0">1</div>
                      <div>
                        <strong className="text-slate-800 block text-xs font-semibold">데이터 동기화 및 신뢰성</strong>
                        <p className="mt-0.5">
                          본 도구는 남양주시 공식 열린포털 '부서 및 직원검색' 웹서비스(키값 2534)의 공공 조회 데이터를 실시간 변환 및 분석하는 프록시 어시스턴트입니다. 허구의 정보가 일체 침투하지 못하는 순수 보증 테이블을 구성하여 내재합니다.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="w-5 h-5 rounded bg-blue-50 border border-blue-200 text-[#004c98] text-[11px] font-bold flex items-center justify-center shrink-0">2</div>
                      <div>
                        <strong className="text-slate-800 block text-xs font-semibold">동적인 하이브리드 검색체계</strong>
                        <p className="mt-0.5">
                          <strong>업무 키워드 질의:</strong> 상단 다용도 제어판에 직역 혹은 단어(예: 여권, 주차, 취득세)를 기입하시면 담당 유무를 지닌 모든 부서원 사원 정보와 내선 번호가 일괄 대조 배열됩니다.<br />
                          <strong>계층식 조직망 탐색:</strong> 좌측 패널에 연동된 총 145개의 과단위 부처 목록을 직접 선택하시면, 해당 소속 팀 전체 명단과 담당 업무가 표 형상으로 즉각 복구 정제 출력됩니다.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <div className="w-5 h-5 rounded bg-blue-50 border border-blue-200 text-[#004c98] text-[11px] font-bold flex items-center justify-center shrink-0">3</div>
                      <div>
                        <strong className="text-slate-800 block text-xs font-semibold">퀵 다이얼 기능 및 복사 지원물</strong>
                        <p className="mt-0.5">
                          전화 걸기 단추 클릭 시 모바일 통신 장치를 통한 즉시 다이얼링이 개시되며, 클립보드 정보 복사를 통해 카카오톡 혹은 협업 툴로 연락 정보 원격 전달이 간편합니다.
                        </p>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="bg-white border border-[#cbd5e1] rounded-2xl shadow-sm overflow-hidden" id="cityhall-location-section">
                  {/* Title Bar */}
                  <div className="bg-slate-50 border-b border-[#cbd5e1] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-[#004c98]">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 m-0 leading-tight">남양주시청 청사별 오시는 길 & 대표 위치 안내</h4>
                        <p className="text-[11px] text-slate-500 m-0 mt-0.5">대중교통 안내, 주차 요금 정보 및 주요 시설 위치를 조회합니다.</p>
                      </div>
                    </div>
                    {/* Switcher Buttons */}
                    <div className="flex bg-slate-200/60 p-1 rounded-lg self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedOffice("office1")}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          selectedOffice === "office1"
                            ? "bg-white text-[#004c98] shadow-xs"
                            : "text-[#64748b] hover:text-slate-800"
                        }`}
                      >
                        제1청사 (금곡동 본관)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedOffice("office2")}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          selectedOffice === "office2"
                            ? "bg-white text-[#004c98] shadow-xs"
                            : "text-[#64748b] hover:text-slate-800"
                        }`}
                      >
                        제2청사 (다산동 별관)
                      </button>
                    </div>
                  </div>

                  {/* Dual Grid Layout */}
                  <div className="p-5 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: Metadata Details (7 columns) */}
                    <div className="lg:col-span-7 space-y-5">
                      {/* Address card &copy action */}
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-left relative overflow-hidden">
                        <div className="absolute top-0 left-0 bottom-0 w-1 bg-[#004c98]" />
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block mb-1">도로명 주소</span>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <p className="text-xs font-bold text-slate-800 leading-relaxed font-sans m-0">
                            {selectedOffice === "office1"
                              ? "경기도 남양주시 경춘로 1037 (금곡동)"
                              : "경기도 남양주시 다산지금로 16번길 85 (다산동)"}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const addr = selectedOffice === "office1" 
                                ? "경기도 남양주시 경춘로 1037 (금곡동)" 
                                : "경기도 남양주시 다산지금로 16번길 85 (다산동)";
                              navigator.clipboard.writeText(addr).then(() => {
                                setAddressCopied(true);
                                setTimeout(() => setAddressCopied(false), 2000);
                              });
                            }}
                            className={`px-3 py-1.5 border rounded-lg text-xs font-semibold cursor-pointer transition-colors shrink-0 flex items-center gap-1.5 ${
                              addressCopied
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {addressCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span>복사 완료</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                                <span>주소 복사</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Info Columns list */}
                      <div className="space-y-3">
                        {/* Subway Row */}
                        <div className="flex gap-3 text-left">
                          <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-150 flex items-center justify-center shrink-0 text-orange-600 text-xs font-bold">
                            지철
                          </div>
                          <div className="space-y-0.5 text-xs text-slate-600 leading-relaxed">
                            <strong className="text-slate-900 block font-semibold">지하철 연계망</strong>
                            {selectedOffice === "office1" ? (
                              <p className="m-0 text-[11px]">
                                <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-800 font-bold rounded text-[10px] mr-1 font-sans">경춘선</span>
                                <strong>금곡역 1번 출구</strong>에서 약 750m 이격 (도보로 약 11~14분 소요됩니다). 금곡역 앞 버스정류장(일반 93번, 168번 등)을 타고 1정거장 이동 후 남양주시청 정류장에서 하차하셔도 이동이 가능합니다.
                              </p>
                            ) : (
                              <p className="m-0 text-[11px]">
                                <span className="px-1.5 py-0.5 bg-blue-100 text-[#004c98] font-bold rounded text-[10px] mr-1 font-sans">경의중앙선</span>
                                <strong>도농역 2번 출구</strong>에서 대각선 반향으로 약 1.1km (도보 약 15~18분 소요됩니다). 도농역 앞에서 연계 버스(일반 34번, 38번, 76번 등)에 승차하여 <strong className="text-slate-800">남양주시청 제2청사.보건소</strong> 정류장에서 하차하시면 편리합니다.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Bus Row */}
                        <div className="flex gap-3 text-left">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-150 flex items-center justify-center shrink-0 text-emerald-600 text-xs font-bold">
                            버스
                          </div>
                          <div className="space-y-0.5 text-xs text-slate-600 leading-relaxed">
                            <strong className="text-slate-900 block font-semibold">시내 및 광역 버스 정류망</strong>
                            {selectedOffice === "office1" ? (
                              <p className="m-0 text-[11px]" id="transit_bus_info">
                                <strong className="text-slate-700 block mb-0.5 font-semibold">하차 정류소: 남양주시청 (정류소 ID: 23-145 / 23-146)</strong>
                                • 일반버스: 1-4, 30, 65, 65-1, 93, 165, 168, 55, 330-1<br />
                                • 직행좌석 및 광역: 1000, 1100, M2323, 1200, 1000-1, G2100 (잠실역 방면 연계)
                              </p>
                            ) : (
                              <p className="m-0 text-[11px]">
                                <strong className="text-slate-700 block mb-0.5 font-semibold">하차 정류소: 남양주시청 제2청사.보건소 (정류소 ID: 23-132 / 23-133)</strong>
                                • 일반버스: 34, 38, 76, 95, 96, 100<br />
                                • 직행좌석 및 광역: 1000-1, 3800, 1200, M2352
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Parking Row */}
                        <div className="flex gap-3 text-left">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-150 flex items-center justify-center shrink-0 text-indigo-600 text-xs font-bold font-sans">
                            🅿️
                          </div>
                          <div className="space-y-0.5 text-xs text-slate-600 leading-relaxed">
                            <strong className="text-slate-900 block font-semibold">자가용 차량 주차장 정보</strong>
                            {selectedOffice === "office1" ? (
                              <p className="m-0 text-[11px]">
                                • <strong>주차 요금 체계:</strong> 최초 60분 간 무료 제공, 이후 초과 10분당 300원씩 부과 (1일 최대 통합 한도액 10,000원)<br />
                                • <strong>운영 기간:</strong> 평일 09:00 ~ 18:00 (토/일요일 및 국공휴일은 민원 편의를 위해 무료 완전 개방)<br />
                                • <strong>주차 면적:</strong> 본관 앞 지상 지주식 주차장 및 본관 뒤 실내 입체 주차장 마련
                              </p>
                            ) : (
                              <p className="m-0 text-[11px]">
                                • <strong>주차 요금 체계:</strong> 최초 60분 무료, 이후 초과 10분당 200원 점증식 부과 (1일 최대 상한액 8,000원)<br />
                                • <strong>편의 지원:</strong> 제2청사는 다산 보건소 및 사법 법조 타운과 주차 인프라를 연계 운영하나, 민원 방문이 많으므로 부서 민원 시 가급적 대중교통 이용을 권장해 드립니다.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Dial Row */}
                        <div className="flex gap-3 text-left">
                          <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-150 flex items-center justify-center shrink-0 text-rose-600 text-xs font-bold">
                            전화
                          </div>
                          <div className="space-y-0.5 text-xs text-slate-600 leading-relaxed">
                            <strong className="text-slate-900 block font-semibold">대표 전화 회선 안내</strong>
                            <p className="m-0 text-[11px]">
                              • <strong>대표 주교환 기기번호:</strong> <a href="tel:031-590-2114" className="text-primary-brand font-bold underline font-mono">031-590-2114</a> (팩스 번호: 031-590-2119)<br />
                              • <strong>종합 업무 야간 당직 상담 센터:</strong> 031-590-2221 (평일 18:00 ~ 익일 09:00 및 주말 비상 운영)
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Map Action Links */}
                      <div className="pt-2 flex flex-wrap gap-2 justify-start">
                        <a
                          href={selectedOffice === "office1" 
                            ? "https://map.kakao.com/?urlX=546312&urlY=1148118&urlLevel=3&map_type=TYPE_MAP&map_hybrid=false&q=%EB%82%A8%EC%96%91%EC%A3%BC%EC%8B%9C%EC%B2%AD" 
                            : "https://map.kakao.com/?q=%EB%82%A8%EC%96%91%EC%A3%BC%EC%8B%9C%EC%B2%AD%20%EC%A0%9C2%EC%B2%AD%EC%82%AC"
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <span className="font-bold">Kakao</span>
                          <span>카카오맵 목적지 설정</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        
                        <a
                          href={selectedOffice === "office1" 
                            ? "https://map.naver.com/v5/search/%EB%82%A8%EC%96%91%EC%A3%BC%EC%8B%9C%EC%B2%AD" 
                            : "https://map.naver.com/v5/search/%EB%82%A8%EC%96%91%EC%A3%BC%EC%8B%9C%EC%B2%AD+%EC%A0%9C2%EC%B2%AD%EC%82%AC"
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 bg-[#03c75a] hover:bg-[#02b350] text-white font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <span className="font-bold">Naver</span>
                          <span>네이버 지도에서 보기</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Right: Beautiful Interactive CSS/SVG Schematic Map (5 columns) */}
                    <div className="lg:col-span-5 flex flex-col">
                      <div className="border border-slate-200 rounded-2xl bg-slate-50/50 p-4 shrink-0 flex-1 flex flex-col justify-between relative overflow-hidden min-h-[300px]">
                        <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center justify-between">
                          <span>🗺️ 시정로 오시는 길 약도</span>
                          <span className="text-[10px] text-primary-brand font-medium">* 주요 거점을 클릭해 보세요</span>
                        </div>

                        {/* Svg container */}
                        <div className="flex-1 bg-white rounded-xl border border-slate-100 p-2 relative flex items-center justify-center min-h-[220px]">
                          {selectedOffice === "office1" ? (
                            <svg viewBox="0 0 400 300" className="w-full h-full max-h-[260px] font-sans">
                              {/* Background subtle grids */}
                              <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.8" />
                              </pattern>
                              <rect width="400" height="300" fill="url(#grid-pattern)" rx="8" />

                              {/* Rail Track representing Gyeongchun line */}
                              <line x1="40" y1="50" x2="360" y2="50" stroke="#94a3b8" strokeWidth="6" strokeDasharray="6,4" />
                              <line x1="40" y1="50" x2="360" y2="50" stroke="#00b4d8" strokeWidth="1.5" />
                              <text x="360" y="42" className="fill-slate-400 font-bold text-[9px] text-anchor-end font-mono">경춘선 (Geumgok Line)</text>

                              {/* Gyeongchun Geumgok Station */}
                              <rect x="90" y="32" width="60" height="36" rx="4" fill="#0077b6" className="shadow-xs cursor-pointer hover:fill-[#005f9e] transition-colors" />
                              <text x="120" y="47" className="fill-white font-bold text-[10px] text-anchor-middle" textAnchor="middle">금곡역</text>
                              <text x="120" y="59" className="fill-cyan-100 font-medium text-[8px] text-anchor-middle" textAnchor="middle">Gyeongchun</text>

                              {/* Highway representing 경춘로 (Main road) */}
                              <path d="M 40 210 Q 200 210 360 210" stroke="#e2e8f0" strokeWidth="20" fill="none" />
                              <path d="M 40 210 Q 200 210 360 210" stroke="#cbd5e1" strokeWidth="18" strokeDasharray="8,6" fill="none" />
                              <text x="360" y="196" className="fill-slate-400 font-bold text-[9px] text-anchor-end" textAnchor="end">경춘로 (Gyeongchun-ro)</text>

                              {/* Pathway dotted walking route */}
                              <path d="M 120 68 L 120 150 L 260 150 L 260 190" stroke="#3b82f6" strokeWidth="3" strokeDasharray="4,4" fill="none" className="animate-pulse" />

                              {/* Route indicator line */}
                              <text x="175" y="142" className="fill-blue-600 font-semibold text-[9px] tracking-tight">도보 약 12분 (750m)</text>

                              {/* Landmark 2: Hong yureung Royal Tomb */}
                              <circle cx="80" cy="150" r="16" fill="#10b981" fillOpacity="0.15" stroke="#059669" strokeWidth="1" />
                              <text x="80" y="153" className="fill-emerald-800 font-extrabold text-[8px]" textAnchor="middle">홍유릉</text>

                              {/* Center Office 1 Main Building (금곡동 본관) */}
                              <g transform="translate(220, 164)" className="cursor-pointer hover:scale-105 transition-transform duration-150">
                                <rect x="0" y="10" width="84" height="42" rx="6" fill="#004c98" stroke="#003b75" strokeWidth="1.5" />
                                <text x="42" y="27" className="fill-white font-black text-[10px]" textAnchor="middle">南양주시청</text>
                                <text x="42" y="39" className="fill-blue-100 font-medium text-[8px]" textAnchor="middle">제1청사 (본관)</text>
                                <circle cx="42" cy="-2" r="5" fill="#f43f5e" className="animate-ping" />
                                <circle cx="42" cy="-2" r="4.5" fill="#e11d48" />
                              </g>

                              {/* Compass direction representation */}
                              <g transform="translate(45, 110)">
                                <circle cx="15" cy="15" r="14" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                                <line x1="15" y1="5" x2="15" y2="25" stroke="#94a3b8" strokeWidth="1" />
                                <line x1="5" y1="15" x2="25" y2="15" stroke="#94a3b8" strokeWidth="1" />
                                <polygon points="15,4 12,10 18,10" fill="#ef4444" />
                                <text x="15" y="3" className="fill-slate-500 font-bold text-[7px]" textAnchor="middle">N</text>
                              </g>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 400 300" className="w-full h-full max-h-[260px] font-sans">
                              {/* Background subtle grids */}
                              <pattern id="grid-pattern-2" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.8" />
                              </pattern>
                              <rect width="400" height="300" fill="url(#grid-pattern-2)" rx="8" />

                              {/* Rail Track representing Gyeongui line */}
                              <line x1="40" y1="50" x2="360" y2="50" stroke="#94a3b8" strokeWidth="6" strokeDasharray="6,4" />
                              <line x1="40" y1="50" x2="360" y2="50" stroke="#6366f1" strokeWidth="1.5" />
                              <text x="360" y="42" className="fill-slate-400 font-bold text-[9px] text-anchor-end font-mono">경의중앙선 (Donong Line)</text>

                              {/* Gyeongui Donong Station */}
                              <rect x="80" y="32" width="60" height="36" rx="4" fill="#4f46e5" className="shadow-xs cursor-pointer hover:fill-[#4338ca] transition-colors" />
                              <text x="110" y="47" className="fill-white font-bold text-[10px] text-anchor-middle" textAnchor="middle">도농역</text>
                              <text x="110" y="59" className="fill-indigo-100 font-medium text-[8px] text-anchor-middle" textAnchor="middle">2번 출구</text>

                              {/* Highway representing 다산지금로 */}
                              <path d="M 40 230 Q 200 210 360 230" stroke="#e2e8f0" strokeWidth="20" fill="none" />
                              <path d="M 40 230 Q 200 210 360 230" stroke="#cbd5e1" strokeWidth="18" strokeDasharray="8,6" fill="none" />
                              <text x="360" y="215" className="fill-slate-400 font-bold text-[9px] text-anchor-end" textAnchor="end">다산지금로</text>

                              {/* Pathway dotted walking route */}
                              <path d="M 110 68 L 110 160 L 250 160 L 250 184" stroke="#4f46e5" strokeWidth="3" strokeDasharray="4,4" fill="none" className="animate-pulse" />

                              {/* Route indicator line */}
                              <text x="150" y="152" className="fill-indigo-600 font-semibold text-[9px] tracking-tight">도보 약 15분 (1.1km)</text>

                              {/* Landmark: Namyangju Police station */}
                              <circle cx="85" cy="180" r="18" fill="#3b82f6" fillOpacity="0.1" stroke="#2563eb" strokeWidth="1" />
                              <text x="85" y="183" className="fill-blue-800 font-extrabold text-[8px]" textAnchor="middle">남양주경찰서</text>

                              {/* Center Office 2 Annex Building (다산동 별관) */}
                              <g transform="translate(210, 180)" className="cursor-pointer hover:scale-105 transition-transform duration-150">
                                <rect x="0" y="10" width="84" height="42" rx="6" fill="#4f46e5" stroke="#3730a3" strokeWidth="1.5" />
                                <text x="42" y="27" className="fill-white font-black text-[10px]" textAnchor="middle">南양주시청</text>
                                <text x="42" y="39" className="fill-indigo-100 font-medium text-[8px]" textAnchor="middle">제2청사 (별관)</text>
                                <circle cx="42" cy="-2" r="5" fill="#f43f5e" className="animate-ping" />
                                <circle cx="42" cy="-2" r="4.5" fill="#e11d48" />
                              </g>

                              {/* Compass direction representation */}
                              <g transform="translate(45, 110)">
                                <circle cx="15" cy="15" r="14" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                                <line x1="15" y1="5" x2="15" y2="25" stroke="#94a3b8" strokeWidth="1" />
                                <line x1="5" y1="15" x2="25" y2="15" stroke="#94a3b8" strokeWidth="1" />
                                <polygon points="15,4 12,10 18,10" fill="#ef4444" />
                                <text x="15" y="3" className="fill-slate-500 font-bold text-[7px]" textAnchor="middle">N</text>
                              </g>
                            </svg>
                          )}
                        </div>

                        {/* Caption notice */}
                        <div className="mt-3 bg-slate-100 p-2.5 rounded-lg border border-slate-200">
                          <p className="text-[10px] text-slate-500 m-0 leading-normal text-left">
                            * 본 약도는 지하철 및 대표 도로를 기산하여 생성한 직렬 모식 레이아웃입니다. 실제 도로 상황과 주차장 밀도에 따라 우회 노선을 확인하시려면 위의 Naver/Kakao 지도를 연동 연계해 보시기 바랍니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

      </main>

    </div>
  </div>
  );
}
