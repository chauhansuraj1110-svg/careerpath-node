/**
 * CareerPath - Express application (routes + request handling).
 *
 * Structure of this file:
 *   1. Setup & small helpers
 *   2. Public pages        (home, about, contact, feedback)
 *   3. Login / logout / forgot password
 *   4. Admin area          (dashboard, master data, reports)
 *   5. Job seeker area     (registration, profile, job search, applications)
 *   6. Recruiter area      (registration, jobs, candidate search, messages)
 *   7. Error handlers & server start
 *
 * Data lives in MySQL (see db.js). HTML is produced by helpers in ui.js and styled with Tailwind.
 * Access control: `need('<role>')` guards every private route using the session role.
 */
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const path = require('node:path');
const { init, q, hash, verify, cfg } = require('./db');
const { esc, layout, form, table, kv, delBtn, LINK, homePage } = require('./ui');

// ---------- 1. Setup & helpers ----------
const app = express();
// Parse HTML form posts, serve /public (compiled CSS + images) and keep a cookie-based login session.
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), resave: false, saveUninitialized: false, cookie: { sameSite: 'lax', httpOnly: true } }));

// Render a full HTML page. `opts.raw` skips the content card (used by the landing page).
const page = (req, res, title, body, opts) => res.send(layout(req, title, body, opts));
// Redirect, optionally carrying a one-off message (?msg=...) that the layout shows as a banner.
const go = (res, url, msg) => res.redirect(msg ? `${url}${url.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : url);
// Today's date as YYYY-MM-DD (dates are stored as plain text in this format).
const today = () => new Date().toISOString().slice(0, 10);
// Express 4 ignores rejected promises, so wrap every handler passed to app.get/app.post:
// an error in an async handler is forwarded to the error handler at the bottom of this file.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
for (const m of ['get', 'post']) { const orig = app[m].bind(app); app[m] = (p, ...h) => (h.length ? orig(p, ...h.map(wrap)) : orig(p)); }
// Route guard: only continue if the logged-in user has this role, otherwise send them to that role's login page.
const need = (role) => (req, res, next) => req.session.role === role ? next() : go(res, role === 'admin' ? '/login?type=admin' : `/login?type=${role}`, 'Please log in first');
// Copy the listed fields from a form body, trimmed (missing fields become empty strings).
const pick = (body, names) => Object.fromEntries(names.map((n) => [n, (body[n] ?? '').toString().trim()]));
// Tiny query builders: INSERT / UPDATE from an object of column -> value.
// Only ever pass trusted column names (never user input); values are bound as parameters.
async function insert(table, data) { const k = Object.keys(data); return await q.run(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, ...Object.values(data)); }
async function update(table, data, where, ...wp) { const k = Object.keys(data); return await q.run(`UPDATE ${table} SET ${k.map((x) => x + '=?').join(',')} WHERE ${where}`, ...Object.values(data), ...wp); }
// Values of one column of a master table, used to fill <select> drop-downs.
const names = async (t, col = 'name') => (await q.all(`SELECT ${col} v FROM ${t} ORDER BY ${col}`)).map((r) => r.v);
// Security questions offered at registration / password reset.
const HINTS = ["What is your pet's name?", 'What is your mother\'s maiden name?', 'What was your first school?', 'What is your favourite colour?'];

// ---------- 2. Public pages ----------
// Landing page: live counts + the latest open jobs.
app.get('/', async (req, res) => {
  const t = today();
  const stats = await q.get(`SELECT (SELECT COUNT(*) FROM jobs WHERE closing_date IS NULL OR closing_date='' OR closing_date>=?) jobs, (SELECT COUNT(*) FROM recruiters) recruiters, (SELECT COUNT(*) FROM jobseekers) seekers`, t);
  const jobs = await q.all(`SELECT j.category, j.role, j.location, j.closing_date, j.skills_required, r.org_name FROM jobs j JOIN recruiters r ON r.username=j.username WHERE j.closing_date IS NULL OR j.closing_date='' OR j.closing_date>=? ORDER BY j.sno DESC LIMIT 6`, t);
  page(req, res, '', homePage({ stats, jobs }), { raw: true });
});
// Small info card used on the About page.
const card = (t, items) => `<div class="rounded-lg border border-slate-200 p-4"><h3 class="mb-2 font-semibold text-brand">${t}</h3><ul class="list-disc space-y-1 pl-5 text-slate-600">${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>`;
app.get('/about', async (req, res) => page(req, res, 'About Us', `
<p class="mb-5 text-base leading-relaxed text-slate-600"><strong class="text-slate-800">CareerPath</strong> is an online job portal that brings job seekers and recruiters together in one place. Candidates build a profile and resume once, and employers can post openings, search for talent and respond to applications, all through a simple web interface.</p>
<div class="grid gap-4 md:grid-cols-3">
${card('For Job Seekers', ['Register and keep your profile and resume online', 'Search jobs by role, location or keyword', 'Apply with one click and track your responses'])}
${card('For Recruiters', ['Register your organisation', 'Post, edit and close job openings', 'Search candidates and review applicants'])}
${card('Administration', ['Manage countries, states, cities and skills', 'Review registered users and applications', 'Read feedback sent by visitors'])}
</div>
<h3 class="mb-2 mt-6 text-lg font-semibold text-brand">How it works</h3>
<ol class="list-decimal space-y-1 pl-5 text-slate-600"><li>Register as a job seeker or a recruiter.</li><li>Recruiters post jobs; job seekers search and apply.</li><li>Recruiters review applicants and get in touch.</li></ol>
<p class="mt-6 text-slate-600">Questions? Visit <a href="/contact" class="${LINK}">Contact Us</a> or send us your <a href="/feedback" class="${LINK}">feedback</a>.</p>`));
// Contact form fields (messages are stored in the feedback table).
const CF = [{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'contact', label: 'Contact No' }, { name: 'subject', label: 'Subject' }, { name: 'message', label: 'Message', type: 'textarea', required: true }];
app.get('/contact', async (req, res) => page(req, res, 'Contact Us', `<p class="mb-4 text-sm font-semibold text-red-600">(Please fill the * values)</p>
<div class="grid gap-6 md:grid-cols-[14rem_1fr]"><div class="text-center text-sm font-semibold text-slate-600"><img src="/images/contact_green_2.jpg" width="137" height="135" class="mx-auto mb-3 rounded-lg"><p>25 RajaRam #07-28</p></div><div>${form(CF, {}, '/contact', 'Submit')}</div></div>`));
app.post('/contact', async (req, res) => { const b = pick(req.body, ['name', 'email', 'contact', 'subject', 'message']); await insert('feedback', { name: b.name, email: b.email, message: `[${b.subject}] (${b.contact}) ${b.message}`, created: today() }); go(res, '/contact', 'Thank you. We will contact you soon.'); });
// Feedback form (stored in the feedback table, shown to the admin).
app.get('/feedback', async (req, res) => page(req, res, '', `<form method="post" action="/feedback" class="mx-auto my-4 w-full max-w-md space-y-3 rounded-xl bg-[url(/images/img4.jpg)] bg-cover bg-center p-6 text-sm font-semibold text-white shadow">
<h3 class="text-center text-2xl font-bold text-red-400">FeedBack</h3>
<label class="block">User Name<input name="name" class="input mt-1 text-slate-800" required></label>
<label class="block">Email Id<input name="email" type="email" maxlength="50" class="input mt-1 text-slate-800" required></label>
<label class="block">Feedback<textarea name="message" maxlength="200" rows="3" class="input mt-1 text-slate-800" required></textarea></label>
<div class="flex gap-2 pt-1"><button>Submit</button><button type="reset">Clear</button></div></form>`));
app.post('/feedback', async (req, res) => { await insert('feedback', { ...pick(req.body, ['name', 'email', 'message']), created: today() }); go(res, '/feedback', 'Thank you for your feedback!'); });

// ---------- 3. Login / logout / forgot password ----------
// Valid login types and the image/title shown on each login form.
const TYPES = { jobseeker: 'Job Seeker', recruiter: 'Recruiter', admin: 'Admin' };
const LOOK = { jobseeker: { title: 'JobSeeker Login', img: 'JobSeekerLogin.jpg', h: 172 }, recruiter: { title: 'Recruiter Login', img: 'RecruiterLogin1.jpg', h: 163 }, admin: { title: 'Admin Login' } };
// GET /login           -> chooser (job seeker / recruiter)
// GET /login?type=x    -> login form for that role
app.get('/login', async (req, res) => {
  const t = TYPES[req.query.type] ? req.query.type : null;
  if (!t) return page(req, res, 'Login', `<div class="grid gap-6 sm:grid-cols-2">${[['jobseeker', 'THREE.JPG', 'Job Seeker login'], ['recruiter', 'ONE.JPG', 'Recruiter Login']].map(([k, i, l]) => `<a href="/login?type=${k}" class="group flex flex-col items-center gap-4 rounded-xl border border-slate-200 p-8 no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><img src="/images/${i}"><span class="w-full rounded-md bg-red-600 px-4 py-2 text-center font-bold !text-white group-hover:bg-red-700">${l}</span></a>`).join('')}</div>`);
  const L = LOOK[t];
  const field = (lab, n, type) => `<label class="block"><span class="text-sm font-semibold text-brand">${lab} <span class="text-red-600">*</span></span><input name="${n}" type="${type}" required class="input mt-1 !max-w-none"></label>`;
  page(req, res, '', `<form method="post" action="/login?type=${t}" class="mx-auto my-4 flex max-w-xl flex-col items-center gap-6 rounded-xl border border-slate-200 p-6 shadow-sm sm:flex-row">
    <div class="w-full flex-1 space-y-4"><div class="text-center"><h3 class="text-xl font-semibold text-brand">${L.title}</h3><p class="text-sm font-semibold text-red-600">* Fields are mandatory</p></div>
    ${field('User Name', 'username', 'text')}${field('Password', 'password', 'password')}
    <div class="flex flex-wrap items-center justify-center gap-2"><button>Login</button><button type="reset">Clear</button></div>
    ${t === 'admin' ? '' : `<div class="flex flex-wrap justify-center gap-4 text-sm"><a href="/${t}/forgot" class="${LINK}">Forgot Password?</a><a href="/${t}/register" class="${LINK}">New User? Register</a></div>`}</div>
    ${L.img ? `<img src="/images/${L.img}" class="hidden rounded-lg border border-slate-200 sm:block" style="height:${L.h}px">` : ''}</form>`);
});
// Check the password hash, then start a fresh session (regenerate prevents session fixation).
app.post('/login', async (req, res) => {
  const t = req.query.type; const { username = '', password = '' } = req.body;
  const src = { jobseeker: ['jobseekers', 'user_id'], recruiter: ['recruiters', 'username'], admin: ['admins', 'username'] }[t];
  if (!src) return go(res, '/login');
  const row = await q.get(`SELECT * FROM ${src[0]} WHERE ${src[1]}=?`, username.trim());
  if (!row || !verify(password, row.password)) return go(res, `/login?type=${t}`, 'Invalid user ID or password');
  req.session.regenerate(() => { req.session.role = t; req.session.user = username.trim(); go(res, t === 'admin' ? '/admin' : `/${t}`); });
});
app.get('/logout', async (req, res) => req.session.destroy(() => res.redirect('/')));

// Forgot password (job seeker + recruiter): verify the hint answer, then let the user set a new password.
for (const [role, table_, idcol] of [['jobseeker', 'jobseekers', 'user_id'], ['recruiter', 'recruiters', 'username']]) {
  const F = [{ name: 'id', label: 'User ID', required: true }, { name: 'hint_question', label: 'Hint question', type: 'select', options: HINTS, required: true },
    { name: 'answer', label: 'Answer', required: true }, { name: 'password', label: 'New password', type: 'password', required: true }];
  app.get(`/${role}/forgot`, async (req, res) => page(req, res, 'Forgot Password', form(F, {}, `/${role}/forgot`, 'Reset password')));
  app.post(`/${role}/forgot`, async (req, res) => {
    const b = req.body; const r = await q.get(`SELECT * FROM ${table_} WHERE ${idcol}=? AND hint_question=? AND lower(answer)=lower(?)`, (b.id || '').trim(), b.hint_question, (b.answer || '').trim());
    if (!r) return go(res, `/${role}/forgot`, 'Details do not match our records');
    await q.run(`UPDATE ${table_} SET password=? WHERE ${idcol}=?`, hash(b.password), r[idcol]);
    go(res, `/login?type=${role}`, 'Password changed. Please log in.');
  });
}

// ---------- 4. Admin area ----------
// Master-data tables the admin can manage. One generic CRUD screen (below) serves all of them:
//   t = table, fields = form fields, list = optional custom list query, cols = extra list columns.
const MASTERS = {
  countries: { title: 'Country', t: 'countries', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description' }] },
  states: { title: 'State', t: 'states', fields: [{ name: 'country_id', label: 'Country', type: 'select', options: async () => (await q.all('SELECT id,name FROM countries ORDER BY name')).map((r) => [r.id, r.name]), required: true }, { name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description' }],
    list: 'SELECT s.id,s.name,s.description,c.name parent FROM states s JOIN countries c ON c.id=s.country_id ORDER BY c.name,s.name', cols: [['parent', 'Country']] },
  cities: { title: 'City', t: 'cities', fields: [{ name: 'state_id', label: 'State', type: 'select', options: async () => (await q.all('SELECT s.id,CONCAT(s.name,\' (\',c.name,\')\') n FROM states s JOIN countries c ON c.id=s.country_id ORDER BY n')).map((r) => [r.id, r.n]), required: true }, { name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description' }],
    list: 'SELECT ci.id,ci.name,ci.description,s.name parent FROM cities ci JOIN states s ON s.id=ci.state_id ORDER BY s.name,ci.name', cols: [['parent', 'State']] },
  experiences: { title: 'Experience', t: 'experiences', fields: [{ name: 'exp_type', label: 'Experience type', required: true }, { name: 'duration', label: 'Duration' }], plain: [['exp_type', 'Type'], ['duration', 'Duration']] },
  'functional-areas': { title: 'Functional Area', t: 'functional_areas', fields: [{ name: 'name', label: 'Functional area', required: true }, { name: 'description', label: 'Description' }] },
  'job-types': { title: 'Job Type', t: 'job_types', fields: [{ name: 'name', label: 'Job type', required: true }, { name: 'description', label: 'Description' }] },
  qualifications: { title: 'Qualification', t: 'qualifications', fields: [{ name: 'name', label: 'Qualification', required: true }, { name: 'level', label: 'Level' }, { name: 'description', label: 'Description' }] },
  skills: { title: 'Skill', t: 'skills', fields: [{ name: 'name', label: 'Skill type', required: true }, { name: 'description', label: 'Description' }] },
};
// Resolve drop-down options (functions) of a master form's fields.
const mFields = async (m) => Promise.all(m.fields.map(async (f) => (typeof f.options === 'function' ? { ...f, options: await f.options() } : f)));
const mNames = (m) => m.fields.map((f) => f.name);
// Admin dashboard: summary counts, quick links and recent activity.
app.get('/admin', need('admin'), async (req, res) => {
  const n = await q.get(`SELECT (SELECT COUNT(*) FROM jobseekers) seekers, (SELECT COUNT(*) FROM recruiters) recruiters,
    (SELECT COUNT(*) FROM jobs WHERE closing_date IS NULL OR closing_date='' OR closing_date>=?) jobs, (SELECT COUNT(*) FROM applications) applications,
    (SELECT COUNT(*) FROM feedback) feedback, (SELECT COUNT(*) FROM jobseekers WHERE reg_date>=?) newSeekers`, today(), new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const stats = [['Job Seekers', n.seekers, '/admin/jobseekers', `${n.newSeekers} new this week`], ['Recruiters', n.recruiters, '/admin/recruiters', 'registered organisations'], ['Open Jobs', n.jobs, '/admin/offered', 'currently accepting applications'],
    ['Applications', n.applications, '/admin/applied', 'sent to recruiters'], ['Feedback', n.feedback, '/admin/feedback', 'messages from visitors']];
  const recentSeekers = await q.all('SELECT user_id, first_name, last_name, email, reg_date FROM jobseekers ORDER BY reg_date DESC, user_id LIMIT 5');
  const recentApps = await q.all('SELECT a.applied_date, a.user_id, a.job_id, r.org_name FROM applications a LEFT JOIN recruiters r ON r.username=a.recruiter ORDER BY a.id DESC LIMIT 5');
  const recentFb = await q.all('SELECT name, message, created FROM feedback ORDER BY id DESC LIMIT 3');
  const section = (t, href, inner) => `<section class="mt-6"><div class="mb-1 flex items-center justify-between"><h3 class="text-base font-semibold text-slate-700">${t}</h3><a href="${href}" class="${LINK} text-sm">View all &rarr;</a></div>${inner}</section>`;
  const quick = [['/admin/m/countries', 'Countries'], ['/admin/m/states', 'States'], ['/admin/m/cities', 'Cities'], ['/admin/m/skills', 'Skills'], ['/admin/m/qualifications', 'Qualifications'], ['/admin/m/job-types', 'Job Types'], ['/admin/m/functional-areas', 'Functional Areas'], ['/admin/m/experiences', 'Experience']];
  page(req, res, 'Administration Dashboard', `<p class="-mt-2 mb-5 text-slate-500">Welcome back, <strong class="text-slate-700">${esc(req.session.user)}</strong>. Here is what is happening on CareerPath today (${today()}).</p>
<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${stats.map(([l, v, h, sub]) => `<a href="${h}" class="group rounded-xl border border-slate-200 bg-white p-4 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md"><div class="text-sm font-semibold text-slate-500">${l}</div><div class="mt-1 text-3xl font-bold text-brand">${v}</div><div class="mt-1 text-xs text-slate-500">${sub}</div></a>`).join('')}</div>
<section class="mt-6"><h3 class="mb-2 text-base font-semibold text-slate-700">Manage master data</h3><div class="flex flex-wrap gap-2">${quick.map(([h, t]) => `<a href="${h}" class="rounded-full border border-brand/30 bg-brand/5 px-3.5 py-1.5 text-sm font-semibold text-brand no-underline transition hover:bg-brand hover:text-white">${t}</a>`).join('')}</div></section>
${section('Recent job seekers', '/admin/jobseekers', table(recentSeekers, [['user_id', 'User ID'], ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['reg_date', 'Registered']]))}
${section('Recent applications', '/admin/applied', table(recentApps, [['applied_date', 'Applied'], ['user_id', 'Job Seeker'], ['job_id', 'Job ID'], ['org_name', 'Organisation']]))}
${section('Latest feedback', '/admin/feedback', recentFb.length ? `<div class="mt-2 space-y-2">${recentFb.map((f) => `<blockquote class="rounded-lg border-l-4 border-brand bg-slate-50 px-4 py-2.5"><p class="text-slate-700">${esc(f.message)}</p><footer class="mt-1 text-xs text-slate-500">${esc(f.name)} &middot; ${esc(f.created)}</footer></blockquote>`).join('')}</div>` : '<p class="my-3 italic text-slate-500">No feedback yet.</p>')}`);
});
// Generic master-data CRUD: /admin/m/:key (list + add), /:id (edit), /:id/delete.
// getM looks up the master config for :key (404 for unknown keys).
const getM = (req, res, next) => { req.m = MASTERS[req.params.key]; req.m ? next() : res.status(404).send('Not found'); };
app.get('/admin/m/:key', need('admin'), getM, async (req, res) => {
  const m = req.m; const rows = await q.all(m.list || `SELECT * FROM ${m.t} ORDER BY id`);
  const cols = m.plain || [['name', m.title], ...(m.cols || []), ...(m.fields.some((f) => f.name === 'level') ? [['level', 'Level']] : []), ['description', 'Description']];
  page(req, res, `Manage ${m.title}`, form((await mFields(m)), {}, `/admin/m/${req.params.key}`, 'Add') + table(rows, cols, (r) => `<a class="${LINK}" href="/admin/m/${req.params.key}/${r.id}">Edit</a>${delBtn(`/admin/m/${req.params.key}/${r.id}/delete`)}`));
});
app.post('/admin/m/:key', need('admin'), getM, async (req, res) => { await insert(req.m.t, pick(req.body, mNames(req.m))); go(res, `/admin/m/${req.params.key}`, 'Added'); });
app.get('/admin/m/:key/:id', need('admin'), getM, async (req, res) => {
  const row = await q.get(`SELECT * FROM ${req.m.t} WHERE id=?`, req.params.id); if (!row) return go(res, `/admin/m/${req.params.key}`, 'Not found');
  page(req, res, `Edit ${req.m.title}`, form((await mFields(req.m)), row, `/admin/m/${req.params.key}/${row.id}`, 'Update'));
});
app.post('/admin/m/:key/:id', need('admin'), getM, async (req, res) => { await update(req.m.t, pick(req.body, mNames(req.m)), 'id=?', req.params.id); go(res, `/admin/m/${req.params.key}`, 'Updated'); });
app.post('/admin/m/:key/:id/delete', need('admin'), getM, async (req, res) => { try { await q.run(`DELETE FROM ${req.m.t} WHERE id=?`, req.params.id); go(res, `/admin/m/${req.params.key}`, 'Deleted'); } catch (e) { go(res, `/admin/m/${req.params.key}`, 'Cannot delete: ' + e.message); } });

// Reports: registered job seekers / recruiters (with date filter) and delete.
const dateFilter = [{ name: 'from', label: 'From date', type: 'date' }, { name: 'to', label: 'To date', type: 'date' }];
for (const [route, tbl, id, cols] of [['jobseekers', 'jobseekers', 'user_id', [['user_id', 'User ID'], ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['reg_date', 'Registered']]],
  ['recruiters', 'recruiters', 'username', [['username', 'User name'], ['org_name', 'Organisation'], ['email1', 'Email'], ['reg_date', 'Registered']]]]) {
  app.get(`/admin/${route}`, need('admin'), async (req, res) => {
    const { from = '9999', to = '' } = req.query; const f = req.query.from || '0000-00-00', t = req.query.to || '9999-12-31';
    const rows = await q.all(`SELECT * FROM ${tbl} WHERE reg_date BETWEEN ? AND ? ORDER BY reg_date DESC`, f, t);
    page(req, res, route === 'jobseekers' ? 'Registered Job Seekers' : 'Registered Recruiters', `<form method="get" class="flex flex-wrap items-end gap-3">${dateFilter.map((d) => `<label class="text-sm font-semibold text-slate-600">${d.label}<input type="date" name="${d.name}" value="${esc(req.query[d.name] || '')}" class="input mt-1 block !w-auto"></label>`).join('')}<button>Filter</button></form>` +
      table(rows, cols, (r) => delBtn(`/admin/${route}/${encodeURIComponent(r[id])}/delete`)));
  });
  app.post(`/admin/${route}/:id/delete`, need('admin'), async (req, res) => { await q.run(`DELETE FROM ${tbl} WHERE ${id}=?`, req.params.id); go(res, `/admin/${route}`, 'Deleted'); });
}
// Reports: applications, jobs offered by recruiters, and visitor feedback.
app.get('/admin/applied', need('admin'), async (req, res) => page(req, res, 'Job Seeker Applied Jobs', table(await q.all('SELECT a.applied_date,a.user_id,s.first_name,a.job_id,r.org_name FROM applications a LEFT JOIN jobseekers s ON s.user_id=a.user_id LEFT JOIN recruiters r ON r.username=a.recruiter ORDER BY a.id DESC'), [['applied_date', 'Applied'], ['user_id', 'Job Seeker'], ['first_name', 'Name'], ['job_id', 'Job ID'], ['org_name', 'Organisation']])));
app.get('/admin/offered', need('admin'), async (req, res) => page(req, res, 'Recruiter Offered Jobs', table(await q.all('SELECT j.*, r.org_name FROM jobs j JOIN recruiters r ON r.username=j.username ORDER BY j.sno DESC'), [['org_name', 'Organisation'], ['job_id', 'Job ID'], ['role', 'Role'], ['location', 'Location'], ['opening_date', 'Opens'], ['closing_date', 'Closes']])));
app.get('/admin/feedback', need('admin'), async (req, res) => page(req, res, 'Feedback', table(await q.all('SELECT * FROM feedback ORDER BY id DESC'), [['created', 'Date'], ['name', 'Name'], ['email', 'Email'], ['message', 'Message']])));

// ---------- 5. Job seeker area ----------
// Checkbox field helper.
const yn = (n) => ({ name: n, type: 'checkbox' });
// Registration form = account fields + the full profile.
const JS_ACCOUNT = [{ heading: 'Account' }, { name: 'user_id', label: 'User ID', required: true }, { name: 'password', label: 'Password', type: 'password', required: true },
  { name: 'hint_question', label: 'Hint question', type: 'select', options: HINTS, required: true }, { name: 'answer', label: 'Answer', required: true }];
// Full job seeker profile as form fields (headings split it into sections). Async because the drop-downs come from the DB.
const JS_PROFILE = async () => { const skills = await names('skills'); return [
  { heading: 'Contact details' }, { name: 'first_name', label: 'First name', required: true }, { name: 'last_name', label: 'Last name' }, { name: 'dob', label: 'Date of birth', type: 'date' },
  { name: 'address', label: 'Address', type: 'textarea' }, { name: 'city', label: 'City' }, { name: 'state', label: 'State' }, { name: 'pin_code', label: 'Pin code' },
  { name: 'country', label: 'Country', type: 'select', options: (await names('countries')) }, { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'phone1', label: 'Phone 1' }, { name: 'phone2', label: 'Phone 2' }, { name: 'fax', label: 'Fax' },
  { heading: 'Background' }, { name: 'highest_degree', label: 'Highest degree', type: 'select', options: (await names('qualifications')) }, { name: 'specialisation', label: 'Specialisation' },
  { name: 'passing_year', label: 'Passing year' }, { name: 'percentage', label: 'Percentage' }, { name: 'university', label: 'University' },
  { name: 'bg_country', label: 'Country of study', type: 'select', options: (await names('countries')) }, { name: 'technical_exp', label: 'Experience', type: 'select', options: (await names('experiences', 'exp_type')) },
  { name: 'work_field', label: 'Work field', type: 'select', options: (await names('functional_areas')) },
  { heading: 'Job preferences' }, { name: 'job_title', label: 'Desired job title' }, { name: 'location1', label: 'Preferred location 1' }, { name: 'state1', label: 'State 1' }, { name: 'country1', label: 'Country 1' },
  { name: 'location2', label: 'Preferred location 2' }, { name: 'state2', label: 'State 2' }, { name: 'country2', label: 'Country 2' },
  { ...yn('will_relocate'), label: 'Will relocate' }, { ...yn('will_telecommute'), label: 'Will telecommute' }, { ...yn('will_travel'), label: 'Will travel' },
  { name: 'full_time_salary', label: 'Full-time salary expected' }, { name: 'hourly_salary', label: 'Hourly rate expected' },
  { name: 'emp_type1', label: 'Employment type 1', type: 'select', options: (await names('job_types')) }, { name: 'emp_type2', label: 'Employment type 2', type: 'select', options: (await names('job_types')) }, { name: 'emp_type3', label: 'Employment type 3', type: 'select', options: (await names('job_types')) },
  { heading: 'Technical skills' }, ...[1, 2, 3, 4].flatMap((i) => [{ name: `skill${i}`, label: `Skill ${i}`, type: 'select', options: skills }, { name: `skill${i}_year`, label: `Skill ${i} years` }, { name: `skill${i}_last`, label: `Skill ${i} last used` }]),
  { heading: 'Resume' }, { name: 'resume', label: 'Resume (paste text)', type: 'textarea' }]; };
// Column names of the profile form, and the values posted for them (checkboxes become 0/1).
const profileNames = async () => (await JS_PROFILE()).filter((f) => f.name).map((f) => f.name);
const profileData = async (b) => { const d = pick(b, await profileNames()); for (const k of ['will_relocate', 'will_telecommute', 'will_travel']) d[k] = b[k] ? 1 : 0; return d; };

app.get('/jobseeker/register', async (req, res) => page(req, res, 'Job Seeker Registration', form([...JS_ACCOUNT, ...(await JS_PROFILE())], {}, '/jobseeker/register', 'Register')));
app.post('/jobseeker/register', async (req, res) => {
  const a = pick(req.body, ['user_id', 'hint_question', 'answer']); if (!a.user_id || !req.body.password) return go(res, '/jobseeker/register', 'User ID and password are required');
  if (await q.get('SELECT 1 x FROM jobseekers WHERE user_id=?', a.user_id)) return go(res, '/jobseeker/register', 'That User ID is already taken');
  await insert('jobseekers', { ...a, password: hash(req.body.password), reg_date: today(), ...(await profileData(req.body)), resume_uploaded: today(), resume_modified: today() });
  go(res, '/login?type=jobseeker', 'Registered! Please log in.');
});
app.get('/jobseeker', need('jobseeker'), async (req, res) => page(req, res, '', '<div class="py-16 text-center text-2xl font-semibold text-brand">Welcome to your job seeker home</div>'));
// The profile is edited one section at a time: /jobseeker/profile/:section (key -> [form heading, page title]).
const SECTIONS = { contact: ['Contact details', 'Update Your Profile'], background: ['Background', 'Update Education Profile'], job: ['Job preferences', 'Update Job Profile'], skills: ['Technical skills', 'Update Technical Skill Profile'], resume: ['Resume', 'Update Resume'] };
// Fields of a single profile section.
async function sectionFields(key) { let on = false; const out = []; for (const f of await JS_PROFILE()) { if (f.heading) on = f.heading === SECTIONS[key][0]; else if (on) out.push(f); } return out; }
app.get('/jobseeker/profile', need('jobseeker'), async (req, res) => res.redirect('/jobseeker/profile/contact'));
const secOk = (req, res, next) => SECTIONS[req.params.section] ? next() : res.redirect('/jobseeker/profile/contact');
app.get('/jobseeker/profile/:section', need('jobseeker'), secOk, async (req, res) => page(req, res, SECTIONS[req.params.section][1], form((await sectionFields(req.params.section)), await q.get('SELECT * FROM jobseekers WHERE user_id=?', req.session.user), `/jobseeker/profile/${req.params.section}`, 'Update')));
app.post('/jobseeker/profile/:section', need('jobseeker'), secOk, async (req, res) => {
  const d = {}; for (const f of (await sectionFields(req.params.section))) d[f.name] = f.type === 'checkbox' ? (req.body[f.name] ? 1 : 0) : (req.body[f.name] ?? '').toString().trim();
  await update('jobseekers', { ...d, resume_modified: today() }, 'user_id=?', req.session.user); go(res, `/jobseeker/profile/${req.params.section}`, 'Profile updated');
});
app.get('/jobseeker/resume', need('jobseeker'), async (req, res) => {
  const s = await q.get('SELECT * FROM jobseekers WHERE user_id=?', req.session.user);
  const rows = (await JS_PROFILE()).map((f) => f.heading ? { heading: f.heading } : [f.label, f.type === 'checkbox' ? (s[f.name] ? 'Yes' : 'No') : s[f.name]]);
  page(req, res, 'View Resume', `${kv(rows)}<p class="text-slate-500">Resume uploaded: ${esc(s.resume_uploaded)} &nbsp;|&nbsp; Last modified: ${esc(s.resume_modified)}</p>`);
});
// Change password (job seeker + recruiter share this form).
const PW = [{ name: 'old', label: 'Current password', type: 'password', required: true }, { name: 'password', label: 'New password', type: 'password', required: true }, { name: 'hint_question', label: 'Hint question', type: 'select', options: HINTS }, { name: 'answer', label: 'Answer' }];
for (const [role, t, id] of [['jobseeker', 'jobseekers', 'user_id'], ['recruiter', 'recruiters', 'username']]) {
  app.get(`/${role}/password`, need(role), async (req, res) => page(req, res, 'Change Password', form(PW, {}, `/${role}/password`, 'Change')));
  app.post(`/${role}/password`, need(role), async (req, res) => {
    const r = await q.get(`SELECT * FROM ${t} WHERE ${id}=?`, req.session.user); if (!verify(req.body.old, r.password)) return go(res, `/${role}/password`, 'Current password is wrong');
    await q.run(`UPDATE ${t} SET password=?, hint_question=COALESCE(NULLIF(?,''),hint_question), answer=COALESCE(NULLIF(?,''),answer) WHERE ${id}=?`, hash(req.body.password), req.body.hint_question || '', req.body.answer || '', req.session.user);
    go(res, `/${role}`, 'Password changed');
  });
}
// Job search columns and the base query (jobs joined with their recruiter's organisation name).
const jobCols = [['job_id', 'Job ID'], ['org_name', 'Organisation'], ['category', 'Category'], ['role', 'Role'], ['location', 'Location'], ['closing_date', 'Closes']];
const JOBQ = 'SELECT j.*, r.org_name FROM jobs j JOIN recruiters r ON r.username=j.username';
// Search open jobs by role, location and keyword; expired jobs are hidden.
app.get('/jobseeker/jobs', need('jobseeker'), async (req, res) => {
  const { role = '', location = '', text = '' } = req.query; const cond = ["(j.closing_date IS NULL OR j.closing_date = '' OR j.closing_date >= ?)"]; const p = [today()];
  if (role) { cond.push('j.role=?'); p.push(role); } if (location) { cond.push('j.location LIKE ?'); p.push(`%${location}%`); }
  if (text) { cond.push('(j.category LIKE ? OR j.skills_required LIKE ? OR j.description LIKE ?)'); p.push(`%${text}%`, `%${text}%`, `%${text}%`); }
  const rows = await q.all(`${JOBQ} WHERE ${cond.join(' AND ')} ORDER BY j.sno DESC`, ...p);
  page(req, res, 'Search Jobs', `<form method="get" class="flex flex-wrap items-end gap-3"><label class="text-sm font-semibold text-slate-600">Role<select name="role" class="input mt-1 block !w-auto"><option value="">All</option>${(await names('functional_areas')).map((n) => `<option${n === role ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <label class="text-sm font-semibold text-slate-600">Location<input name="location" value="${esc(location)}" class="input mt-1 block !w-auto"></label><label class="text-sm font-semibold text-slate-600">Keyword<input name="text" value="${esc(text)}" class="input mt-1 block !w-auto"></label><button>Search</button></form>` + table(rows, jobCols, (r) => `<a class="${LINK}" href="/jobseeker/jobs/${r.sno}">View</a>`));
});
app.get('/jobseeker/jobs/:sno', need('jobseeker'), async (req, res) => {
  const j = await q.get(`${JOBQ} WHERE j.sno=?`, req.params.sno); if (!j) return go(res, '/jobseeker/jobs', 'Job not found');
  const applied = await q.get('SELECT 1 x FROM applications WHERE user_id=? AND recruiter=? AND job_id=?', req.session.user, j.username, j.job_id);
  const rows = [['Job ID', j.job_id], ['Organisation', j.org_name], ['Category', j.category], ['Role', j.role], ['Skills required', j.skills_required], ['Minimum qualification', j.min_qualification], ['Maximum age', j.max_age],
    ['Experience (years)', j.experience_years], ['Expected salary', j.expected_salary], ['Location', j.location], ['Opens', j.opening_date], ['Closes', j.closing_date], ['Description', j.description]];
  page(req, res, 'Job Details', kv(rows) +
    (applied ? '<p class="rounded-md border border-green-300 bg-green-50 px-3.5 py-2.5 text-sm font-semibold text-green-800">You have already applied for this job.</p>' : `<form method="post" action="/jobseeker/jobs/${j.sno}/apply"><button>Apply for this job</button></form>`));
});
// Apply for a job (INSERT IGNORE: applying twice is silently ignored thanks to the unique key).
app.post('/jobseeker/jobs/:sno/apply', need('jobseeker'), async (req, res) => {
  const j = await q.get('SELECT * FROM jobs WHERE sno=?', req.params.sno); if (!j) return go(res, '/jobseeker/jobs', 'Job not found');
  await q.run('INSERT IGNORE INTO applications (user_id,recruiter,job_id,applied_date) VALUES (?,?,?,?)', req.session.user, j.username, j.job_id, today());
  go(res, '/jobseeker/applied', 'Application sent');
});
app.get('/jobseeker/applied', need('jobseeker'), async (req, res) => page(req, res, 'Jobs I Applied To', table(await q.all(`SELECT a.applied_date,a.job_id,r.org_name,j.role,j.location FROM applications a JOIN recruiters r ON r.username=a.recruiter LEFT JOIN jobs j ON j.username=a.recruiter AND j.job_id=a.job_id WHERE a.user_id=? ORDER BY a.id DESC`, req.session.user),
  [['applied_date', 'Applied'], ['job_id', 'Job ID'], ['org_name', 'Organisation'], ['role', 'Role'], ['location', 'Location']])));

// ---------- 6. Recruiter area ----------
// Recruiter registration = account fields + organisation details.
const RC_ACCOUNT = [{ heading: 'Account' }, { name: 'username', label: 'User name', required: true }, { name: 'password', label: 'Password', type: 'password', required: true },
  { name: 'hint_question', label: 'Hint question', type: 'select', options: HINTS, required: true }, { name: 'answer', label: 'Answer', required: true }];
const RC_ORG = [{ heading: 'Organisation' }, { name: 'org_name', label: 'Organisation name', required: true }, { name: 'business_sector', label: 'Business sector' }, { name: 'certificate1', label: 'Certificate 1' }, { name: 'certificate2', label: 'Certificate 2' }, { name: 'certificate3', label: 'Certificate 3' },
  { name: 'website', label: 'Website' }, { name: 'email1', label: 'Email 1', type: 'email', required: true }, { name: 'email2', label: 'Email 2', type: 'email' }, { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'org_environment', label: 'Organisation environment', type: 'textarea' }, { name: 'terms', label: 'Terms and conditions', type: 'textarea' }, { name: 'others', label: 'Others' }, { name: 'org_size', label: 'Size of organisation', type: 'number' }];
const orgNames = RC_ORG.filter((f) => f.name).map((f) => f.name);
app.get('/recruiter/register', async (req, res) => page(req, res, 'Recruiter Registration', form([...RC_ACCOUNT, ...RC_ORG], {}, '/recruiter/register', 'Register')));
app.post('/recruiter/register', async (req, res) => {
  const a = pick(req.body, ['username', 'hint_question', 'answer']); if (!a.username || !req.body.password) return go(res, '/recruiter/register', 'User name and password are required');
  if (await q.get('SELECT 1 x FROM recruiters WHERE username=?', a.username)) return go(res, '/recruiter/register', 'That user name is already taken');
  const org = pick(req.body, orgNames); org.org_size = parseInt(org.org_size, 10) || null;
  await insert('recruiters', { ...a, password: hash(req.body.password), reg_date: today(), ...org }); go(res, '/login?type=recruiter', 'Registered! Please log in.');
});
app.get('/recruiter', need('recruiter'), async (req, res) => page(req, res, '', `<div class="py-12 text-center text-3xl font-bold text-blue-700">Welcome To : ${esc(req.session.user.toUpperCase())}</div>`));
app.get('/recruiter/responses', need('recruiter'), async (req, res) => page(req, res, 'Applicants for My Jobs', table(await q.all('SELECT a.applied_date,a.job_id,a.user_id,s.first_name,s.last_name,s.highest_degree FROM applications a JOIN jobseekers s ON s.user_id=a.user_id WHERE a.recruiter=? ORDER BY a.id DESC', req.session.user),
  [['applied_date', 'Applied'], ['job_id', 'Job ID'], ['first_name', 'First name'], ['last_name', 'Last name'], ['highest_degree', 'Degree']], (r) => `<a class="${LINK}" href="/recruiter/seekers/${encodeURIComponent(r.user_id)}">View resume</a>`)));
app.get('/recruiter/profile', need('recruiter'), async (req, res) => page(req, res, 'Organisation Profile', form(RC_ORG.filter((f) => f.name !== 'username'), await q.get('SELECT * FROM recruiters WHERE username=?', req.session.user), '/recruiter/profile', 'Update')));
app.post('/recruiter/profile', need('recruiter'), async (req, res) => { const o = pick(req.body, orgNames); o.org_size = parseInt(o.org_size, 10) || null; await update('recruiters', o, 'username=?', req.session.user); go(res, '/recruiter/profile', 'Profile updated'); });
// Job posting form, and the values posted for it.
const JOBF = async () => [{ name: 'job_id', label: 'Job ID', required: true }, { name: 'category', label: 'Job category', type: 'select', options: (await names('job_types')) }, { name: 'role', label: 'Role', type: 'select', options: (await names('functional_areas')), required: true },
  { name: 'skills_required', label: 'Skills required' }, { name: 'min_qualification', label: 'Minimum qualification', type: 'select', options: (await names('qualifications')) }, { name: 'max_age', label: 'Maximum age', type: 'number' },
  { name: 'experience_years', label: 'Experience (years)' }, { name: 'expected_salary', label: 'Expected salary' }, { name: 'location', label: 'Job location' },
  { name: 'opening_date', label: 'Opening date', type: 'date' }, { name: 'closing_date', label: 'Closing date', type: 'date' }, { name: 'description', label: 'Description', type: 'textarea' }];
const jobData = async (b) => { const d = pick(b, (await JOBF()).map((f) => f.name)); d.max_age = parseInt(d.max_age, 10) || null; return d; };
// My jobs (with applicant counts), post / edit / delete.
app.get('/recruiter/jobs', need('recruiter'), async (req, res) => page(req, res, 'My Posted Jobs', '<p><a class="btn" href="/recruiter/jobs/new">Post a Job</a></p>' +
  table(await q.all('SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.recruiter=j.username AND a.job_id=j.job_id) applicants FROM jobs j WHERE username=? ORDER BY sno DESC', req.session.user),
    [['job_id', 'Job ID'], ['category', 'Category'], ['role', 'Role'], ['opening_date', 'Opens'], ['closing_date', 'Closes'], ['applicants', 'Applicants']],
    (r) => `<a class="${LINK}" href="/recruiter/jobs/${r.sno}/applicants">Applicants</a><a class="${LINK}" href="/recruiter/jobs/${r.sno}">Edit</a>${delBtn(`/recruiter/jobs/${r.sno}/delete`)}`)));
app.get('/recruiter/jobs/new', need('recruiter'), async (req, res) => page(req, res, 'Post a Job', form((await JOBF()), { opening_date: today() }, '/recruiter/jobs/new', 'Post')));
app.post('/recruiter/jobs/new', need('recruiter'), async (req, res) => {
  const d = (await jobData(req.body)); if (await q.get('SELECT 1 x FROM jobs WHERE username=? AND job_id=?', req.session.user, d.job_id)) return go(res, '/recruiter/jobs/new', 'You already have a job with that Job ID');
  await insert('jobs', { ...d, username: req.session.user }); go(res, '/recruiter/jobs', 'Job posted');
});
// Make sure the job in the URL belongs to the logged-in recruiter (blocks editing other people's jobs).
const ownJob = async (req, res, next) => { req.job = await q.get('SELECT * FROM jobs WHERE sno=? AND username=?', req.params.sno, req.session.user); req.job ? next() : go(res, '/recruiter/jobs', 'Job not found'); };
app.get('/recruiter/jobs/:sno', need('recruiter'), ownJob, async (req, res) => page(req, res, 'Edit Job', form((await JOBF()), req.job, `/recruiter/jobs/${req.job.sno}`, 'Update')));
app.post('/recruiter/jobs/:sno', need('recruiter'), ownJob, async (req, res) => { await update('jobs', (await jobData(req.body)), 'sno=?', req.job.sno); go(res, '/recruiter/jobs', 'Job updated'); });
app.post('/recruiter/jobs/:sno/delete', need('recruiter'), ownJob, async (req, res) => { await q.run('DELETE FROM jobs WHERE sno=?', req.job.sno); go(res, '/recruiter/jobs', 'Job deleted'); });
app.get('/recruiter/jobs/:sno/applicants', need('recruiter'), ownJob, async (req, res) => page(req, res, `Applicants for ${req.job.job_id}`,
  table(await q.all('SELECT s.*, a.applied_date FROM applications a JOIN jobseekers s ON s.user_id=a.user_id WHERE a.recruiter=? AND a.job_id=?', req.job.username, req.job.job_id),
    [['applied_date', 'Applied'], ['first_name', 'First name'], ['last_name', 'Last name'], ['highest_degree', 'Degree'], ['technical_exp', 'Experience']], (r) => `<a class="${LINK}" href="/recruiter/seekers/${encodeURIComponent(r.user_id)}">View resume</a>`)));
// Candidate search (keyword over skills/degree/resume, plus city) and a candidate's full profile.
app.get('/recruiter/seekers', need('recruiter'), async (req, res) => {
  const { text = '', city = '' } = req.query; const cond = ['1=1']; const p = [];
  if (text) { const l = `%${text}%`; cond.push('(skill1 LIKE ? OR skill2 LIKE ? OR skill3 LIKE ? OR skill4 LIKE ? OR highest_degree LIKE ? OR work_field LIKE ? OR job_title LIKE ? OR resume LIKE ?)'); p.push(l, l, l, l, l, l, l, l); }
  if (city) { cond.push('city LIKE ?'); p.push(`%${city}%`); }
  page(req, res, 'Find Candidates', `<form method="get" class="flex flex-wrap items-end gap-3"><label class="text-sm font-semibold text-slate-600">Keyword (skill, degree, field)<input name="text" value="${esc(text)}" class="input mt-1 block !w-auto"></label><label class="text-sm font-semibold text-slate-600">City<input name="city" value="${esc(city)}" class="input mt-1 block !w-auto"></label><button>Search</button></form>` +
    table(await q.all(`SELECT * FROM jobseekers WHERE ${cond.join(' AND ')} ORDER BY reg_date DESC`, ...p), [['first_name', 'First name'], ['last_name', 'Last name'], ['city', 'City'], ['highest_degree', 'Degree'], ['technical_exp', 'Experience'], ['work_field', 'Field']],
      (r) => `<a class="${LINK}" href="/recruiter/seekers/${encodeURIComponent(r.user_id)}">View</a>`));
});
app.get('/recruiter/seekers/:id', need('recruiter'), async (req, res) => {
  const s = await q.get('SELECT * FROM jobseekers WHERE user_id=?', req.params.id); if (!s) return go(res, '/recruiter/seekers', 'Not found');
  const rows = (await JS_PROFILE()).filter((f) => f.name).map((f) => [f.label, f.type === 'checkbox' ? (s[f.name] ? 'Yes' : 'No') : s[f.name]]);
  page(req, res, `${s.first_name || ''} ${s.last_name || ''}`, `${kv(rows)}<p><a class="btn" href="/recruiter/mail?to=${encodeURIComponent(s.email || '')}">Send message</a></p>`);
});
// Message to a candidate. Messages are saved in the database (no email server is configured).
const MAILF = [{ name: 'to', label: 'To', required: true }, { name: 'subject', label: 'Subject', required: true }, { name: 'body', label: 'Message', type: 'textarea', required: true }];
app.get('/recruiter/mail', need('recruiter'), async (req, res) => page(req, res, 'Send Message', '<p><em>Messages are saved in the portal; SMTP e-mail delivery is not configured.</em></p>' + form(MAILF, { to: req.query.to }, '/recruiter/mail', 'Send')));
app.post('/recruiter/mail', need('recruiter'), async (req, res) => { const b = pick(req.body, ['to', 'subject', 'body']); await insert('mails', { sender: req.session.user, recipient: b.to, subject: b.subject, body: b.body, created: today() }); go(res, '/recruiter', 'Message saved'); });

// ---------- 7. Error handlers & start ----------
// 404 for unknown URLs
app.use(async (req, res) => res.status(404).send(layout(req, 'Not found', '<p>That page does not exist.</p>')));
// Any error thrown in a handler ends up here (logged on the server, friendly message to the user).
app.use((err, req, res, _next) => { console.error(err); res.status(500).send(layout(req, 'Error', `<p class="rounded-md border border-red-300 bg-red-50 px-3.5 py-2.5 font-semibold text-red-700">${esc(err.message)}</p>`)); });

// Connect to MySQL (creates the database/tables on first run), then start listening.
const PORT = process.env.PORT || 3000;
init().then(() => app.listen(PORT, () => console.log(`CareerPath running at http://localhost:${PORT}  (admin login: admin / admin123)\nMySQL: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`)))
  .catch((e) => {
    console.error(`\nCould not connect to MySQL at ${cfg.host}:${cfg.port} as "${cfg.user}": ${e.code || ''} ${e.message}\n` +
      'Make sure MySQL is running and set MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD in a .env file (see .env.example).');
    process.exit(1);
  });
