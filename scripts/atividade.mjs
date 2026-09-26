// Gera assets/atividade.svg com as contribuições do último ano.
// Na Action:  GITHUB_TOKEN=... node scripts/atividade.mjs <usuario>
// Local:      node scripts/atividade.mjs <usuario> --dados dias.json
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const usuario = process.argv[2];
const arquivoDados = process.argv.includes("--dados") ? process.argv[process.argv.indexOf("--dados") + 1] : null;

const COR = { fundo: "#0F2B30", linha: "#2A5A62", texto: "#EAF3F1", apoio: "#9DBAB6", destaque: "#FFB547" };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

async function buscar() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN não definido.");
  const query = `query($login: String!) { user(login: $login) { contributionsCollection {
    restrictedContributionsCount
    contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`;
  const resposta = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "atividade-svg" },
    body: JSON.stringify({ query, variables: { login: usuario } }),
  });
  if (!resposta.ok) throw new Error(`A API do GitHub respondeu ${resposta.status}.`);
  const json = await resposta.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  const colecao = json.data.user.contributionsCollection;
  const dias = colecao.contributionCalendar.weeks
    .flatMap((s) => s.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
  return { dias, privadas: colecao.restrictedContributionsCount > 0 };
}

function calcular(dias) {
  dias = [...dias].sort((a, b) => a.date.localeCompare(b.date));
  const total = dias.reduce((s, d) => s + d.count, 0);

  let maior = 0, corrida = 0;
  for (const d of dias) { corrida = d.count > 0 ? corrida + 1 : 0; maior = Math.max(maior, corrida); }
  let i = dias.length - 1;
  if (i >= 0 && dias[i].count === 0) i--; // hoje ainda sem contribuição não zera a sequência
  let atual = 0;
  for (; i >= 0 && dias[i].count > 0; i--) atual++;

  const porDia = Array(7).fill(0);
  for (const d of dias) porDia[new Date(d.date + "T12:00:00Z").getUTCDay()] += d.count;
  const diaTop = porDia.indexOf(Math.max(...porDia));

  const ultimo = new Date(dias[dias.length - 1].date + "T12:00:00Z");
  const meses = [];
  for (let k = 11; k >= 0; k--) {
    const m = new Date(Date.UTC(ultimo.getUTCFullYear(), ultimo.getUTCMonth() - k, 1));
    const chave = m.toISOString().slice(0, 7);
    meses.push({ rotulo: MESES[m.getUTCMonth()], nome: MESES_NOME[m.getUTCMonth()], valor: dias.filter((d) => d.date.startsWith(chave)).reduce((s, d) => s + d.count, 0) });
  }
  const mesTop = meses.reduce((a, b) => (b.valor > a.valor ? b : a)).nome;
  return { total, maior, atual, diaTop: SEMANA[diaTop], mesTop, meses };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n) => n.toLocaleString("pt-BR");
const dias = (n) => `${num(n)} ${n === 1 ? "dia" : "dias"}`;

function texto(x, y, s, tam, peso, cor, ancora = "start") {
  return `<text x="${x}" y="${y}" font-size="${tam}" font-weight="${peso}" fill="${cor}" text-anchor="${ancora}">${esc(s)}</text>`;
}

function desenhar({ total, maior, atual, diaTop, mesTop, meses }, privadas) {
  const W = 1000, H = 330;
  const fonte = JSON.parse(readFileSync(join(raiz, "scripts", "fonte.json"), "utf8"));
  const faces = Object.entries(fonte)
    .map(([peso, b64]) => `@font-face{font-family:FG;font-weight:${peso};src:url(data:font/woff2;base64,${b64}) format('woff2');}`)
    .join("");
  const legenda = privadas ? "últimos 12 meses, incluindo repositórios privados" : "últimos 12 meses";
  const resumo = `${num(total)} contribuições no último ano. Sequência atual de ${dias(atual)}, maior sequência de ${dias(maior)}, dia mais ativo: ${diaTop}, mês mais ativo: ${mesTop}. Por mês: ${meses.map((m) => `${m.rotulo} ${m.valor}`).join(", ")}.`;

  const p = [];
  p.push(`<rect width="${W}" height="${H}" rx="28" fill="${COR.fundo}"/>`);
  p.push(texto(40, 58, "Contribuições por mês", 19, 600, COR.texto));
  p.push(texto(40, 83, legenda, 15, 400, COR.apoio));

  const x0 = 40, x1 = 668, base = 262, alturaMax = 130;
  const maxValor = Math.max(1, ...meses.map((m) => m.valor));
  const passo = (x1 - x0) / meses.length, largura = 28;
  p.push(`<path d="M${x0} ${base + 0.5}H${x1}" stroke="${COR.linha}" stroke-width="1"/>`);
  meses.forEach((m, k) => {
    const atualMes = k === meses.length - 1;
    const cx = x0 + passo * k + passo / 2;
    const h = Math.max(3, (m.valor / maxValor) * alturaMax);
    const cor = atualMes ? COR.destaque : COR.texto;
    p.push(`<rect x="${(cx - largura / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${largura}" height="${h.toFixed(1)}" rx="6" fill="${cor}" fill-opacity="${atualMes ? 1 : 0.82}"/>`);
    p.push(texto(cx.toFixed(1), (base - h - 9).toFixed(1), num(m.valor), 14, atualMes ? 600 : 400, atualMes ? COR.texto : COR.apoio, "middle"));
    p.push(texto(cx.toFixed(1), base + 26, m.rotulo, 14.5, atualMes ? 600 : 400, atualMes ? COR.destaque : COR.apoio, "middle"));
  });

  p.push(`<path d="M700 40V290" stroke="${COR.linha}" stroke-width="1"/>`);
  p.push(texto(736, 104, num(total), 46, 700, COR.texto));
  p.push(texto(736, 131, "contribuições no último ano", 14.5, 400, COR.apoio));
  const blocos = [[dias(atual), "sequência atual"], [dias(maior), "maior sequência"], [diaTop, "dia mais ativo"], [mesTop, "mês mais ativo"]];
  blocos.forEach(([valor, rotulo], k) => {
    const x = 736 + (k % 2) * 114, yy = 187 + Math.floor(k / 2) * 66;
    p.push(texto(x, yy, valor, 24, 600, COR.texto));
    p.push(texto(x, yy + 22, rotulo, 14.5, 400, COR.apoio));
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(resumo)}">` +
    `<title>${esc(resumo)}</title><style>${faces}text{font-family:FG,'Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;}</style>` +
    p.join("") + `</svg>`;
}

const { dias: lista, privadas } = arquivoDados
  ? { dias: JSON.parse(readFileSync(arquivoDados, "utf8")), privadas: false }
  : await buscar();
if (!lista.length) throw new Error("Nenhum dia de contribuição retornado.");
writeFileSync(join(raiz, "assets", "atividade.svg"), desenhar(calcular(lista), privadas));
console.log("assets/atividade.svg atualizado.");
