const SHEET_NAME = "Respostas_Ranking";
const OWNER_EMAIL = "empreendedoreixo@gmail.com";
const SPREADSHEET_ID = "1kwkxBE7ZNIBRLRdAjldwZsKiv8vIILHapdn8ft4XNtY";

// (Opcional) Pasta no Drive pra salvar PDFs. Se vazio, salva na raiz do Drive.
const REPORT_FOLDER_ID = "";

// 22 colunas (EXATAS)
const HEADERS = [
  "timestamp",
  "nome",
  "email",
  "whatsapp",
  "empresa",
  "segmento",
  "primary",
  "secondary",
  "pct_D",
  "pct_I",
  "pct_S",
  "pct_C",
  "ranking_json",
  "behaviors_json",
  "behaviors_top",
  "behaviors_bottom",
  "consent",
  "page_url",
  "referrer",
  "user_agent",
  "quiz_version",
  "report_url"
];

// ====== Utils de planilha ======
function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sh) {
  const needCols = HEADERS.length;
  const maxCols = sh.getMaxColumns();
  if (maxCols < needCols) sh.insertColumnsAfter(maxCols, needCols - maxCols);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    return;
  }

  const first = String(sh.getRange(1, 1).getValue() || "").toLowerCase().trim();
  if (first !== "timestamp") sh.insertRowBefore(1);

  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sh.setFrozenRows(1);
}

// ====== Endpoint ======
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "Perfil do Dono (Ranking) endpoint online" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sh = getSheet_();
  ensureHeaders_(sh);

  try {
    const data = JSON.parse(e?.postData?.contents || "{}");

    // segmento final
    const segmentoFinal =
      (data.segmento && String(data.segmento).trim()) ||
      (data.segmento_select === "Outro (digitar)"
        ? (data.segmento_outro || "")
        : (data.segmento_select || "")) || "";

    const pct = data.pct || {};
    const pctD = Number(pct.D) || 0;
    const pctI = Number(pct.I) || 0;
    const pctS = Number(pct.S) || 0;
    const pctC = Number(pct.C) || 0;

    // JSONs
    const rankingJson = JSON.stringify(data.ranking || data.ranking_json || []);
    const behaviorsJson = JSON.stringify(data.behaviors || data.behaviors_json || {});
    const topJson = JSON.stringify(data.behaviorsTop || data.behaviors_top || []);
    const bottomJson = JSON.stringify(data.behaviorsBottom || data.behaviors_bottom || []);

    // monta linha
    const row = [
      new Date(),                        // timestamp
      data.nome || "",                   // nome
      data.email || "",                  // email
      data.whatsapp || "",               // whatsapp
      data.empresa || "",                // empresa
      segmentoFinal,                     // segmento
      data.primary || "",                // primary
      data.secondary || "",              // secondary
      pctD,                              // pct_D
      pctI,                              // pct_I
      pctS,                              // pct_S
      pctC,                              // pct_C
      rankingJson,                       // ranking_json
      behaviorsJson,                     // behaviors_json
      topJson,                           // behaviors_top
      bottomJson,                        // behaviors_bottom
      data.consent ? "yes" : "no",       // consent
      data.pageUrl || data.page_url || "",        // page_url
      data.referrer || "",               // referrer
      data.userAgent || data.user_agent || "",    // user_agent
      data.quizVersion || data.quiz_version || "perfil-do-dono-ranking-v1", // quiz_version
      ""                                 // report_url
    ];

    const nextRow = sh.getLastRow() + 1;
    sh.getRange(nextRow, 1, 1, HEADERS.length).setValues([row]);

    // gera PDF e grava URL
    const reportUrl = generatePdfReport_({
      timestamp: row[0],
      nome: row[1],
      email: row[2],
      whatsapp: row[3],
      empresa: row[4],
      segmento: row[5],
      primary: row[6],
      secondary: row[7],
      pct: { D: pctD, I: pctI, S: pctS, C: pctC },
      behaviorsTop: JSON.parse(topJson),
      behaviorsBottom: JSON.parse(bottomJson),
      behaviors: JSON.parse(behaviorsJson),
      quizVersion: row[20],
    });

    sh.getRange(nextRow, HEADERS.indexOf("report_url") + 1).setValue(reportUrl);

    // e-mail opcional
    if (OWNER_EMAIL && OWNER_EMAIL.includes("@")) {
      MailApp.sendEmail(
        OWNER_EMAIL,
        `Ranking PDF — ${row[1] || "Sem nome"} (${row[6]}/${row[7]})`,
        `Nome: ${row[1] || "-"}\nEmpresa: ${row[4] || "-"}\nSegmento: ${row[5] || "-"}\n\nDistribuição: D ${pctD}% | I ${pctI}% | S ${pctS}% | C ${pctC}%\n\nPDF:\n${reportUrl}`
      );
    }

    return ok_();
  } catch (err) {
    // loga o erro numa linha pra você enxergar
    sh.appendRow([new Date(), "ERRO", String(err)]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function ok_() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====== PDF ======
function generatePdfReport_(d) {
  const top = (d.behaviorsTop || []).slice(0, 8);
  const bottom = (d.behaviorsBottom || []).slice(0, 6);

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
      .kpi{ font-size:12px; }
      .small{ font-size:11px; color:#666; }
      ul{ margin:8px 0 0 18px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Perfil do Dono — Relatório prático (Ranking)</h1>
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
            <div class="small">*Distribuição = como seu estilo se reparte. Não é laudo.</div>
          </div>
        </div>
      </div>

      <div class="box">
        <div><span class="pill">Top 8 prioridades</span> <span class="pill">6 pontos pra ajustar</span></div>
        <p class="small">Prioridades = tendências mais fortes. Ajustar = tendências menos naturais (vale instalar rotina).</p>
        <div class="row">
          <div style="flex:1; min-width:220px">
            <b>Top 8</b>
            <ul>
              ${top.map(x=>`<li>${esc_(x)}</li>`).join("")}
            </ul>
          </div>
          <div style="flex:1; min-width:220px">
            <b>Ajustar</b>
            <ul>
              ${bottom.map(x=>`<li>${esc_(x)}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>

      <div class="box">
        <b>Próximo passo (simples)</b>
        <ul>
          <li>Escolha 1 meta da semana e escreva o combinado com o time.</li>
          <li>Defina 3 números no Monitoramento do Dono (venda, caixa, entrega).</li>
          <li>Feche “próxima ação”: quem faz o quê, até quando.</li>
        </ul>
      </div>

      <p class="small">Se quiser remoção dos dados, é só pedir.</p>
    </div>
  </body></html>`;

  const fileName =
    `PerfilDoDono_Ranking_${slug_(d.nome || "SemNome")}_${slug_(d.empresa || "Empresa")}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm")}.pdf`;

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

