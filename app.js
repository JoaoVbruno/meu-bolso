'use strict';
/* =========================================================================
   Meu Bolso — controle de contas, consultor de compras, planos e previsão.
   Tudo fica salvo no próprio celular (localStorage). Nada vai para servidor.
   ========================================================================= */

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const r2 = (v) => Math.round(v * 100) / 100;
const pct = (v) => `${Math.round(v * 100)}%`;
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

/** Lê valores em formato brasileiro ("1.234,56") ou com ponto ("1234.56"). */
function money(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/R\$|\s/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/* ---------- datas ---------- */
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ymOf = (s) => s.slice(0, 7);
const curM = () => ymOf(todayStr());
const dayOf = (s) => +s.slice(8, 10);
function addM(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
/** a − b, em meses. */
function diffM(a, b) {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (ya - yb) * 12 + (ma - mb);
}
const mLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]}/${String(y).slice(2)}`; };
const mFull = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_FULL[m - 1]} ${y}`; };
const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dateIn = (ym, day) => `${ym}-${pad(Math.min(Math.max(1, day), daysIn(ym)))}`;
const fmtDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/* ---------- categorias ---------- */
const CATS = {
  moradia: ['Moradia', true], contas: ['Contas da casa', true], mercado: ['Mercado', true],
  transporte: ['Transporte e carro', true], saude: ['Saúde', true], educacao: ['Educação', true],
  dividas: ['Dívidas e financiamentos', true], impostos: ['Impostos (IPVA, IPTU)', true],
  restaurantes: ['Restaurantes e delivery', false], lazer: ['Lazer', false], compras: ['Compras', false],
  assinaturas: ['Assinaturas', false], viagem: ['Viagem', false], outros: ['Outros', false],
};
const isEss = (c) => (CATS[c] || CATS.outros)[1];
const catName = (c) => (CATS[c] || CATS.outros)[0];
const catOptions = (sel) => Object.entries(CATS)
  .map(([k, [n, e]]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n}${e ? ' · essencial' : ''}</option>`).join('');

// Regras para classificar lançamentos importados (a ordem importa).
const RULES = [
  [/mercado ?livre|mercadolivre|shopee|amazon(?! prime)|magalu|magazine|americanas|shein|aliexpress|renner|riachuelo|c&a|zara|centauro|netshoes|kabum/i, 'compras'],
  [/ipva|iptu|licenciamento|detran|dpvat|receita federal|darf/i, 'impostos'],
  [/netflix|spotify|disney|hbo|max\.com|prime video|amazon prime|youtube|apple\.com|icloud|google one|deezer|globoplay|paramount|chatgpt|openai|crunchyroll/i, 'assinaturas'],
  [/ifood|rappi|restaurante|lanchonete|pizz|burger|padaria|cafe|café|mcdonald|starbucks|outback|bk |subway|sushi|churrasc/i, 'restaurantes'],
  [/supermerc|mercado|atacad|assai|assaí|carrefour|pão de açúcar|pao de acucar|hortifruti|sacol|açougue|acougue|dia brasil/i, 'mercado'],
  [/uber|99app|99 pop|posto|shell|ipiranga|petrobras|combust|estacion|metr[oô]|bilhete|sem parar|veloe|conectcar|ped[aá]gio|oficina|auto ?pe[cç]as/i, 'transporte'],
  [/farm|drogaria|droga|raia|pacheco|hospital|cl[ií]nic|laborat|unimed|amil|hapvida|odonto|dentista|m[eé]dic|academia|smart ?fit/i, 'saude'],
  [/aluguel|condom|imobili/i, 'moradia'],
  [/enel|light s|cemig|copel|celesc|sabesp|cedae|copasa|energia|[aá]gua|comg[aá]s|vivo|claro|tim |internet|telefon/i, 'contas'],
  [/escola|faculdade|curso|udemy|alura|livraria|universidade|col[eé]gio/i, 'educacao'],
  [/cinema|ingresso|show|steam|playstation|xbox|nintendo|parque|teatro|sympla|eventim|bar /i, 'lazer'],
  [/hotel|airbnb|booking|latam|gol linhas|azul linhas|decolar|passagem|123milhas/i, 'viagem'],
  [/empr[eé]stimo|financiamento|juros|iof|parcelamento de fatura|seguro/i, 'dividas'],
];
const guessCat = (desc) => (RULES.find(([re]) => re.test(desc)) || [null, 'outros'])[1];

/* ---------- estado ---------- */
const KEY = 'meu-bolso-v1';
const DEFAULT = {
  settings: {
    income: 0, payDay: 5, savingsPct: 10, varEssBudget: 0,
    cardClose: 3, cardDue: 10, cardLimit: 0, lazerToPlans: 30, theme: 'auto', setupDone: false,
    notify: true, lock: false, aiKey: '',
  },
  fixed: [],   // contas fixas: mensal | anual | parcelado
  incomes: [], // rendas extras: unica | anual | parcelado (por um tempo) | mensal
  limits: {},  // { categoria: valor máximo por mês }
  paid: {},    // { 'AAAA-MM': { idDaConta: true } }
  tx: [],      // lançamentos (gastos)
  goals: [],   // planos
  meta: {},    // datas de backup, resumo visto, checagem de atualização
};
let S = load();
let PLAN = null; // cache do planejamento; zera a cada save()
const UI = { tab: 'home', month: curM(), txMonth: curM(), horizon: 12, adv: { method: 'credito', parcels: 1, essential: false } };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { ...structuredClone(DEFAULT), ...d, settings: { ...DEFAULT.settings, ...(d.settings || {}) } };
    }
  } catch { /* sem armazenamento: segue com o padrão */ }
  return structuredClone(DEFAULT);
}
function save() {
  PLAN = null;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Não consegui salvar no aparelho.'); }
  scheduleNotificationsSoon();
}

/* ---------- cartão de crédito ---------- */
/** Mês em que a compra feita em `ds` será paga (vencimento da fatura). */
function cardPayMonth(ds) {
  const { cardClose: c, cardDue: due } = S.settings;
  let close = ymOf(ds);
  if (dayOf(ds) >= c) close = addM(close, 1); // no dia do fechamento já vai para a próxima fatura
  return +due > +c ? close : addM(close, 1);
}
const cardDueDate = (ym) => dateIn(ym, +S.settings.cardDue);
/** Estimativa do limite já usado: faturas ainda não pagas. */
function cardUsed() {
  const t = todayStr(); const cur = curM();
  const firstUnpaid = dayOf(t) <= +S.settings.cardDue ? cur : addM(cur, 1);
  const open = cardPayMonth(t);
  let used = sum(S.tx.filter((x) => x.method === 'credito' && diffM(x.payMonth, firstUnpaid) >= 0), (x) => x.amount);
  for (let M = firstUnpaid; diffM(open, M) >= 0; M = addM(M, 1)) {
    used += sum(fixedForMonth(M).filter((e) => e.f.method === 'credito'), (e) => e.f.amount);
  }
  return used;
}
function daysToPayday() {
  const t = todayStr(); const pd = +S.settings.payDay || 1;
  const target = dayOf(t) <= pd ? dateIn(curM(), pd) : dateIn(addM(curM(), 1), pd);
  return daysBetween(t, target);
}

/* ---------- contas fixas ---------- */
function occurs(f, M) {
  if (f.kind === 'unica') return M === f.start;
  if (f.start && diffM(M, f.start) < 0) return false;
  if (f.kind === 'parcelado') return diffM(M, f.start) < (+f.parcels || 1);
  if (f.kind === 'anual') {
    const mm = +M.slice(5, 7);
    return ((mm - (+f.month || 1) + 12) % 12) < Math.max(1, +f.spread || 1);
  }
  return true;
}
function fixedInfo(f, M) {
  if (f.kind === 'parcelado') return `parcela ${diffM(M, f.start) + 1}/${f.parcels}`;
  if (f.kind === 'anual') {
    const i = ((+M.slice(5, 7) - (+f.month) + 12) % 12) + 1;
    return f.spread > 1 ? `anual · ${i}/${f.spread}` : 'anual';
  }
  return 'mensal';
}
const fixedEnd = (f) => (f.kind === 'parcelado' ? addM(f.start, (+f.parcels || 1) - 1) : null);

/**
 * Contas fixas que saem do bolso no mês M.
 * Débito: no próprio mês. Cartão: no mês em que vence a fatura onde a cobrança cai
 * (ex.: assinatura cobrada dia 20 com fechamento dia 3 entra na fatura do mês seguinte).
 * Devolve [{ f, O }], onde O é o mês da cobrança original.
 */
function fixedForMonth(M) {
  const out = [];
  for (const f of S.fixed) {
    if (f.method !== 'credito') { if (occurs(f, M)) out.push({ f, O: M }); continue; }
    for (let k = 2; k >= 0; k--) {
      const O = addM(M, -k);
      if (occurs(f, O) && cardPayMonth(dateIn(O, +f.day || 1)) === M) out.push({ f, O });
    }
  }
  return out.sort((a, b) => a.f.day - b.f.day);
}
const extrasForMonth = (M) => (S.incomes || []).filter((x) => occurs(x, M));

/* ---------- números do mês ---------- */
/** Números do mês sem considerar os planos. */
function baseMonth(M) {
  const s = S.settings; const cur = curM();
  const entries = fixedForMonth(M);
  const fx = entries.map((e) => e.f);
  const fixedEss = sum(fx.filter((f) => isEss(f.cat)), (f) => f.amount);
  const fixedLaz = sum(fx.filter((f) => !isEss(f.cat)), (f) => f.amount);
  const txs = S.tx.filter((t) => t.payMonth === M && !t.linkedFixed);
  const varEss = sum(txs.filter((t) => isEss(t.cat)), (t) => t.amount);
  const varLaz = sum(txs.filter((t) => !isEss(t.cat)), (t) => t.amount);
  const extras = extrasForMonth(M);
  const extraIncome = sum(extras, (x) => x.amount);
  const salary = +s.income || 0;
  const income = salary + extraIncome;
  const savings = salary * (+s.savingsPct || 0) / 100; // a renda extra fica livre para os planos
  // Mês atual e futuros: conta o orçamento de variáveis essenciais (mercado etc.) mesmo que ainda não gasto.
  const essPlanned = diffM(M, cur) >= 0 ? Math.max(+s.varEssBudget || 0, varEss) : varEss;
  const beforeSavings = income - fixedEss - fixedLaz - essPlanned;
  const card = sum(txs.filter((t) => t.method === 'credito'), (t) => t.amount)
    + sum(fx.filter((f) => f.method === 'credito'), (f) => f.amount);
  return { M, income, salary, extras, extraIncome, entries, fx, fixedEss, fixedLaz, varEss, varLaz, essPlanned, savings, beforeSavings, txs, card };
}

/**
 * Planejamento: simula mês a mês (até 10 anos) quanto separar para cada plano.
 * Capacidade do mês = meta de poupança + fatia do que sobraria para lazer.
 * Prioridade alta primeiro; dentro da prioridade, o prazo mais curto.
 * Cada plano pede (falta ÷ meses até o prazo); se o prazo passou, pede tudo que falta.
 */
function plan() {
  if (PLAN) return PLAN;
  const cur = curM(); const share = (+S.settings.lazerToPlans || 0) / 100;
  const PRI = { alta: 0, media: 1, baixa: 2 };
  const goals = S.goals.filter((g) => (+g.saved || 0) < (+g.target || 0))
    .map((g) => ({ ...g, bal: +g.saved || 0 }))
    .sort((a, b) => (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1) || diffM(a.deadline || '2999-12', b.deadline || '2999-12'));
  const alloc = {}; const eta = {}; const capacity = {};
  S.goals.forEach((g) => { if ((+g.saved || 0) >= (+g.target || 0)) eta[g.id] = 'feito'; });
  for (let i = 0; i < 120 && goals.some((g) => !eta[g.id]); i++) {
    const M = addM(cur, i); const b = baseMonth(M);
    const free = Math.max(0, b.beforeSavings - b.savings - b.varLaz);
    let cap = Math.max(0, Math.min(b.savings + share * free, b.beforeSavings - b.varLaz));
    capacity[M] = cap;
    const rec = { total: 0, by: {} };
    for (const g of goals) {
      if (eta[g.id] || cap <= 0) continue;
      const left = (+g.target) - g.bal;
      const monthsLeft = g.deadline ? Math.max(1, diffM(g.deadline, M) + 1) : 12;
      const give = r2(Math.min(left / monthsLeft, cap, left));
      if (give <= 0) continue;
      g.bal += give; cap -= give; rec.total += give; rec.by[g.id] = give;
      if (g.bal >= (+g.target) - 0.01) eta[g.id] = M;
    }
    alloc[M] = rec;
  }
  PLAN = { alloc, eta, capacity };
  return PLAN;
}

/** Números completos do mês: inclui o que vai para os planos. */
function monthSummary(M) {
  const b = baseMonth(M);
  const planned = diffM(M, curM()) >= 0 ? (plan().alloc[M]?.total || 0) : 0;
  const reserved = Math.max(b.savings, planned);
  const livreLazer = b.beforeSavings - reserved;
  return { ...b, planned, reserved, livreLazer, restante: livreLazer - b.varLaz };
}

/* ---------- consultor ---------- */
function makeHits(value, method, parcels) {
  if (method === 'debito') return [{ M: curM(), amt: value }];
  const first = cardPayMonth(todayStr());
  return Array.from({ length: parcels }, (_, i) => ({ M: addM(first, i), amt: r2(value / parcels) }));
}
function evalHits(hits) {
  return hits.map((h) => { const s = monthSummary(h.M); return { ...h, room: s.restante, livre: s.livreLazer, after: s.restante - h.amt }; });
}
const worstOf = (rows) => rows.reduce((a, b) => (b.after < a.after ? b : a));

function advise({ value, method, parcels, essential, balance, cat }) {
  const s = S.settings; const today = todayStr(); const cur = curM();
  const rows = evalHits(makeHits(value, method, parcels));
  const worst = worstOf(rows);
  const reasons = []; const tips = [];
  let level = 'ok';
  let hardBlock = false;

  if (!(+s.income > 0)) { level = 'warn'; reasons.push('Cadastre sua renda em Configurações para eu avaliar de verdade.'); }

  if (worst.after < 0) {
    level = 'bad';
    reasons.push(`Em ${mFull(worst.M)} o dinheiro livre ficaria ${brl(-worst.after)} negativo.`);
  } else {
    const tight = rows.find((r) => r.amt > 0.5 * Math.max(r.room, 0) || r.after < 0.15 * Math.max(r.livre, 1));
    if (tight) {
      if (level === 'ok') level = 'warn';
      reasons.push(`Usa ${pct(tight.amt / Math.max(tight.room, 1))} do que resta livre em ${mFull(tight.M)} (sobra ${brl(tight.after)}).`);
    } else {
      reasons.push(`Cabe com folga: depois da compra ainda sobra ${brl(worst.after)} livre em ${mFull(worst.M)}.`);
    }
  }

  if (method === 'debito' && balance != null && balance >= 0 && value > balance) {
    level = 'bad'; hardBlock = true;
    reasons.unshift(`Seu saldo em conta (${brl(balance)}) não cobre a compra.`);
  }

  if (method === 'credito') {
    const due = cardDueDate(rows[0].M); const days = daysBetween(today, due);
    const day = dayOf(today); const close = +s.cardClose;
    const sinceClose = day - close;
    if (sinceClose >= 0 && sinceClose <= 3) {
      tips.push(`Ótimo dia para usar o cartão: a fatura acabou de fechar. Você só paga em ${fmtDate(due)} (${days} dias).`);
    } else if (close - day > 0 && close - day <= 5) {
      const nextDue = cardDueDate(addM(rows[0].M, 1));
      tips.push(`Se esperar ${close - day} dia(s), até o fechamento (dia ${close}), a compra vai para a fatura de ${fmtDate(nextDue)}: cerca de 30 dias a mais para pagar.`);
    } else {
      tips.push(`Entra na fatura que vence em ${fmtDate(due)} (daqui ${days} dias).`);
    }
    if (+s.cardLimit > 0) {
      const avail = +s.cardLimit - cardUsed();
      if (value > avail) { level = 'bad'; hardBlock = true; reasons.unshift(`O limite disponível estimado (${brl(avail)}) não cobre a compra.`); }
      else if (value > 0.5 * avail) tips.push(`Vai usar mais da metade do limite que sobra (${brl(avail)}).`);
    }
  }

  if (level !== 'ok' && !hardBlock) {
    if (method === 'debito') {
      const alt = worstOf(evalHits(makeHits(value, 'credito', 1)));
      if (alt.after > worst.after) tips.push(`No crédito à vista ela cai em ${mFull(alt.M)}, onde sobra ${brl(alt.after)} depois da compra. Melhor que no débito.`);
    }
    for (let n = Math.max(2, parcels + 1); n <= 12; n++) {
      if (worstOf(evalHits(makeHits(value, 'credito', n))).after >= 0) {
        tips.push(`Parcelando em ${n}x (${brl(value / n)}/mês) cabe no orçamento. Só vale se for sem juros.`);
        break;
      }
    }
    for (let i = 1; i <= 6; i++) {
      const M = addM(cur, i);
      if (monthSummary(M).restante >= value) { tips.push(`Se puder esperar até ${mFull(M)}, cabe à vista.`); break; }
    }
  }
  const lim = +(S.limits || {})[cat] || 0;
  if (lim > 0) {
    const first = rows[0];
    const spent = categorySpent(first.M, cat);
    const after = spent + first.amt;
    if (after > lim) {
      if (level === 'ok') level = 'warn';
      reasons.push(`Passa o limite de ${catName(cat)} em ${mFull(first.M)}: ${brl(after)} de ${brl(lim)}.`);
    } else if (after > 0.8 * lim) {
      tips.push(`Chega a ${pct(after / lim)} do limite de ${catName(cat)} em ${mFull(first.M)}.`);
    }
  }
  if (essential && level === 'bad') tips.push('Como é essencial: se não der para adiar, compense cortando lazer nos meses afetados.');
  if (!essential && +s.income > 0 && value > 0.3 * s.income) tips.push('Compra grande (mais de 30% da renda): espere 48 horas antes de decidir.');
  if (method === 'debito' && level !== 'ok') {
    const pd = daysToPayday();
    if (pd > 0 && pd <= 5) tips.push(`Seu salário cai em ${pd} dia(s). Esperar alivia o caixa.`);
  }
  if (level !== 'ok' && S.goals.length) tips.push('Comprar agora pode atrasar seus planos. Veja o impacto na aba Planos depois de registrar.');

  return { level, rows, reasons, tips };
}

/* ---------- importação Nubank ---------- */
function splitCSV(line, d) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
function toISO(s) {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
const SKIP_PAYMENT = /pagamento de fatura|pagamento da fatura|pagamento recebido|nu pagamentos|fatura nubank/i;
const SKIP_INVEST = /aplica[cç][aã]o|resgate|rdb|caixinha|investimento|guardado/i;

/** Lê CSV (fatura ou conta) ou OFX do Nubank. Devolve gastos já filtrados. */
function parseStatement(text) {
  const out = { kind: null, items: [], skipped: { entradas: 0, pagamentos: 0, investimentos: 0 } };
  const push = (date, desc, amount, fitid) => {
    if (!date || !(amount > 0)) return;
    if (SKIP_PAYMENT.test(desc)) { out.skipped.pagamentos++; return; }
    if (out.kind === 'bank' && SKIP_INVEST.test(desc)) { out.skipped.investimentos++; return; }
    out.items.push({ date, desc: desc.trim(), amount: r2(amount), fitid });
  };

  if (/<OFX>|<STMTTRN>/i.test(text)) {
    out.kind = /CREDITCARDMSGSRS|<CCSTMTRS>/i.test(text) ? 'card' : 'bank';
    for (const block of text.split(/<STMTTRN>/i).slice(1)) {
      const get = (tag) => (block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')) || [])[1]?.trim() || '';
      const amt = money(get('TRNAMT'));
      const desc = get('MEMO') || get('NAME');
      if (amt > 0) {
        if (out.kind === 'card') out.skipped.pagamentos++;
        else if (SKIP_INVEST.test(desc)) out.skipped.investimentos++;
        else out.skipped.entradas++;
        continue;
      }
      push(toISO(get('DTPOSTED')), desc, -amt, get('FITID'));
    }
    return out;
  }

  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('Arquivo vazio.');
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = splitCSV(lines[0], delim).map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const iDate = col('date', 'data'); const iAmt = col('amount', 'valor');
  const iDesc = col('title', 'descricao', 'description', 'historico', 'estabelecimento');
  if (iDate < 0 || iAmt < 0) throw new Error('Não reconheci as colunas. Use o CSV exportado pelo app do Nubank.');
  out.kind = head.includes('title') || head.includes('amount') ? 'card' : 'bank';
  for (const l of lines.slice(1)) {
    const c = splitCSV(l, delim);
    const amt = money(c[iAmt]);
    const desc = c[iDesc] ?? '';
    const date = toISO(c[iDate] || '');
    if (out.kind === 'card') {
      if (amt < 0) { out.skipped.pagamentos++; continue; } // pagamento ou estorno
      push(date, desc, amt);
    } else {
      if (amt > 0) { SKIP_INVEST.test(desc) ? out.skipped.investimentos++ : out.skipped.entradas++; continue; }
      push(date, desc, -amt);
    }
  }
  return out;
}

const normDesc = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*-?\s*parcela\s*\d+\s*\/\s*\d+/i, '').replace(/\s+/g, ' ').trim();
function linkFixed(desc) {
  const d = desc.toLowerCase();
  return S.fixed.find((f) => { const k = (f.keyword || f.name || '').toLowerCase().trim(); return k.length >= 3 && d.includes(k); });
}

/** Aplica a importação. Compras parceladas do cartão já projetam as parcelas seguintes na previsão. */
function applyImport(parsed, payMonthForCard) {
  const existing = new Set(S.tx.map((t) => t.id));
  const seen = {};
  let added = 0; let dup = 0; let projected = 0;
  for (const it of parsed.items) {
    const base = `${parsed.kind}|${it.date}|${it.amount}|${normDesc(it.desc)}`;
    seen[base] = (seen[base] || 0) + 1;
    const id = it.fitid ? `ofx:${it.fitid}` : `imp:${base}|${seen[base]}`;
    if (existing.has(id)) { dup++; continue; }
    const payMonth = parsed.kind === 'card' ? payMonthForCard : ymOf(it.date);
    const f = linkFixed(it.desc);
    const p = it.desc.match(/parcela\s*(\d+)\s*\/\s*(\d+)/i);
    const tx = {
      id, date: it.date, desc: it.desc, amount: it.amount, cat: f ? f.cat : guessCat(it.desc),
      method: parsed.kind === 'card' ? 'credito' : 'debito', payMonth, source: 'import', linkedFixed: f ? f.id : null,
    };
    if (p) {
      const k = +p[1]; const n = +p[2];
      tx.pkey = `${normDesc(it.desc)}|${n}|${k}`;
      S.tx = S.tx.filter((t) => !(t.projected && t.pkey === tx.pkey)); // a parcela real substitui a projetada
      for (let j = k + 1; j <= n; j++) {
        const pkey = `${normDesc(it.desc)}|${n}|${j}`;
        if (S.tx.some((t) => t.pkey === pkey)) continue;
        S.tx.push({
          id: `proj:${pkey}`, date: it.date, desc: it.desc.replace(/parcela\s*\d+\s*\/\s*\d+/i, `Parcela ${j}/${n}`),
          amount: it.amount, cat: tx.cat, method: 'credito', payMonth: addM(payMonth, j - k), source: 'projeção', projected: true, pkey,
        });
        projected++;
      }
    }
    if (f) { S.paid[payMonth] = S.paid[payMonth] || {}; S.paid[payMonth][f.id] = true; }
    S.tx.push(tx); existing.add(id); added++;
  }
  save();
  return { added, dup, projected };
}

/* ---------- render: base ---------- */
const view = () => $('#view');
function render() {
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const fn = { home: renderHome, bills: renderBills, advisor: renderAdvisor, plans: renderPlans, forecast: renderForecast, tx: renderTx }[UI.tab];
  view().innerHTML = fn();
  $$('form', view()).forEach(restoreDraft);
  saveUI();
  window.scrollTo(0, 0);
}
const monthBar = (key) => `
  <div class="monthbar">
    <button class="btn ghost sm" data-act="month" data-key="${key}" data-d="-1" aria-label="Mês anterior">‹</button>
    <strong>${mFull(UI[key])}</strong>
    <button class="btn ghost sm" data-act="month" data-key="${key}" data-d="1" aria-label="Próximo mês">›</button>
  </div>`;
const stat = (k, v, extra = '') => `<div class="stat"><div class="k">${k}</div><div class="v num">${v}</div>${extra}</div>`;
const tags = (f) => `<span class="tag ${isEss(f.cat) ? 'ess' : 'laz'}">${esc(catName(f.cat))}</span>${f.method === 'credito' ? '<span class="tag cred">cartão</span>' : ''}`;

/* ---------- Início ---------- */
function renderHome() {
  const M = UI.month; const cur = curM(); const isCur = M === cur; const s = monthSummary(M); const st = S.settings;
  const alerts = [];
  if (!(+st.income > 0)) alerts.push(['warn', 'Comece pelas <b>Configurações</b> (engrenagem): renda, dia do salário e cartão.']);
  if (s.livreLazer < 0) alerts.push(['bad', `Os compromissos de ${mFull(M)} passam a renda em <b>${brl(-s.livreLazer)}</b>.`]);
  else if (s.restante < 0) alerts.push(['bad', `Você já passou ${brl(-s.restante)} do dinheiro livre deste mês.`]);

  const daysLeft = isCur ? daysIn(M) - dayOf(todayStr()) + 1 : daysIn(M);
  const perDay = Math.max(0, s.restante) / daysLeft;
  const used = s.livreLazer > 0 ? Math.min(1, s.varLaz / s.livreLazer) : 1;

  const paidMap = S.paid[M] || {};
  const bills = s.entries.map(({ f, O }) => {
    const paid = !!paidMap[f.id];
    const card = f.method === 'credito';
    const dueDay = card ? +S.settings.cardDue : f.day;
    const late = isCur && !paid && dueDay < dayOf(todayStr());
    const when = card ? `na fatura que vence ${fmtDate(cardDueDate(M))}` : `vence ${pad(Math.min(f.day, daysIn(M)))}/${M.slice(5)}`;
    return `<div class="row">
      <input type="checkbox" data-act="paid" data-id="${f.id}" ${paid ? 'checked' : ''} aria-label="Marcar ${esc(f.name)} como paga">
      <div class="grow"><div class="title">${esc(f.name)}</div>
        <div class="small ${late ? 'neg' : 'muted'}">${when} · ${fixedInfo(f, O)}${late ? ' · atrasada' : ''}</div></div>
      <div class="amt num">${brl(f.amount)}</div></div>`;
  }).join('') || '<div class="empty">Nenhuma conta fixa neste mês. Cadastre na aba Contas.</div>';

  // Limites por categoria.
  const lims = Object.entries(S.limits || {}).filter(([, v]) => +v > 0);
  const limHtml = `<h2>Limites por categoria</h2><div class="card">${lims.map(([c, v]) => {
    const spent = categorySpent(M, c); const p = spent / v;
    const cls = p > 1 ? 'neg' : p >= 0.8 ? 'warn-t' : '';
    return `<div style="padding:6px 0"><div class="row" style="padding:0;border:0"><div class="grow title">${esc(catName(c))}</div>
      <div class="small num ${cls}">${brl(spent)} de ${brl(v)}</div></div>
      <div class="pbar"><i style="width:${Math.min(100, Math.round(p * 100))}%;background:${p > 1 ? 'var(--bad)' : p >= 0.8 ? 'var(--warn)' : 'var(--brand)'}"></i></div></div>`;
  }).join('') || '<div class="small muted">Defina um teto para restaurantes, compras, lazer…</div>'}
    <button class="btn ghost sm" data-act="limits" style="margin-top:8px">${lims.length ? 'Editar limites' : 'Definir limites'}</button></div>`;

  // Avisos de atualização, resumo do mês e backup.
  const prev = addM(cur, -1);
  const top = [];
  if (UPDATE) top.push(`<div class="alert ok">Nova versão ${esc(UPDATE.version)} disponível. <button class="btn sm" data-act="do-update">Atualizar</button></div>`);
  if (isCur && hasData(prev)) top.push(`<div class="alert ok">Resumo de ${mFull(prev)} pronto. <button class="btn sm ghost" data-act="summary" data-m="${prev}">Ver resumo</button></div>`);
  const lastShare = S.meta?.lastShare ? daysBetween(S.meta.lastShare, todayStr()) : null;
  if (NATIVE && S.settings.setupDone && (lastShare === null || lastShare > 30)) {
    top.push(`<div class="alert">Seu último backup fora do celular ${lastShare === null ? 'nunca foi feito' : `foi há ${lastShare} dias`}. <button class="btn sm ghost" data-act="backup">Enviar ao Drive</button></div>`);
  }

  // Contas anuais chegando: sugere guardar um pouco por mês.
  const upcoming = [];
  for (let i = 1; i <= 6; i++) {
    const MM = addM(M, i);
    S.fixed.filter((f) => f.kind === 'anual' && occurs(f, MM) && !occurs(f, addM(MM, -1)))
      .forEach((f) => upcoming.push({ f, MM, i, total: (+f.amount) * Math.max(1, +f.spread || 1) }));
  }
  const upHtml = upcoming.length ? `<h2>Contas anuais chegando</h2><div class="card">${upcoming.map(({ f, MM, i, total }) => `
    <div class="row"><div class="grow"><div class="title">${esc(f.name)}</div>
    <div class="small muted">${mFull(MM)}${f.spread > 1 ? ` · ${f.spread}x de ${brl(f.amount)}` : ''} · guarde ${brl(total / i)}/mês até lá</div></div>
    <div class="amt num">${brl(total)}</div></div>`).join('')}</div>` : '';

  const pl = plan().alloc[M];
  const planHtml = isCur && pl && pl.total > 0 ? `<h2>Separe para seus planos</h2><div class="card">${Object.entries(pl.by).map(([id, v]) => {
    const g = S.goals.find((x) => x.id === id);
    return `<div class="row"><div class="grow"><div class="title">${esc(g?.name)}</div></div><div class="amt num">${brl(v)}</div></div>`;
  }).join('')}</div>` : '';

  return `${top.join('')}${monthBar('month')}
  ${alerts.map(([k, t]) => `<div class="alert ${k}">${t}</div>`).join('')}
  <div class="card hero">
    <div class="sub">Livre para lazer ${isCur ? 'até o fim do mês' : `em ${mFull(M)}`}</div>
    <div class="big num">${brl(s.restante)}</div>
    <div class="sub">de ${brl(Math.max(0, s.livreLazer))} · já gasto ${brl(s.varLaz)}${isCur ? ` · ≈ ${brl(perDay)}/dia por ${daysLeft} dias` : ''}</div>
    <div class="bar"><i style="width:${Math.round(used * 100)}%"></i></div>
  </div>
  <div class="grid2">
    ${stat('Renda', brl(s.income), s.extraIncome ? `<div class="small muted">inclui ${brl(s.extraIncome)} extra</div>` : '')}
    ${stat('Fixos essenciais', brl(s.fixedEss))}
    ${stat('Fixos não essenciais', brl(s.fixedLaz))}
    ${stat('Variáveis essenciais', brl(s.varEss), `<div class="small muted">previsto ${brl(s.essPlanned)}</div>`)}
    ${stat('Guardar / planos', brl(s.reserved))}
    ${stat('Fatura do cartão', brl(s.card), `<div class="small muted">vence ${fmtDate(cardDueDate(M))}</div>`)}
  </div>
  <h2>Contas do mês</h2><div class="card">${bills}</div>
  ${limHtml}${planHtml}${upHtml}`;
}

/** Quanto foi gasto numa categoria no mês (lançamentos + contas fixas daquela categoria). */
function categorySpent(M, cat) {
  return sum(S.tx.filter((t) => t.payMonth === M && t.cat === cat && !t.linkedFixed), (t) => t.amount)
    + sum(fixedForMonth(M).filter((e) => e.f.cat === cat), (e) => e.f.amount);
}
const hasData = (M) => S.tx.some((t) => t.payMonth === M && !t.projected);

/* ---------- resumo do mês ---------- */
function summaryHtml(M) {
  const s = monthSummary(M); const p = baseMonth(addM(M, -1));
  const byCat = {};
  s.txs.forEach((t) => { byCat[t.cat] = (byCat[t.cat] || 0) + t.amount; });
  s.fx.forEach((f) => { byCat[f.cat] = (byCat[f.cat] || 0) + (+f.amount); });
  const prevCat = {};
  p.txs.forEach((t) => { prevCat[t.cat] = (prevCat[t.cat] || 0) + t.amount; });
  p.fx.forEach((f) => { prevCat[f.cat] = (prevCat[f.cat] || 0) + (+f.amount); });
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = sum(rows, (r) => r[1]);
  const prevTotal = sum(Object.values(prevCat));
  const saved = sum(S.goals.flatMap((g) => g.history || []).filter((h) => ymOf(h.date) === M), (h) => h.v);
  // Sugestão de corte: a categoria não essencial que mais cresceu.
  const cut = rows.filter(([c]) => !isEss(c)).map(([c, v]) => [c, v - (prevCat[c] || 0), v]).sort((a, b) => b[1] - a[1])[0];
  const over = Object.entries(S.limits || {}).filter(([c, v]) => +v > 0 && (byCat[c] || 0) > v);
  return `<h3>Resumo de ${mFull(M)}</h3>
  <div class="grid2">
    ${stat('Gastos totais', brl(total), prevTotal ? `<div class="small ${total > prevTotal ? 'neg' : 'pos'}">${total > prevTotal ? '+' : ''}${brl(total - prevTotal)} vs mês anterior</div>` : '')}
    ${stat('Sobrou livre', brl(s.restante))}
    ${stat('Guardado nos planos', brl(saved))}
    ${stat('Renda', brl(s.income))}
  </div>
  <div class="card">${rows.map(([c, v]) => {
    const d = v - (prevCat[c] || 0);
    return `<div class="row"><div class="grow"><div class="title">${esc(catName(c))}</div>
      <div class="small ${d > 0 ? 'neg' : 'muted'}">${prevCat[c] ? `${d > 0 ? '+' : ''}${brl(d)} vs anterior` : 'novo'}</div></div>
      <div class="amt num">${brl(v)}</div></div>`;
  }).join('') || '<div class="empty">Sem gastos registrados.</div>'}</div>
  ${over.length ? `<div class="alert bad">Passou do limite em: ${over.map(([c]) => esc(catName(c))).join(', ')}.</div>` : ''}
  ${cut && cut[1] > 0 ? `<div class="alert">Onde dá para cortar: <b>${esc(catName(cut[0]))}</b> subiu ${brl(cut[1])}. Voltar ao nível do mês anterior libera esse valor para os planos.</div>` : ''}
  <div class="btns"><button class="btn" data-act="close">Fechar</button></div>`;
}

/* ---------- Contas fixas ---------- */
function renderBills() {
  const cur = curM();
  const group = (kind, title) => {
    const list = S.fixed.filter((f) => f.kind === kind);
    if (!list.length) return '';
    return `<h2>${title}</h2><div class="card">${list.map((f) => {
      let info = `dia ${f.day}`;
      if (kind === 'anual') info = `${MONTHS_FULL[(+f.month || 1) - 1]}${f.spread > 1 ? ` · em ${f.spread}x` : ''} · dia ${f.day}`;
      if (kind === 'parcelado') {
        const end = fixedEnd(f); const left = Math.max(0, Math.min(+f.parcels, diffM(end, cur) + 1));
        info = left ? `faltam ${left} de ${f.parcels} · termina ${mLabel(end)}` : 'quitado';
      }
      return `<div class="row" data-act="edit-bill" data-id="${f.id}" style="cursor:pointer">
        <div class="grow"><div class="title">${esc(f.name)}</div><div class="small muted">${info}</div><div>${tags(f)}</div></div>
        <div class="amt num">${brl(f.amount)}</div></div>`;
    }).join('')}</div>`;
  };
  const s = monthSummary(cur);
  const KIND_TXT = (x) => ({
    unica: `em ${mFull(x.start)}`,
    anual: `todo ano em ${MONTHS_FULL[(+x.month || 1) - 1]}${x.spread > 1 ? ` (${x.spread}x)` : ''}`,
    parcelado: `${x.parcels} meses a partir de ${mLabel(x.start)}`,
    mensal: 'todo mês',
  }[x.kind]);
  const incomes = (S.incomes || []).map((x) => `<div class="row" data-act="edit-income" data-id="${x.id}" style="cursor:pointer">
    <div class="grow"><div class="title">${esc(x.name)}</div><div class="small muted">${KIND_TXT(x)}</div></div>
    <div class="amt num pos">+${brl(x.amount)}</div></div>`).join('');
  const incomeHtml = `<h2>Rendas extras</h2><div class="card">
    ${incomes || '<div class="small muted">13º, férias, bônus, freelas… Entram na previsão no mês certo.</div>'}
    <div class="btns" style="margin-top:8px">
      <button class="btn ghost sm" data-act="new-income">+ Renda extra</button>
      ${(S.incomes || []).some((x) => /13/.test(x.name)) ? '' : '<button class="chip" style="color:var(--brand)" data-act="new-income" data-tpl="13">13º salário</button>'}
      <button class="chip" style="color:var(--brand)" data-act="new-income" data-tpl="ferias">Férias</button>
    </div></div>`;
  return `<div class="fab-row"><button class="btn" data-act="new-bill">+ Nova conta fixa</button></div>
  <div class="grid2">${stat('Fixos neste mês', brl(s.fixedEss + s.fixedLaz))}${stat('Essenciais', brl(s.fixedEss))}</div>
  ${group('mensal', 'Mensais')}${group('anual', 'Anuais (IPVA, IPTU, seguro…)')}${group('parcelado', 'Parceladas e financiamentos')}
  ${S.fixed.length ? '' : '<div class="empty">Cadastre aluguel, luz, internet, financiamento do carro, IPVA…<br>Isso é a base da previsão.</div>'}
  ${incomeHtml}`;
}

function incomeForm(x, tpl) {
  const cur = curM(); const sal = +S.settings.income || 0;
  if (!x) {
    x = { kind: 'unica', start: cur, month: 12, spread: 1, parcels: 6, name: '', amount: '' };
    if (tpl === '13') Object.assign(x, { name: '13º salário', kind: 'anual', month: 11, spread: 2, amount: r2(sal / 2) });
    if (tpl === 'ferias') Object.assign(x, { name: 'Férias (1/3)', kind: 'unica', start: addM(cur, 1), amount: r2(sal / 3) });
  }
  const monthOpts = MONTHS_FULL.map((m, i) => `<option value="${i + 1}" ${+x.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
  const L = { unica: 'Uma vez', anual: 'Todo ano', parcelado: 'Por um tempo', mensal: 'Todo mês' };
  return `<h3>${x.id ? 'Editar renda extra' : 'Nova renda extra'}</h3>
  <form id="income-form" data-id="${x.id || ''}">
    <label class="f">Nome<input name="name" required value="${esc(x.name)}" placeholder="Ex.: Bônus, freela"></label>
    <label class="f">Valor (por vez)<input name="amount" inputmode="decimal" required value="${x.amount}" placeholder="0,00"></label>
    <div class="seg" data-seg="kind">${Object.entries(L).map(([k, l]) => `<button type="button" data-v="${k}" class="${x.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div data-kind="unica" ${x.kind === 'unica' ? '' : 'hidden'}><label class="f">Mês<input name="startU" type="month" value="${x.start || cur}"></label></div>
    <div data-kind="anual" ${x.kind === 'anual' ? '' : 'hidden'}><div class="f2">
      <label class="f">Mês<select name="month">${monthOpts}</select></label>
      <label class="f">Em quantas vezes<input name="spread" type="number" min="1" max="12" value="${x.spread || 1}"></label></div>
      <p class="small muted">13º: novembro, em 2 vezes (metade em nov, metade em dez).</p></div>
    <div data-kind="parcelado" ${x.kind === 'parcelado' ? '' : 'hidden'}><div class="f2">
      <label class="f">A partir de<input name="startP" type="month" value="${x.start || cur}"></label>
      <label class="f">Por quantos meses<input name="parcels" type="number" min="1" max="120" value="${x.parcels || 6}"></label></div></div>
    <div class="btns">
      <button class="btn" type="submit">Salvar</button>
      <button class="btn ghost" type="button" data-act="close">Cancelar</button>
      ${x.id ? '<button class="btn danger" type="button" data-act="del-income">Excluir</button>' : ''}
    </div>
  </form>`;
}

function limitsForm() {
  const cur = curM();
  return `<h3>Limites por categoria</h3>
  <p class="small muted">Teto de gasto por mês. Deixe em branco para não ter limite. Entre parênteses, o gasto deste mês.</p>
  <form id="limits-form">${Object.keys(CATS).map((c) => `<label class="f">${esc(catName(c))} <span class="muted">(${brl(categorySpent(cur, c))})</span>
    <input name="${c}" inputmode="decimal" value="${(S.limits || {})[c] || ''}" placeholder="sem limite"></label>`).join('')}
    <div class="btns"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-act="close">Cancelar</button></div>
  </form>`;
}

function billForm(f) {
  const cur = curM();
  f = f || { kind: 'mensal', cat: 'moradia', method: 'debito', day: 10, month: 4, spread: 1, parcels: 72 };
  const curParcel = f.kind === 'parcelado' && f.start ? Math.max(1, diffM(cur, f.start) + 1) : 1;
  const monthOpts = MONTHS_FULL.map((m, i) => `<option value="${i + 1}" ${+f.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
  return `<h3>${f.id ? 'Editar conta' : 'Nova conta fixa'}</h3>
  <form id="bill-form" data-id="${f.id || ''}">
    <label class="f">Nome<input name="name" required value="${esc(f.name || '')}" placeholder="Ex.: Financiamento do carro"></label>
    <div class="f2">
      <label class="f">Valor (por parcela)<input name="amount" inputmode="decimal" required value="${f.amount ?? ''}" placeholder="0,00"></label>
      <label class="f">Dia do vencimento<input name="day" type="number" min="1" max="31" required value="${f.day}"></label>
    </div>
    <div class="small muted">Repetição</div>
    <div class="seg" data-seg="kind">
      ${['mensal', 'anual', 'parcelado'].map((k) => `<button type="button" data-v="${k}" class="${f.kind === k ? 'on' : ''}">${{ mensal: 'Todo mês', anual: 'Uma vez por ano', parcelado: 'Parcelado' }[k]}</button>`).join('')}
    </div>
    <div data-kind="anual" ${f.kind === 'anual' ? '' : 'hidden'}>
      <div class="f2">
        <label class="f">Mês<select name="month">${monthOpts}</select></label>
        <label class="f">Em quantas vezes<input name="spread" type="number" min="1" max="12" value="${f.spread || 1}"></label>
      </div>
      <p class="small muted">Ex.: IPVA em abril à vista → mês abril, 1 vez. Em 3x → abril, 3 vezes (abr, mai, jun).</p>
    </div>
    <div data-kind="parcelado" ${f.kind === 'parcelado' ? '' : 'hidden'}>
      <div class="f2">
        <label class="f">Total de parcelas<input name="parcels" type="number" min="1" max="600" value="${f.parcels || 72}"></label>
        <label class="f">Parcela deste mês é a nº<input name="curParcel" type="number" min="1" value="${curParcel}"></label>
      </div>
      <p class="small muted">Ex.: carro em 6 anos = 72 parcelas. Se começou agora, parcela nº 1.</p>
    </div>
    <label class="f">Categoria<select name="cat">${catOptions(f.cat)}</select></label>
    <label class="f">Forma de pagamento<select name="method">
      <option value="debito" ${f.method !== 'credito' ? 'selected' : ''}>Débito, Pix ou boleto</option>
      <option value="credito" ${f.method === 'credito' ? 'selected' : ''}>Cartão de crédito</option></select></label>
    <label class="f">Como aparece no extrato (opcional)<input name="keyword" value="${esc(f.keyword || '')}" placeholder="Ex.: NETFLIX"></label>
    <div class="btns">
      <button class="btn" type="submit">Salvar</button>
      <button class="btn ghost" type="button" data-act="close">Cancelar</button>
      ${f.id ? '<button class="btn danger" type="button" data-act="del-bill">Excluir</button>' : ''}
    </div>
  </form>`;
}

/* ---------- Consultor ---------- */
function renderAdvisor() {
  const a = UI.adv;
  return `<div class="card">
    <h3>Vale a pena comprar agora?</h3>
    <p class="small muted">Digite o valor e a forma de pagamento. Eu confiro o orçamento deste e dos próximos meses, o ciclo do cartão e seus planos.</p>
    <form id="adv-form">
      <label class="f">Valor da compra<input name="value" inputmode="decimal" required value="${a.value ?? ''}" placeholder="0,00"></label>
      <label class="f">O que é (opcional)<input name="desc" value="${esc(a.desc || '')}" placeholder="Ex.: tênis, jantar, conserto"></label>
      <div class="small muted">Pagamento</div>
      <div class="seg" data-seg="method">
        <button type="button" data-v="debito" class="${a.method === 'debito' ? 'on' : ''}">Débito / Pix</button>
        <button type="button" data-v="credito" class="${a.method === 'credito' ? 'on' : ''}">Crédito</button>
      </div>
      <div data-show="credito" ${a.method === 'credito' ? '' : 'hidden'}>
        <label class="f">Parcelas<select name="parcels">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${+a.parcels === i + 1 ? 'selected' : ''}>${i + 1}x</option>`).join('')}</select></label>
      </div>
      <div data-show="debito" ${a.method === 'debito' ? '' : 'hidden'}>
        <label class="f">Saldo hoje na conta (opcional)<input name="balance" inputmode="decimal" value="${a.balance ?? ''}" placeholder="0,00"></label>
      </div>
      <label class="f">Categoria<select name="cat">${catOptions(a.cat || 'compras')}</select></label>
      <button class="btn block" type="submit">Analisar</button>
    </form>
  </div>
  <div id="adv-result">${a.result || ''}</div>`;
}

function adviceHtml(r, input) {
  const title = { ok: 'Bom momento', warn: 'Dá, mas com atenção', bad: 'Não é o melhor momento' }[r.level];
  const rows = r.rows.map((x) => `<tr><td>${mLabel(x.M)}</td><td class="num">${brl(x.amt)}</td><td class="num">${brl(x.room)}</td><td class="num ${x.after < 0 ? 'neg' : 'pos'}">${brl(x.after)}</td></tr>`).join('');
  return `<div class="verdict ${r.level}"><div class="vt">${title}</div>
    ${r.reasons.map((t) => `<p>${t}</p>`).join('')}</div>
  ${r.tips.length ? `<div class="card"><h3>Dicas</h3><ul class="tips">${r.tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>` : ''}
  <div class="card scroll-x"><h3>Impacto por mês</h3>
    <table class="t"><thead><tr><th>Mês</th><th>Compra</th><th>Livre antes</th><th>Livre depois</th></tr></thead><tbody>${rows}</tbody></table></div>
  <button class="btn block ghost" data-act="register-buy">Comprei: registrar ${brl(input.value)}${input.method === 'credito' && input.parcels > 1 ? ` em ${input.parcels}x` : ''}</button>`;
}

/* ---------- Planos ---------- */
const PRI_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
function renderPlans() {
  const cur = curM(); const P = plan(); const st = S.settings;
  const goals = S.goals;
  const cards = goals.map((g) => {
    const saved = +g.saved || 0; const target = +g.target || 0; const prog = target ? Math.min(1, saved / target) : 0;
    const eta = P.eta[g.id];
    const now = P.alloc[cur]?.by[g.id] || 0;
    let status = '';
    const tips = [];
    if (eta === 'feito') status = '<span class="pos">Concluído 🎉</span>';
    else if (!eta) {
      status = '<span class="neg">Não cabe no orçamento em 10 anos</span>';
      tips.push('Aumente a fatia do lazer para planos, reduza o valor ou corte uma conta fixa.');
    } else if (g.deadline && diffM(eta, g.deadline) > 0) {
      status = `<span class="neg">Fica pronto em ${mFull(eta)} (${diffM(eta, g.deadline)} meses depois do prazo)</span>`;
      const months = Math.max(1, diffM(g.deadline, cur) + 1);
      const ideal = (target - saved) / months;
      let byDeadline = saved;
      for (let M = cur; diffM(g.deadline, M) >= 0; M = addM(M, 1)) byDeadline += P.alloc[M]?.by[g.id] || 0;
      const avg = (byDeadline - saved) / months;
      if (avg > 0) tips.push(`Para cumprir até ${mFull(g.deadline)} seria preciso ${brl(ideal)}/mês; hoje cabe em média ${brl(avg)}/mês.`);
      else tips.push(`Até ${mFull(g.deadline)} o dinheiro vai para planos de prioridade maior. Este começa a receber quando eles terminarem.`);
      tips.push(`Opções: adiar o prazo para ${mFull(eta)}${byDeadline > saved ? `, reduzir a meta para ${brl(byDeadline)}` : ''}, subir a prioridade, ou aumentar a fatia do lazer.`);
    } else {
      status = `<span class="pos">Fica pronto em ${mFull(eta)}${g.deadline ? ' · dentro do prazo' : ''}</span>`;
    }
    return `<div class="card">
      <div class="row" style="padding-top:0"><div class="grow"><div class="title">${esc(g.name)}</div>
        <div class="small muted">Prioridade ${PRI_LABEL[g.priority] || 'Média'}${g.deadline ? ` · prazo ${mFull(g.deadline)}` : ''}</div></div>
        <div class="amt num">${brl(target)}</div></div>
      <div class="pbar"><i style="width:${Math.round(prog * 100)}%"></i></div>
      <div class="small muted" style="margin-top:4px">${brl(saved)} guardado (${pct(prog)})</div>
      <p class="small" style="margin:8px 0 4px">${status}</p>
      ${eta !== 'feito' ? `<p class="small" style="margin:0 0 8px">Guardar neste mês: <b>${brl(now)}</b></p>` : ''}
      ${tips.length ? `<ul class="tips small">${tips.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
      <div class="btns" style="margin-top:8px">
        <button class="btn sm" data-act="deposit" data-id="${g.id}">Guardei dinheiro</button>
        <button class="btn sm ghost" data-act="edit-goal" data-id="${g.id}">Editar</button>
      </div></div>`;
  }).join('');

  // Linha do tempo e tabela de quanto guardar por mês.
  const timeline = goals.filter((g) => P.eta[g.id] && P.eta[g.id] !== 'feito')
    .sort((a, b) => diffM(P.eta[a.id], P.eta[b.id]))
    .map((g) => `<div class="row"><div class="grow"><div class="title">${esc(g.name)}</div></div><div class="small">${mFull(P.eta[g.id])}</div></div>`).join('');
  const months = Array.from({ length: 12 }, (_, i) => addM(cur, i));
  const active = goals.filter((g) => P.eta[g.id] !== 'feito');
  const table = active.length ? `<div class="card scroll-x"><h3>Quanto guardar em cada mês</h3>
    <table class="t"><thead><tr><th>Mês</th>${active.map((g) => `<th>${esc(g.name.slice(0, 12))}</th>`).join('')}<th>Total</th></tr></thead><tbody>
    ${months.map((M) => `<tr><td>${mLabel(M)}</td>${active.map((g) => `<td class="num">${brl(P.alloc[M]?.by[g.id] || 0)}</td>`).join('')}<td class="num"><b>${brl(P.alloc[M]?.total || 0)}</b></td></tr>`).join('')}
    </tbody></table></div>` : '';

  const b = baseMonth(cur);
  return `<div class="card">
    <h3>Seu planejamento</h3>
    <p class="small muted">Conte seus planos com valor e prazo. Eu divido o que sobra por mês entre eles, por prioridade e prazo, e aviso o que não cabe.</p>
    <div class="grid2" style="margin:8px 0">
      ${stat('Meta de poupança', `${st.savingsPct}%`, `<div class="small muted">${brl(b.savings)}/mês</div>`)}
      ${stat('Capacidade este mês', brl(P.capacity[cur] ?? 0))}
    </div>
    <label class="f">Fatia do lazer que pode ir para os planos: <b id="share-v">${st.lazerToPlans}%</b>
      <input type="range" min="0" max="100" step="5" value="${st.lazerToPlans}" data-act="share" style="padding:0;border:0"></label>
  </div>
  <div class="card">
    <h3>Conte seus planos</h3>
    <form id="talk-form">
      <label class="f">Escreva do seu jeito. Eu monto as metas.
        <textarea class="f-area" name="text" placeholder="Ex.: Quero viajar para o Chile em julho de 2027, uns 10 mil. Também quero trocar de celular até março, 3.500, já tenho 500. E montar minha reserva de emergência."></textarea></label>
      <button class="btn block" type="submit">Montar planos</button>
      <p class="small muted" style="margin:6px 0 0">${S.settings.aiKey ? 'Usando o Claude (precisa de internet).' : 'Leitura feita no próprio celular. Para entender textos mais livres, cadastre uma chave da API do Claude em Configurações.'}</p>
    </form>
    <div id="talk-result"></div>
  </div>
  <div class="fab-row"><button class="btn" data-act="new-goal">+ Novo plano</button></div>
  <div class="btns" style="margin-bottom:12px">
    ${['Reserva de emergência', 'Viagem', 'Trocar de carro', 'Quitar dívida', 'Entrada de imóvel'].map((t) => `<button class="chip" style="color:var(--brand)" data-act="new-goal" data-tpl="${t}">${t}</button>`).join('')}
  </div>
  ${cards || '<div class="empty">Nenhum plano ainda. Toque em um atalho acima.</div>'}
  ${timeline ? `<h2>Linha do tempo</h2><div class="card">${timeline}</div>` : ''}
  ${table}`;
}

function goalForm(g, tpl) {
  const cur = curM();
  if (!g) {
    g = { name: tpl || '', priority: 'media', saved: 0, deadline: addM(cur, 12) };
    if (tpl === 'Reserva de emergência') {
      const b = baseMonth(cur);
      g.target = r2(6 * (b.fixedEss + Math.max(+S.settings.varEssBudget || 0, b.varEss)));
      g.priority = 'alta';
    }
  }
  return `<h3>${g.id ? 'Editar plano' : 'Novo plano'}</h3>
  <form id="goal-form" data-id="${g.id || ''}">
    <label class="f">Nome<input name="name" required value="${esc(g.name)}" placeholder="Ex.: Viagem para o Nordeste"></label>
    <div class="f2">
      <label class="f">Quanto custa<input name="target" inputmode="decimal" required value="${g.target ?? ''}" placeholder="0,00"></label>
      <label class="f">Já tenho guardado<input name="saved" inputmode="decimal" value="${g.saved ?? 0}"></label>
    </div>
    <label class="f">Até quando<input name="deadline" type="month" value="${g.deadline || ''}" min="${cur}"></label>
    ${tpl === 'Reserva de emergência' ? '<p class="small muted">Sugestão: 6 meses dos seus gastos essenciais.</p>' : ''}
    <div class="small muted">Prioridade</div>
    <div class="seg" data-seg="priority">
      ${['alta', 'media', 'baixa'].map((p) => `<button type="button" data-v="${p}" class="${g.priority === p ? 'on' : ''}">${PRI_LABEL[p]}</button>`).join('')}
    </div>
    <div class="btns">
      <button class="btn" type="submit">Salvar</button>
      <button class="btn ghost" type="button" data-act="close">Cancelar</button>
      ${g.id ? '<button class="btn danger" type="button" data-act="del-goal">Excluir</button>' : ''}
    </div>
  </form>`;
}

/* ---------- planos por conversa ---------- */
const MONTH_RE = 'jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço|co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?';
const monthIdx = (s) => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(s.slice(0, 3).toLowerCase().replace('ç', 'c'));

/** Lê valores como "10 mil", "R$ 3.500", "2k", "1,5 mil". Devolve [valores na ordem]. */
function readAmounts(t) {
  const out = [];
  const re = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(mil|k)?\b/gi;
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 4), m.index).toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 12).toLowerCase();
    if (/^\s*(de\s+)?(20\d\d)/.test(m[0]) || /^\s*(meses|mês|mes|anos?|x|vezes|dias)/.test(after) || /\/$/.test(before)) continue;
    if (/^(20\d\d)$/.test(m[1])) continue;
    // "3.500" é milhar em português, não 3,5.
    let v = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(m[1]) ? money(m[1].replace(/\./g, '')) : money(m[1]);
    if (m[2]) v *= 1000;
    if (v >= 10) out.push({ v, i: m.index });
  }
  return out;
}
/** Prazo: "julho de 2027", "jul/27", "até março", "em 2 anos", "daqui 6 meses", "fim do ano". */
function readDeadline(t) {
  const cur = curM(); const low = t.toLowerCase();
  let m = low.match(new RegExp(`(${MONTH_RE})\\s*(?:de|/)?\\s*(20\\d\\d|\\d\\d)\\b`));
  if (m) { const y = m[2].length === 2 ? `20${m[2]}` : m[2]; return `${y}-${pad(monthIdx(m[1]) + 1)}`; }
  m = low.match(/(?:em|daqui(?: a)?)\s*(\d+|um|uma|dois|duas|tr[eê]s)\s*(anos?|meses|m[eê]s)/);
  if (m) {
    const n = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3 }[m[1]] || +m[1];
    return addM(cur, /ano/.test(m[2]) ? n * 12 : n);
  }
  m = low.match(new RegExp(`(?:at[eé]|em|para)\\s+(${MONTH_RE})\\b`));
  if (m) { const mi = monthIdx(m[1]) + 1; let y = +cur.slice(0, 4); if (mi <= +cur.slice(5)) y++; return `${y}-${pad(mi)}`; }
  m = low.match(/\b(20\d\d)\b/);
  if (m) return `${m[1]}-12`;
  if (/fim do ano|final do ano/.test(low)) return `${cur.slice(0, 4)}-12`;
  return null;
}
function localParsePlans(text) {
  const parts = text.split(/(?<!\d)\.(?!\d)|[;\n]+|\s+e\s+(?=(?:tamb[eé]m|quero|preciso|pretendo|vou|gostaria|meu|minha|fazer|comprar|trocar|juntar|guardar|montar|quitar|pagar|viajar))|\btamb[eé]m\b/i)
    .map((p) => p.trim()).filter((p) => p.length > 3);
  const plans = [];
  for (const p of parts) {
    const amts = readAmounts(p);
    const savedM = p.match(/j[aá] (?:tenho|guardei|juntei)\s*(?:r\$\s*)?([\d.,]+\s*(?:mil|k)?)/i);
    const saved = savedM ? readAmounts(savedM[1])[0]?.v || 0 : 0;
    const target = amts.find((a) => !savedM || a.v !== saved)?.v || 0;
    const reserva = /reserva|emerg[eê]ncia/i.test(p);
    if (!target && !reserva) continue;
    let name = p
      .replace(/r\$\s*[\d.,]+\s*(mil|k)?/gi, '').replace(/\b\d[\d.,]*\s*(mil|k|reais)?\b/gi, '')
      .replace(new RegExp(`\\b(em|at[eé]|para|de)?\\s*(${MONTH_RE})(\\s*(de|/)?\\s*(20)?\\d\\d)?\\b`, 'gi'), '')
      .replace(/j[aá] (tenho|guardei|juntei).*/i, '')
      .replace(/\b(eu\s+)?(quero|preciso|pretendo|vou|gostaria de|queria|tamb[eé]m|uns|umas|cerca de|mais ou menos|daqui( a)?|em \w+ (anos?|meses)|anos?|meses|at[eé]|custa|custando|que custa|no valor de)\b/gi, '')
      .replace(/\b(se der|se sobrar|quando puder|sem pressa|urgente)\b/gi, '')
      .replace(/\s+/g, ' ').replace(/^[\s,e-]+|[\s,-]+$/g, '')
      .replace(/(\s+(de|do|da|em|at[eé]|para|por|no|na|com))+$/i, '').trim();
    if (!name) name = reserva ? 'Reserva de emergência' : 'Plano';
    name = name.charAt(0).toUpperCase() + name.slice(1);
    let t = target;
    if (reserva && !t) { const b = baseMonth(curM()); t = r2(6 * (b.fixedEss + Math.max(+S.settings.varEssBudget || 0, b.varEss))); }
    const priority = reserva || /urgente|prioridade|d[ií]vida|quitar/i.test(p) ? 'alta' : /se der|se sobrar|quando puder|sem pressa/i.test(p) ? 'baixa' : 'media';
    plans.push({ name: name.slice(0, 40), target: t, saved, deadline: readDeadline(p), priority });
  }
  return { plans, note: plans.length ? 'Confira os valores e prazos antes de adicionar.' : 'Não encontrei planos com valor. Tente: "viagem de 8 mil em julho de 2027".' };
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.MeuBolsoAI) { res(); return; }
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Não consegui carregar o módulo de IA.'));
    document.head.appendChild(s);
  });
}
let talkDraft = null;
async function runTalk(text) {
  const box = $('#talk-result');
  box.innerHTML = '<p class="small muted">Montando…</p>';
  let res;
  try {
    if (S.settings.aiKey) {
      await loadScript('vendor/ai.js');
      res = await window.MeuBolsoAI.parsePlans(text, S.settings.aiKey, todayStr());
    } else res = localParsePlans(text);
  } catch (err) {
    res = localParsePlans(text);
    res.note = `${err.message} Usei a leitura do celular. ${res.note}`;
  }
  talkDraft = res.plans.map((p) => ({ ...p, id: uid(), saved: +p.saved || 0, target: r2(+p.target || 0) }));
  box.innerHTML = `<p class="small">${esc(res.note)}</p>${talkDraft.map((p, i) => `<label class="row" style="cursor:pointer">
    <input type="checkbox" data-talk="${i}" checked>
    <div class="grow"><div class="title">${esc(p.name)}</div>
      <div class="small muted">${brl(p.target)}${p.saved ? ` · já tem ${brl(p.saved)}` : ''} · ${p.deadline ? `até ${mFull(p.deadline)}` : 'sem prazo'} · prioridade ${PRI_LABEL[p.priority]}</div></div></label>`).join('')}
    ${talkDraft.length ? '<button class="btn block" data-act="talk-add" style="margin-top:8px">Adicionar marcados</button>' : ''}`;
}

/* ---------- Previsão ---------- */
function renderForecast() {
  const cur = curM(); const n = UI.horizon;
  const months = Array.from({ length: n }, (_, i) => addM(cur, i));
  const data = months.map((M) => monthSummary(M));

  // Gráfico de barras empilhadas.
  const bw = 22; const gap = 10; const H = 150; const W = n * (bw + gap);
  const maxV = Math.max(1, ...data.map((d) => Math.max(d.income, d.fixedEss + d.fixedLaz + d.essPlanned + d.varLaz + d.reserved)));
  const y = (v) => (v / maxV) * H;
  const bars = data.map((d, i) => {
    const x = i * (bw + gap) + gap / 2; let base = H;
    const segs = [
      [d.fixedEss + d.fixedLaz, 'var(--c-fixed)', 'Contas fixas'], [d.essPlanned, 'var(--c-ess)', 'Variáveis essenciais'],
      [d.varLaz, 'var(--c-card)', 'Compras já feitas'], [d.reserved, 'var(--c-plan)', 'Poupança / planos'],
      [Math.max(0, d.restante), 'var(--c-free)', 'Livre'],
    ];
    const rects = segs.map(([v, c, label]) => {
      const h = y(Math.max(0, v)); base -= h;
      return h > 0 ? `<rect x="${x}" y="${base}" width="${bw}" height="${h}" fill="${c}" rx="2"><title>${mLabel(d.M)} · ${label}: ${brl(v)}</title></rect>` : '';
    }).join('');
    const inc = H - y(d.income);
    return `${rects}<line x1="${x - 3}" x2="${x + bw + 3}" y1="${inc}" y2="${inc}" stroke="var(--text)" stroke-width="1.5"><title>Renda ${brl(d.income)}</title></line>
      ${d.restante < 0 ? `<circle cx="${x + bw / 2}" cy="${Math.max(6, base - 8)}" r="4" fill="var(--bad)"><title>Falta ${brl(-d.restante)}</title></circle>` : ''}
      <text x="${x + bw / 2}" y="${H + 14}" text-anchor="middle">${MONTHS[+d.M.slice(5) - 1]}</text>`;
  }).join('');

  // Destaques: contas anuais e parcelamentos que terminam.
  const notes = [];
  months.forEach((M) => S.fixed.filter((f) => f.kind === 'anual' && occurs(f, M)).forEach((f) => notes.push(['warn', `${mFull(M)}: ${esc(f.name)} +${brl(f.amount)}`])));
  data.forEach((d) => d.extras.filter((x) => x.kind !== 'mensal').forEach((x) => notes.push(['ok', `${mFull(d.M)}: entra ${esc(x.name)} ${brl(x.amount)}`])));
  S.fixed.filter((f) => f.kind === 'parcelado').forEach((f) => {
    const end = fixedEnd(f);
    if (diffM(end, cur) >= 0) notes.push(['ok', `${esc(f.name)} termina em ${mFull(end)}: libera ${brl(f.amount)}/mês a partir de ${mFull(addM(end, 1))}.`]);
  });
  data.filter((d) => d.restante < 0).forEach((d) => notes.unshift(['bad', `${mFull(d.M)}: faltam ${brl(-d.restante)}. Antecipe cortes ou guarde antes.`]));

  // Média real de gastos variáveis essenciais dos últimos 3 meses.
  const past = [1, 2, 3].map((i) => baseMonth(addM(cur, -i)).varEss).filter((v) => v > 0);
  const avgEss = past.length ? sum(past) / past.length : 0;
  const essNote = avgEss && Math.abs(avgEss - (+S.settings.varEssBudget || 0)) > 0.15 * avgEss
    ? `<div class="alert">Seus gastos essenciais variáveis (mercado, transporte…) foram em média <b>${brl(avgEss)}</b> nos últimos meses; o orçamento está em ${brl(S.settings.varEssBudget)}. <button class="btn sm" data-act="use-avg" data-v="${r2(avgEss)}">Usar a média</button></div>` : '';

  const rows = data.map((d) => `<tr><td>${mLabel(d.M)}</td><td class="num">${brl(d.income)}</td><td class="num">${brl(d.fixedEss + d.fixedLaz)}</td>
    <td class="num">${brl(d.essPlanned + d.varLaz)}</td><td class="num">${brl(d.reserved)}</td><td class="num ${d.restante < 0 ? 'neg' : ''}"><b>${brl(d.restante)}</b></td></tr>`).join('');

  return `<div class="seg" data-seg="horizon">
    ${[6, 12, 24].map((h) => `<button type="button" data-v="${h}" class="${n === h ? 'on' : ''}">${h} meses</button>`).join('')}
  </div>
  <div class="card"><h3>Para onde vai a renda</h3>
    <div class="scroll-x"><svg class="chart" viewBox="0 0 ${W} ${H + 20}" width="${Math.max(W, 300)}" height="${H + 20}" role="img" aria-label="Previsão por mês">${bars}</svg></div>
    <div class="legend"><span><i style="background:var(--c-fixed)"></i>Contas fixas</span><span><i style="background:var(--c-ess)"></i>Variáveis essenciais</span>
      <span><i style="background:var(--c-card)"></i>Compras já feitas</span><span><i style="background:var(--c-plan)"></i>Poupança/planos</span>
      <span><i style="background:var(--c-free)"></i>Livre</span><span>— renda</span></div>
  </div>
  ${essNote}
  ${notes.slice(0, 14).map(([k, t]) => `<div class="alert ${k}">${t}</div>`).join('')}
  <div class="card scroll-x"><table class="t"><thead><tr><th>Mês</th><th>Renda</th><th>Fixos</th><th>Variáveis</th><th>Guardar</th><th>Livre</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- Gastos ---------- */
function renderTx() {
  const M = UI.txMonth;
  const list = S.tx.filter((t) => t.payMonth === M).sort((a, b) => b.date.localeCompare(a.date));
  const total = sum(list.filter((t) => !t.linkedFixed), (t) => t.amount);
  const rows = list.map((t) => {
    const f = t.linkedFixed && S.fixed.find((x) => x.id === t.linkedFixed);
    return `<div class="row">
      <div class="grow"><div class="title">${esc(t.desc)}</div>
        <div class="small muted">${fmtDate(t.date)} · ${t.method === 'credito' ? 'cartão' : 'débito'}${t.projected ? ' · parcela futura' : ''}${f ? ` · conta fixa: ${esc(f.name)}` : ''}</div>
        <select class="small" data-act="tx-cat" data-id="${t.id}" style="margin-top:4px;border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:2px 4px;max-width:100%">${catOptions(t.cat)}</select>
      </div>
      <div style="text-align:right"><div class="amt num">${brl(t.amount)}</div>
        <button class="icon-btn small muted" data-act="del-tx" data-id="${t.id}" aria-label="Excluir">✕</button></div></div>`;
  }).join('');
  return `${monthBar('txMonth')}
  <div class="fab-row">
    <button class="btn" data-act="import">Importar Nubank</button>
    <button class="btn ghost" data-act="new-tx">+ Gasto</button>
  </div>
  <p class="small muted">Gastos do cartão aparecem no mês em que a fatura vence. Lançamentos de contas fixas não contam em dobro.</p>
  <div class="grid2">${stat('Gastos variáveis', brl(total))}${stat('Lançamentos', list.length)}</div>
  <div class="card">${rows || '<div class="empty">Nada neste mês.<br>Importe o extrato ou a fatura do Nubank (CSV ou OFX).</div>'}</div>
  <details class="card small"><summary><b>Como exportar do Nubank</b></summary>
    <p><b>Fatura do cartão:</b> no app, Cartão de crédito → Faturas → escolha a fatura → Exportar fatura (CSV). O arquivo chega por e-mail.</p>
    <p><b>Extrato da conta:</b> no app, Conta → ícone de extrato → Exportar extrato → escolha o período e o formato CSV ou OFX.</p>
    <p>Pagamentos de fatura, entradas e Caixinhas/investimentos são ignorados automaticamente.</p>
  </details>`;
}

function txForm() {
  return `<h3>Novo gasto</h3>
  <form id="tx-form">
    <label class="f">Descrição<input name="desc" required placeholder="Ex.: Mercado"></label>
    <div class="f2">
      <label class="f">Valor<input name="amount" inputmode="decimal" required placeholder="0,00"></label>
      <label class="f">Data<input name="date" type="date" required value="${todayStr()}"></label>
    </div>
    <label class="f">Forma<select name="method"><option value="debito">Débito / Pix</option><option value="credito">Cartão de crédito</option></select></label>
    <label class="f">Parcelas (crédito)<input name="parcels" type="number" min="1" max="24" value="1"></label>
    <label class="f">Categoria<select name="cat">${catOptions('mercado')}</select></label>
    <div class="btns"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-act="close">Cancelar</button></div>
  </form>`;
}

/** Registra uma compra (com parcelas no cartão, cada parcela no mês da fatura). */
function addPurchase({ desc, value, method, parcels, cat, date }) {
  date = date || todayStr();
  const M0 = method === 'credito' ? cardPayMonth(date) : ymOf(date);
  const lim = +(S.limits || {})[cat] || 0;
  const before = lim ? categorySpent(M0, cat) : 0;
  setTimeout(() => {
    if (!lim) return;
    const after = categorySpent(M0, cat);
    if (after > lim && before <= lim) toast(`Atenção: passou o limite de ${catName(cat)} (${brl(after)} de ${brl(lim)}).`);
    else if (after >= 0.8 * lim && before < 0.8 * lim) toast(`Você já usou ${pct(after / lim)} do limite de ${catName(cat)}.`);
  }, 50);
  if (method === 'credito') {
    const first = cardPayMonth(date); const n = Math.max(1, parcels || 1); const each = r2(value / n);
    for (let i = 0; i < n; i++) {
      S.tx.push({ id: uid(), date, desc: n > 1 ? `${desc} (${i + 1}/${n})` : desc, amount: each, cat, method, payMonth: addM(first, i), source: 'manual', projected: i > 0 });
    }
  } else {
    S.tx.push({ id: uid(), date, desc, amount: r2(value), cat, method: 'debito', payMonth: ymOf(date), source: 'manual' });
  }
  save();
}

/* ---------- configurações ---------- */
function settingsForm() {
  const s = S.settings;
  return `<h3>${s.setupDone ? 'Configurações' : 'Bem-vindo! Vamos configurar'}</h3>
  ${s.setupDone ? '' : '<p class="small muted">Leva 1 minuto. Dá para mudar tudo depois na engrenagem.</p>'}
  <form id="set-form">
    <div class="f2">
      <label class="f">Renda líquida mensal<input name="income" inputmode="decimal" value="${s.income || ''}" placeholder="0,00"></label>
      <label class="f">Dia que o salário cai<input name="payDay" type="number" min="1" max="31" value="${s.payDay}"></label>
    </div>
    <div class="f2">
      <label class="f">Meta de poupança (%)<input name="savingsPct" type="number" min="0" max="90" value="${s.savingsPct}"></label>
      <label class="f">Mercado, transporte e outros essenciais variáveis por mês<input name="varEssBudget" inputmode="decimal" value="${s.varEssBudget || ''}" placeholder="0,00"></label>
    </div>
    <h3 style="margin-top:8px">Cartão Nubank</h3>
    <div class="f2">
      <label class="f">Dia do fechamento<input name="cardClose" type="number" min="1" max="31" value="${s.cardClose}"></label>
      <label class="f">Dia do vencimento<input name="cardDue" type="number" min="1" max="31" value="${s.cardDue}"></label>
    </div>
    <label class="f">Limite total do cartão (opcional)<input name="cardLimit" inputmode="decimal" value="${s.cardLimit || ''}" placeholder="0,00"></label>
    <p class="small muted">No app do Nubank: Cartão de crédito → Ajustes do cartão → Data de vencimento mostra o melhor dia de compra (fechamento).</p>
    <h3 style="margin-top:8px">Celular</h3>
    <label class="f" style="display:flex;gap:10px;align-items:center;color:var(--text)"><input type="checkbox" name="notify" ${s.notify ? 'checked' : ''}> Lembretes de vencimento, fatura e resumo do mês</label>
    <label class="f" style="display:flex;gap:10px;align-items:center;color:var(--text)"><input type="checkbox" name="lock" ${s.lock ? 'checked' : ''}> Pedir digital ou PIN para abrir</label>
    <label class="f">Chave da API do Claude (opcional, para "Conte seus planos")<input name="aiKey" type="password" autocomplete="off" value="${esc(s.aiKey || '')}" placeholder="sk-ant-…"></label>
    <p class="small muted">A chave fica só neste celular. Cada uso custa centavos na sua conta da Anthropic. Sem chave, a leitura é feita no próprio celular.</p>
    <label class="f">Tema<select name="theme">
      ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></label>
    <div class="btns"><button class="btn" type="submit">Salvar</button>${s.setupDone ? '<button class="btn ghost" type="button" data-act="close">Fechar</button>' : ''}</div>
  </form>
  ${s.setupDone ? `<h3 style="margin-top:18px">Seus dados</h3>
  <p class="small muted">Ficam só neste celular. Faça backup de vez em quando.</p>
  ${NATIVE ? `<p class="small muted">Backup automático semanal em Documentos/MeuBolso: ${S.meta?.lastAutoBackup ? `último em ${fmtDate(S.meta.lastAutoBackup)}/${S.meta.lastAutoBackup.slice(0, 4)}` : 'ainda não feito'}.</p>` : ''}
  <div class="btns">
    <button class="btn ghost sm" data-act="backup">${NATIVE ? 'Enviar backup (Drive, WhatsApp…)' : 'Baixar backup'}</button>
    <button class="btn ghost sm" data-act="restore">Restaurar backup</button>
    <button class="btn danger sm" data-act="reset">Apagar tudo</button>
  </div>
  ${NATIVE ? `<h3 style="margin-top:18px">Versão</h3>
  <p class="small muted">Instalada: ${esc(APPVER?.versionName || '?')}${UPDATE ? ` · disponível: ${esc(UPDATE.version)}` : ''}</p>
  <div class="btns"><button class="btn ghost sm" data-act="${UPDATE ? 'do-update' : 'check-update'}">${UPDATE ? 'Baixar e instalar atualização' : 'Verificar atualização'}</button></div>` : ''}` : ''}`;
}
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ---------- rascunhos: salva tudo que está sendo digitado ---------- */
// Cada formulário é salvo a cada tecla. Se o app fechar no meio, ao abrir de novo
// ele volta para o mesmo formulário com o que já tinha sido preenchido.
const DRAFT_KEY = 'meu-bolso-rascunhos';
const UI_KEY = 'meu-bolso-ui';
let modalRef = null; // qual formulário está aberto no modal, para reabrir depois

function readDrafts() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } }
function writeDrafts(all) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(all)); } catch { /* sem armazenamento */ } }
const draftKey = (form) => `${form.id}|${form.dataset.id || ''}`;

function saveDraft(form) {
  if (!form?.id) return;
  const d = formData(form);
  $$('[data-seg]', form).forEach((s) => { d[`seg:${s.dataset.seg}`] = segValue(form, s.dataset.seg); });
  const all = readDrafts();
  all[draftKey(form)] = { d, at: Date.now(), reopen: form.closest('dialog') ? modalRef : null };
  writeDrafts(all);
}
function restoreDraft(form) {
  const dr = form && readDrafts()[draftKey(form)];
  if (!dr) return;
  $$('input[type=checkbox][name]', form).forEach((c) => { c.checked = c.name in dr.d; });
  for (const [k, v] of Object.entries(dr.d)) {
    if (form.elements[k]?.type === 'checkbox') continue;
    if (k.startsWith('seg:')) { const btn = $(`[data-seg="${k.slice(4)}"] [data-v="${v}"]`, form); if (btn) setSeg(btn); continue; }
    const el = form.elements[k];
    if (el && el.type !== 'file') el.value = v;
  }
}
function clearDraft(form) {
  if (!form?.id) return;
  const all = readDrafts(); delete all[draftKey(form)]; writeDrafts(all);
}
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: UI.tab })); } catch { /* ok */ } }

/* ---------- modal e avisos ---------- */
const modal = () => $('#modal');
function openModal(html, ref = null) {
  modalRef = ref;
  $('#modal-body').innerHTML = html;
  restoreDraft($('#modal-body form'));
  if (!modal().open) modal().showModal();
}
function closeModal() { if (modal().open) modal().close(); modalRef = null; }
/** Reabre o formulário pelo descritor salvo no rascunho. */
function reopenModal(ref) {
  if (!ref) return;
  if (ref.k === 'settings') openModal(settingsForm(), ref);
  else if (ref.k === 'bill') { const f = ref.id && S.fixed.find((x) => x.id === ref.id); if (!ref.id || f) openModal(billForm(f), ref); }
  else if (ref.k === 'goal') { const g = ref.id && S.goals.find((x) => x.id === ref.id); if (!ref.id || g) openModal(goalForm(g, ref.tpl), ref); }
  else if (ref.k === 'tx') openModal(txForm(), ref);
  else if (ref.k === 'income') { const x = ref.id && S.incomes.find((y) => y.id === ref.id); if (!ref.id || x) openModal(incomeForm(x, ref.tpl), ref); }
  else if (ref.k === 'limits') openModal(limitsForm(), ref);
}
function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;z-index:50;font-size:14px;max-width:90vw;text-align:center';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const segValue = (root, name) => $(`[data-seg="${name}"] .on`, root)?.dataset.v;

/* ---------- eventos ---------- */
let pendingImport = null;

/** Liga um botão de um seletor (seg) e mostra/esconde as partes do formulário ligadas a ele. */
function setSeg(btn) {
  const seg = btn.parentElement; const name = seg.dataset.seg; const v = btn.dataset.v;
  $$('button', seg).forEach((b) => b.classList.toggle('on', b === btn));
  if (name === 'kind') $$('[data-kind]', seg.closest('form')).forEach((el) => { el.hidden = el.dataset.kind !== v; });
  if (name === 'method') { UI.adv.method = v; $$('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== v; }); }
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tabs button');
  if (tab) { UI.tab = tab.dataset.tab; render(); return; }

  const segBtn = e.target.closest('[data-seg] button');
  if (segBtn) {
    setSeg(segBtn);
    if (segBtn.parentElement.dataset.seg === 'horizon') { UI.horizon = +segBtn.dataset.v; render(); }
    saveDraft(segBtn.closest('form'));
    return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act; const id = el.dataset.id;
  if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'range')) return; // tratados no 'change'/'input'

  switch (act) {
    case 'month': UI[el.dataset.key] = addM(UI[el.dataset.key], +el.dataset.d); render(); break;
    case 'paid': {
      const M = UI.month; S.paid[M] = S.paid[M] || {};
      S.paid[M][id] = el.checked; save(); break;
    }
    case 'close': clearDraft($('#modal-body form')); closeModal(); break;
    case 'new-bill': openModal(billForm(), { k: 'bill' }); break;
    case 'edit-bill': openModal(billForm(S.fixed.find((f) => f.id === id)), { k: 'bill', id }); break;
    case 'del-bill': {
      const fid = $('#bill-form').dataset.id;
      if (confirm('Excluir esta conta fixa?')) { S.fixed = S.fixed.filter((f) => f.id !== fid); save(); closeModal(); render(); }
      break;
    }
    case 'new-goal': openModal(goalForm(null, el.dataset.tpl), { k: 'goal', tpl: el.dataset.tpl }); break;
    case 'edit-goal': openModal(goalForm(S.goals.find((g) => g.id === id)), { k: 'goal', id }); break;
    case 'del-goal': {
      const gid = $('#goal-form').dataset.id;
      if (confirm('Excluir este plano?')) { S.goals = S.goals.filter((g) => g.id !== gid); save(); closeModal(); render(); }
      break;
    }
    case 'deposit': {
      const g = S.goals.find((x) => x.id === id);
      const sugg = plan().alloc[curM()]?.by[id] || '';
      openModal(`<h3>Guardei para: ${esc(g.name)}</h3><form id="dep-form" data-id="${id}">
        <label class="f">Valor<input name="v" inputmode="decimal" required value="${sugg ? r2(sugg) : ''}"></label>
        <div class="btns"><button class="btn" type="submit">Adicionar</button><button class="btn ghost" type="button" data-act="close">Cancelar</button></div></form>`);
      break;
    }
    case 'new-tx': openModal(txForm(), { k: 'tx' }); break;
    case 'new-income': openModal(incomeForm(null, el.dataset.tpl), { k: 'income', tpl: el.dataset.tpl }); break;
    case 'edit-income': openModal(incomeForm(S.incomes.find((x) => x.id === id)), { k: 'income', id }); break;
    case 'del-income': {
      const iid = $('#income-form').dataset.id;
      if (confirm('Excluir esta renda extra?')) { S.incomes = S.incomes.filter((x) => x.id !== iid); save(); closeModal(); render(); }
      break;
    }
    case 'limits': openModal(limitsForm(), { k: 'limits' }); break;
    case 'summary': {
      openModal(summaryHtml(el.dataset.m));
      S.meta = { ...(S.meta || {}), lastSummary: el.dataset.m }; save();
      break;
    }
    case 'talk-add': {
      const picked = $$('[data-talk]').filter((c) => c.checked).map((c) => talkDraft[+c.dataset.talk]);
      picked.forEach((p) => S.goals.push({ id: uid(), name: p.name, target: p.target, saved: p.saved, deadline: p.deadline, priority: p.priority, history: [] }));
      talkDraft = null; clearDraft($('#talk-form')); save(); render();
      toast(`${picked.length} plano(s) adicionados. Veja abaixo quanto guardar por mês.`);
      break;
    }
    case 'check-update': checkUpdate(true); break;
    case 'do-update': doUpdate(); break;
    case 'del-tx': if (confirm('Excluir este lançamento?')) { S.tx = S.tx.filter((t) => t.id !== id); save(); render(); } break;
    case 'import': $('#file-import').click(); break;
    case 'confirm-import': {
      const pm = $('#imp-month')?.value || null;
      const res = applyImport(pendingImport, pm);
      pendingImport = null; closeModal(); render();
      toast(`${res.added} gastos importados${res.dup ? `, ${res.dup} repetidos ignorados` : ''}${res.projected ? `, ${res.projected} parcelas futuras previstas` : ''}.`);
      break;
    }
    case 'register-buy': {
      const a = UI.adv;
      addPurchase({ desc: a.desc || 'Compra', value: a.value, method: a.method, parcels: a.parcels, cat: a.cat });
      clearDraft($('#adv-form'));
      a.result = ''; a.value = undefined; a.desc = ''; render(); toast('Compra registrada.');
      break;
    }
    case 'use-avg': S.settings.varEssBudget = +el.dataset.v; save(); render(); toast('Orçamento de essenciais atualizado.'); break;
    case 'backup': exportBackup(); break;
    case 'restore': $('#file-backup').click(); break;
    case 'reset':
      if (confirm('Apagar TODOS os dados deste aparelho? Não dá para desfazer.')) { S = structuredClone(DEFAULT); save(); writeDrafts({}); closeModal(); render(); openModal(settingsForm(), { k: 'settings' }); }
      break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.form?.id) saveDraft(el.form);
  if (el.dataset.act === 'tx-cat') { const t = S.tx.find((x) => x.id === el.dataset.id); if (t) { t.cat = el.value; save(); } }
  if (el.dataset.act === 'share') { S.settings.lazerToPlans = +el.value; save(); render(); }
});
document.addEventListener('input', (e) => {
  if (e.target.dataset.act === 'share') $('#share-v').textContent = `${e.target.value}%`;
  if (e.target.form?.id) saveDraft(e.target.form);
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target; const d = formData(form);
  if (form.id !== 'adv-form') clearDraft(form); // salvo de verdade: o rascunho não é mais necessário
  switch (form.id) {
    case 'set-form': {
      const s = S.settings;
      Object.assign(s, {
        income: money(d.income), payDay: +d.payDay || 1, savingsPct: +d.savingsPct || 0, varEssBudget: money(d.varEssBudget),
        cardClose: +d.cardClose || 1, cardDue: +d.cardDue || 1, cardLimit: money(d.cardLimit), theme: d.theme, setupDone: true,
        notify: d.notify === 'on', aiKey: (d.aiKey || '').trim(),
      });
      const wantLock = d.lock === 'on';
      if (wantLock && !s.lock) {
        const ok = await enableLock();
        s.lock = ok;
      } else s.lock = wantLock;
      save(); applyTheme(); closeModal(); render(); toast('Configurações salvas.');
      if (s.notify) ensureNotifyPermission();
      break;
    }
    case 'income-form': {
      const kind = segValue(form, 'kind') || 'unica';
      const x = { id: form.dataset.id || uid(), name: d.name.trim(), amount: r2(money(d.amount)), kind };
      if (kind === 'unica') x.start = d.startU || curM();
      if (kind === 'anual') { x.month = +d.month; x.spread = Math.max(1, +d.spread || 1); x.start = '2000-01'; }
      if (kind === 'parcelado') { x.start = d.startP || curM(); x.parcels = Math.max(1, +d.parcels || 1); }
      if (kind === 'mensal') x.start = curM();
      S.incomes = S.incomes || [];
      const i = S.incomes.findIndex((y) => y.id === x.id);
      if (i >= 0) S.incomes[i] = x; else S.incomes.push(x);
      save(); closeModal(); render(); toast('Renda extra salva.');
      break;
    }
    case 'limits-form': {
      S.limits = {};
      for (const [c, v] of Object.entries(d)) { const n = money(v); if (n > 0) S.limits[c] = r2(n); }
      save(); closeModal(); render(); toast('Limites salvos.');
      break;
    }
    case 'talk-form': {
      if (!d.text.trim()) { toast('Escreva seus planos.'); break; }
      runTalk(d.text.trim());
      break;
    }
    case 'bill-form': {
      const kind = segValue(form, 'kind') || 'mensal'; const cur = curM();
      const f = {
        id: form.dataset.id || uid(), name: d.name.trim(), amount: r2(money(d.amount)), day: Math.min(31, Math.max(1, +d.day || 1)),
        cat: d.cat, method: d.method, kind, keyword: d.keyword.trim(),
      };
      if (kind === 'anual') { f.month = +d.month; f.spread = Math.max(1, +d.spread || 1); f.start = S.fixed.find((x) => x.id === f.id)?.start || cur; }
      if (kind === 'parcelado') { f.parcels = Math.max(1, +d.parcels || 1); f.start = addM(cur, -(Math.max(1, +d.curParcel || 1) - 1)); }
      if (kind === 'mensal') f.start = S.fixed.find((x) => x.id === f.id)?.start || cur;
      const i = S.fixed.findIndex((x) => x.id === f.id);
      if (i >= 0) S.fixed[i] = f; else S.fixed.push(f);
      save(); closeModal(); render(); toast('Conta salva.');
      break;
    }
    case 'goal-form': {
      const g = {
        id: form.dataset.id || uid(), name: d.name.trim(), target: r2(money(d.target)), saved: r2(money(d.saved)),
        deadline: d.deadline || null, priority: segValue(form, 'priority') || 'media',
      };
      const i = S.goals.findIndex((x) => x.id === g.id);
      if (i >= 0) S.goals[i] = g; else S.goals.push(g);
      save(); closeModal(); UI.tab = 'plans'; render();
      break;
    }
    case 'dep-form': {
      const g = S.goals.find((x) => x.id === form.dataset.id);
      g.saved = r2((+g.saved || 0) + money(d.v));
      g.history = [...(g.history || []), { date: todayStr(), v: r2(money(d.v)) }];
      save(); closeModal(); render();
      toast(g.saved >= g.target ? `Plano "${g.name}" concluído!` : 'Valor guardado.');
      break;
    }
    case 'tx-form': {
      addPurchase({ desc: d.desc.trim(), value: money(d.amount), method: d.method, parcels: +d.parcels || 1, cat: d.cat, date: d.date });
      closeModal(); UI.txMonth = d.method === 'credito' ? cardPayMonth(d.date) : ymOf(d.date); render();
      break;
    }
    case 'adv-form': {
      const a = UI.adv;
      Object.assign(a, {
        value: money(d.value), desc: d.desc.trim(), method: segValue(form, 'method') || a.method,
        parcels: +(d.parcels || 1), cat: d.cat, essential: isEss(d.cat),
        balance: d.balance && d.balance.trim() ? money(d.balance) : undefined,
      });
      if (a.method === 'debito') a.parcels = 1;
      if (!(a.value > 0)) { toast('Informe o valor.'); break; }
      const r = advise({ value: a.value, method: a.method, parcels: a.parcels, essential: a.essential, balance: a.balance ?? null, cat: a.cat });
      a.result = adviceHtml(r, a);
      $('#adv-result').innerHTML = a.result;
      $('#adv-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
    default: break;
  }
});

$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    let text = await file.text();
    if (/�/.test(text)) text = new TextDecoder('windows-1252').decode(await file.arrayBuffer()); // OFX antigo em latin1
    const p = parseStatement(text);
    if (!p.items.length) { toast('Nenhum gasto encontrado no arquivo.'); return; }
    pendingImport = p;
    const dates = p.items.map((i) => i.date).sort();
    const defM = p.kind === 'card' ? cardPayMonth(dates[dates.length - 1]) : null;
    const opts = defM ? Array.from({ length: 7 }, (_, i) => addM(defM, i - 3))
      .map((M) => `<option value="${M}" ${M === defM ? 'selected' : ''}>${mFull(M)} (vence ${fmtDate(cardDueDate(M))})</option>`).join('') : '';
    const sk = p.skipped;
    openModal(`<h3>Importar ${p.kind === 'card' ? 'fatura do cartão' : 'extrato da conta'}</h3>
      <p class="small">${p.items.length} gastos de ${fmtDate(dates[0])} a ${fmtDate(dates[dates.length - 1])}: <b>${brl(sum(p.items, (i) => i.amount))}</b></p>
      <p class="small muted">Ignorados: ${sk.pagamentos} pagamentos/estornos, ${sk.entradas} entradas, ${sk.investimentos} Caixinhas/investimentos.</p>
      ${defM ? `<label class="f">Esta fatura vence em<select id="imp-month">${opts}</select></label>` : ''}
      <div class="card" style="max-height:240px;overflow:auto">${p.items.slice(0, 30).map((i) => `<div class="row small"><div class="grow"><div class="title">${esc(i.desc)}</div><div class="muted">${fmtDate(i.date)} · ${catName(guessCat(i.desc))}</div></div><div class="amt num">${brl(i.amount)}</div></div>`).join('')}</div>
      <div class="btns"><button class="btn" data-act="confirm-import">Importar</button><button class="btn ghost" data-act="close">Cancelar</button></div>`);
  } catch (err) { toast(err.message || 'Não consegui ler o arquivo.'); }
});

$('#file-backup').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!d.settings || !Array.isArray(d.fixed)) throw new Error();
    if (!confirm('Substituir os dados atuais pelo backup?')) return;
    S = { ...structuredClone(DEFAULT), ...d, settings: { ...DEFAULT.settings, ...d.settings } };
    save(); applyTheme(); closeModal(); render(); toast('Backup restaurado.');
  } catch { toast('Arquivo de backup inválido.'); }
});

$('#btn-settings').addEventListener('click', () => openModal(settingsForm(), { k: 'settings' }));
modal().addEventListener('click', (e) => { if (e.target === modal() && S.settings.setupDone) closeModal(); });
modal().addEventListener('cancel', (e) => { if (!S.settings.setupDone) e.preventDefault(); });

/* ---------- backup ---------- */
const NATIVE = !!window.Capacitor?.isNativePlatform?.();
/** No app Android: grava o arquivo e abre o "Compartilhar" (Drive, WhatsApp, e-mail). No navegador: baixa o arquivo. */
async function exportBackup() {
  const name = `meu-bolso-backup-${todayStr()}.json`;
  const json = JSON.stringify(S, null, 2);
  const P = window.Capacitor?.Plugins || {};
  if (NATIVE && P.Filesystem && P.Share) {
    try {
      const { uri } = await P.Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title: 'Backup Meu Bolso', files: [uri] });
      S.meta = { ...(S.meta || {}), lastShare: todayStr() }; save(); render();
      return;
    } catch (err) {
      if (/cancel/i.test(String(err?.message))) return;
      toast('Não consegui compartilhar o backup.');
      return;
    }
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  S.meta = { ...(S.meta || {}), lastShare: todayStr() }; save();
}

/** Backup automático: 1x por semana grava em Documentos/MeuBolso (sobrevive à desinstalação do app). */
async function autoBackup(force = false) {
  const P = window.Capacitor?.Plugins || {};
  if (!NATIVE || !P.Filesystem) return;
  const last = S.meta?.lastAutoBackup;
  if (!force && last && daysBetween(last, todayStr()) < 7) return;
  const json = JSON.stringify(S, null, 2);
  const files = ['MeuBolso/meu-bolso-backup.json', `MeuBolso/meu-bolso-${curM()}.json`];
  for (const directory of ['DOCUMENTS', 'EXTERNAL']) {
    try {
      for (const path of files) await P.Filesystem.writeFile({ path, data: json, directory, encoding: 'utf8', recursive: true });
      S.meta = { ...(S.meta || {}), lastAutoBackup: todayStr(), backupDir: directory };
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ok */ }
      return;
    } catch { /* tenta a próxima pasta */ }
  }
}

/* ---------- lembretes (notificações) ---------- */
let notifTimer = null;
function scheduleNotificationsSoon() {
  clearTimeout(notifTimer);
  notifTimer = setTimeout(scheduleNotifications, 1500);
}
async function ensureNotifyPermission() {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (!NATIVE || !LN) return false;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    return p.display === 'granted';
  } catch { return false; }
}
/** Reagenda todos os lembretes dos próximos ~45 dias a partir dos dados atuais. */
async function scheduleNotifications() {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (!NATIVE || !LN) return;
  try {
    const pending = await LN.getPending();
    if (pending.notifications?.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!S.settings.notify || !S.settings.setupDone) return;
    if ((await LN.checkPermissions()).display !== 'granted') return;

    const now = Date.now(); const limit = now + 45 * 864e5;
    const list = []; let id = 1;
    const at = (ds, h = 9) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d, h, 0, 0); };
    const add = (date, title, body) => { if (date.getTime() > now && date.getTime() < limit) list.push({ id: id++, title, body, schedule: { at: date } }); };
    const st = S.settings; const cur = curM();

    for (let i = 0; i < 3; i++) {
      const M = addM(cur, i); const paid = S.paid[M] || {};
      // Contas no débito/boleto: 2 dias antes e no dia.
      for (const { f } of fixedForMonth(M)) {
        if (f.method === 'credito' || paid[f.id]) continue;
        const due = dateIn(M, f.day);
        const d2 = new Date(at(due).getTime() - 2 * 864e5);
        add(d2, `${f.name} vence em 2 dias`, `${brl(f.amount)} no dia ${fmtDate(due)}.`);
        add(at(due), `Hoje vence: ${f.name}`, `${brl(f.amount)}. Depois de pagar, marque como paga no app.`);
      }
      // Fatura do cartão: 2 dias antes.
      const card = baseMonth(M).card;
      if (card > 0) {
        const due = cardDueDate(M);
        add(new Date(at(due).getTime() - 2 * 864e5), 'Fatura do cartão vence em 2 dias', `Previsto: ${brl(card)} em ${fmtDate(due)}.`);
      }
      // Melhor dia de compra e lembrete de importar a fatura fechada.
      const close = dateIn(M, +st.cardClose);
      add(at(close), 'Melhor dia de compra no cartão', 'A fatura fechou: compras de hoje só serão pagas no próximo vencimento.');
      add(at(close, 19), 'Importe a fatura do Nubank', 'Exporte o CSV da fatura que fechou e importe em Gastos → Importar Nubank.');
      // Resumo do mês no dia 1.
      if (i > 0) add(at(`${M}-01`), `Resumo de ${mFull(addM(M, -1))}`, 'Veja quanto gastou por categoria e onde dá para cortar.');
      // Contas anuais 7 dias antes.
      S.fixed.filter((f) => f.kind === 'anual' && occurs(f, M) && !occurs(f, addM(M, -1))).forEach((f) => {
        const due = dateIn(M, f.day);
        add(new Date(at(due).getTime() - 7 * 864e5), `${f.name} vence em 7 dias`, `${brl(f.amount * Math.max(1, +f.spread || 1))} em ${fmtDate(due)}.`);
      });
    }
    if (list.length) await LN.schedule({ notifications: list.slice(0, 60) });
  } catch { /* lembretes são um extra: falha silenciosa */ }
}

/* ---------- bloqueio com digital ---------- */
const MB = () => window.Capacitor?.Plugins?.MeuBolso;
let hiddenAt = 0;
async function enableLock() {
  if (!NATIVE || !MB()) { toast('O bloqueio só funciona no app Android.'); return false; }
  const { available } = await MB().canLock();
  if (!available) { toast('Configure digital ou PIN de tela no celular primeiro.'); return false; }
  const { ok } = await MB().authenticate();
  if (!ok) toast('Bloqueio não ativado.');
  return ok;
}
async function showLock() {
  if (!NATIVE || !S.settings.lock || !MB() || $('.lock')) return;
  const el = document.createElement('div');
  el.className = 'lock';
  el.innerHTML = '<div style="font-size:22px;font-weight:800">Meu Bolso</div><div>Bloqueado</div><button class="btn">Desbloquear</button>';
  document.body.appendChild(el);
  const tryUnlock = async () => { const { ok } = await MB().authenticate(); if (ok) el.remove(); };
  el.querySelector('button').addEventListener('click', tryUnlock);
  tryUnlock();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 60000) showLock();
  if (hiddenAt && Date.now() - hiddenAt > 3600000) { render(); scheduleNotificationsSoon(); }
});

/* ---------- atualização dentro do app ---------- */
const REPO = 'JoaoVbruno/meu-bolso';
let UPDATE = null; // { version, code, url }
let APPVER = null; // { versionName, versionCode }
async function checkUpdate(manual = false) {
  if (!NATIVE || !MB()) return;
  try {
    APPVER = APPVER || await MB().getVersion();
    if (!manual && S.meta?.lastUpdateCheck === todayStr()) { if (S.meta.update && S.meta.update.code > APPVER.versionCode) { UPDATE = S.meta.update; render(); } return; }
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rel = await r.json();
    const code = +(String(rel.tag_name).match(/(\d+)$/) || [])[1] || 0;
    const asset = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
    S.meta = { ...(S.meta || {}), lastUpdateCheck: todayStr() };
    if (asset && code > APPVER.versionCode) {
      UPDATE = { version: String(rel.tag_name).replace(/^v/, ''), code, url: asset.browser_download_url };
      S.meta.update = UPDATE;
    } else { UPDATE = null; delete S.meta.update; if (manual) toast('Você já está na versão mais nova.'); }
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ok */ }
    if (UPDATE || manual) { render(); if (modal().open && modalRef?.k === 'settings') openModal(settingsForm(), modalRef); }
  } catch { if (manual) toast('Não consegui verificar agora. Confira a internet.'); }
}
async function doUpdate() {
  if (!UPDATE || !MB()) return;
  await autoBackup(true); // garante uma cópia antes de trocar a versão
  const sub = await MB().addListener('updateProgress', (e) => toastOnce(`Baixando atualização… ${e.percent}%`));
  try {
    const { status } = await MB().installUpdate({ url: UPDATE.url });
    if (status === 'needs-permission') toast('Permita "Instalar apps desconhecidos" para o Meu Bolso, volte e toque em Atualizar de novo.');
  } catch (err) { toast(err?.message || 'Falha ao baixar a atualização.'); }
  finally { sub?.remove?.(); }
}
let toastEl = null;
function toastOnce(msg) {
  if (!toastEl) { toast(msg); toastEl = document.body.lastElementChild; setTimeout(() => { toastEl = null; }, 2500); }
  else toastEl.textContent = msg;
}

/* ---------- instalação (PWA) ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#btn-install').hidden = false; });
$('#btn-install').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btn-install').hidden = true;
});
// No APK os arquivos já estão dentro do app: o service worker só é usado na versão web.
if (!NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
navigator.storage?.persist?.().catch(() => {});

/* ---------- início ---------- */
applyTheme();
try { const u = JSON.parse(localStorage.getItem(UI_KEY)); if (u?.tab) UI.tab = u.tab; } catch { /* ok */ }
render();
if (!S.settings.setupDone) openModal(settingsForm(), { k: 'settings' });
else {
  // Reabre o último formulário que ficou pela metade.
  const last = Object.values(readDrafts()).filter((x) => x.reopen).sort((a, b) => b.at - a.at)[0];
  if (last) { reopenModal(last.reopen); toast('Recuperei o que você estava preenchendo.'); }
  else {
    // No começo do mês, abre o resumo do mês anterior uma vez.
    const prev = addM(curM(), -1);
    if (hasData(prev) && S.meta?.lastSummary !== prev) {
      openModal(summaryHtml(prev));
      S.meta = { ...(S.meta || {}), lastSummary: prev }; save();
    }
  }
}
if (NATIVE) {
  showLock();
  autoBackup();
  ensureNotifyPermission().then(() => scheduleNotifications());
  checkUpdate(false);
}
