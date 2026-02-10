const SHEET_NAME = "Respostas";
const OWNER_EMAIL = "luizfernando.curti@gmail.com";
const SPREADSHEET_ID = "1kwkxBE7ZNIBRLRdAjldwZsKiv8vIILHapdn8ft4XNtY";

// Cole o ID de uma pasta do Drive (opcional). Ex: "1AbC...xyz"
const REPORT_FOLDER_ID = "1_QyLaXtPS6eJuvkfbjYhY5NLy0-p6jnJ"; 

const HEADERS = [
  "timestamp","nome","email","whatsapp","empresa","segmento",
  "primary","secondary","pct_D","pct_I","pct_S","pct_C",
  "answers_json","consent","page_url","referrer","user_agent","quiz_version",
  "report_url" // ✅ nova coluna para o PDF
];

// 24 comportamentos (tendência 0–10) via pesos D/I/S/C
const BEHAVIORS = [
  { key:"persistencia", label:"Persistência", w:{S:0.6, D:0.4} },
  { key:"planejamento", label:"Planejamento", w:{C:0.6, S:0.4} },
  { key:"organizacao_controle", label:"Organização e controle", w:{C:0.7, S:0.3} },
  { key:"detalhismo", label:"Detalhismo", w:{C:1.0} },
  { key:"disciplina", label:"Disciplina", w:{C:0.6, S:0.4} },
  { key:"comando_firmeza", label:"Comando e firmeza", w:{D:1.0} },
  { key:"senso_urgencia", label:"Senso de urgência", w:{D:1.0} },
  { key:"flexibilidade", label:"Flexibilidade com mudanças", w:{I:0.6, D:0.4} },
  { key:"entusiasmo", label:"Entusiasmo e motivação", w:{I:1.0} },
  { key:"persuasao", label:"Persuasão", w:{I:0.7, D:0.3} },
  { key:"concentracao_precisao", label:"Concentração e precisão", w:{C:1.0} },
  { key:"sociabilidade", label:"Sociabilidade", w:{I:1.0} },
  { key:"objetividade", label:"Objetividade", w:{D:0.6, C:0.4} },
  { key:"ousadia", label:"Ousadia", w:{D:0.6, I:0.4} },
  { key:"carisma", label:"Carisma", w:{I:1.0} },
  { key:"paciencia", label:"Paciência", w:{S:1.0} },
  { key:"prudencia", label:"Prudência", w:{C:0.6, S:0.4} },
  { key:"dinamismo", label:"Dinamismo", w:{D:0.6, I:0.4} },
  { key:"empatia", label:"Empatia", w:{S:0.6, I:0.4} },
  { key:"conciliacao", label:"Conciliação e consentimento", w:{S:0.8, I:0.2} },
  { key:"estabilidade", label:"Estabilidade", w:{S:1.0} },
  { key:"racionalidade", label:"Racionalidade", w:{C:1.0} },
  { key:"independencia", label:"Independência", w:{D:1.0} },
  { key:"extroversao", label:"Extroversão", w:{I:1.0} },
];

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sh){
  const needCols = HEADERS.length;
  const maxCols = sh.getMaxColumns();
  if (maxCols < needCols) sh.insertColumnsAfter(maxCols, needCols - maxCols);

  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    return;
  }

  const first = String(sh.getRange(1,1).getValue() || "").toLowerCase().trim();
  if (first !== "timestamp") sh.insertRowBefore(1);

  sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  sh.setFrozenRows(1);
}

function doGet(){
  return ContentService
    .createTextOutput(JSON.stringify({ ok:true, message:"Perfil do Dono endpoint online" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e){
  const sh = getSheet_();
  ensureHeaders_(sh);

  try{
    const data = JSON.parse(e?.postData?.contents || "{}");

    const segmentoFinal =
      (data.segmento && String(data.segmento).trim()) ||
      (data.segmento_select === "Outro (digitar)"
        ? (data.segmento_outro || "")
        : (data.segmento_select || "")) || "";

    const pct = data.pct || {};
    const answersJson = JSON.stringify(data.answers || []);

    const row = [
      new Date(),
      data.nome || "",
      data.email || "",
      data.whatsapp || "",
      data.empresa || "",
      segmentoFinal,
      data.primary || "",
      data.secondary || "",
      pct.D ?? "",
      pct.I ?? "",
      pct.S ?? "",
      pct.C ?? "",
      answersJson,
      data.consent ? "yes" : "no",
      data.pageUrl || data.page_url || "",
      data.referrer || "",
      data.userAgent || data.user_agent || "",
      data.quizVersion || data.quiz_version || "perfil-do-dono-v1",
      "" // report_url (vamos preencher depois)
    ];

    const nextRow = sh.getLastRow() + 1;
    sh.getRange(nextRow, 1, 1, HEADERS.length).setValues([row]);

    // ✅ gera PDF e grava o link na coluna report_url
    const reportUrl = generatePdfReport_({
      timestamp: row[0],
      nome: row[1],
      email: row[2],
      whatsapp: row[3],
      empresa: row[4],
      segmento: row[5],
      primary: row[6],
      secondary: row[7],
      pct: { D: Number(row[8])||0, I: Number(row[9])||0, S: Number(row[10])||0, C: Number(row[11])||0 },
      answers_json: row[12],
      quiz_version: row[17],
    });

    sh.getRange(nextRow, HEADERS.indexOf("report_url")+1).setValue(reportUrl);

    // opcional: email pra você com link
    if (OWNER_EMAIL && OWNER_EMAIL.includes("@")) {
      MailApp.sendEmail(
        OWNER_EMAIL,
        `PDF gerado — ${row[1] || "Sem nome"} (${row[6]}/${row[7]})`,
        `Nome: ${row[1] || "-"}\nEmpresa: ${row[4] || "-"}\nSegmento: ${row[5] || "-"}\n\nLink do PDF:\n${reportUrl}`
      );
    }

    return ok_();
  } catch(err){
    const sh2 = getSheet_();
    const r = sh2.getLastRow() + 1;
    sh2.getRange(r,1,1,3).setValues([[new Date(), "ERRO", String(err)]]);
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function ok_(){
  return ContentService.createTextOutput(JSON.stringify({ ok:true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== PDF =====

function scoreBehaviors_(pct){
  // pct: {D,I,S,C} em 0..100 e SOMA 100
  return BEHAVIORS.map(b=>{
    const w = b.w || {};
    const val =
      (pct.D || 0) * (w.D || 0) +
      (pct.I || 0) * (w.I || 0) +
      (pct.S || 0) * (w.S || 0) +
      (pct.C || 0) * (w.C || 0);

    // Índice 0..100 (1 casa)
    const idx = Math.round(val * 10) / 10;

    return { key:b.key, label:b.label, idx };
  }).sort((a,b)=> b.idx - a.idx);
}


function band_(idx){
  if (idx >= 80) return "Muito forte";
  if (idx >= 65) return "Forte";
  if (idx >= 50) return "Médio";
  if (idx >= 35) return "Baixo";
  return "Muito baixo";
}


function segmentTips_(segmento, primary){
  // simples e útil: dá pra evoluir depois por segmento.
  const seg = (segmento || "").toLowerCase();
  const base = [];

  base.push("Escolha 1 meta da semana (uma só) e faça um combinado claro com o time.");
  base.push("Tenha 3 números no Monitoramento do Dono (venda, caixa, entrega).");
  base.push("Defina a próxima ação sempre: quem faz o quê, até quando.");

  if (seg.includes("restaurante") || seg.includes("cafeteria") || seg.includes("padaria") || seg.includes("food")) {
    base.push("Operação: padrão de atendimento + tempo de entrega (1 métrica por turno).");
    base.push("Venda: 1 oferta do dia + 1 upsell (treino de 10 min antes do pico).");
  } else if (seg.includes("varejo") || seg.includes("loja")) {
    base.push("Venda: taxa de conversão (entradas x vendas) e ticket médio diário.");
    base.push("Equipe: 1 script simples de abordagem + 1 checklist de vitrine/organização.");
  } else if (seg.includes("contabilidade") || seg.includes("jurídico") || seg.includes("serviços")) {
    base.push("Pipeline: leads -> propostas -> fechamentos (1 rotina fixa semanal).");
    base.push("Entrega: padrão de prazo + checklist de qualidade pra reduzir retrabalho.");
  }

  // toque por perfil
  if (primary === "D") base.push("Atenção: velocidade sem combinado vira incêndio. Escreva expectativa.");
  if (primary === "I") base.push("Atenção: energia sem rotina vira dispersão. 3 prioridades/dia.");
  if (primary === "S") base.push("Atenção: paz demais vira adiamento. Marque conversas difíceis com data.");
  if (primary === "C") base.push("Atenção: perfeição demais vira atraso. Defina prazo e “bom o suficiente”.");

  return base.slice(0, 8);
}

function generatePdfReport_(d){
  const scores = scoreBehaviors_(d.pct);
  const top5 = scores.slice(0,5);
  const low5 = scores.slice(-5).reverse();
  const tips = segmentTips_(d.segmento, d.primary);

  const html = `
  <html><head>
    <meta charset="utf-8">
    <style>
      body{ font-family: Arial, sans-serif; color:#111; }
      .wrap{ padding:24px; }
      h1{ margin:0 0 8px; }
      .sub{ color:#444; margin:0 0 18px; }
      .box{ border:1px solid #ddd; border-radius:10px; padding:14px; margin:12px 0; }
      .row{ display:flex; gap:12px; flex-wrap:wrap; }
      .pill{ display:inline-block; padding:6px 10px; border-radius:999px; background:#e9f5ec; border:1px solid #cfe7d6; margin-right:8px; }
      table{ width:100%; border-collapse:collapse; margin-top:8px; }
      th,td{ border-bottom:1px solid #eee; text-align:left; padding:8px 6px; font-size:12px; }
      th{ background:#fafafa; }
      .muted{ color:#666; }
      .kpi{ font-size:12px; }
      .small{ font-size:11px; color:#666; }
      .good{ font-weight:bold; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Perfil do Dono — Relatório prático</h1>
      <p class="sub">Gerado em ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm")}</p>

      <div class="box">
        <div class="row">
          <div style="flex:1; min-width:220px">
            <div class="kpi"><b>Nome:</b> ${esc_(d.nome)}</div>
            <div class="kpi"><b>Empresa:</b> ${esc_(d.empresa)}</div>
            <div class="kpi"><b>Segmento:</b> ${esc_(d.segmento)}</div>
          </div>
          <div style="flex:1; min-width:220px">
            <div class="kpi"><b>Perfil:</b> ${esc_(d.primary)}/${esc_(d.secondary)}</div>
            <div class="kpi"><b>Distribuição do perfil:</b> D ${d.pct.D}% | I ${d.pct.I}% | S ${d.pct.S}% | C ${d.pct.C}%</div>
            <div class="small">*Índices abaixo são tendências (0–100), não “nota escolar”.</div>

          </div>
        </div>
      </div>

      <div class="box">
        <div><span class="pill">Top 5 tendências</span> <span class="pill">Pontos de atenção</span></div>
        <p class="muted">O que tende a te ajudar (top) e o que pode te custar resultado (baixo).</p>
        <div class="row">
          <div style="flex:1; min-width:220px">
            <ul>
              ${top5.map(x=>`<li><b>${esc_(x.label)}:</b> ${x.idx} <span class="muted">(${band_(x.idx)})</span></li>`).join("")}
            </ul>
          </div>
          <div style="flex:1; min-width:220px">
            <ul>
              ${low5.map(x=>`<li><b>${esc_(x.label)}:</b> ${x.score}/10 <span class="muted">(${band_(x.score)})</span></li>`).join("")}
            </ul>
          </div>
        </div>
      </div>

      <div class="box">
        <h3 style="margin:0 0 8px;">Plano curto por segmento (aplique já)</h3>
        <ol>
          ${tips.map(t=>`<li>${esc_(t)}</li>`).join("")}
        </ol>
      </div>

      <div class="box">
        <h3 style="margin:0 0 8px;">24 comportamentos (tendência 0–10)</h3>
        <table>
          <thead>
            <tr><th>Comportamento</th><th>Índice</th><th>Leitura</th></tr>
          </thead>
          <tbody>
            ${scores.map(x=>`
              <tr>
                <td>${esc_(x.label)}</td>
                <td class="good">${x.idx}</td>
                <td class="muted">${band_(x.idx)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <p class="small">Perfil do Dono — uso recomendado: clareza, rotina e liderança. Se quiser remover seus dados, é só pedir.</p>
    </div>
  </body></html>`;

  const fileName = `PerfilDoDono_${slug_(d.nome || "SemNome")}_${slug_(d.empresa || "Empresa")}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm")}.pdf`;
  const pdfBlob = HtmlService.createHtmlOutput(html).getBlob().getAs("application/pdf").setName(fileName);

  let file;
  if (REPORT_FOLDER_ID) {
    const folder = DriveApp.getFolderById(REPORT_FOLDER_ID);
    file = folder.createFile(pdfBlob);
  } else {
    file = DriveApp.createFile(pdfBlob);
  }

  return file.getUrl();
}

function esc_(s){
  s = String(s ?? "");
  return s.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
function slug_(s){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"")
    .slice(0,40);
}
