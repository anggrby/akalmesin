import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDependency, browserPath} from '../../scripts/instagram-growth/runtime.mjs';
import {InstagramBrowser, GrowthBrowserStop} from '../../scripts/instagram-growth/browser.mjs';
import {GrowthReadInterrupted} from '../../scripts/instagram-growth/recovery.mjs';

const {chromium} = await loadDependency('playwright-core');
const origin = 'https://www.instagram.com';
const nav = '<nav><a href="/akalmesin/" aria-label="Profile">Profile</a></nav>';
const html = content => `<!doctype html><html><body>${nav}${content}</body></html>`;
const ids = {akalmesin: '100', alice: '101', bob: '102', carol: '103', 'aico.community': '104'};
const searchInput = `<input aria-label="Search" oninput="document.querySelectorAll('#followers a').forEach(a => a.hidden=!!this.value && a.textContent!==this.value); document.querySelector('#none').hidden=!this.value || ['alice','bob'].includes(this.value); fetch('/api/v1/friendships/100/followers/?query='+encodeURIComponent(this.value))">`;
const profile = (username, relationship = 'Follow', badge = '') =>
  html(
    `<script type="application/json">${JSON.stringify({user: {username, id: ids[username] || '999'}})}</script><header><h1>${username}</h1><a href="#" onclick="document.querySelector('#followers').hidden=false;return false">12 followers</a><button id="relation" onclick="if(this.textContent==='Following'){document.querySelector('#confirm').hidden=false}else{this.textContent='Following'}">${relationship}</button><span>${badge}</span></header><div role="dialog" id="followers" hidden>${searchInput}<p id="none" hidden>No results found</p><a href="/alice/">alice</a><a href="/bob/">bob</a><a href="/alice/">alice</a></div><div role="dialog" id="confirm" hidden><button onclick="document.querySelector('#relation').textContent='Follow';document.querySelector('#confirm').remove()">Unfollow</button></div>`
  );

async function setup(t, pages = {}) {
  const browser = await chromium.launch({headless: true, executablePath: browserPath(chromium)});
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/v1/friendships/100/followers/')
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({users: [], has_more: false})});
    const entry = pages[url.pathname] ?? profile(url.pathname.split('/')[1] || 'akalmesin');
    return route.fulfill(typeof entry === 'string' ? {status: 200, contentType: 'text/html', body: entry} : entry);
  });
  await page.goto(origin + '/akalmesin/');
  return {page, client: new InstagramBrowser(page, {account: 'akalmesin'})};
}

test('verifies the navigation account and collects unique visible followers', async t => {
  const {client, page} = await setup(t, {'/aico.community/': profile('aico.community')});
  assert.equal(await client.assertAccount(), true);
  const source = {type: 'followers', account: 'aico.community'};
  const rows = await client.collectCandidates(source, {limit: 2});
  assert.deepEqual(
    rows.map(r => r.username),
    ['alice', 'bob']
  );
  assert.equal(rows[0].userId, null);
  assert.deepEqual(rows[0].source, source);
  assert.ok(!Number.isNaN(Date.parse(rows[0].observedAt)));
  await page.locator('nav a').evaluate(a => (a.href = '/other/'));
  await assert.rejects(client.assertAccount(), e => e instanceof GrowthBrowserStop && e.code === 'account_mismatch');
});

test('follow skips existing relationships and verifies a changed control', async t => {
  const {client} = await setup(t, {'/alice/': profile('alice'), '/bob/': profile('bob', 'Following'), '/carol/': profile('carol', 'Requested')});
  assert.deepEqual(await client.follow('alice'), {status: 'following', userId: '101'});
  assert.deepEqual(await client.follow('bob'), {status: 'skipped', userId: '102'});
  assert.deepEqual(await client.follow('carol'), {status: 'skipped', userId: '103'});
});

test('collects only visible users from a post likes dialog', async t => {
  const post = html(
    `<main><a href="#" onclick="document.querySelector('[role=dialog]').hidden=false;return false">42 likes</a></main><div role="dialog" hidden><a href="/alice/">alice</a><a href="/bob/" hidden>bob</a><a href="/alice/">alice</a></div>`
  );
  const {client} = await setup(t, {'/p/abc/': post});
  const rows = await client.collectCandidates({type: 'likes', url: origin + '/p/abc/'}, {limit: 2});
  assert.deepEqual(
    rows.map(r => r.username),
    ['alice']
  );
});

test('reciprocal state comes from badge or exact search, and unfollow requires explicit absence', async t => {
  const {client} = await setup(t, {
    '/alice/': profile('alice', 'Following', 'Follows you'),
    '/bob/': profile('bob', 'Following'),
    '/carol/': profile('carol', 'Following')
  });
  assert.deepEqual(await client.inspect('alice'), {username: 'alice', userId: '101', relationship: 'following', followsBack: true});
  assert.deepEqual(await client.inspect('bob'), {username: 'bob', userId: '102', relationship: 'following', followsBack: true});
  assert.deepEqual(await client.inspect('carol'), {username: 'carol', userId: '103', relationship: 'following', followsBack: false});
  assert.deepEqual(await client.unfollow('carol', {expectedUserId: '103'}), {status: 'unfollowed'});
  assert.deepEqual(await client.unfollow('alice', {expectedUserId: '101'}), {status: 'skipped'});
});

test('ambiguous reciprocity and unsupported URLs fail closed', async t => {
  const noSearch = profile('akalmesin').replace(searchInput, '');
  const {client} = await setup(t, {'/akalmesin/': noSearch, '/carol/': profile('carol', 'Following')});
  assert.equal((await client.inspect('carol')).followsBack, null);
  await assert.rejects(client.unfollow('carol', {expectedUserId: '103'}), e => e.code === 'ambiguous_ui');
  await assert.rejects(client.collectCandidates({type: 'likes', url: 'https://instagram.com.evil.test/p/a/'}), e => e.code === 'invalid_source');
  await assert.rejects(client.follow('../bad'), e => e.code === 'invalid_username');
});

test('guard stops on scoped warnings and blocked responses without scanning ordinary posts', async t => {
  const {client, page} = await setup(t);
  await page.locator('body').evaluate(body => body.insertAdjacentHTML('beforeend', '<article>Try again later</article>'));
  await client.guard();
  await page.locator('body').evaluate(body => body.insertAdjacentHTML('beforeend', '<div role="alert">Try again later</div>'));
  await assert.rejects(client.guard(), e => e.code === 'rate_limited');
  await page.locator('[role="alert"]').evaluate(node => node.remove());
  await page.route('**/api/test', route => route.fulfill({status: 429, body: 'limited'}));
  await page.evaluate(() => fetch('/api/test'));
  await assert.rejects(client.guard(), e => e.code === 'rate_limited');
});

test('login pages are allowed only for explicit login and challenge paths stop', async t => {
  const {client, page} = await setup(t, {'/accounts/login/': html('<input name="password">'), '/challenge/': html('challenge')});
  await page.goto(origin + '/accounts/login/');
  await client.guard({allowLogin: true});
  await assert.rejects(client.guard(), e => e.code === 'login_required');
  await page.goto(origin + '/challenge/');
  await assert.rejects(client.guard({allowLogin: true}), e => e.code === 'challenge');
});

test('waits for delayed profile, dialog, and follow confirmation', async t => {
  const delayed = html(
    `<script>setTimeout(() => { const header=document.createElement('header'); header.innerHTML='<h1>alice</h1><a href="#">2 followers</a><button>Follow</button>'; document.body.append(header); header.querySelector('button').onclick=function(){setTimeout(()=>this.textContent='Following',200)}; header.querySelector('a').onclick=function(e){e.preventDefault();setTimeout(()=>{const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<a href="/bob/">bob</a>';document.body.append(dialog)},200)}; }, 200)</script>`
  );
  const {client} = await setup(t, {'/alice/': delayed});
  assert.deepEqual(await client.follow('alice'), {status: 'following', userId: null});
  const rows = await client.collectCandidates({type: 'followers', account: 'alice'}, {limit: 1});
  assert.deepEqual(
    rows.map(r => r.username),
    ['bob']
  );
});

test('a warning appearing during a wait stops the action', async t => {
  const delayed = html(`<script>setTimeout(()=>{document.body.insertAdjacentHTML('beforeend','<div role="alert">Try again later</div>')},100)</script>`);
  const {client} = await setup(t, {'/alice/': delayed});
  await assert.rejects(client.follow('alice'), e => e.code === 'rate_limited');
});

test('login polling can distinguish missing account from a different account', async t => {
  const {client, page} = await setup(t);
  await page.locator('nav').evaluate(node => node.remove());
  await assert.rejects(client.assertAccount({allowLogin: true}), e => e.code === 'account_unverified');
  await page.locator('body').evaluate(node => node.insertAdjacentHTML('afterbegin', '<div><a href="/other/" aria-label="Profile">Profile</a></div>'));
  await assert.rejects(client.assertAccount({allowLogin: true}), e => e.code === 'account_mismatch');
});

test('warning dialogs with a help link are detected without scanning user-list biographies', async t => {
  const {client, page} = await setup(t);
  await page
    .locator('body')
    .evaluate(body =>
      body.insertAdjacentHTML('beforeend', '<div role="dialog"><a href="/alice/">alice</a><a href="/bob/">bob</a><p>Try again later</p></div>')
    );
  await client.guard();
  await page.getByRole('dialog').evaluate(node => node.remove());
  await page
    .locator('body')
    .evaluate(body =>
      body.insertAdjacentHTML('beforeend', '<div role="dialog"><h2>Try again later</h2><a href="https://help.instagram.com/">Learn more</a></div>')
    );
  await assert.rejects(client.guard(), e => e.code === 'rate_limited');
});

test('mutation gate can stop follow and unfollow immediately before the click', async t => {
  const {client, page} = await setup(t, {'/alice/': profile('alice'), '/carol/': profile('carol', 'Following')});
  client.beforeMutation = () => {
    throw new Error('paused');
  };
  await assert.rejects(client.follow('alice'), /paused/);
  assert.equal(await page.locator('#relation').innerText(), 'Follow');
  await assert.rejects(client.unfollow('carol', {expectedUserId: '103'}), /paused/);
  assert.equal(await page.locator('#relation').innerText(), 'Following');
  assert.equal(await page.getByRole('dialog').isVisible(), true);
});

test('manual login may handle a two-factor page but growth cannot', async t => {
  const {client, page} = await setup(t, {'/accounts/login/two_factor/': html('<main><h1>Enter security code</h1></main>')});
  await page.goto(origin + '/accounts/login/two_factor/');
  await client.guard({allowLogin: true});
  await assert.rejects(client.guard(), e => e.code === 'challenge');
});

test('stale no-results and unrelated owner responses never prove non-reciprocity', async t => {
  const stale = profile('akalmesin').replace('/friendships/100/followers/', '/friendships/999/followers/');
  const {client, page} = await setup(t, {'/akalmesin/': stale, '/carol/': profile('carol', 'Following')});
  await page.route('**/api/v1/friendships/999/followers/**', route =>
    route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({users: [], has_more: false})})
  );
  assert.equal((await client.inspect('carol')).followsBack, null);
  await assert.rejects(client.unfollow('carol', {expectedUserId: '103'}), e => e.code === 'ambiguous_ui');
});

test('missing or recycled profile identity prevents unfollow', async t => {
  const {client} = await setup(t, {'/carol/': profile('carol', 'Following')});
  await assert.rejects(client.unfollow('carol'), e => e.code === 'identity_unverified');
  await assert.rejects(client.unfollow('carol', {expectedUserId: '777'}), e => e.code === 'identity_mismatch');
});

test('profile metadata is current-visit scoped and conflicting IDs are not accepted', async t => {
  const conflicting = profile('alice').replace('</body>', '<script type="application/json">{"username":"alice","pk":"987"}</script></body>');
  const {client} = await setup(t, {'/alice/': conflicting, '/bob/': profile('bob', 'Following', 'Follows you')});
  assert.equal((await client.inspect('bob')).userId, '102');
  assert.equal((await client.inspect('alice')).userId, null);
});

test('identity is rechecked after mutation preflight and before dispatch', async t => {
  const {client, page} = await setup(t, {'/alice/': profile('alice')});
  const check = client.assertAccount.bind(client);
  let count = 0;
  client.assertAccount = async (...args) => {
    if (++count === 2) await page.locator('nav a').evaluate(node => (node.href = '/other/'));
    return check(...args);
  };
  await assert.rejects(client.follow('alice'), e => e.code === 'account_mismatch');
  assert.equal(await page.locator('#relation').innerText(), 'Follow');
});

test('visible Instagram limit warnings stop activity', async t => {
  const {client, page} = await setup(t);
  await page
    .locator('body')
    .evaluate(node =>
      node.insertAdjacentHTML(
        'beforeend',
        '<div role="dialog"><h2>We limit how often you can do certain things on Instagram, like following people.</h2><a href="https://help.instagram.com/">Learn More</a></div>'
      )
    );
  await assert.rejects(client.guard(), e => e.code === 'rate_limited');
});

test('an incomplete or contradictory followers search response cannot establish absence', async t => {
  const {client, page} = await setup(t, {'/carol/': profile('carol', 'Following')});
  await page.route('**/api/v1/friendships/100/followers/**', route =>
    route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({users: [], has_more: false, more_available: true})})
  );
  assert.equal((await client.inspect('carol')).followsBack, null);
});

test('a failed status payload cannot establish non-reciprocity', async t => {
  const {client, page} = await setup(t, {'/carol/': profile('carol', 'Following')});
  await page.route('**/api/v1/friendships/100/followers/**', route =>
    route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({status: 'fail', users: [], has_more: false})})
  );
  assert.equal((await client.inspect('carol')).followsBack, null);
});

test('a previously excluded stable identity is skipped even under a new username', async t => {
  const renamed = profile('newname').replace('"id":"999"', '"id":"103"');
  const {client, page} = await setup(t, {'/newname/': renamed});
  const calls = [];
  client.shouldSkipIdentity = (userId, username) => {
    calls.push([userId, username]);
    return userId === '103';
  };
  assert.deepEqual(await client.follow('newname'), {status: 'skipped', userId: '103'});
  assert.deepEqual(calls, [['103', 'newname']]);
  assert.equal(await page.locator('#relation').innerText(), 'Follow');
  client.shouldSkipIdentity = null;
  assert.deepEqual(await client.follow('newname'), {status: 'following', userId: '103'});
});

test('collapsed sidebar image identifies the account without confusing feed profile pictures', async t => {
  const collapsed = `<div id="sidebar"><a href="/">Home</a><a href="/explore/">Search</a><a href="/reels/">Reels</a><a href="/direct/inbox/">Messages</a><a href="/akalmesin/"><img alt="akalmesin's profile picture"></a></div><main><a href="/akalmesin/"><img alt="akalmesin's profile picture"></a></main><aside><a href="/someone/"><img alt="someone's profile picture"></a></aside>`;
  const {client, page} = await setup(t);
  await page.locator('body').evaluate((node, content) => {
    node.innerHTML = content;
  }, collapsed);
  assert.equal(await client.assertAccount(), true);
  await page
    .locator('#sidebar a')
    .last()
    .evaluate(node => {
      node.href = '/other/';
      node.querySelector('img').alt = "other's profile picture";
    });
  await assert.rejects(client.assertAccount(), e => e.code === 'account_mismatch');
  await page
    .locator('#sidebar a')
    .last()
    .evaluate(node => {
      node.href = '/akalmesin/';
      node.querySelector('img').alt = "other's profile picture";
    });
  await assert.rejects(client.assertAccount(), e => e.code === 'account_unverified');
});

test('candidate collection waits for a delayed initial follower list', async t => {
  const delayed = html(
    `<header><h1>alice</h1><a href="#" onclick="document.querySelector('[role=dialog]').hidden=false;setTimeout(()=>document.querySelector('[role=dialog]').innerHTML='<a href=/bob/>bob</a>',2000);return false">Followers</a></header><div role="dialog" hidden></div>`
  );
  const {client} = await setup(t, {'/alice/': delayed});
  const rows = await client.collectCandidates({type: 'followers', account: 'alice'}, {limit: 1});
  assert.deepEqual(
    rows.map(r => r.username),
    ['bob']
  );
});

test('candidate collection distinguishes explicit empty sources from unverified loading', async t => {
  const empty = html(
    `<header><h1>alice</h1><a href="#" onclick="document.querySelector('[role=dialog]').hidden=false;return false">Followers</a></header><div role="dialog" hidden><p>No followers yet</p></div>`
  );
  const unknown = empty.replace('<p>No followers yet</p>', '<p>Loading...</p>');
  const {client} = await setup(t, {'/alice/': empty, '/bob/': unknown.replace('<h1>alice</h1>', '<h1>bob</h1>')});
  assert.deepEqual(await client.collectCandidates({type: 'followers', account: 'alice'}), []);
  await assert.rejects(client.collectCandidates({type: 'followers', account: 'bob'}), e => e.code === 'source_unverified');
});

test('candidate collection waits after scrolling for additional visible rows', async t => {
  const delayed = html(
    `<header><h1>alice</h1><a href="#" onclick="document.querySelector('[role=dialog]').hidden=false;return false">Followers</a></header><div role="dialog" hidden><div style="height:50px;overflow:auto" onscroll="if(!this.dataset.done){this.dataset.done='1';setTimeout(()=>this.insertAdjacentHTML('beforeend','<a href=/carol/>carol</a>'),1000)}"><a href="/bob/">bob</a><div style="height:400px"></div></div></div>`
  );
  const {client} = await setup(t, {'/alice/': delayed});
  const rows = await client.collectCandidates({type: 'followers', account: 'alice'}, {limit: 2});
  assert.deepEqual(
    rows.map(r => r.username),
    ['bob', 'carol']
  );
});

test('unrelated large bootstrap JSON cannot exhaust target profile identity traversal', async t => {
  const unrelated = JSON.stringify(Array.from({length: 12000}, (_, i) => ({other: i})));
  const target = profile('alice', 'Following', 'Follows you').replace(
    '<script type="application/json">',
    `<script type="application/json">${unrelated}</script><script type="application/json">`
  );
  const {client} = await setup(t, {'/alice/': target});
  assert.equal((await client.inspect('alice')).userId, '101');
});

test('profile identity waits briefly for delayed bootstrap metadata', async t => {
  const delayed = html(
    `<header><h1>alice</h1><button>Following</button><span>Follows you</span></header><script>setTimeout(()=>{const data=document.createElement('script');data.type='application/json';data.textContent=JSON.stringify({user:{username:'alice',id:'101'}});document.body.append(data)},600)</script>`
  );
  const {client} = await setup(t, {'/alice/': delayed});
  assert.equal((await client.inspect('alice')).userId, '101');
});

test('route-bound profile_id metadata requires matching canonical and rejects conflicts', async t => {
  const bootstrap = (username, id, canonical = username, extra = '') =>
    profile(username).replace(/<script type="application\/json">.*?<\/script>/, '') +
    `<meta property="og:url" content="${origin}/${canonical}/"><script type="application/json">${JSON.stringify({initialRouteInfo: {route: {params: {username}}}, props: {profile_id: id}})}</script>${extra}`;
  const {client, page} = await setup(t, {
    '/alice/': bootstrap('alice', '101'),
    '/bob/': bootstrap('bob', '102', 'other'),
    '/carol/': bootstrap('carol', '103', 'carol', '<script type="application/json">{"props":{"profile_id":"999"}}</script>')
  });
  await client.openProfile('alice');
  assert.equal(await client.profileUserId('alice'), '101');
  await client.openProfile('bob');
  assert.equal(await client.profileUserId('bob'), null);
  await client.openProfile('carol');
  assert.equal(await client.profileUserId('carol'), null);
  await page.goto(origin + '/alice/');
  await page.locator('script').evaluateAll(nodes => nodes.forEach(n => n.remove()));
  assert.equal(await client.profileUserId('alice'), null);
});

test('a completed exact followers query recognizes the live no-results punctuation', async t => {
  const own = profile('akalmesin').replace('No results found</p>', 'No results found.</p>');
  const {client} = await setup(t, {'/akalmesin/': own, '/carol/': profile('carol', 'Following')});
  assert.equal((await client.inspect('carol')).followsBack, false);
});

test('follow-back absence waits for DOM rendering after the response completes', async t => {
  const own = profile('akalmesin').replace(
    searchInput,
    `<input aria-label="Search" oninput="fetch('/api/v1/friendships/100/followers/?query='+encodeURIComponent(this.value)).then(()=>setTimeout(()=>{document.querySelectorAll('#followers a').forEach(a=>a.hidden=true);document.querySelector('#none').hidden=false},200))">`
  );
  const {client} = await setup(t, {'/akalmesin/': own, '/carol/': profile('carol', 'Following')});
  assert.equal((await client.inspect('carol')).followsBack, false);
});

test('relationship confirmation ignores SVG titles and hidden label suffixes', async t => {
  const withIcons = profile('alice', 'Following').replace(
    '>Following</button>',
    '>Following<svg aria-label="Down chevron icon"><title>Down chevron icon</title></svg><span hidden>menu</span></button>'
  );
  const {client} = await setup(t, {'/alice/': withIcons});
  const header = await client.openProfile('alice');
  assert.equal(await client.relationship(header), 'following');
  const control = await client.relationshipControl(header, 'following');
  assert.equal((await control.innerText()).trim(), 'Following');
  assert.deepEqual(await client.follow('alice'), {status: 'skipped', userId: '101'});
});

test('follow confirms stale controls through a fresh profile read without clicking twice', async t => {
  const {client, page} = await setup(t);
  let followed = false,
    clicks = 0,
    visits = 0;
  await page.route('**/fixture-follow', async route => {
    clicks++;
    followed = true;
    await route.fulfill({status: 200, body: 'ok'});
  });
  await page.route('**/alice/', async route => {
    visits++;
    let body = profile('alice', followed ? 'Following' : 'Follow');
    if (!followed) body = body.replace(/onclick="if\(this.textContent==='Following'\).*?"/, "onclick=\"fetch('/fixture-follow',{method:'POST'})\"");
    await route.fulfill({status: 200, contentType: 'text/html', body});
  });
  assert.deepEqual(await client.follow('alice'), {status: 'following', userId: '101'});
  assert.equal(clicks, 1);
  assert.equal(visits, 2);
});

test('recovery: a disconnected profile load is attested before any Follow dispatch', async t => {
  const {client, page} = await setup(t);
  let clicks = 0;
  client.beforeMutation = () => clicks++;
  await page.route('**/alice/', route => route.abort('internetdisconnected'));
  await assert.rejects(client.follow('alice'), error => error instanceof GrowthReadInterrupted);
  assert.equal(clicks, 0);
});

test('recovery: a transport failure after Follow dispatch never gains permission to retry', async t => {
  const {client} = await setup(t);
  let clicks = 0,
    reads = 0;
  client.beforeMutation = () => clicks++;
  const original = client.waitRelationship.bind(client);
  client.waitRelationship = async (...args) => {
    if (++reads === 2) throw new Error('net::ERR_NETWORK_CHANGED');
    return original(...args);
  };
  await assert.rejects(client.follow('alice'), error => !(error instanceof GrowthReadInterrupted) && /ERR_NETWORK_CHANGED/.test(error.message));
  assert.equal(clicks, 1);
});

test('recovery: Unfollow preflight can reconnect without submitting a relationship change', async t => {
  const {client} = await setup(t);
  let clicks = 0;
  client.beforeMutation = () => clicks++;
  client.inspect = async () => {
    throw new Error('page.goto: net::ERR_CONNECTION_RESET');
  };
  await assert.rejects(client.unfollow('carol', {expectedUserId: '103'}), error => error instanceof GrowthReadInterrupted);
  assert.equal(clicks, 0);
});

test('recovery: a restriction warning wins over a temporary connection error', async t => {
  const {client, page} = await setup(t);
  client.openProfile = async () => {
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div role="alert">Try again later</div>'));
    throw new Error('net::ERR_CONNECTION_CLOSED');
  };
  await assert.rejects(client.follow('alice'), error => error.code === 'rate_limited' && !(error instanceof GrowthReadInterrupted));
});

test('recovery: a closed browser before a read can be replaced', async t => {
  const {client, page} = await setup(t);
  await page.close();
  await assert.rejects(
    client.withReadRecovery(() => client.assertAccount()),
    error => error instanceof GrowthReadInterrupted
  );
});
