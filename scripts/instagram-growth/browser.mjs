import {loadDependency, browserPath} from './runtime.mjs';

const ORIGIN = 'https://www.instagram.com';
const USERNAME = /^[a-zA-Z0-9._]{1,30}$/;
const RESERVED = new Set(['accounts', 'explore', 'reels', 'reel', 'p', 'stories', 'direct', 'about', 'legal', 'challenge']);
const cleanUsername = value => {
  if (typeof value !== 'string' || !USERNAME.test(value) || value.startsWith('.') || value.endsWith('.') || value.includes('..'))
    throw new GrowthBrowserStop('invalid_username', 'Invalid Instagram username');
  return value.toLowerCase();
};
const profileName = href => {
  try {
    const u = new URL(href, ORIGIN);
    if (u.protocol !== 'https:' || u.hostname !== 'www.instagram.com' || u.port || u.search || u.hash) return null;
    const match = u.pathname.match(/^\/([a-zA-Z0-9._]{1,30})\/?$/);
    if (!match || RESERVED.has(match[1].toLowerCase())) return null;
    return cleanUsername(match[1]);
  } catch {
    return null;
  }
};

export class GrowthBrowserStop extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GrowthBrowserStop';
    this.code = code;
  }
}

export class InstagramBrowser {
  static async launch({profileDirectory, account, executablePath, headless = true} = {}) {
    const {chromium} = await loadDependency('playwright-core');
    const context = await chromium.launchPersistentContext(profileDirectory, {
      headless,
      executablePath: executablePath || browserPath(chromium)
    });
    const page = context.pages()[0] || (await context.newPage());
    return new InstagramBrowser(page, {account, context});
  }

  constructor(page, {account, context} = {}) {
    this.page = page;
    this.account = cleanUsername(account);
    this.context = context || null;
    this.networkStop = null;
    this.beforeMutation = null;
    this.shouldSkipIdentity = null;
    this.profileIdentity = null;
    this.page.on('response', response => {
      const status = response.status();
      let url;
      try {
        url = new URL(response.url());
      } catch {
        return;
      }
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com', 'i.instagram.com'].includes(url.hostname)) return;
      if (![401, 403, 429].includes(status)) return;
      const type = response.request().resourceType();
      if (!['document', 'xhr', 'fetch'].includes(type)) return;
      this.networkStop ||= new GrowthBrowserStop(status === 429 ? 'rate_limited' : 'http_blocked', `Instagram returned HTTP ${status}`);
    });
  }

  async close() {
    if (this.context) await this.context.close();
  }

  async guard({allowLogin = false} = {}) {
    if (this.networkStop) throw this.networkStop;
    const url = new URL(this.page.url());
    if (url.href === 'about:blank') return;
    if (url.protocol !== 'https:' || url.hostname !== 'www.instagram.com' || url.port || url.username || url.password)
      throw new GrowthBrowserStop('unexpected_domain', 'Browser left the expected Instagram domain');
    if (/^\/(challenge|checkpoint|accounts\/suspended)/i.test(url.pathname) || (!allowLogin && /^\/accounts\/login\/two_factor/i.test(url.pathname)))
      throw new GrowthBrowserStop('challenge', 'Instagram requires verification or account review');
    const alerts = this.page.locator('[role="alert"], [role="alertdialog"], [role="dialog"], main h1, main h2');
    const texts = await alerts.allTextContents();
    for (let i = 0; i < texts.length; i++) {
      if (
        !(await alerts
          .nth(i)
          .isVisible()
          .catch(() => false))
      )
        continue;
      // User-list contents may include arbitrary biographies. For such dialogs,
      // inspect their headings/alerts instead of interpreting user content as UI.
      let rawText = texts[i];
      if ((await alerts.nth(i).getAttribute('role')) === 'dialog') {
        const dialog = alerts.nth(i);
        const profileLinks = await dialog.locator('a[href]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
        const isUserList = (await dialog.locator('input, [role="textbox"]').count()) > 0 || new Set(profileLinks.map(profileName).filter(Boolean)).size >= 2;
        if (isUserList) rawText = (await dialog.locator('h1, h2, h3, [role="heading"], [role="alert"]').allTextContents()).join(' ');
      }
      const text = rawText.replace(/\s+/g, ' ').trim();
      if (
        /try again later|we restrict certain activity|we limit how often you can do certain things|automated behavior detected|we suspect automated behavior|temporarily (?:blocked|restricted)|going too fast|action blocked|too many requests|coba lagi nanti|kami membatasi aktivitas|kami membatasi seberapa sering|perilaku otomatis|akun anda.{0,100}(?:dibatasi|diblokir) sementara|tindakan diblokir/i.test(
          text
        )
      )
        throw new GrowthBrowserStop('rate_limited', 'Instagram displayed an activity restriction');
      if (
        /confirm (?:it.s|your identity)|verify your identity|suspicious activity|konfirmasi identitas|verifikasi identitas/i.test(text) ||
        (!(allowLogin && /^\/accounts\/login\/two_factor/i.test(url.pathname)) && /security code|kode keamanan/i.test(text))
      )
        throw new GrowthBrowserStop('challenge', 'Instagram displayed a verification warning');
      if (/something went wrong|page isn.t available|sorry, this page isn.t available|terjadi kesalahan|halaman ini tidak tersedia/i.test(text))
        throw new GrowthBrowserStop('instagram_error', 'Instagram displayed an error');
    }
    const login =
      /^\/accounts\/login/i.test(url.pathname) ||
      (await this.page
        .locator('input[name="password"]')
        .isVisible()
        .catch(() => false));
    if (login && !allowLogin) throw new GrowthBrowserStop('login_required', 'Instagram login is required');
  }

  async navigate(url, options = {}) {
    await this.guard(options);
    this.profileIdentity = null;
    await this.page.goto(url, {waitUntil: 'domcontentloaded'});
    await this.guard(options);
  }

  async click(locator, {mutation = false, targetUsername = null, expectedTargetUserId = null} = {}) {
    await this.guard();
    if ((await locator.count()) !== 1 || !(await locator.isVisible())) throw new GrowthBrowserStop('ambiguous_ui', 'Expected a single visible control');
    if (mutation) {
      await locator.click({trial: true, timeout: 2000});
      await this.assertAccount();
      if (
        targetUsername &&
        (new URL(this.page.url()).pathname.toLowerCase() !== `/${targetUsername}/` ||
          (expectedTargetUserId && (await this.profileUserId(targetUsername)) !== expectedTargetUserId))
      )
        throw new GrowthBrowserStop('identity_mismatch', 'Target identity changed before the action');
      if (this.beforeMutation) this.beforeMutation();
      await locator.click({timeout: 1000, noWaitAfter: true});
    } else await locator.click();
    await this.guard();
  }

  async login() {
    await this.navigate(ORIGIN + '/', {allowLogin: true});
  }

  async poll(check, {timeout = 10000, allowLogin = false} = {}) {
    const deadline = Date.now() + timeout;
    do {
      await this.guard({allowLogin});
      const result = await check();
      if (result) return result;
      if (Date.now() >= deadline) break;
      await this.page.waitForTimeout(Math.min(200, deadline - Date.now()));
    } while (true);
    await this.guard({allowLogin});
    return null;
  }

  async assertAccount({allowLogin = false} = {}) {
    await this.guard({allowLogin});
    const links = this.page.locator('a[href]');
    const matches = [];
    for (let i = 0; i < (await links.count()); i++) {
      const link = links.nth(i);
      if (!(await link.isVisible())) continue;
      if (await link.evaluate(node => !!node.closest('main, article, [role="main"], [role="dialog"]'))) continue;
      const label = [
        await link.getAttribute('aria-label'),
        await link.innerText(),
        ...(await link.locator('[aria-label]').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label'))))
      ]
        .filter(Boolean)
        .map(s => s.trim());
      const target = profileName(await link.getAttribute('href'));
      if (label.some(s => /^(profile|profil)$/i.test(s))) {
        matches.push(target);
        continue;
      }
      // Collapsed desktop navigation labels its profile image with the account
      // name. Accept that cue only in a bounded primary navigation group.
      const sidebar = await link.evaluate(node => {
        const imageNames = [...node.querySelectorAll('img[alt]')].map(image => image.getAttribute('alt') || '');
        if (!imageNames.length) return null;
        const routes = new Set(['/', '/reels/', '/direct/inbox/', '/explore/']);
        for (let group = node.parentElement; group && !['BODY', 'HTML'].includes(group.tagName); group = group.parentElement) {
          if (group.querySelector('main, article, [role="main"], [role="dialog"]')) continue;
          const anchors = [...group.querySelectorAll('a[href]')];
          if (anchors.length > 20) continue;
          const found = new Set();
          for (const anchor of anchors) {
            try {
              const url = new URL(anchor.href);
              if (url.origin === location.origin && routes.has(url.pathname)) found.add(url.pathname);
            } catch {
              /* Ignore malformed links. */
            }
          }
          if (found.size >= 3) return imageNames;
        }
        return null;
      });
      if (sidebar) {
        const pictureNames = sidebar.map(alt => alt.match(/^([a-zA-Z0-9._]{1,30})['’]s profile picture$/i)?.[1]?.toLowerCase()).filter(Boolean);
        if (pictureNames.length === 1) matches.push(pictureNames[0] === target ? target : null);
      }
    }
    if (!matches.length || matches.includes(null)) throw new GrowthBrowserStop('account_unverified', 'Cannot find a signed-in Profile navigation link');
    if (matches.length !== 1 || matches[0] !== this.account)
      throw new GrowthBrowserStop('account_mismatch', 'Cannot verify the signed-in account from the Profile navigation link');
    return true;
  }

  async openProfile(username) {
    username = cleanUsername(username);
    await this.navigate(`${ORIGIN}/${username}/`);
    const header = this.page.locator('header').filter({has: this.page.getByText(username, {exact: true})});
    if (!(await this.poll(async () => (await header.count()) === 1 && (await header.isVisible()))))
      throw new GrowthBrowserStop('ambiguous_ui', `Cannot verify profile ${username}`);
    const userId = await this.poll(async () => await this.profileUserId(username), {timeout: 2000});
    this.profileIdentity = {username, userId};
    return header;
  }

  // Read only JSON embedded in this current profile document. Never fall back
  // to a prior visit or another user's profile if the evidence is missing.
  async profileUserId(username) {
    if (new URL(this.page.url()).pathname.toLowerCase() !== `/${username}/`) return null;
    const scripts = await this.page.locator('script[type="application/json"], script[type="application/ld+json"]').evaluateAll(
      (nodes, name) =>
        nodes
          .slice(0, 100)
          .map(node => node.textContent || '')
          .filter(text => text.length <= 1000000 && (text.toLowerCase().includes(name) || text.includes('"profile_id"'))),
      username
    );
    const ids = new Set(),
      routeIds = new Set();
    let routeMatches = false;
    const add = (set, id) => {
      if ((typeof id === 'string' && /^[0-9]{1,30}$/.test(id)) || (typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) set.add(String(id));
    };
    for (const text of scripts) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      const pending = [parsed];
      let budget = 20000;
      while (pending.length && budget-- > 0) {
        const item = pending.pop();
        if (!item || typeof item !== 'object') continue;
        if (typeof item.username === 'string' && item.username.toLowerCase() === username) {
          add(ids, item.id);
          add(ids, item.pk);
        }
        if (item.initialRouteInfo?.route?.params?.username?.toLowerCase() === username) routeMatches = true;
        add(routeIds, item.profile_id);
        for (const value of Object.values(item)) if (value && typeof value === 'object') pending.push(value);
      }
      if (budget <= 0) return null;
    }
    // Current Instagram embeds the profile_id apart from its route username.
    // Require both the exact initial route and canonical profile URL before
    // accepting that document-level identity; a biography string is not parsed.
    if (routeMatches && routeIds.size) {
      const meta = this.page.locator('meta[property="og:url"]');
      if ((await meta.count()) === 1) {
        try {
          const canonical = new URL(await meta.getAttribute('content'));
          if (canonical.origin === ORIGIN && canonical.pathname.toLowerCase() === `/${username}/`) for (const id of routeIds) ids.add(id);
        } catch {
          /* Missing or malformed canonical evidence remains unknown. */
        }
      }
    }
    return ids.size === 1 ? [...ids][0] : null;
  }

  async openFollowers(username) {
    const header = await this.openProfile(username);
    const links = header.locator('a[href]').filter({hasText: /followers|pengikut/i});
    if (!(await this.poll(async () => (await links.count()) === 1 && (await links.isVisible()))))
      throw new GrowthBrowserStop('ambiguous_ui', 'Followers control unavailable');
    await this.click(links);
    const dialog = this.page.getByRole('dialog');
    if (!(await this.poll(async () => (await dialog.count()) === 1 && (await dialog.isVisible()))))
      throw new GrowthBrowserStop('ambiguous_ui', 'Followers dialog did not open');
    return dialog;
  }

  async visibleUsernames(scope) {
    const links = scope.locator('a[href]');
    const names = [];
    for (let i = 0; i < (await links.count()); i++) {
      const link = links.nth(i);
      if (!(await link.isVisible())) continue;
      const name = profileName(await link.getAttribute('href'));
      if (name) names.push(name);
    }
    return [...new Set(names)];
  }

  async collectCandidates(source, {limit = 300} = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 300) throw new GrowthBrowserStop('invalid_limit', 'Candidate limit must be between 1 and 300');
    const deadline = Date.now() + 45000;
    await this.assertAccount();
    let dialog;
    if (source?.type === 'followers') {
      dialog = await this.openFollowers(cleanUsername(source.account));
    } else if (source?.type === 'likes') {
      let url;
      try {
        url = new URL(source.url);
      } catch {
        throw new GrowthBrowserStop('invalid_source', 'Invalid post URL');
      }
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'www.instagram.com' ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !/^\/(p|reel)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
      )
        throw new GrowthBrowserStop('invalid_source', 'Expected an Instagram post or reel URL');
      await this.navigate(url.href);
      const button = this.page.locator('main').getByRole('link', {name: /^(?:[\d,.]+\s+)?(?:likes|suka)$/i});
      if (!(await this.poll(async () => (await button.count()) === 1 && (await button.isVisible()))))
        throw new GrowthBrowserStop('ambiguous_ui', 'Likes control unavailable');
      await this.click(button);
      dialog = this.page.getByRole('dialog');
      if (!(await this.poll(async () => (await dialog.count()) === 1 && (await dialog.isVisible()))))
        throw new GrowthBrowserStop('ambiguous_ui', 'Likes dialog did not open');
    } else throw new GrowthBrowserStop('invalid_source', 'Unsupported candidate source');
    const seen = new Set();
    const rows = async () => (await this.visibleUsernames(dialog)).filter(name => name !== this.account);
    const emptyState = dialog.getByText(
      /^(no followers yet|no likes yet|no results found|no results|belum ada pengikut|belum ada suka|tidak ada hasil|tidak ditemukan hasil)\.?$/i,
      {exact: true}
    );
    const initial = await this.poll(
      async () => {
        const names = await rows();
        if (names.length) return {names};
        const inputs = dialog.getByRole('textbox');
        const searchEmpty = (await inputs.count()) === 0 || ((await inputs.count()) === 1 && !(await inputs.inputValue()));
        if (searchEmpty && (await emptyState.count()) === 1 && (await emptyState.isVisible())) return {empty: true};
        return null;
      },
      {timeout: Math.max(0, Math.min(10000, deadline - Date.now()))}
    );
    if (!initial) throw new GrowthBrowserStop('source_unverified', 'Source list did not load or show an explicit empty state');
    if (initial.empty) return [];
    for (const name of initial.names) if (seen.size < limit) seen.add(name);
    let unchanged = 0;
    for (let iteration = 0; iteration < 25 && seen.size < limit && unchanged < 3 && Date.now() < deadline; iteration++) {
      await this.guard();
      await dialog.evaluate(node => {
        const candidates = [node, ...node.querySelectorAll('*')].filter(n => n.scrollHeight > n.clientHeight + 10);
        candidates.sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight));
        if (candidates[0]) candidates[0].scrollTop = candidates[0].scrollHeight;
      });
      await this.guard();
      let sawSpinner = false;
      const progress = await this.poll(
        async () => {
          const names = await rows();
          if (names.some(name => !seen.has(name))) return {names};
          const spinners = dialog.locator('[aria-busy="true"], [role="progressbar"]');
          const loading = (await spinners.count()) > 0 && (await spinners.first().isVisible());
          if (loading) sawSpinner = true;
          if (sawSpinner && !loading) return {names};
          return null;
        },
        {timeout: Math.max(0, Math.min(2000, deadline - Date.now()))}
      );
      const before = seen.size;
      for (const name of progress?.names || (await rows())) if (seen.size < limit) seen.add(name);
      unchanged = seen.size === before ? unchanged + 1 : 0;
    }
    return [...seen].map(username => ({username, userId: null, source, observedAt: new Date().toISOString()}));
  }

  async relationshipControls(header) {
    const states = new Map([
      ['following', 'following'],
      ['mengikuti', 'following'],
      ['requested', 'requested'],
      ['diminta', 'requested'],
      ['permintaan terkirim', 'requested'],
      ['follow', 'not_following'],
      ['ikuti', 'not_following']
    ]);
    const buttons = header.getByRole('button');
    const found = [];
    for (let i = 0; i < (await buttons.count()); i++) {
      const button = buttons.nth(i);
      if (!(await button.isVisible())) continue;
      // Visible text excludes SVG titles and hidden accessibility text that
      // Instagram appends to the Following control.
      const label = (await button.innerText()).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
      const state = states.get(label);
      if (state) found.push({button, state});
    }
    return found;
  }

  async relationship(header) {
    const found = await this.relationshipControls(header);
    return found.length === 1 ? found[0].state : 'unknown';
  }

  async relationshipControl(header, state) {
    const found = await this.relationshipControls(header);
    if (found.length !== 1 || found[0].state !== state) throw new GrowthBrowserStop('ambiguous_ui', 'Cannot verify a unique visible relationship control');
    return found[0].button;
  }

  async waitRelationship(header, accepted = ['following', 'requested', 'not_following'], {timeout = 10000} = {}) {
    return await this.poll(
      async () => {
        const state = await this.relationship(header);
        return accepted.includes(state) ? state : null;
      },
      {timeout}
    );
  }

  async inspect(username) {
    username = cleanUsername(username);
    await this.assertAccount();
    const header = await this.openProfile(username);
    const userId = this.profileIdentity.userId;
    const relationship = (await this.waitRelationship(header)) || 'unknown';
    const badge = header.getByText(/^(follows you|mengikuti anda)$/i, {exact: true});
    let followsBack = (await badge.count()) === 1 && (await badge.isVisible()) ? true : null;
    if (followsBack === null) {
      let dialog;
      try {
        dialog = await this.openFollowers(this.account);
      } catch (error) {
        if (error instanceof GrowthBrowserStop && error.code === 'ambiguous_ui') return {username, userId, relationship, followsBack: null};
        throw error;
      }
      const ownerId = this.profileIdentity.userId;
      const search = dialog.getByRole('textbox');
      const searchReady = await this.poll(async () => (await search.count()) === 1 && (await search.isVisible()), {timeout: 3000});
      if (searchReady) {
        const noResults = dialog.getByText(/^(no results found|no results|tidak ada hasil|tidak ditemukan hasil)\.?$/i, {exact: true});
        const initialQuery = await search.inputValue();
        const initialNoResults = (await noResults.count()) > 0 && (await noResults.first().isVisible());
        const requests = new WeakSet();
        let emptyResponse = false;
        let matchingRequests = 0;
        const onRequest = request => {
          try {
            const url = new URL(request.url());
            if (
              ownerId &&
              request.method() === 'GET' &&
              url.protocol === 'https:' &&
              url.hostname === 'www.instagram.com' &&
              !url.port &&
              url.pathname === `/api/v1/friendships/${ownerId}/followers/` &&
              url.searchParams.getAll('query').length === 1 &&
              url.searchParams.get('query') === username &&
              !['max_id', 'cursor', 'page'].some(key => url.searchParams.has(key))
            ) {
              matchingRequests++;
              emptyResponse = false;
              requests.add(request);
            }
          } catch {
            /* Ignore unrelated browser traffic. */
          }
        };
        const onResponse = async response => {
          if (!requests.has(response.request()) || response.status() !== 200) return;
          try {
            const declaredLength = response.headers()['content-length'];
            if (declaredLength !== undefined && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 1000000)) return;
            const text = await response.text();
            if (Buffer.byteLength(text, 'utf8') > 1000000) return;
            const data = JSON.parse(text);
            if (
              (data.status === undefined || data.status === 'ok') &&
              Array.isArray(data.users) &&
              data.users.length === 0 &&
              matchingRequests === 1 &&
              data.has_more !== true &&
              data.more_available !== true &&
              (data.has_more === false || data.more_available === false) &&
              (data.next_max_id === undefined || data.next_max_id === null || data.next_max_id === '')
            )
              emptyResponse = true;
          } catch {
            /* Unreadable or unexpected response is not evidence. */
          }
        };
        this.page.on('request', onRequest);
        this.page.on('response', onResponse);
        try {
          await this.guard();
          await search.fill(username);
          await this.guard();
          await this.poll(
            async () => {
              const names = await this.visibleUsernames(dialog);
              if (names.includes(username)) return true;
              return (
                emptyResponse &&
                names.length === 0 &&
                (await search.inputValue()) === username &&
                (await noResults.count()) === 1 &&
                (await noResults.isVisible()) &&
                (await dialog.locator('[aria-busy="true"]:visible, [role="progressbar"]:visible').count()) === 0
              );
            },
            {timeout: 5000}
          );
          await this.guard();
          const names = await this.visibleUsernames(dialog);
          if (names.includes(username)) followsBack = true;
          else if (
            emptyResponse &&
            names.length === 0 &&
            !initialQuery &&
            !initialNoResults &&
            (await search.inputValue()) === username &&
            (await noResults.count()) === 1 &&
            (await noResults.isVisible()) &&
            (await dialog.locator('[aria-busy="true"]:visible, [role="progressbar"]:visible').count()) === 0
          )
            followsBack = false;
        } finally {
          this.page.off('request', onRequest);
          this.page.off('response', onResponse);
        }
      }
    }
    return {username, userId, relationship, followsBack};
  }

  async follow(username) {
    username = cleanUsername(username);
    await this.assertAccount();
    const header = await this.openProfile(username);
    const userId = this.profileIdentity.userId;
    const state = await this.waitRelationship(header);
    if (state === 'following' || state === 'requested') return {status: 'skipped', userId};
    if (state !== 'not_following') throw new GrowthBrowserStop('ambiguous_ui', 'Cannot establish current follow state');
    if (userId && this.shouldSkipIdentity && this.shouldSkipIdentity(userId, username)) return {status: 'skipped', userId};
    await this.click(await this.relationshipControl(header, 'not_following'), {mutation: true, targetUsername: username, expectedTargetUserId: userId});
    let next = await this.waitRelationship(header, ['following', 'requested'], {timeout: 3000});
    if (!next) {
      // A successful Follow can leave Instagram's current profile controls stale.
      // Read the saved relationship once; never submit a second Follow click.
      const fresh = await this.openProfile(username);
      await this.assertAccount();
      if (userId && this.profileIdentity.userId !== userId)
        throw new GrowthBrowserStop('identity_mismatch', 'Target identity changed during follow confirmation');
      next = await this.waitRelationship(fresh, ['following', 'requested']);
    }
    return {
      status: next === 'following' || next === 'requested' ? next : 'uncertain',
      userId,
      ...(next ? {} : {detail: 'Follow click returned, but neither the live controls nor a fresh profile read-back confirmed its result.'})
    };
  }

  async unfollow(username, {expectedUserId} = {}) {
    username = cleanUsername(username);
    if (typeof expectedUserId !== 'string' || !/^[0-9]{1,30}$/.test(expectedUserId))
      throw new GrowthBrowserStop('identity_unverified', 'A stable target user ID is required before unfollow');
    const observed = await this.inspect(username);
    if (!observed.userId || observed.userId !== expectedUserId)
      throw new GrowthBrowserStop('identity_mismatch', 'The observed target ID does not match the recorded user ID');
    if (observed.relationship === 'unknown' || observed.followsBack === null)
      throw new GrowthBrowserStop('ambiguous_ui', 'Cannot establish relationship and reciprocal-follow state');
    if (observed.relationship !== 'following' || observed.followsBack !== false) return {status: 'skipped'};
    const header = await this.openProfile(username);
    if (this.profileIdentity.userId !== expectedUserId) throw new GrowthBrowserStop('identity_mismatch', 'The target ID changed before unfollow');
    if ((await this.waitRelationship(header)) !== 'following') throw new GrowthBrowserStop('ambiguous_ui', 'Relationship changed before unfollow');
    await this.click(await this.relationshipControl(header, 'following'));
    const dialog = this.page.getByRole('dialog');
    if (!(await this.poll(async () => (await dialog.count()) === 1 && (await dialog.isVisible()))))
      throw new GrowthBrowserStop('ambiguous_ui', 'Unfollow confirmation did not open');
    await this.click(dialog.getByRole('button', {name: /^(unfollow|berhenti mengikuti)$/i}), {
      mutation: true,
      targetUsername: username,
      expectedTargetUserId: expectedUserId
    });
    return {status: (await this.waitRelationship(header, ['not_following'])) === 'not_following' ? 'unfollowed' : 'uncertain'};
  }
}
