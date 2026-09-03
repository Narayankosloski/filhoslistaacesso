/* ============================================================
   BABA LINDAO DEUS — USUÁRIO
   Arquivo único: config + inicialização + lógica.
   Usa o SDK clássico do Firebase (compat), carregado via <script>
   no HTML, por exemplo:

     <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
     <script src="user.js"></script>

   Nenhum import/export — tudo dentro de uma IIFE.
   ============================================================ */
(function () {

  /* ---------------------------------------------------------
     CONFIGURAÇÃO DO FIREBASE
     Preencha com os dados do seu projeto (Configurações do
     projeto → Seus apps → app da Web).
  --------------------------------------------------------- */
  var firebaseConfig = {
    apiKey:            "COLE_AQUI_SUA_API_KEY",
    authDomain:         "COLE_AQUI.firebaseapp.com",
    projectId:          "COLE_AQUI_PROJECT_ID",
    storageBucket:      "COLE_AQUI.appspot.com",
    messagingSenderId:  "COLE_AQUI_SENDER_ID",
    appId:              "COLE_AQUI_APP_ID"
  };

  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var db   = firebase.firestore();

  var STATUS = {
    PENDENTE:   "pendente",
    ACEITO:     "aceito",
    ANDAMENTO:  "andamento",
    FINALIZADO: "finalizado"
  };

  var STATUS_LABEL = {
    pendente:   "Pendente",
    aceito:     "Aceito",
    andamento:  "Em andamento",
    finalizado: "Finalizado"
  };

  var blocksCache = [];
  var currentBlockId = null;
  var currentUid = null;

  /* ============================================================
     GUARD DE AUTENTICAÇÃO
  ============================================================ */
  auth.onAuthStateChanged(function (user) {
    if (!user) { window.location.href = "index.html"; return; }

    db.collection("users").doc(user.uid).get().then(function (snap) {
      var profile = snap.exists ? Object.assign({ id: snap.id }, snap.data()) : null;

      if (!profile || profile.role !== "user") {
        window.location.href = profile && profile.role === "admin" ? "admin.html" : "index.html";
        return;
      }

      currentUid = user.uid;
      document.getElementById("user-name").textContent = profile.name || user.email;
      document.getElementById("user-initial").textContent = (profile.name || user.email).charAt(0).toUpperCase();

      db.collection("blocks")
        .where("assignedTo", "==", user.uid)
        .orderBy("createdAt", "desc")
        .onSnapshot(function (snap2) {
          var blocks = [];
          snap2.forEach(function (d) { blocks.push(Object.assign({ id: d.id }, d.data())); });
          blocksCache = blocks;
          renderBlocos();
          renderHistorico();
        });
    });
  });

  document.getElementById("logout-btn").addEventListener("click", function () {
    auth.signOut();
  });

  /* ============================================================
     NAVEGAÇÃO
  ============================================================ */
  function switchView(name) {
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    document.querySelectorAll(".nav-item").forEach(function (n) { n.classList.remove("active"); });
    document.getElementById("view-" + name).classList.add("active");
    document.querySelector('.nav-item[data-view="' + name + '"]').classList.add("active");
  }
  document.querySelectorAll(".nav-item[data-view]").forEach(function (el) {
    el.addEventListener("click", function () { switchView(el.dataset.view); });
  });

  /* ============================================================
     TOAST
  ============================================================ */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  /* ============================================================
     HELPERS
  ============================================================ */
  function statusBadge(status) {
    return '<span class="badge ' + status + '">' + (STATUS_LABEL[status] || status) + '</span>';
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
    return '' +
      '<div class="list-row ' + b.status + '" data-id="' + b.id + '">' +
      '<div class="row-main">' +
      '<div class="row-title">' + b.name + '</div>' +
      '<div class="row-sub">' + b.items.length + ' ' + (b.items.length === 1 ? "item" : "itens") + ' · ' + fmtDate(b.createdAt) + '</div>' +
      '</div>' +
      '<div class="row-side">' + statusBadge(b.status) + '</div>' +
      '</div>';
  }

  function renderBlocos() {
    var ativos = blocksCache.filter(function (b) { return b.status !== STATUS.FINALIZADO; });
    var container = document.getElementById("lista-blocos");
    container.innerHTML = ativos.length ? ativos.map(renderBlockRow).join("")
      : '<div class="empty-state"><h3>Nenhum bloco no momento</h3><p>Quando o administrador enviar uma tarefa, ela aparecerá aqui.</p></div>';
    container.querySelectorAll(".list-row").forEach(function (row) {
      row.addEventListener("click", function () { openBlockDetail(row.dataset.id); });
    });
  }

  function renderHistorico() {
    var finalizados = blocksCache.filter(function (b) { return b.status === STATUS.FINALIZADO; });
    var container = document.getElementById("lista-historico");
    container.innerHTML = finalizados.length ? finalizados.map(renderBlockRow).join("")
      : '<div class="empty-state"><h3>Nenhum bloco finalizado ainda</h3></div>';
    container.querySelectorAll(".list-row").forEach(function (row) {
      row.addEventListener("click", function () { openBlockDetail(row.dataset.id); });
    });
  }

  /* ============================================================
     MODAL DE DETALHE + AÇÃO DE STATUS
  ============================================================ */
  function openBlockDetail(id) {
    var b = blocksCache.find(function (x) { return x.id === id; });
    if (!b) return;
    currentBlockId = id;

    document.getElementById("detalhe-bloco-nome").textContent = b.name;
    document.getElementById("detalhe-bloco-descricao").textContent = b.description || "Sem descrição adicional.";
    document.getElementById("detalhe-bloco-itens").innerHTML = b.items.map(function (i) {
      return '<div class="item-line"><span class="item-name">' + i.itemName + '</span><span class="small muted">' + i.quantity + ' un.</span></div>';
    }).join("");
    document.getElementById("detalhe-bloco-status").outerHTML =
      statusBadge(b.status).replace('<span class="badge', '<span id="detalhe-bloco-status" class="badge');

    var actionBtn = document.getElementById("btn-avancar-status");
    var step = nextStep(b.status);
    if (step) {
      actionBtn.textContent = step.label;
      actionBtn.classList.remove("hidden");
      actionBtn.onclick = function () {
        db.collection("blocks").doc(b.id).update({
          status: step.next,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          toast('Bloco marcado como "' + STATUS_LABEL[step.next] + '".');
          document.getElementById("modal-bloco").classList.remove("active");
        });
      };
    } else {
      actionBtn.classList.add("hidden");
    }

    document.getElementById("modal-bloco").classList.add("active");
  }

  document.getElementById("btn-fechar-detalhe").addEventListener("click", function () {
    document.getElementById("modal-bloco").classList.remove("active");
  });

})();
