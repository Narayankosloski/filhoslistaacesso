import {
  watchAuth, getUserProfile, logout,
  watchBlocksForUser, updateBlockStatus,
  STATUS, STATUS_LABEL
} from "./firebase.js";

let blocksCache = [];
let currentBlockId = null;
let currentUid = null;

/* ============================================================
   GUARD DE AUTENTICAÇÃO
============================================================ */
watchAuth(async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  const profile = await getUserProfile(user.uid);
  if (!profile || profile.role !== "user") {
    window.location.href = profile && profile.role === "admin" ? "admin.html" : "index.html";
    return;
  }
  currentUid = user.uid;
  document.getElementById("user-name").textContent = profile.name || user.email;
  document.getElementById("user-initial").textContent = (profile.name || user.email).charAt(0).toUpperCase();

  watchBlocksForUser(user.uid, blocks => {
    blocksCache = blocks;
    renderBlocos();
    renderHistorico();
  });
});

document.getElementById("logout-btn").addEventListener("click", () => logout());

/* ============================================================
   NAVEGAÇÃO
============================================================ */
function switchView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelector(`.nav-item[data-view="${name}"]`).classList.add("active");
}
document.querySelectorAll(".nav-item[data-view]").forEach(el => {
  el.addEventListener("click", () => switchView(el.dataset.view));
});

/* ============================================================
   TOAST
============================================================ */
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ============================================================
   HELPERS
============================================================ */
function statusBadge(status) {
  return `<span class="badge ${status}">${STATUS_LABEL[status] || status}</span>`;
}
function fmtDate(ts) {
  if (!ts || !ts.toDate) return "";
  return ts.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Próximo status e o rótulo do botão de ação para avançar o fluxo. */
function nextStep(status) {
  switch (status) {
    case STATUS.PENDENTE:  return { next: STATUS.ACEITO,     label: "Aceitar" };
    case STATUS.ACEITO:    return { next: STATUS.ANDAMENTO,  label: "Iniciar produção" };
    case STATUS.ANDAMENTO: return { next: STATUS.FINALIZADO, label: "Finalizar" };
    default:                return null;
  }
}

/* ============================================================
   RENDER — BLOCOS
============================================================ */
function renderBlockRow(b) {
  return `
    <div class="list-row ${b.status}" data-id="${b.id}">
      <div class="row-main">
        <div class="row-title">${b.name}</div>
        <div class="row-sub">${b.items.length} ${b.items.length === 1 ? "item" : "itens"} · ${fmtDate(b.createdAt)}</div>
      </div>
      <div class="row-side">${statusBadge(b.status)}</div>
    </div>`;
}

function renderBlocos() {
  const ativos = blocksCache.filter(b => b.status !== STATUS.FINALIZADO);
  const container = document.getElementById("lista-blocos");
  container.innerHTML = ativos.length ? ativos.map(renderBlockRow).join("")
    : `<div class="empty-state"><h3>Nenhum bloco no momento</h3><p>Quando o administrador enviar uma tarefa, ela aparecerá aqui.</p></div>`;
  container.querySelectorAll(".list-row").forEach(row => row.addEventListener("click", () => openBlockDetail(row.dataset.id)));
}

function renderHistorico() {
  const finalizados = blocksCache.filter(b => b.status === STATUS.FINALIZADO);
  const container = document.getElementById("lista-historico");
  container.innerHTML = finalizados.length ? finalizados.map(renderBlockRow).join("")
    : `<div class="empty-state"><h3>Nenhum bloco finalizado ainda</h3></div>`;
  container.querySelectorAll(".list-row").forEach(row => row.addEventListener("click", () => openBlockDetail(row.dataset.id)));
}

/* ============================================================
   MODAL DE DETALHE + AÇÃO DE STATUS
============================================================ */
function openBlockDetail(id) {
  const b = blocksCache.find(x => x.id === id);
  if (!b) return;
  currentBlockId = id;

  document.getElementById("detalhe-bloco-nome").textContent = b.name;
  document.getElementById("detalhe-bloco-descricao").textContent = b.description || "Sem descrição adicional.";
  document.getElementById("detalhe-bloco-itens").innerHTML = b.items.map(i => `
    <div class="item-line"><span class="item-name">${i.itemName}</span><span class="small muted">${i.quantity} un.</span></div>
  `).join("");
  document.getElementById("detalhe-bloco-status").outerHTML = statusBadge(b.status).replace("<span class=\"badge", `<span id="detalhe-bloco-status" class="badge`);

  const actionBtn = document.getElementById("btn-avancar-status");
  const step = nextStep(b.status);
  if (step) {
    actionBtn.textContent = step.label;
    actionBtn.classList.remove("hidden");
    actionBtn.onclick = async () => {
      await updateBlockStatus(b.id, step.next);
      toast(`Bloco marcado como "${STATUS_LABEL[step.next]}".`);
      document.getElementById("modal-bloco").classList.remove("active");
    };
  } else {
    actionBtn.classList.add("hidden");
  }

  document.getElementById("modal-bloco").classList.add("active");
}

document.getElementById("btn-fechar-detalhe").addEventListener("click", () => document.getElementById("modal-bloco").classList.remove("active"));
