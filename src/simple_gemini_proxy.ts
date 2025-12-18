// simple_gemini_proxy.ts - 稳定极简版
const GEMINI_API_HOST = "generativelanguage.googleapis.com";

Deno.serve(async (request) => {
  const url = new URL(request.url);
  
  // 1. 处理根路径，返回简单提示
  if (url.pathname === "/") {
    return new Response("Gemini OpenAI-Proxy is running. Use /v1/chat/completions", { status: 200 });
  }
  
  // 2. 只处理 /v1/chat/completions 路径
  if (!url.pathname.startsWith("/v1/chat/completions")) {
    return new Response("Not Found. Use /v1/chat/completions", { status: 404 });
  }
  
  // 3. 强制从环境变量获取API密钥
  const API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!API_KEY) {
    console.error("FATAL: GEMINI_API_KEY environment variable is not set.");
    return new Response(JSON.stringify({ 
      error: { message: "Server configuration error: API key missing." } 
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  
  // 4. 准备转发给Gemini的请求
  const targetUrl = `https://${GEMINI_API_HOST}/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
  
  try {
    // 5. 获取Sealdice发来的原始请求体
    const originalBody = await request.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(originalBody);
    } catch {
      return new Response(JSON.stringify({ error: { message: "Invalid JSON in request body" } }), { status: 400 });
    }
    
    // 6. 构建Gemini格式的请求体 (极简转换)
    const geminiRequest = {
      contents: [{
        parts: [{
          text: parsedBody.messages?.[parsedBody.messages.length - 1]?.content || ""
        }]
      }],
      generationConfig: {
        maxOutputTokens: parsedBody.max_tokens || 1024,
        temperature: parsedBody.temperature || 0.7,
      }
    };
    
    // 7. 转发请求到Gemini
    const geminiResponse = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiRequest),
    });
    
    const geminiData = await geminiResponse.json();
    
    // 8. 将Gemini响应转换为OpenAI格式
    const openAiResponse = {
      id: "chatcmpl-" + Date.now(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gemini-1.5-flash",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "(No response generated)"
        },
        finish_reason: "stop"
      }],
      usage: {
        prompt_tokens: 0, // 简化版暂不计算
        completion_tokens: 0,
        total_tokens: 0
      }
    };
    
    return new Response(JSON.stringify(openAiResponse), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
    
  } catch (error) {
    console.error("Proxy Error:", error);
    return new Response(JSON.stringify({ 
      error: { message: `Internal proxy error: ${error.message}` } 
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});