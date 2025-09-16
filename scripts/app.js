sudo tee /opt/KoCal-local/scripts/app.js >/dev/null <<'JS'
(function () {
  // --------- Helpers UI ----------
  function $(id) { return document.getElementById(id); }
  function ensureStatusEl() {
    var host = $('smsSubscription');
    if (!host) return null;
    var id = 'smsStatus';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.marginTop = '8px';
      el.style.fontSize = '13px';
      el.style.lineHeight = '1.5';
      host.parentNode.insertBefore(el, host.nextSibling);
    }
    return el;
  }
  function setStatus(msg, ok) {
    var el = ensureStatusEl();
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok ? '#166534' : '#b91c1c';
  }

  // --------- Micro-saison ----------
  function formatDateFR(d) {
    var mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    return d.getDate() + ' ' + mois[d.getMonth()];
  }
  function buildStarts(year, list) {
    var out = [];
    [yea]()
