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
    var years = [year - 1, year, year + 1];
    
    years.forEach(function(year) {
      list.forEach(function(season, idx) {
        out.push({
          season: season,
          idx: idx,
          start: new Date(year, season.month - 1, season.day)
        });
      });
    });
    
    out.sort(function(a, b) { return a.start - b.start; });
    return out;
  }
  
  function getCurrentMicroSeason(now, microSeasons) {
    var starts = buildStarts(now.getFullYear(), microSeasons);
    var current = starts[0];
    
    for (var i = 0; i < starts.length; i++) {
      var item = starts[i];
      if (item.start <= now) {
        current = item;
      } else {
        break;
      }
    }
    
    return current.season;
  }
  
  function updateDisplay() {
    try {
      // Charger les données des micro-saisons
      fetch('./data/micro-seasons.json')
        .then(function(response) {
          if (!response.ok) {
            throw new Error('Erreur de chargement des données');
          }
          return response.json();
        })
        .then(function(data) {
          var now = new Date();
          var currentSeason = getCurrentMicroSeason(now, data.microSeasons);
          
          // Mettre à jour l'affichage
          $('fr').textContent = currentSeason.translations.fr;
          $('jp').textContent = currentSeason.japanese.kanji;
          $('romaji').textContent = currentSeason.japanese.romaji;
          
          // Calculer la date de fin (5 jours après le début de la micro-saison actuelle)
          var currentStart = new Date(now.getFullYear(), currentSeason.month - 1, currentSeason.day);
          var endDate = new Date(currentStart.getTime() + 4 * 24 * 60 * 60 * 1000); // 4 jours après le début = 5 jours au total
          
          // Debug: afficher les dates dans la console
          console.log('Date actuelle:', now);
          console.log('Micro-saison actuelle:', currentSeason);
          console.log('Début de la micro-saison:', currentStart);
          console.log('Fin calculée:', endDate);
          
          $('range').textContent = 'du ' + formatDateFR(currentStart) + ' au ' + formatDateFR(endDate);
        })
        .catch(function(error) {
          console.error('Erreur:', error);
          $('fr').textContent = 'Erreur de chargement';
          $('jp').textContent = '—';
          $('romaji').textContent = '—';
          $('range').textContent = '—';
        });
    } catch (error) {
      console.error('Erreur dans updateDisplay:', error);
    }
  }

  // --------- SMS Subscription ----------
  function subscribeSMS() {
    var phoneNumber = $('phoneNumber').value.trim();
    
    if (!phoneNumber) {
      setStatus('Veuillez entrer un numéro de téléphone', false);
      return;
    }
    
    setStatus('Inscription en cours...', true);
    
    // Détecter l'environnement (local vs production)
    var apiUrl = window.location.hostname === 'localhost' ? 
      'http://localhost:3001/api/subscribe' : 
      '/api/subscribe';
    
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber: phoneNumber })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        setStatus('Inscription réussie ! Vous recevrez bientôt un SMS de confirmation.', true);
        $('phoneNumber').value = '';
      } else {
        setStatus(data.error || 'Erreur lors de l\'inscription', false);
      }
    })
    .catch(function(error) {
      console.error('Erreur:', error);
      setStatus('Erreur de connexion au serveur', false);
    });
  }

  // --------- Event Listeners ----------
  function init() {
    // Mettre à jour l'affichage au chargement
    updateDisplay();
    
    // Toggle sections
    $('toggleAbout').addEventListener('click', function(e) {
      e.preventDefault();
      var about = $('about');
      var smsForm = $('smsForm');
      
      about.classList.toggle('open');
      smsForm.classList.remove('open');
    });
    
    $('toggleSms').addEventListener('click', function(e) {
      e.preventDefault();
      var about = $('about');
      var smsForm = $('smsForm');
      
      smsForm.classList.toggle('open');
      about.classList.remove('open');
    });
    
    // SMS subscription
    $('smsSubscription').addEventListener('submit', function(e) {
      e.preventDefault();
      subscribeSMS();
    });
    
    // Mettre à jour l'affichage toutes les heures
    setInterval(updateDisplay, 60 * 60 * 1000);
  }

  // Démarrer l'application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();