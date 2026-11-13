(() => {
  const REDIRECT_URI = new URL("/coachella/", window.location.origin).href;
  const SCOPES = [
    "user-library-read",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-private"
  ].join(" ");

  const LINEUP = window.COACHELLA_LINEUP;
  const DAYS = ["friday", "saturday", "sunday"];
  const POSTERS = { ...LINEUP, all: window.COACHELLA_FULL_POSTER };
  const HEAT_COLOR = "94, 189, 255";
  const HEAT_MIN_ALPHA = 0.15;
  const HEAT_MAX_ALPHA = 0.36;
  const SETTINGS_KEY = "coachella_heatmap_settings_v1";
  const CLIENT_ID_KEY = "coachella_heatmap_spotify_client_id";
  const TOKEN_KEY = "coachella_heatmap_spotify_token";
  const OAUTH_STATE_KEY = "coachella_heatmap_oauth_state";
  const VERIFIER_KEY = "coachella_heatmap_code_verifier";
  const DB_NAME = "coachella_heatmap_db";
  const DB_STORE = "cache";
  const CACHE_KEY = "library_v4";
  const DONATION_ACK_KEY = "coachella_heatmap_donation_ack_session_v2";
  const DIRECT_SPOTIFY_UNLOCK_KEY = "coachella_direct_spotify_unlocked_v1";
  const SAMPLE_EXPORT_URL = "sample-exportify/Exportify_Test.zip";

  const defaults = {
    liked: true,
    owned: true,
    collaborative: true,
    albums: true,
    externalPlaylists: false,
    excludeCoachellaPlaylists: true
  };

  const shareFileCache = new Map();
  let imageSaveObjectUrl = null;

  const state = {
    day: "all",
    settings: loadSettings(),
    library: null,
    artistMap: new Map(),
    demo: false,
    syncing: false
  };

  const el = id => document.getElementById(id);

  function loadSettings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch {
      return { ...defaults };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function setStatus(message, isError = false) {
    const node = el("statusText");
    node.textContent = message || "";
    node.classList.toggle("error", !!isError);
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/\+/g, " plus ")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase();
  }

  function isPlaylistSource(source) {
    return ["playlist", "externalPlaylist", "owned", "collaborative"].includes(source);
  }

  function sourceTypeEnabled(source) {
    // Exportify does not include explicit playlist ownership metadata in the CSV.
    // We classify playlist files from their Added By values:
    //   playlist = likely yours / collaborative because your inferred Spotify user ID appears
    //   externalPlaylist = followed / other playlist, excluded by default
    if (source === "playlist") return state.settings.owned || state.settings.collaborative;
    if (source === "externalPlaylist") return !!state.settings.externalPlaylists;
    return !!state.settings[source];
  }

  function playlistNameIsExcluded(label) {
    if (!state.settings.excludeCoachellaPlaylists) return false;
    const words = normalizeName(label).split(/\s+/).filter(Boolean);
    return words.includes("coachella");
  }

  function sourceEnabled(track) {
    // Newer imports retain the name of every playlist a song came from. This lets
    // the user exclude Coachella planning playlists without losing the same song when it
    // also appears in Liked Songs or another included playlist.
    if (Array.isArray(track.sourceDetails) && track.sourceDetails.length) {
      return track.sourceDetails.some(detail => {
        if (!sourceTypeEnabled(detail.type)) return false;
        if (isPlaylistSource(detail.type) && playlistNameIsExcluded(detail.label || "")) return false;
        return true;
      });
    }
    // Legacy cache fallback. Playlist-name filtering is unavailable for old data.
    return (track.sources || []).some(sourceTypeEnabled);
  }

  function rebuildArtistMap() {
    const map = new Map();
    if (!state.library?.tracks) {
      state.artistMap = map;
      return;
    }

    for (const track of state.library.tracks) {
      if (!sourceEnabled(track)) continue;
      for (const artist of track.artists || []) {
        const key = normalizeName(artist.name);
        if (!key) continue;
        if (!map.has(key)) map.set(key, new Map());
        map.get(key).set(track.id, track);
      }
    }
    state.artistMap = map;
  }

  function tracksForPerformance(perf) {
    const result = new Map();
    for (const name of [perf.name, ...(perf.aliases || [])]) {
      const tracks = state.artistMap.get(normalizeName(name));
      if (!tracks) continue;
      for (const [id, track] of tracks) result.set(id, track);
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function maxMatchedCount() {
    return Math.max(0, ...Object.values(LINEUP).flatMap(day =>
      day.performances.map(performance => tracksForPerformance(performance).length)
    ));
  }

  function heatAlpha(count, maxCount) {
    if (count <= 0 || maxCount <= 0) return 0;
    if (maxCount <= 1) return HEAT_MAX_ALPHA;
    // Log scaling keeps low-count artists visible while still making the user's
    // strongest match the hottest color every time.
    const ratio = Math.log1p(count) / Math.log1p(maxCount);
    // Add a small contrast curve so nearby counts separate more clearly without
    // changing the basic relative-to-your-library behavior.
    const contrasted = Math.pow(ratio, 1.35);
    return HEAT_MIN_ALPHA + ((HEAT_MAX_ALPHA - HEAT_MIN_ALPHA) * contrasted);
  }

  function pct(value, total) {
    return `${(value / total) * 100}%`;
  }

  function render() {
    rebuildArtistMap();
    el("setupCard").classList.toggle("compact", !!state.library);
    const syncButton = el("syncButton");
    syncButton.classList.toggle("hidden", !state.library);
    syncButton.textContent = state.library?.mode === "exportify" ? "Import again" : "Refresh Spotify";
    renderSelectors();
    renderSummary();
    renderSchedules();
    renderRecommendations();
    updateSaveButtonLabels();
    syncSettingsUI();
  }

  function renderSelectors() {
    document.querySelectorAll("#daySelector button").forEach(button => {
      const active = button.dataset.day === state.day;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderSummary() {
    const summary = el("librarySummary");
    if (!summary) return;
    if (!state.library) {
      summary.textContent = "Import Exportify data or load demo data.";
      return;
    }
    const uniqueTracks = state.library.tracks.filter(sourceEnabled).length;
    const maxCount = maxMatchedCount();
    const scaleText = maxCount > 0
      ? ` Strongest lineup match: ${maxCount.toLocaleString()} song${maxCount === 1 ? "" : "s"}; every other highlight scales relative to that.`
      : " No Coachella artist matches are currently found with these sources.";

    if (state.library.mode === "exportify") {
      const stats = state.library.importStats || {};
      const parts = [];
      if (state.settings.liked && stats.likedFiles) parts.push("Liked Songs");
      if ((state.settings.owned || state.settings.collaborative) && stats.personalPlaylistFiles) parts.push(`${stats.personalPlaylistFiles} personal/shared playlist${stats.personalPlaylistFiles === 1 ? "" : "s"}`);
      if (state.settings.externalPlaylists && stats.externalPlaylistFiles) parts.push(`${stats.externalPlaylistFiles} followed/other playlist${stats.externalPlaylistFiles === 1 ? "" : "s"}`);
      const ignoredText = !state.settings.externalPlaylists && stats.externalPlaylistFiles
        ? ` ${stats.externalPlaylistFiles} followed/other playlist${stats.externalPlaylistFiles === 1 ? "" : "s"} ignored by default.`
        : "";
      summary.textContent = `Exportify: ${uniqueTracks.toLocaleString()} unique songs from ${parts.length ? parts.join(" + ") : "no enabled imported sources"}.${ignoredText}${scaleText}`;
      return;
    }

    const sourceNames = [];
    if (state.settings.liked) sourceNames.push("Liked Songs");
    if (state.settings.owned) sourceNames.push("my playlists");
    if (state.settings.collaborative) sourceNames.push("shared playlists");
    if (state.settings.albums) sourceNames.push("saved albums");
    const prefix = state.demo ? "Demo: " : "";
    summary.textContent = `${prefix}${uniqueTracks.toLocaleString()} unique songs from ${sourceNames.length ? sourceNames.join(", ") : "no enabled sources"}.${scaleText}`;
  }

  function renderSchedules() {
    const area = el("scheduleArea");
    area.innerHTML = "";
    area.appendChild(makeScheduleCard(state.day, maxMatchedCount()));
    updateSaveButtonLabels();
    if (isMobileLike()) prewarmScheduleFiles([state.day]);
  }

  function makeScheduleCard(dayKey, maxCount) {
    const schedule = POSTERS[dayKey];
    const fragment = el("scheduleTemplate").content.cloneNode(true);
    const card = fragment.querySelector(".schedule-card");
    const image = fragment.querySelector(".schedule-image");
    const overlay = fragment.querySelector(".overlay-layer");
    const download = fragment.querySelector(".download-button");

    fragment.querySelector(".schedule-kicker").textContent = schedule.date;
    fragment.querySelector(".schedule-title").textContent = schedule.label;
    image.src = schedule.image;
    image.alt = `Coachella 2027: ${schedule.label}`;
    image.width = schedule.width;
    image.height = schedule.height;
    download.dataset.day = dayKey;
    download.addEventListener("click", () => exportSchedule(dayKey));
    const directory = fragment.querySelector(".artist-directory-list");

    for (const perf of schedule.performances) {
      const tracks = tracksForPerformance(perf);
      const alpha = heatAlpha(tracks.length, maxCount);
      const { x, y, w, h } = perf.rect;
      const button = document.createElement("button");
      button.type = "button";
      button.className = tracks.length ? "artist-overlay matched" : "artist-overlay";
      button.style.left = pct(x, schedule.width);
      button.style.top = pct(y, schedule.height);
      button.style.width = pct(w, schedule.width);
      button.style.height = pct(h, schedule.height);
      button.style.setProperty("--alpha", alpha.toFixed(3));
      const description = tracks.length
        ? `${tracks.length} saved song${tracks.length === 1 ? "" : "s"}`
        : "Explore songs";
      button.setAttribute("aria-label", `${perf.name}: ${description}`);
      button.title = `${perf.name} • ${description}`;
      button.tabIndex = -1;
      button.addEventListener("click", () => openArtist(perf, tracks, schedule));
      overlay.appendChild(button);

      const listButton = document.createElement("button");
      listButton.type = "button";
      listButton.textContent = perf.name;
      listButton.setAttribute("aria-label", `${perf.name}: ${description}`);
      listButton.classList.toggle("matched", tracks.length > 0);
      listButton.addEventListener("click", () => openArtist(perf, tracks, schedule));
      directory.appendChild(listButton);
    }

    return card;
  }

  function spotifySearch(query) {
    return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
  }

  function makeListeningLinks(performance, songs) {
    const list = document.createElement("ul");
    list.className = "listening-links";
    for (const [artist, title] of songs.length ? songs : [[performance.name, ""]]) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = spotifySearch(title ? `${artist} ${title}` : artist);
      link.target = "_blank";
      link.rel = "noopener";
      const artistCredit = normalizeName(artist) === normalizeName(performance.name) ? "" : ` · ${artist}`;
      link.textContent = title ? `${title}${artistCredit} ↗` : `Find ${artist} on Spotify ↗`;
      item.append(link);
      list.append(item);
    }
    return list;
  }

  function renderRecommendations() {
    const section = el("recommendations");
    const tracks = state.library?.tracks || [];
    const enabled = tracks.filter(sourceEnabled);
    section.hidden = !enabled.length;
    const list = el("recommendationList");
    list.replaceChildren();
    if (!enabled.length) return;

    const libraryArtists = new Set(tracks.flatMap(track => (track.artists || []).map(artist => normalizeName(artist.name))));
    const groups = window.COACHELLA_STYLES.map(group => ({
      ...group,
      artists: new Set([...group.lineup, ...group.references].map(normalizeName)),
      score: 0
    }));
    for (const track of enabled) {
      const names = (track.artists || []).map(artist => normalizeName(artist.name));
      const genres = (track.genres || []).map(normalizeName);
      for (const group of groups) {
        if (genres.some(genre => group.genre.test(genre))) group.score += 2;
        else if (names.some(name => group.artists.has(name))) group.score += 1;
      }
    }

    const rankedStyles = groups.filter(group => group.score > 0).sort((a, b) => b.score - a.score);
    const days = state.day === "all" ? DAYS : [state.day];
    for (const dayKey of days) {
      const day = LINEUP[dayKey];
      const candidates = day.performances.filter(perf =>
        window.COACHELLA_TRACKS[perf.name]?.length &&
        [perf.name, ...perf.aliases].every(name => !libraryArtists.has(normalizeName(name)))
      );
      if (!candidates.length) continue;

      const card = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = day.label;
      card.append(heading);
      const picked = new Set();
      let genreCount = 0;
      for (const group of rankedStyles) {
        const picks = candidates.filter(perf => group.lineup.includes(perf.name) && !picked.has(perf.name)).slice(0, 2);
        if (!picks.length) continue;
        card.append(recommendationGroup(group.label, picks, day));
        for (const perf of picks) picked.add(perf.name);
        if (++genreCount === 2) break;
      }
      if (!genreCount) card.append(recommendationGroup("More from the lineup", candidates.slice(0, 2), day));
      list.append(card);
    }
    section.hidden = !list.childElementCount;
  }

  function recommendationGroup(label, artists, day) {
    const group = document.createElement("div");
    group.className = "recommendation-group";
    const heading = document.createElement("h4");
    heading.textContent = label;
    group.append(heading);
    for (const artist of artists) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = artist.name;
      button.setAttribute("aria-haspopup", "dialog");
      button.addEventListener("click", () => openArtist(artist, [], day));
      group.append(button);
    }
    return group;
  }

  function openArtist(perf, tracks, schedule) {
    el("artistName").textContent = perf.name;
    el("artistMeta").textContent = perf.dayLabel || schedule.label;
    el("artistCount").textContent = `${tracks.length} unique saved song${tracks.length === 1 ? "" : "s"} by this artist`;
    const list = el("songList");
    list.replaceChildren();
    if (!tracks.length) {
      const songs = window.COACHELLA_TRACKS[perf.name] || [];
      el("artistCount").textContent = songs.length ? "Tracks to try" : "Explore on Spotify";
      list.append(makeListeningLinks(perf, songs));
    }
    tracks.forEach(track => {
      const row = document.createElement("div");
      row.className = "song-row";

      const text = document.createElement("div");
      text.className = "song-text";
      const name = document.createElement("span");
      name.className = "song-name";
      name.textContent = track.name;
      text.appendChild(name);

      if (state.library?.mode === "exportify" && Array.isArray(track.sourceDetails) && track.sourceDetails.length) {
        const detail = document.createElement("small");
        detail.className = "song-source";
        const labels = [...new Set(track.sourceDetails.map(item => item.label).filter(Boolean))];
        detail.textContent = `Found in: ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? ` +${labels.length - 3} more` : ""}`;
        text.appendChild(detail);
      }

      const link = document.createElement("a");
      link.textContent = "Spotify ↗";
      link.href = track.url || `https://open.spotify.com/track/${track.id}`;
      link.target = "_blank";
      link.rel = "noopener";
      row.append(text, link);
      list.appendChild(row);
    });
    el("artistDialog").showModal();
  }

  function isMobileLike() {
    return !!(window.matchMedia?.("(max-width: 700px)")?.matches || navigator.maxTouchPoints > 0);
  }

  function scheduleExportKey(dayKey) {
    return [
      dayKey,
      state.library?.syncedAt || (state.demo ? "demo" : "empty"),
      JSON.stringify(state.settings)
    ].join("|");
  }

  async function buildScheduleFile(dayKey) {
    const schedule = POSTERS[dayKey];
    const maxCount = maxMatchedCount();
    const highlights = schedule.performances.map(perf => ({
      ...perf.rect,
      alpha: heatAlpha(tracksForPerformance(perf).length, maxCount)
    })).filter(rect => rect.alpha > 0);
    const image = await loadImage(schedule.image);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    for (const { x, y, w, h, alpha } of highlights) {
      ctx.fillStyle = `rgba(${HEAT_COLOR}, ${alpha})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = `rgba(${HEAT_COLOR}, ${alpha + 0.35})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not create PNG")), "image/png");
    });
    const filename = `Coachella-2027-${dayKey}-personalized.png`;
    return new File([blob], filename, { type: "image/png" });
  }

  async function prewarmScheduleFiles(days) {
    for (const dayKey of days) {
      const button = document.querySelector(`.download-button[data-day="${dayKey}"]`);
      const key = scheduleExportKey(dayKey);
      const existing = shareFileCache.get(key);
      if (existing instanceof File) {
        if (button) {
          button.disabled = false;
          button.textContent = "Save to Photos";
        }
        continue;
      }
      if (button) {
        button.disabled = true;
        button.textContent = "Preparing…";
      }
      try {
        const file = await buildScheduleFile(dayKey);
        shareFileCache.set(key, file);
        if (button && document.body.contains(button) && scheduleExportKey(dayKey) === key) {
          button.disabled = false;
          button.textContent = "Save to Photos";
        }
      } catch (error) {
        console.warn("Could not pre-render share image", error);
        if (button && document.body.contains(button)) {
          button.disabled = false;
          button.textContent = "Save / Share";
        }
      }
    }
  }

  function downloadFile(file) {
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1500);
  }

  function openImageSaveFallback(file, schedule) {
    if (imageSaveObjectUrl) URL.revokeObjectURL(imageSaveObjectUrl);
    imageSaveObjectUrl = URL.createObjectURL(file);
    el("imageSavePreview").src = imageSaveObjectUrl;
    el("imageSaveTitle").textContent = `Save ${schedule.label} lineup`;
    el("imageSaveDialog").showModal();
    setStatus("Press and hold the image, then choose Save to Photos / Save Image.");
  }

  async function exportSchedule(dayKey) {
    const schedule = POSTERS[dayKey];
    try {
      const mobileLike = isMobileLike();
      const key = scheduleExportKey(dayKey);
      let file = shareFileCache.get(key);

      if (mobileLike) {
        // Pre-rendered files keep navigator.share inside the user's tap gesture on iOS.
        if (!(file instanceof File)) {
          setStatus("Still preparing your image — tap Save to Photos again in a moment.");
          prewarmScheduleFiles([dayKey]);
          return;
        }

        const canShareFile = !!(window.isSecureContext && navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
        if (canShareFile) {
          try {
            await navigator.share({
              files: [file],
              title: `My Coachella ${schedule.label} lineup`
            });
            setStatus(`${schedule.label} lineup opened in the iPhone share sheet. Choose Save Image to put it in Photos.`);
            return;
          } catch (error) {
            if (error?.name === "AbortError") {
              setStatus("Share canceled. Nothing was saved.");
              return;
            }
            console.warn("Native file share failed; showing image-save fallback.", error);
          }
        }

        // Local HTTP testing and older browsers cannot use native file sharing.
        // Show the finished image instead of silently downloading it to Files.
        openImageSaveFallback(file, schedule);
        return;
      }

      setStatus(`Preparing ${schedule.label} image…`);
      if (!(file instanceof File)) {
        file = await buildScheduleFile(dayKey);
        shareFileCache.set(key, file);
      }
      downloadFile(file);
      setStatus(`${schedule.label} personalized lineup downloaded.`);
    } catch (error) {
      setStatus(error.message || "Could not export the lineup.", true);
    }
  }

  function updateSaveButtonLabels() {
    const mobileLike = isMobileLike();
    document.querySelectorAll(".download-button").forEach(button => {
      if (!button.disabled) button.textContent = mobileLike ? "Save to Photos" : "Download PNG";
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${src}`));
      image.src = src;
    });
  }

  function syncSettingsUI() {
    el("sourceLiked").checked = state.settings.liked;
    el("sourceOwned").checked = state.settings.owned;
    el("sourceCollaborative").checked = state.settings.collaborative;
    el("sourceAlbums").checked = state.settings.albums;
    if (el("sourceExternal")) el("sourceExternal").checked = !!state.settings.externalPlaylists;
    if (el("excludeCoachellaPlaylists")) el("excludeCoachellaPlaylists").checked = state.settings.excludeCoachellaPlaylists !== false;
    el("clientIdInput").value = localStorage.getItem(CLIENT_ID_KEY) || "";
    el("spotifyRedirectUri").textContent = REDIRECT_URI;
    const unlocked = sessionStorage.getItem(DIRECT_SPOTIFY_UNLOCK_KEY) === "1";
    el("directSpotifyPanel").classList.toggle("hidden", !unlocked);
    el("unlockSpotifyButton").textContent = unlocked ? "Unlocked" : "Locked features";
    el("unlockSpotifyButton").disabled = unlocked;
    const cacheText = state.library?.syncedAt
      ? `Current local cache: ${state.library.tracks.length.toLocaleString()} unique tracks. Last loaded ${new Date(state.library.syncedAt).toLocaleString()}.`
      : "No Spotify library cache is stored yet.";
    el("cacheInfo").textContent = cacheText;

    const note = el("sourceModeNote");
    if (state.library?.mode === "exportify") {
      const stats = state.library.importStats || {};
      const inferred = stats.inferredUserId ? ` I detected your Spotify user ID from ${stats.inferredUserFileCount || 0} playlist files.` : " I could not confidently infer a personal Spotify user ID, so all selected playlist files were treated as personal.";
      note.textContent = `Exportify mode: Liked Songs are always counted separately. By default, the app counts playlist files where your inferred Spotify user ID appears in the Added By column and ignores followed/other playlists.${inferred} Exportify’s saved album list contains album details only. Use direct Spotify to count tracks from saved albums.`;
    } else if (state.library?.mode === "spotify") {
      note.textContent = "Direct Spotify mode: all four source controls are available.";
    } else {
      note.textContent = "The available source detail depends on how you load your library.";
    }
  }

  async function startSpotifyAuth() {
    const inputValue = el("clientIdInput").value.trim();
    const clientId = inputValue || (localStorage.getItem(CLIENT_ID_KEY) || "").trim();
    if (!clientId) {
      el("settingsDialog").showModal();
      setStatus("Paste your Spotify Client ID in Settings first.", true);
      return;
    }
    localStorage.setItem(CLIENT_ID_KEY, clientId);

    const verifier = randomString(64);
    const challenge = await pkceChallenge(verifier);
    const oauthState = randomString(32);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state: oauthState
    });
    window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
  }

  async function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      history.replaceState({}, "", window.location.pathname);
      setStatus(`Spotify authorization did not finish: ${error}`, true);
      return;
    }
    const code = params.get("code");
    if (!code) return;

    const returnedState = params.get("state");
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    const clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!verifier || !clientId || !expectedState || returnedState !== expectedState) {
      history.replaceState({}, "", window.location.pathname);
      throw new Error("Spotify sign-in state could not be verified. Try connecting again.");
    }

    setStatus("Finishing Spotify connection…");
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    });
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error_description || payload.error || "Spotify token exchange failed.");
    saveToken(payload);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    history.replaceState({}, "", window.location.pathname);
    await syncSpotifyLibrary();
  }

  function saveToken(payload, previous = {}) {
    const token = {
      ...previous,
      ...payload,
      expires_at: Date.now() + (Number(payload.expires_in || 3600) * 1000) - 30_000
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    return token;
  }

  function loadToken() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); }
    catch { return null; }
  }

  async function validAccessToken(forceRefresh = false) {
    const token = loadToken();
    if (!token) throw new Error("Spotify is not connected yet.");
    if (!forceRefresh && token.access_token && Date.now() < token.expires_at) return token.access_token;
    if (!token.refresh_token) throw new Error("Spotify session expired. Connect again.");

    const clientId = localStorage.getItem(CLIENT_ID_KEY);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId
    });
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error_description || payload.error || "Spotify session could not be refreshed.");
    return saveToken(payload, token).access_token;
  }

  async function spotifyFetch(url, retry401 = true) {
    const token = await validAccessToken(false);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 && retry401) {
      await validAccessToken(true);
      return spotifyFetch(url, false);
    }
    if (response.status === 429) {
      let details = {};
      try { details = await response.json(); } catch {}
      const reason = details?.error?.reason;
      if (reason === "QUOTA_EXCEEDED") throw new Error("Spotify's development quota is temporarily exhausted. Wait and try Refresh Spotify later.");
      throw new Error("Spotify is rate-limiting requests right now. Wait a little and try Refresh Spotify again.");
    }
    if (response.status === 403) {
      throw new Error("Spotify returned 403. In Development Mode, make sure this Spotify account is allowed to use the app and the app owner has Premium.");
    }
    if (!response.ok) {
      let details = {};
      try { details = await response.json(); } catch {}
      throw new Error(details?.error?.message || `Spotify request failed (${response.status}).`);
    }
    return response.json();
  }

  async function fetchPaged(url, onPage) {
    let next = url;
    const all = [];
    while (next) {
      const page = await spotifyFetch(next);
      all.push(...(page.items || []));
      if (onPage) onPage(all.length, page.total ?? all.length);
      next = page.next;
    }
    return all;
  }

  function addTrack(trackMap, rawTrack, source, sourceLabel = "") {
    if (!rawTrack || rawTrack.type && rawTrack.type !== "track") return;
    const id = rawTrack.id;
    if (!id) return;
    const artists = (rawTrack.artists || []).map(a => ({ id: a.id || "", name: a.name || "" })).filter(a => a.name);
    if (!artists.length) return;
    const existing = trackMap.get(id) || {
      id,
      name: rawTrack.name || "Untitled track",
      artists,
      url: rawTrack.external_urls?.spotify || `https://open.spotify.com/track/${id}`,
      sources: [],
      sourceDetails: []
    };
    if (!existing.sources.includes(source)) existing.sources.push(source);
    if (!Array.isArray(existing.sourceDetails)) existing.sourceDetails = [];
    const label = sourceLabel || (source === "liked" ? "Liked Songs" : source === "albums" ? "Saved Albums" : source);
    if (!existing.sourceDetails.some(item => item.type === source && item.label === label)) {
      existing.sourceDetails.push({ type: source, label });
    }
    trackMap.set(id, existing);
  }

  async function syncSpotifyLibrary() {
    if (state.syncing) return;
    state.syncing = true;
    state.demo = false;
    el("syncButton").disabled = true;
    setStatus("Connecting to Spotify…");
    try {
      const me = await spotifyFetch("https://api.spotify.com/v1/me");
      const trackMap = new Map();

      setStatus("Loading Liked Songs…");
      const likedItems = await fetchPaged("https://api.spotify.com/v1/me/tracks?limit=50", (count, total) => {
        setStatus(`Loading Liked Songs… ${Math.min(count, total).toLocaleString()} / ${total.toLocaleString()}`);
      });
      likedItems.forEach(entry => addTrack(trackMap, entry.track || entry.item, "liked", "Liked Songs"));

      setStatus("Finding your playlists…");
      const playlists = await fetchPaged("https://api.spotify.com/v1/me/playlists?limit=50");
      const readable = playlists.filter(pl => pl?.owner?.id === me.id || pl?.collaborative === true);

      for (let index = 0; index < readable.length; index++) {
        const playlist = readable[index];
        const source = playlist?.owner?.id === me.id ? "owned" : "collaborative";
        setStatus(`Loading playlists… ${index + 1} / ${readable.length}: ${playlist.name || "playlist"}`);
        try {
          const entries = await fetchPaged(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlist.id)}/items?limit=50&additional_types=track`);
          entries.forEach(entry => addTrack(trackMap, entry.item || entry.track, source, playlist.name || "Playlist"));
        } catch (error) {
          console.warn(`Skipped playlist ${playlist.name}:`, error);
        }
      }

      setStatus("Loading saved albums…");
      const albumEntries = await fetchPaged("https://api.spotify.com/v1/me/albums?limit=50");
      for (let index = 0; index < albumEntries.length; index++) {
        const album = albumEntries[index]?.album;
        if (!album) continue;
        setStatus(`Loading saved albums… ${index + 1} / ${albumEntries.length}: ${album.name || "album"}`);
        (album.tracks?.items || []).forEach(track => addTrack(trackMap, track, "albums", album.name || "Saved Album"));
        let next = album.tracks?.next;
        while (next) {
          const page = await spotifyFetch(next);
          (page.items || []).forEach(track => addTrack(trackMap, track, "albums", album.name || "Saved Album"));
          next = page.next;
        }
      }

      state.library = {
        tracks: [...trackMap.values()],
        syncedAt: new Date().toISOString(),
        profile: { id: me.id, displayName: me.display_name || "Spotify user" },
        mode: "spotify"
      };
      await dbSet(CACHE_KEY, state.library);
      setStatus(`Done. Loaded ${state.library.tracks.length.toLocaleString()} unique songs from Spotify.`);
      render();
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Spotify sync failed.", true);
    } finally {
      state.syncing = false;
      el("syncButton").disabled = false;
    }
  }


  function normalizeHeader(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const input = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"') {
          if (input[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(field);
        field = "";
      } else if (ch === '\n') {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
    if (field.length || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows.filter(r => r.some(cell => String(cell).trim() !== ""));
  }

  function exportifySourceForFilename(filename) {
    const normalized = normalizeName(filename.replace(/\.csv$/i, "").replace(/[_-]+/g, " "));
    return normalized.includes("liked songs") || normalized === "liked" ? "liked" : "playlist";
  }

  function exportifyLabelForFilename(filename) {
    const base = String(filename || "")
      .replace(/\.csv$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return exportifySourceForFilename(filename) === "liked" ? "Liked Songs" : (base || "Playlist");
  }

  function spotifyTrackIdFromUri(uri) {
    const value = String(uri || "").trim();
    const uriMatch = value.match(/^spotify:track:([A-Za-z0-9]+)$/i);
    if (uriMatch) return uriMatch[1];
    const urlMatch = value.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/i);
    if (urlMatch) return urlMatch[1];
    return "";
  }

  function splitExportifyUris(value) {
    const text = String(value || "").trim();
    if (!text) return [];
    return text.split(/\s*[,;]\s*/).map(item => item.trim()).filter(Boolean);
  }

  function splitExportifyArtistNames(value, expectedCount = 0) {
    const text = String(value || "").trim();
    if (!text) return [];
    // Current Exportify CSVs separate multiple artists with commas (not semicolons).
    // If Spotify says there is only one artist URI, keep the name intact so names
    // containing commas are not accidentally split.
    if (expectedCount === 1) return [text];
    const parts = text.split(/\s*[,;]\s*/).map(item => item.trim()).filter(Boolean);
    if (!expectedCount || parts.length === expectedCount) return parts;
    // When a literal comma exists inside an artist name, exact reconstruction from
    // the CSV is impossible. Keep the simple split rather than dropping collaborators.
    return parts;
  }

  function exportifyAddedByIds(filename, text) {
    if (exportifySourceForFilename(filename) === "liked") return new Set();
    const rows = parseCsv(text);
    if (rows.length < 2) return new Set();
    const headers = rows[0].map(normalizeHeader);
    const addedByIndex = headers.indexOf(normalizeHeader("Added By"));
    if (addedByIndex < 0) return new Set();
    const ids = new Set();
    for (let r = 1; r < rows.length; r++) {
      const value = String(rows[r][addedByIndex] || "").trim();
      // Exportify sometimes emits the unusable literal "spotify:user:".
      if (value && value !== "spotify:user:") ids.add(value);
    }
    return ids;
  }

  function inferExportifyUser(csvs) {
    const filePresence = new Map();
    for (const csv of csvs) {
      if (exportifySourceForFilename(csv.name) === "liked") continue;
      for (const id of exportifyAddedByIds(csv.name, csv.text)) {
        filePresence.set(id, (filePresence.get(id) || 0) + 1);
      }
    }
    const ranked = [...filePresence.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return { id: "", fileCount: 0, confidence: "none" };
    const [id, fileCount] = ranked[0];
    const second = ranked[1]?.[1] || 0;
    // A user's own ID normally appears across many of their playlists, while owners
    // of followed playlists usually appear in only one or two files. Require some
    // separation before auto-filtering; otherwise fall back to including all files.
    const confident = fileCount >= 3 && (second === 0 || fileCount >= second * 1.5);
    return { id: confident ? id : "", candidateId: id, fileCount, second, confidence: confident ? "high" : "low" };
  }

  function isExportifyAlbumList(csv) {
    const headerLine = csv.text.split(/\r?\n/, 1)[0];
    const headers = parseCsv(headerLine)[0]?.map(normalizeHeader) || [];
    return headers.includes("album uri") && headers.includes("album name") &&
      !headers.includes("track name") && !headers.includes("track uri");
  }

  function classifyExportifyCsv(filename, text, inferredUserId) {
    if (exportifySourceForFilename(filename) === "liked") return "liked";
    if (!inferredUserId) return "playlist";
    const ids = exportifyAddedByIds(filename, text);
    return ids.has(inferredUserId) ? "playlist" : "externalPlaylist";
  }

  function parseExportifyCsv(filename, text, trackMap, sourceOverride = null) {
    const rows = parseCsv(text);
    if (rows.length < 2) return { imported: 0, source: sourceOverride || exportifySourceForFilename(filename) };
    const headers = rows[0].map(normalizeHeader);
    const indexOf = (...names) => {
      for (const name of names) {
        const idx = headers.indexOf(normalizeHeader(name));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const uriIndex = indexOf("Track URI", "Spotify URI", "URI");
    const nameIndex = indexOf("Track Name", "Name");
    const artistIndex = indexOf("Artist Name(s)", "Artist Name", "Artists");
    const artistUriIndex = indexOf("Artist URI(s)", "Artist URI");
    const albumIndex = indexOf("Album Name", "Album");
    const genreIndex = indexOf("Artist Genres", "Genres", "Album Genres");
    if (nameIndex < 0 || artistIndex < 0) {
      throw new Error(`${filename} does not look like an Exportify CSV (Track Name / Artist Name(s) columns are missing).`);
    }

    const source = sourceOverride || exportifySourceForFilename(filename);
    let imported = 0;
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const trackName = String(cells[nameIndex] || "").trim();
      const artistUris = artistUriIndex >= 0 ? splitExportifyUris(cells[artistUriIndex]) : [];
      const artistNames = splitExportifyArtistNames(cells[artistIndex], artistUris.length);
      if (!trackName || !artistNames.length) continue;
      const trackUri = uriIndex >= 0 ? String(cells[uriIndex] || "").trim() : "";
      const spotifyId = spotifyTrackIdFromUri(trackUri);
      const albumName = albumIndex >= 0 ? String(cells[albumIndex] || "").trim() : "";
      const dedupeId = spotifyId || `import:${normalizeName(trackName)}:${artistNames.map(normalizeName).join("|")}:${normalizeName(albumName)}`;
      const artists = artistNames.map((name, i) => ({
        id: (artistUris[i] || "").replace(/^spotify:artist:/i, ""),
        name
      }));
      const existing = trackMap.get(dedupeId) || {
        id: dedupeId,
        name: trackName,
        artists,
        url: spotifyId ? `https://open.spotify.com/track/${spotifyId}` : spotifySearch(`${trackName} ${artistNames[0]}`),
        sources: [],
        sourceDetails: []
      };
      const genres = genreIndex >= 0 ? String(cells[genreIndex] || "").split(/[,;|]/).map(value => value.trim()).filter(Boolean) : [];
      existing.genres = [...new Set([...(existing.genres || []), ...genres])];
      // If a prior copy of the same track had fewer credited artists, keep the richer
      // Exportify row so featured artists are not lost when deduplicating.
      if ((existing.artists || []).length < artists.length) existing.artists = artists;
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!Array.isArray(existing.sourceDetails)) existing.sourceDetails = [];
      const sourceLabel = exportifyLabelForFilename(filename);
      if (!existing.sourceDetails.some(item => item.type === source && item.label === sourceLabel)) {
        existing.sourceDetails.push({ type: source, label: sourceLabel });
      }
      trackMap.set(dedupeId, existing);
      imported++;
    }
    return { imported, source };
  }

  function findZipEndOfCentralDirectory(view) {
    const min = Math.max(0, view.byteLength - 65557);
    for (let i = view.byteLength - 22; i >= min; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser cannot unpack ZIP files directly. In Exportify, export/upload the CSV files instead of the ZIP.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function extractCsvsFromZip(file) {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const eocd = findZipEndOfCentralDirectory(view);
    if (eocd < 0) throw new Error(`${file.name} is not a readable ZIP file.`);
    const entries = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    let cursor = centralOffset;
    const decoder = new TextDecoder("utf-8");
    const results = [];

    for (let n = 0; n < entries; n++) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const nameBytes = new Uint8Array(buffer, cursor + 46, nameLength);
      const filename = decoder.decode(nameBytes);

      if (!filename.endsWith("/") && /\.csv$/i.test(filename)) {
        if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Could not read ${filename} inside the ZIP.`);
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = new Uint8Array(buffer, dataStart, compressedSize);
        let raw;
        if (method === 0) raw = compressed;
        else if (method === 8) raw = await inflateRaw(compressed);
        else throw new Error(`ZIP compression method ${method} is not supported. Upload the CSV files directly instead.`);
        results.push({ name: filename.split("/").pop(), text: decoder.decode(raw) });
      }
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return results;
  }

  function setImportResult(message, isError = false) {
    const node = el("importResult");
    node.textContent = message || "";
    node.classList.toggle("visible", !!message);
    node.classList.toggle("error", !!isError);
  }

  function setImportProgress(active, title = "Importing your music…", detail = "Reading your files locally.") {
    const progress = el("importProgress");
    progress.hidden = !active;
    el("importProgressTitle").textContent = title;
    el("importProgressDetail").textContent = detail;
    el("dropZone").classList.toggle("busy", active);
    el("importFileInput").disabled = active;
    el("useSampleImport").disabled = active;
    el("importClose").disabled = active;
    el("dropZoneTitle").textContent = active ? "Import in progress" : "Tap here to upload";
    el("dropZoneSubtitle").textContent = active ? "Please keep this window open for a moment" : "Choose spotify_playlists.zip";
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function importExportifyFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setImportResult("");
    setImportProgress(true, "Opening your Exportify files…", `${files.length} selected file${files.length === 1 ? "" : "s"}`);
    setStatus("Importing Exportify data…");
    try {
      const csvs = [];
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        setImportProgress(true, "Reading your Exportify files…", `${index + 1} of ${files.length}: ${file.name}`);
        if (/\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
          const extracted = await extractCsvsFromZip(file);
          csvs.push(...extracted);
        } else if (/\.csv$/i.test(file.name) || file.type === "text/csv" || !file.type) {
          csvs.push({ name: file.name, text: await file.text() });
        }
      }
      if (!csvs.length) throw new Error("No CSV files were found. Choose an Exportify ZIP or CSV file.");

      const trackCsvs = csvs.filter(csv => !isExportifyAlbumList(csv));
      const skippedAlbumFiles = csvs.length - trackCsvs.length;
      const albumNote = skippedAlbumFiles ? " Saved album lists were skipped because they contain album details only." : "";
      if (!trackCsvs.length) {
        throw new Error("This export only contains saved album lists. Include Liked Songs or playlists to import individual tracks.");
      }

      setImportProgress(true, "Identifying your playlists…", `Found ${trackCsvs.length} track CSV file${trackCsvs.length === 1 ? "" : "s"}. Looking at Exportify's Added By data so followed playlists do not inflate your heatmap.`);
      const inferred = inferExportifyUser(trackCsvs);
      const trackMap = new Map();
      let likedFiles = 0;
      let personalPlaylistFiles = 0;
      let externalPlaylistFiles = 0;
      let rowsRead = 0;
      const personalPlaylistNames = [];
      const externalPlaylistNames = [];
      for (let index = 0; index < trackCsvs.length; index++) {
        const csv = trackCsvs[index];
        const classification = classifyExportifyCsv(csv.name, csv.text, inferred.id);
        const label = exportifyLabelForFilename(csv.name);
        setImportProgress(true, "Reading your songs…", `${index + 1} of ${trackCsvs.length}: ${label}`);
        const result = parseExportifyCsv(csv.name, csv.text, trackMap, classification);
        rowsRead += result.imported;
        if (classification === "liked") likedFiles++;
        else if (classification === "playlist") {
          personalPlaylistFiles++;
          personalPlaylistNames.push(label);
        } else {
          externalPlaylistFiles++;
          externalPlaylistNames.push(label);
        }
        if (index % 8 === 0) await wait(0);
      }
      if (!trackMap.size) throw new Error("The files were readable, but no Spotify tracks were found.");

      const enabledNow = [...trackMap.values()].filter(sourceEnabled).length;
      setImportProgress(true, "Building your Coachella lineup…", `${enabledNow.toLocaleString()} unique songs in the default personal-library view.`);
      state.library = {
        tracks: [...trackMap.values()],
        syncedAt: new Date().toISOString(),
        profile: { displayName: "Exportify import" },
        mode: "exportify",
        importStats: {
          csvFiles: trackCsvs.length,
          skippedAlbumFiles,
          likedFiles,
          personalPlaylistFiles,
          externalPlaylistFiles,
          personalPlaylistNames,
          externalPlaylistNames,
          rowsRead,
          inferredUserId: inferred.id,
          inferredUserFileCount: inferred.fileCount,
          inferenceConfidence: inferred.confidence
        }
      };
      state.demo = false;
      await dbSet(CACHE_KEY, state.library);
      render();

      const duplicateCount = Math.max(0, rowsRead - trackMap.size);
      const enabledCount = state.library.tracks.filter(sourceEnabled).length;
      const likedText = likedFiles ? "Liked Songs found" : "no Liked Songs file detected";
      const filterText = inferred.id
        ? `${personalPlaylistFiles} personal/shared playlists included; ${externalPlaylistFiles} followed/other playlists ignored by default`
        : `${personalPlaylistFiles} playlist files included (personal playlist ID could not be inferred)`;
      const resultText = `✓ Import complete: ${enabledCount.toLocaleString()} unique songs in your default library view. ${likedText}; ${filterText}. ${duplicateCount.toLocaleString()} duplicate playlist appearances removed.${albumNote}`;
      setImportProgress(true, "Import complete ✓", `${enabledCount.toLocaleString()} unique songs are ready. ${externalPlaylistFiles ? `${externalPlaylistFiles} followed/other playlists were kept out of the heatmap.` : ""}`);
      setStatus(resultText);
      await wait(850);
      if (el("importDialog").open) el("importDialog").close();
    } catch (error) {
      console.error(error);
      setImportProgress(false);
      setImportResult(error.message || "Could not import those Exportify files.", true);
      setStatus(error.message || "Could not import those Exportify files.", true);
    } finally {
      if (!el("importDialog").open) setImportProgress(false);
      el("importFileInput").value = "";
    }
  }

  async function loadSampleExportifyImport() {
    setImportResult("Loading the included Exportify sample…");
    try {
      const response = await fetch(SAMPLE_EXPORT_URL);
      if (!response.ok) throw new Error("Could not load the included sample ZIP.");
      const blob = await response.blob();
      const file = new File([blob], "Exportify_Test.zip", { type: "application/zip" });
      await importExportifyFiles([file]);
    } catch (error) {
      setImportResult(error.message || "Could not load sample data.", true);
    }
  }

  function openImportDialog() {
    setImportResult("");
    setImportProgress(false);
    el("importDialog").showModal();
  }

  function randomString(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const random = new Uint8Array(length);
    crypto.getRandomValues(random);
    return [...random].map(v => chars[v % chars.length]).join("");
  }

  async function pkceChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function demoLibrary() {
    const specs = [
      ["Dua Lipa", 12, "liked"],
      ["Peggy Gou", 6, "owned"],
      ["Tame Impala", 8, "albums"],
      ["Magdalena Bay", 5, "collaborative"],
      ["SZA", 10, "liked"],
      ["Four Tet", 3, "owned"]
    ];
    const tracks = [];
    for (const [artist, count, source] of specs) {
      for (let i = 1; i <= count; i++) {
        const id = `demo-${normalizeName(artist)}-${i}`;
        tracks.push({
          id,
          name: `${artist} demo song ${i}`,
          artists: [{ id: `demo-${normalizeName(artist)}`, name: artist }],
          url: "https://open.spotify.com/",
          sources: [source]
        });
      }
    }
    return { tracks, syncedAt: new Date().toISOString(), profile: { displayName: "Demo" }, mode: "demo" };
  }

  function loadDemo() {
    state.library = demoLibrary();
    state.demo = true;
    setStatus("Demo data loaded. Try switching days and library sources.");
    render();
  }

  async function clearLocalData() {
    localStorage.removeItem(TOKEN_KEY);
    await dbDelete(CACHE_KEY);
    state.library = null;
    state.demo = false;
    setStatus("Local music data cleared. Your calculation settings were kept.");
    render();
  }

  function disconnectSpotify() {
    localStorage.removeItem(TOKEN_KEY);
    setStatus("Spotify disconnected. Cached library data remains until you clear local data.");
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbDelete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function openSpotifyPasswordPrompt() {
    if (sessionStorage.getItem(DIRECT_SPOTIFY_UNLOCK_KEY) === "1") {
      syncSettingsUI();
      return;
    }
    el("passwordError").textContent = "";
    el("spotifyPasswordInput").value = "";
    if (el("settingsDialog").open) el("settingsDialog").close();
    el("passwordDialog").showModal();
    setTimeout(() => el("spotifyPasswordInput").focus(), 50);
  }

  function unlockDirectSpotify() {
    const value = el("spotifyPasswordInput").value;
    if (value !== "password") {
      el("passwordError").textContent = "Incorrect password.";
      return;
    }
    sessionStorage.setItem(DIRECT_SPOTIFY_UNLOCK_KEY, "1");
    el("passwordDialog").close();
    syncSettingsUI();
    el("settingsDialog").showModal();
    requestAnimationFrame(() => el("directSpotifyPanel").scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function maybeShowDonationPrompt() {
    // Show once per browser session. sessionStorage survives the Spotify redirect in
    // the same tab, so the prompt will not reappear mid-flow, but it will appear
    // again the next time the app is opened in a new browsing session.
    if (sessionStorage.getItem(DONATION_ACK_KEY) === "1") return;
    const dialog = el("donationDialog");
    if (dialog && !dialog.open) dialog.showModal();
  }

  function acknowledgeDonationPrompt() {
    sessionStorage.setItem(DONATION_ACK_KEY, "1");
    el("donationDialog").close();
  }

  function bindEvents() {
    el("donationContinue").addEventListener("click", acknowledgeDonationPrompt);
    el("donationDialog").addEventListener("cancel", event => event.preventDefault());
    el("importButton").addEventListener("click", openImportDialog);
    el("settingsImport").addEventListener("click", () => { el("settingsDialog").close(); openImportDialog(); });
    el("importClose").addEventListener("click", () => el("importDialog").close());
    el("useSampleImport").addEventListener("click", loadSampleExportifyImport);
    el("importFileInput").addEventListener("change", event => importExportifyFiles(event.target.files));
    const dropZone = el("dropZone");
    ["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    }));
    dropZone.addEventListener("drop", event => importExportifyFiles(event.dataTransfer.files));
    el("unlockSpotifyButton").addEventListener("click", openSpotifyPasswordPrompt);
    el("passwordSubmit").addEventListener("click", unlockDirectSpotify);
    el("passwordClose").addEventListener("click", () => { el("passwordDialog").close(); el("settingsDialog").showModal(); });
    el("spotifyPasswordInput").addEventListener("keydown", event => { if (event.key === "Enter") unlockDirectSpotify(); });
    el("settingsConnect").addEventListener("click", startSpotifyAuth);
    if (el("demoButton")) el("demoButton").addEventListener("click", loadDemo);
    el("settingsDemo").addEventListener("click", loadDemo);
    el("syncButton").addEventListener("click", () => {
      if (state.library?.mode === "exportify") openImportDialog();
      else syncSpotifyLibrary();
    });
    el("settingsButton").addEventListener("click", () => el("settingsDialog").showModal());
    el("settingsClose").addEventListener("click", () => el("settingsDialog").close());
    el("artistClose").addEventListener("click", () => el("artistDialog").close());
    el("imageSaveClose").addEventListener("click", () => el("imageSaveDialog").close());
    el("imageSaveDialog").addEventListener("close", () => {
      if (imageSaveObjectUrl) URL.revokeObjectURL(imageSaveObjectUrl);
      imageSaveObjectUrl = null;
      el("imageSavePreview").removeAttribute("src");
    });
    el("disconnectButton").addEventListener("click", disconnectSpotify);
    el("clearDataButton").addEventListener("click", clearLocalData);

    el("clientIdInput").addEventListener("change", event => {
      const value = event.target.value.trim();
      if (value) localStorage.setItem(CLIENT_ID_KEY, value);
      else localStorage.removeItem(CLIENT_ID_KEY);
    });

    const settingsMap = {
      sourceLiked: "liked",
      sourceOwned: "owned",
      sourceCollaborative: "collaborative",
      sourceAlbums: "albums",
      sourceExternal: "externalPlaylists",
      excludeCoachellaPlaylists: "excludeCoachellaPlaylists"
    };
    for (const [id, key] of Object.entries(settingsMap)) {
      el(id).addEventListener("change", event => {
        state.settings[key] = event.target.checked;
        saveSettings();
        render();
      });
    }

    document.querySelectorAll("#daySelector button").forEach(button => {
      button.addEventListener("click", () => {
        state.day = button.dataset.day;
        render();
      });
    });

    [el("artistDialog"), el("settingsDialog"), el("importDialog")].forEach(dialog => {
      dialog.addEventListener("click", event => {
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) dialog.close();
      });
    });
  }

  async function init() {
    bindEvents();
    try {
      const cached = await dbGet(CACHE_KEY);
      if (cached?.tracks?.length) {
        state.library = cached;
        setStatus(`Using your locally cached Spotify library from ${new Date(cached.syncedAt).toLocaleString()}.`);
      }
    } catch (error) {
      console.warn("Could not load IndexedDB cache", error);
    }
    render();
    maybeShowDonationPrompt();

    try {
      await handleOAuthCallback();
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Spotify connection failed.", true);
    }
  }

  init();
})();
