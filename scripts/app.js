/**
 * KoCal - Application des 72 micro-saisons japonaises
 * Affiche la micro-saison actuelle selon le calendrier traditionnel japonais
 */

class KoCalApp {
  constructor() {
    this.microSeasons = [];
    this.currentData = null;
    this.elements = {};
    this.init();
  }

  /**
   * Initialise l'application
   */
  async init() {
    try {
      await this.loadData();
      this.setupElements();
      this.setupEventListeners();
      this.render();
      this.startAutoUpdate();
    } catch (error) {
      console.error('Erreur lors de l\'initialisation:', error);
      this.showError();
    }
  }

  /**
   * Charge les données des micro-saisons depuis le fichier JSON
   */
  async loadData() {
    try {
      const response = await fetch('./data/micro-seasons.json');
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      const data = await response.json();
      this.microSeasons = data.microSeasons;
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      throw error;
    }
  }

  /**
   * Configure les références aux éléments DOM
   */
  setupElements() {
    this.elements = {
      fr: document.getElementById('fr'),
      jp: document.getElementById('jp'),
      romaji: document.getElementById('romaji'),
      sekki: document.getElementById('sekki'),
      range: document.getElementById('range'),
      toggleAbout: document.getElementById('toggleAbout'),
      about: document.getElementById('about'),
      toggleSms: document.getElementById('toggleSms'),
      smsForm: document.getElementById('smsForm'),
      smsSubscription: document.getElementById('smsSubscription'),
      phoneNumber: document.getElementById('phoneNumber')
    };
  }

  /**
   * Configure les écouteurs d'événements
   */
  setupEventListeners() {
    if (this.elements.toggleAbout) {
      this.elements.toggleAbout.addEventListener('click', (e) => {
        e.preventDefault();
        this.elements.about.classList.toggle('open');
        // Fermer le formulaire SMS si ouvert
        if (this.elements.smsForm) {
          this.elements.smsForm.classList.remove('open');
        }
      });
    }

    if (this.elements.toggleSms) {
      this.elements.toggleSms.addEventListener('click', (e) => {
        e.preventDefault();
        this.elements.smsForm.classList.toggle('open');
        // Fermer la section about si ouverte
        if (this.elements.about) {
          this.elements.about.classList.remove('open');
        }
      });
    }

    if (this.elements.smsSubscription) {
      this.elements.smsSubscription.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSmsSubscription();
      });
    }
  }

  /**
   * Construit la liste des dates de début pour une année donnée
   */
  buildStarts(year) {
    const list = [];
    const years = [year - 1, year, year + 1];
    
    years.forEach(year => {
      this.microSeasons.forEach((season, idx) => {
        list.push({
          season,
          idx,
          start: new Date(year, season.month - 1, season.day)
        });
      });
    });
    
    list.sort((a, b) => a.start - b.start);
    return list;
  }

  /**
   * Trouve la micro-saison actuelle
   */
  getCurrent(now) {
    const starts = this.buildStarts(now.getFullYear());
    let current = starts[0];
    
    for (const item of starts) {
      if (item.start <= now) {
        current = item;
      } else {
        break;
      }
    }
    
    const i = starts.indexOf(current);
    const next = starts[(i + 1) % starts.length];
    
    return { current, next, i };
  }

  /**
   * Formate une date en français
   */
  formatDate(date) {
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short'
    });
  }

  /**
   * Affiche la micro-saison actuelle
   */
  render() {
    const now = new Date();
    const { current, next, i } = this.getCurrent(now);
    const season = current.season;
    
    // Mise à jour des éléments
    if (this.elements.fr) this.elements.fr.textContent = season.translations.fr;
    if (this.elements.jp) this.elements.jp.textContent = season.japanese.kanji;
    if (this.elements.romaji) this.elements.romaji.textContent = season.japanese.romaji;
    
    // Affichage du sekki avec position
    const position = (i % 3) + 1;
    if (this.elements.sekki) {
      this.elements.sekki.innerHTML = 
        `<em>${position}ème kō du sekki</em> ${season.sekki.name} · ${season.sekki.translation}`;
    }
    
    // Calcul des dates
    let start = current.start;
    let end = next.start;
    
    if (end <= start) {
      end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
    }
    
    if (this.elements.range) {
      this.elements.range.textContent = `${this.formatDate(start)} – ${this.formatDate(end)}`;
    }
    
    this.currentData = { current, next, i };
  }

  /**
   * Démarre la mise à jour automatique
   */
  startAutoUpdate() {
    // Mise à jour toutes les minutes
    setInterval(() => {
      this.render();
    }, 60000);
  }

  /**
   * Affiche un message d'erreur
   */
  showError() {
    if (this.elements.fr) this.elements.fr.textContent = 'Erreur de chargement';
    if (this.elements.jp) this.elements.jp.textContent = '—';
    if (this.elements.romaji) this.elements.romaji.textContent = '—';
    if (this.elements.sekki) this.elements.sekki.textContent = '—';
    if (this.elements.range) this.elements.range.textContent = '—';
  }

  /**
   * Obtient les informations de la micro-saison actuelle
   */
  getCurrentSeasonInfo() {
    return this.currentData;
  }

  /**
   * Obtient toutes les micro-saisons
   */
  getAllSeasons() {
    return this.microSeasons;
  }

  /**
   * Gère l'inscription SMS
   */
  async handleSmsSubscription() {
    const phoneNumber = this.elements.phoneNumber.value.trim();
    
    if (!phoneNumber) {
      alert('Veuillez entrer un numéro de téléphone');
      return;
    }

    // Validation basique du numéro
    const phoneRegex = /^(\+33|0)[1-9](\d{8})$/;
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
      alert('Veuillez entrer un numéro de téléphone français valide');
      return;
    }

    try {
      // Désactiver le bouton pendant l'envoi
      const submitButton = this.elements.smsSubscription.querySelector('button');
      const originalText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = 'Inscription...';

      // Envoyer la requête à l'API
      const response = await fetch('http://localhost:3001/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber })
      });

      const result = await response.json();

      if (response.ok) {
        alert('Inscription réussie ! Vous recevrez bientôt les notifications par SMS.');
        // Réinitialiser le formulaire
        this.elements.phoneNumber.value = '';
        this.elements.smsForm.classList.remove('open');
      } else {
        alert(`Erreur: ${result.error}`);
      }

    } catch (error) {
      console.error('Erreur inscription:', error);
      alert('Erreur de connexion. Veuillez réessayer plus tard.');
    } finally {
      // Réactiver le bouton
      const submitButton = this.elements.smsSubscription.querySelector('button');
      submitButton.disabled = false;
      submitButton.textContent = 'S\'abonner';
    }
  }
}

// Initialisation de l'application quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
  window.koCalApp = new KoCalApp();
});
