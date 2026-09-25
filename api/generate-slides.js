// Função serverless (Vercel) — proxy para a 2slides.com.
//
// A chave de API NUNCA fica no site (index.html): ela vive só aqui, no servidor,
// lida a partir de uma variável de ambiente. Para ativar essa função:
//   1. No painel do seu projeto na Vercel, vá em Settings > Environment Variables.
//   2. Crie a variável TWOSLIDES_API_KEY com o valor da sua chave (sk-2slides-...).
//   3. Faça um novo deploy (ou "Redeploy") para a variável entrar em vigor.
// Sem essa variável configurada, este endpoint responde com erro 500 e o site
// mostra um aviso amigável — ele nunca expõe a chave de volta pro navegador.
//
// A busca de temas da 2slides.com funciona por palavra-chave em inglês, então o
// site manda uma dessas chaves prontas (escolhida num menu, não digitada pela
// professora) e, se não encontrar nada, tentamos mais algumas alternativas
// conhecidas antes de desistir — assim a professora nunca precisa "adivinhar"
// um termo que funcione.
var THEME_FALLBACK_CHAIN = ['modern', 'business', 'professional', 'clean', 'minimal', 'simple', 'creative', 'education'];

async function findThemeId(apiKey, preferredQuery) {
  var tried = {};
  var candidates = [preferredQuery].concat(THEME_FALLBACK_CHAIN).filter(function (q) {
    if (!q) return false;
    var key = q.toLowerCase();
    if (tried[key]) return false;
    tried[key] = true;
    return true;
  });

  for (var i = 0; i < candidates.length; i++) {
    var q = candidates[i];
    try {
      var resp = await fetch(
        'https://2slides.com/api/v1/themes/search?query=' + encodeURIComponent(q) + '&limit=1',
        { headers: { 'Authorization': 'Bearer ' + apiKey } }
      );
      var data = await resp.json().catch(function () { return null; });
      if (resp.ok && data && data.success && data.data && data.data.themes && data.data.themes.length) {
        return data.data.themes[0].id;
      }
    } catch (e) {
      // tenta o próximo candidato
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  var apiKey = process.env.TWOSLIDES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'A variável de ambiente TWOSLIDES_API_KEY não está configurada neste servidor.' });
    return;
  }

  var body = req.body || {};
  var topic = (body.topic || '').toString().trim();
  var themeQuery = (body.themeQuery || 'modern').toString().trim() || 'modern';
  var language = (body.language || 'pt-BR').toString().trim() || 'pt-BR';

  if (!topic) {
    res.status(400).json({ error: 'Informe o tema/conteúdo da apresentação.' });
    return;
  }

  try {
    // 1) Busca um tema visual disponível na 2slides.com (endpoint gratuito),
    // tentando alternativas conhecidas se a preferida não existir.
    var themeId = await findThemeId(apiKey, themeQuery);
    if (!themeId) {
      res.status(502).json({ error: 'Não foi possível encontrar nenhum tema visual disponível na 2slides.com no momento. Tente novamente em instantes.' });
      return;
    }

    // 2) Gera a apresentação (modo síncrono — resposta já vem com o link pronto).
    var genResp = await fetch('https://2slides.com/api/v1/slides/generate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        themeId: themeId,
        userInput: topic,
        responseLanguage: language,
        mode: 'sync'
      })
    });
    var genData = await genResp.json().catch(function () { return null; });

    if (!genResp.ok || !genData || !genData.success || !genData.data) {
      var msg = (genData && genData.error) || 'Falha ao gerar a apresentação na 2slides.com.';
      res.status(genResp.status || 502).json({
        error: msg,
        code: genData && genData.code,
        details: genData && genData.details
      });
      return;
    }

    res.status(200).json({
      downloadUrl: genData.data.downloadUrl,
      jobUrl: genData.data.jobUrl,
      slidePageCount: genData.data.slidePageCount
    });
  } catch (err) {
    res.status(502).json({ error: 'Não foi possível falar com a 2slides.com agora. Tente novamente em instantes.' });
  }
}
