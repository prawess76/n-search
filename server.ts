import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      geminiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return geminiClient;
}

async function extractSearchKeywords(inputText: string): Promise<{ original: string; extracted: string[]; method: "gemini" | "heuristic" | "direct" | "fallback" }> {
  const trimmed = inputText.trim();
  if (!trimmed) {
    return { original: trimmed, extracted: [], method: "fallback" };
  }

  // If it's a short, simple single word under 6 characters and of length >= 2 with no spaces, return it as a single keyword direct match
  if (trimmed.length <= 6 && !trimmed.includes(" ") && trimmed.length >= 2) {
    return { original: trimmed, extracted: [trimmed], method: "direct" };
  }

  // Try using Gemini with built-in retry and model fallback
  try {
    const client = getGeminiClient();
    if (client) {
      const prompt = `주어진 사용자의 질문이나 문장에서, 공공기관(남양주시청) 직원 연락처 및 행정 업무명 검색에 가장 적합한 핵심적인 '검색 키워드 단어 명사들'(예: "여권", "주차", "지방세", "자동차세", "취득세", "이의신청", "복지", "도로관리", "건축" 등)을 최대 5개 추출하십시오. 
오직 추출된 키워드들을 콤마(,)로 구분된 한 줄 텍스트 형식으로만 응답해주십시오. 다른 부연 설명, 따옴표, 마침표, 번호 매기기, 공백 또는 줄바꿈은 일체 포함하지 마십시오. 두꺼운(bold) 표시도 하지 마십시오.
예: 여권,발급,교부,분실

문장: "${trimmed}"`;

      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
      let result = "";
      let modelUsed = "";

      for (const model of modelsToTry) {
        if (result) break;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[Gemini NLP] Multi-keyword extraction attempt with ${model} (attempt ${attempt}/2)...`);
            const response = await client.models.generateContent({
              model: model,
              contents: prompt,
              config: {
                temperature: 0.1,
              }
            });
            const textResponse = response.text?.trim() || "";
            if (textResponse) {
              result = textResponse;
              modelUsed = model;
              break;
            }
          } catch (err: any) {
            console.warn(`[Gemini NLP] Attempt ${attempt} on model ${model} failed with error: ${err.message || err}`);
            if (attempt < 2) {
              // Wait 250ms before retrying
              await new Promise(resolve => setTimeout(resolve, 250));
            }
          }
        }
      }

      if (result) {
        const parsed = result.split(",")
          .map(w => w.replace(/['"“”`\[\]\(\)\-\*\s]/g, "").trim())
          .filter(w => w.length >= 2 && w.length <= 10);
        if (parsed.length > 0) {
          console.log(`[Gemini NLP] Extracted multiple keywords ${JSON.stringify(parsed)} from '${trimmed}' using ${modelUsed}`);
          return { original: trimmed, extracted: parsed, method: "gemini" };
        }
      }
    }
  } catch (error) {
    console.error("Gemini keyword extraction failed completely, using heuristic fallback:", error);
  }

  // Heuristic word-based extractor for Korean sentences
  const stopWords = new Set([
    "어디로", "어디서", "누구한테", "누구", "어떻게", "언제", "무엇을", "무슨",
    "있나요", "있습니까", "해당", "담당", "담당자", "연락처", "전화번호", "전화",
    "알려주세요", "알려줘", "알려", "주세요", "원합니다", "원해요", "하고", "하고싶어요",
    "하고싶은데", "싶은데", "싶어요", "가야", "가야하나요", "가야하는지", "합니까", "하는",
    "해서", "에서", "으로", "에게", "인가요", "입니까", "문의", "문의드려요", "관련", "관련된"
  ]);

  const words = trimmed.split(/\s+/).map(w => {
    return w.replace(/(은|는|이|가|을|를|에|의|로|으로|에서|한테|에게|하고|와|과|요)$/, "");
  }).filter(w => w.length >= 2 && !stopWords.has(w));

  if (words.length > 0) {
    const uniqueWords = Array.from(new Set(words)).slice(0, 5);
    console.log(`[Heuristic NLP] Extracted multiple keywords ${JSON.stringify(uniqueWords)} from '${trimmed}'`);
    return { original: trimmed, extracted: uniqueWords, method: "heuristic" };
  }

  return { original: trimmed, extracted: [trimmed], method: "fallback" };
}

// User-Agent definition to match browsers
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Department {
  code: string;
  name: string;
  level: number;
}

// Memory cache for departments list to speed up startup
let cachedDepartments: Department[] = [];
let lastFetchedDepartments = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

// Assistive scraper for departments
async function getDepartments(): Promise<Department[]> {
  const now = Date.now();
  if (cachedDepartments.length > 0 && (now - lastFetchedDepartments < CACHE_DURATION)) {
    return cachedDepartments;
  }

  try {
    console.log("Scraping Namyangju City Hall departments list...");
    const res = await fetch("https://www.nyj.go.kr/www/contents.do?key=2534", {
      headers: { "User-Agent": USER_AGENT }
    });
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const list: Department[] = [];
    $("select[name='searchDeptCode'] option").each((_, opt) => {
      const option = $(opt);
      const code = option.val();
      if (!code) return; // ignore placeholder option

      const name = option.text().trim();
      const style = option.attr("style") || "";
      const paddingMatch = style.match(/padding-left:\s*(\d+)px/);
      let level = 1;
      if (paddingMatch) {
        const padding = parseInt(paddingMatch[1], 10);
        if (padding === 20) level = 2;
        if (padding >= 30) level = 3;
      }

      list.push({ code: String(code), name, level });
    });

    if (list.length > 0) {
      cachedDepartments = list;
      lastFetchedDepartments = now;
      console.log(`Successfully scraped ${list.length} departments.`);
    }
    return list;
  } catch (error) {
    console.error("Failed to scrape departments list:", error);
    // Return stale cache if available, or temporary fallback structure
    if (cachedDepartments.length > 0) return cachedDepartments;
    return [
      { code: "39904950000", name: "시민시장담당관", level: 1 },
      { code: "39904810000", name: "시민안전관", level: 1 },
      { code: "39905330000", name: "청년담당관", level: 1 },
      { code: "39904960000", name: "홍보담당관", level: 1 },
      { code: "39902380000", name: "감사관", level: 1 },
      { code: "39904830000", name: "기획조정실", level: 1 },
      { code: "39904990000", name: "정책기획과", level: 2 },
      { code: "39905350000", name: "행정국", level: 1 },
      { code: "39905360000", name: "행정지원과", level: 2 },
      { code: "39905070000", name: "교통정책과", level: 2 }
    ];
  }
}

// Enable JSON parse middleware
app.use(express.json());

// API: Get departments list
app.get("/api/departments", async (req, res) => {
  try {
    const list = await getDepartments();
    res.json({ success: true, departments: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function to query employee results from Namyangju server
async function fetchEmployeeResults(deptCode?: string, queryKeyword?: string, page: string = "1") {
  let url = "https://www.nyj.go.kr/www/selectDeptEmployeeList.do?key=2535";
  
  if (deptCode) {
    url += `&searchDeptCode=${encodeURIComponent(String(deptCode))}`;
  }
  if (queryKeyword) {
    url += `&searchKrwd=${encodeURIComponent(String(queryKeyword))}&pageIndex=${page}`;
  }

  console.log(`Backend proxying search fetch URL: ${url}`);
  
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT }
  });
  if (!response.ok) {
    throw new Error(`Namyangju Server responded with HTTP status ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const list: any[] = [];
  const hasDeptCode = !!deptCode;

  if (hasDeptCode) {
    $("table.table").each((_, tableElem) => {
      const table = $(tableElem);
      let teamName = "소속 부서";
      let prev = table.prev();
      while (prev.length > 0) {
        if (prev.is("span.h3") || prev.is("h3") || prev.is("h4")) {
          teamName = prev.text().trim();
          break;
        }
        prev = prev.prev();
      }
      const pageTitle = $(".sub_title_wrap h2, .sub_title").text().trim() || "해당부서";

      table.find("tbody tr").each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length >= 3) {
          const position = $(tds[0]).text().replace(/\s+/g, " ").trim();
          const task = $(tds[1]).text().replace(/\s+/g, " ").trim();
          const phone = $(tds[2]).text().replace(/\s+/g, " ").trim();
          list.push({
            department: `${pageTitle} - ${teamName}`,
            team: teamName,
            position,
            phone,
            task
          });
        }
      });
    });
  } else {
    $("table.table").each((_, tableElem) => {
      const table = $(tableElem);
      table.find("tbody tr").each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length >= 4) {
          const department = $(tds[0]).text().replace(/\s+/g, " ").trim();
          const position = $(tds[1]).text().replace(/\s+/g, " ").trim();
          const phone = $(tds[2]).text().replace(/\s+/g, " ").trim();
          const task = $(tds[3]).text().replace(/\s+/g, " ").trim();
          list.push({
            department,
            position,
            phone,
            task
          });
        }
      });
    });
  }

  // Parse pagination
  const pagination: number[] = [];
  let activePage = 1;
  let maxPage = 1;

  $(".p-page__link-group a, .p-page__link-group strong").each((_, elem) => {
    const el = $(elem);
    const textVal = el.text().trim();
    const num = parseInt(textVal, 10);
    if (!isNaN(num)) {
      pagination.push(num);
      if (el.hasClass("active") || el.is("strong")) {
        activePage = num;
      }
      if (num > maxPage) maxPage = num;
    }
  });

  return {
    results: list,
    pagination: {
      currentPage: activePage,
      pages: pagination.length > 0 ? pagination : [1],
      maxPage
    }
  };
}

// API: Extract multiple search keywords from a sentence using Gemini or Heuristic NLP
app.get("/api/extract-keywords", async (req, res) => {
  const { text } = req.query;
  try {
    const data = await extractSearchKeywords(String(text || ""));
    return res.json({
      success: true,
      ...data
    });
  } catch (err: any) {
    console.error("Keyword extraction API failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Search employees
// Supports:
// - `deptCode` to query a specific department
// - `keyword` to query a general search term across tasks/positions (can be a single or comma-separated list of keywords)
// - `pageIndex` for keyword pagination (default 1)
app.get("/api/search", async (req, res) => {
  const { deptCode, keyword, pageIndex } = req.query;
  const page = pageIndex ? String(pageIndex) : "1";

  try {
    if (deptCode) {
      const data = await fetchEmployeeResults(String(deptCode), undefined, page);
      return res.json({
        success: true,
        ...data
      });
    }

    if (keyword) {
      const rawText = String(keyword);
      
      // If the keyword contains a comma, it represents multiple chosen terms manually separated by the UI
      if (rawText.includes(",")) {
        const keywordsList = rawText.split(",")
          .map(w => w.trim())
          .filter(Boolean);
        
        console.log(`[Multi-Search] Concurrent search requested for keywords: ${JSON.stringify(keywordsList)}`);

        // Fetch each keyword parallelly to get comprehensive results from Namyangju
        const queryPromises = keywordsList.map(kw => 
          fetchEmployeeResults(undefined, kw, "1").catch(err => {
            console.error(`Concurrent fetch failed for: ${kw}`, err);
            return { results: [], pagination: { currentPage: 1, pages: [1], maxPage: 1 } };
          })
        );

        const listObjects = await Promise.all(queryPromises);

        // Merge and deduplicate results
        const mergedList: any[] = [];
        const seen = new Set<string>();

        for (const obj of listObjects) {
          for (const item of obj.results) {
            // Identifier string combo: Department, Position, Phone, and Task
            const uniqKey = `${item.department || ""}|${item.position || ""}|${item.phone || ""}|${item.task || ""}`;
            if (!seen.has(uniqKey)) {
              seen.add(uniqKey);
              mergedList.push(item);
            }
          }
        }

        return res.json({
          success: true,
          results: mergedList,
          originalKeyword: rawText,
          extractedKeyword: rawText,
          searchMethod: "direct",
          pagination: {
            currentPage: 1,
            pages: [1],
            maxPage: 1
          }
        });
      }

      // Single word / phrase search fallback (if no comma)
      // Perform sentence-to-keyword extraction using Gemini/heuristic
      const extraction = await extractSearchKeywords(rawText);
      console.log(`Keyword extraction results - Original: "${extraction.original}", Extracted: ${JSON.stringify(extraction.extracted)}, Method: "${extraction.method}"`);

      let resultsList: any[] = [];
      let finalKeyword = rawText;
      let finalMethod = extraction.method;

      if (extraction.extracted.length > 0) {
        // Query the first/primary keyword extracted
        const primaryKeyword = extraction.extracted[0];
        const data = await fetchEmployeeResults(undefined, primaryKeyword, page);
        resultsList = data.results;
        finalKeyword = primaryKeyword;

        // If primary extracted keyword yield 0 results, fall back to checking other keywords or original raw query
        if (resultsList.length === 0 && rawText !== primaryKeyword) {
          console.log(`Primary keyword "${primaryKeyword}" yielded 0 results. Falling back to original raw text search.`);
          const fallbackData = await fetchEmployeeResults(undefined, rawText, page);
          if (fallbackData.results.length > 0) {
            resultsList = fallbackData.results;
            finalKeyword = rawText;
            finalMethod = "fallback";
          }
        }
      } else {
        const data = await fetchEmployeeResults(undefined, rawText, page);
        resultsList = data.results;
      }

      return res.json({
        success: true,
        results: resultsList,
        originalKeyword: rawText,
        extractedKeyword: finalKeyword,
        searchMethod: finalMethod,
        pagination: {
          currentPage: 1,
          pages: [1],
          maxPage: 1
        }
      });
    }

    return res.status(400).json({ success: false, error: "Keyword or Department Code required" });
  } catch (err: any) {
    console.error("Proxy search failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Setup Vite Dev Server / Static Assets Serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite server in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Setting up Express static files serving in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Pre-fetch departments asynchronously so that initial requests are instant
  getDepartments().catch(() => {});

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
