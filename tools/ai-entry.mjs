// Planos por conversa com o Claude. Empacotado pelo esbuild em vendor/ai.js
// (npm run build:web) e carregado pelo app só quando o usuário usa a função.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const PlanList = z.object({
  plans: z.array(z.object({
    name: z.string(),
    target: z.number(),
    saved: z.number(),
    deadline: z.string().nullable(),
    priority: z.enum(['alta', 'media', 'baixa']),
  })),
  note: z.string(),
});

const SYSTEM = `Você transforma o que a pessoa conta sobre os planos financeiros dela em uma lista de metas.
Para cada plano: name (curto, em português), target (valor total em reais, número), saved (quanto já tem guardado; 0 se não disse),
deadline (mês limite no formato AAAA-MM, ou null se não disse prazo) e priority (alta, media ou baixa; use alta para reserva de emergência,
dívidas e o que a pessoa chamar de urgente; baixa para o que ela disser "se der"; senão media).
Se faltar o valor de um plano, estime um valor razoável no Brasil e diga isso em note. Em note, escreva em uma ou duas frases o que você assumiu.`;

/**
 * @param {string} text  o que a pessoa escreveu
 * @param {string} apiKey  chave da API guardada no aparelho
 * @param {string} today  data de hoje (AAAA-MM-DD), para resolver "daqui 6 meses"
 */
async function parsePlans(text, apiKey, today) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(PlanList) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Hoje é ${today}.\n\n${text}` }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new Error('O Claude não conseguiu montar os planos com esse texto.');
    }
    return response.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new Error('Chave da API inválida. Confira em Configurações.');
    if (error instanceof Anthropic.RateLimitError) throw new Error('Muitas consultas seguidas. Tente de novo em um minuto.');
    if (error instanceof Anthropic.APIConnectionError) throw new Error('Sem conexão com a internet.');
    if (error instanceof Anthropic.APIError) throw new Error(`Erro da API (${error.status}).`);
    throw error;
  }
}

window.MeuBolsoAI = { parsePlans };
