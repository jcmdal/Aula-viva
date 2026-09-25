// Função serverless (Vercel) — proxy para a 2slides.com.
//
// A chave de API NUNCA fica no site (index.html): ela vive só aqui, no servidor,
// lida a partir de uma variável de ambiente. Para ativar essa função:
//   1. No painel do seu projeto na Vercel, vá em Settings > Environment Variables.
//   2. Crie a variável TWOSLIDES_API_KEY com o valor da sua chave (sk-2slides-...).
//   3. Faça um novo deploy (ou "Redeploy") para a variável entrar em vigor.
// Sem essa variável configurada, este endpoint responde com erro 500 e o site
// mostra um aviso amigável — ele nunca expõe a chave de volta pro navegador.

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
  var themeQuery = (body.themeQuery || 'moderno').toString().trim() || 'moderno';
  var language = (body.language || 'pt-BR').toString().trim() || 'pt-BR';

  if (!topic) {
    res.status(400).json({ error: 'Informe o tema/conteúdo da apresentação.' });
    return;
  }

  try {
    // 1) Busca um tema visual disponível na 2slides.com (endpoint gratuito).
    var themeResp = await fetch(
      'https://2slides.com/api/v1/themes/search?query=' + encodeURIComponent(themeQuery) + '&limit=1',
      { headers: { 'Authorization': 'Bearer ' + apiKey } }
    );
    var themeData = await themeResp.json().catch(function () { return null; });

    if (!themeResp.ok || !themeData || !themeData.success || !themeData.data || !themeData.data.themes || !themeData.data.themes.length) {
      res.status(502).json({ error: 'Não foi possível encontrar um tema de slides na 2slides.com para "' + themeQuery + '".' });
      return;
    }
    var themeId = themeData.data.themes[0].id;

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
