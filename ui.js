/**
 * CareerPath - HTML rendering helpers (no template engine, just JS template strings).
 *
 *   layout()    full page shell: header, role band, role menu, content card, footer
 *   homePage()  public landing page
 *   form() / table() / kv() / delBtn()   reusable UI pieces used by the routes in server.js
 *
 * Styling is 100% Tailwind utility classes, compiled from src/input.css by `npm run build:css`.
 * Role colours (admin = purple, job seeker = green, recruiter = navy, public = blue) come from the CSS
 * variables set per <body class="t-..."> in src/input.css, so `bg-brand`, `text-brand` etc. follow the role.
 * Always pass user-supplied text through esc() to prevent XSS.
 */
// Escape text for safe inclusion in HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// <img> for a file in /public/images.
const img = (n, a = '') => `<img src="/images/${n}" ${a}>`;
// Shared class strings.
const LINK = 'font-semibold text-brand hover:underline';
const CARD = 'mx-auto w-full max-w-5xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-8';
// Inline SVG icon paths (outline style) used on the landing page.
const ICON = {
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  users: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z',
  doc: 'M9 12h6m-6 4h6M7 4h7l5 5v11a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z',
};
const icon = (n, c = 'h-6 w-6') => `<svg class="${c}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

// Which look applies to this request (public / admin / job seeker / recruiter).
function theme(req) {
  const p = req.path || '', s = req.session || {}, ty = req.query && req.query.type;
  if (p.startsWith('/admin') || (p === '/login' && ty === 'admin')) return 'admin';
  if (s.role === 'jobseeker' && p.startsWith('/jobseeker')) return /^\/jobseeker\/(register|forgot)/.test(p) ? 'jslogin' : 'jobseeker';
  if (/^\/recruiter\/(register|forgot)/.test(p)) return 'rclogin';
  if (s.role === 'recruiter' && p.startsWith('/recruiter')) return 'recruiter';
  if ((p === '/login' && ty === 'jobseeker') || /^\/jobseeker\/(register|forgot)/.test(p)) return 'jslogin';
  if (p === '/login' && ty === 'recruiter') return 'rclogin';
  return 'home';
}

// Which part of the site is this? Shown as a badge + breadcrumb so users always know where they are.
function section(req) {
  const p = req.path || '', ty = req.query && req.query.type;
  if (p.startsWith('/admin') || (p === '/login' && ty === 'admin')) return { role: 'admin', badge: 'Admin', label: 'Administration' };
  if (p.startsWith('/jobseeker') || (p === '/login' && ty === 'jobseeker')) return { role: 'jobseeker', badge: 'Job Seeker', label: 'Job Seeker Portal' };
  if (p.startsWith('/recruiter') || (p === '/login' && ty === 'recruiter')) return { role: 'recruiter', badge: 'Recruiter', label: 'Recruiter Portal' };
  return null;
}
function bar(req, title) {
  const sec = section(req), s = req.session || {};
  const byPath = { '/login': 'Login', '/feedback': 'Feedback', '/jobseeker/register': 'Registration', '/recruiter/register': 'Registration' };
  const here = title || byPath[req.path] || 'Home';
  const left = sec
    ? `<span class="rounded-md bg-white px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-brand">${sec.badge}</span><span class="font-bold">${sec.label}</span>`
    : `<span class="font-bold">CareerPath</span>`;
  const right = sec && s.role === sec.role ? `<span class="ml-auto font-semibold">Welcome, ${esc(s.user)}</span><a href="/logout" class="rounded-md bg-white/15 px-3 py-1 text-xs font-bold !text-white no-underline transition hover:bg-white/25">Log out</a>` : '';
  return `<div class="bg-brand-dark text-sm text-white"><div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">${left}<span class="opacity-60">&rsaquo;</span><span>${esc(here)}</span>${right}</div></div>`;
}

// Brand logo mark (inline SVG, so no image file is needed).
const logoMark = `<svg viewBox="0 0 40 40" class="h-10 w-10 shrink-0" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#0909ff"/><path d="M9 28c4-1 6-5 8-9s5-7 14-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M25 10h6v6" fill="none" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="29" r="3" fill="#ff4d4d"/></svg>`;
// Common header on every page: logo + name (click = home page), public menu, Login/Register or dashboard button.
function siteHeader(req) {
  const p = req.path || '', s = req.session || {};
  const links = [['/', 'Home'], ['/about', 'About Us'], ['/contact', 'Contact Us'], ['/feedback', 'Feedback'], ['/login?type=admin', 'Admin']];
  const nav = links.map(([h, t]) => `<a href="${h}" class="rounded-md px-3 py-1.5 text-sm font-semibold no-underline transition hover:bg-slate-100 ${h === p ? '!text-brand bg-slate-100' : '!text-slate-600'}">${t}</a>`).join('');
  const cta = s.role
    ? `<a href="/${s.role === 'admin' ? 'admin' : s.role}" class="btn !py-1.5">My dashboard</a>`
    : `<a href="/login" class="rounded-md border border-slate-300 px-3.5 py-1.5 text-sm font-semibold !text-slate-700 no-underline transition hover:bg-slate-100">Login</a><a href="/jobseeker/register" class="btn !py-1.5">Register</a>`;
  return `<header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
<a href="/" title="Go to Home page" aria-label="CareerPath - Home" class="flex items-center gap-3 no-underline">${logoMark}<span class="leading-tight"><span class="block text-2xl font-extrabold tracking-tight text-slate-900">Career <span class="text-[#0909ff]">Path</span><span class="text-red-600">.com</span></span><span class="block text-[11px] font-bold uppercase tracking-[0.2em] text-red-600">Shape Your Future</span></span></a>
<nav class="ml-auto flex flex-wrap items-center gap-1">${nav}<span class="mx-1 hidden h-6 w-px bg-slate-200 sm:block"></span><div class="flex items-center gap-2">${cta}</div></nav></div></header>`;
}

// Dark site footer shown on every page.
const footer = () => `<footer class="mt-auto bg-slate-900 text-slate-300"><div class="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
<div><div class="flex items-center gap-2 text-lg font-extrabold text-white">${logoMark.replace('h-10 w-10', 'h-8 w-8')}<span>Career Path<span class="text-red-500">.com</span></span></div><p class="mt-3 text-sm leading-relaxed text-slate-400">An online placement portal connecting job seekers with recruiters. Build your profile, find openings and get hired.</p></div>
<div><h4 class="mb-3 text-sm font-bold uppercase tracking-wider text-white">Quick links</h4><ul class="space-y-1.5 text-sm">${[['/', 'Home'], ['/about', 'About Us'], ['/contact', 'Contact Us'], ['/feedback', 'Feedback'], ['/login?type=jobseeker', 'Job Seeker Login'], ['/login?type=recruiter', 'Recruiter Login'], ['/login?type=admin', 'Admin Login']].map(([h, t]) => `<li><a href="${h}" class="!text-slate-300 no-underline hover:!text-white hover:underline">${t}</a></li>`).join('')}</ul></div>
<div><h4 class="mb-3 text-sm font-bold uppercase tracking-wider text-white">Contact</h4><p class="text-sm text-slate-400">25 RajaRam #07-28<br>support@careerpath.example<br>www.careerpath.com</p></div></div>
<div class="border-t border-white/10 px-4 py-4 text-center text-xs text-slate-400">&copy; ${new Date().getFullYear()} CareerPath &middot; All Rights Reserved To www.careerpath.com</div></footer>`;

// Admin menu bar with hover drop-downs (pure CSS via Tailwind `group-hover`).
function adminMenu() {
  const sub = (items) => `<ul class="invisible absolute left-0 top-full z-20 min-w-52 rounded-b-lg border border-slate-200 bg-white py-1 shadow-xl group-hover:visible group-focus-within:visible">${items.map(([h, t]) => `<li><a href="${h}" class="block px-4 py-2 text-sm font-medium !text-slate-700 no-underline hover:bg-fuchsia-50 hover:!text-brand">${t}</a></li>`).join('')}</ul>`;
  const top = (h, t, items) => `<li class="group relative"><a href="${h}" class="block px-4 py-2.5 text-sm font-semibold !text-white no-underline group-hover:bg-brand-dark">${t}${items ? ' <span class="text-[10px]">&#9662;</span>' : ''}</a>${items ? sub(items) : ''}</li>`;
  return `<nav class="bg-brand"><ul class="mx-auto flex max-w-7xl flex-wrap items-center px-3">
${top('/admin', 'Home')}
${top('#', 'Add', [['/admin/m/countries', 'Country'], ['/admin/m/states', 'State'], ['/admin/m/cities', 'Location'], ['/admin/m/experiences', 'Experience'], ['/admin/m/functional-areas', 'Functional Area'], ['/admin/m/job-types', 'Job Type'], ['/admin/m/qualifications', 'Qualification'], ['/admin/m/skills', 'Skill']])}
${top('#', 'Job Seeker Report', [['/admin/jobseekers', 'Registered Job Seeker'], ['/admin/applied', 'Job Seeker Applied Jobs']])}
${top('#', 'Recruiter Report', [['/admin/recruiters', 'Registered Recruiter'], ['/admin/offered', 'Recruiter Offered Jobs'], ['/admin/feedback', 'Feedback']])}
</ul></nav>`;
}

// Menu links for the job seeker / recruiter bars. The link matching the current URL (longest prefix) is highlighted.
const barLinks = (items, cls, activeCls, path) => {
  const act = items.filter(([h]) => path === h || path.startsWith(h + '/')).sort((x, y) => y[0].length - x[0].length)[0];
  return items.map(([h, t]) => `<a href="${h}"${act && act[0] === h ? ' aria-current="page"' : ''} class="px-3 py-2.5 text-[13px] font-semibold no-underline transition ${cls}${act && act[0] === h ? ' ' + activeCls : ''}">${t}</a>`).join('');
};

// Standard page body: the content in a centred white card.
const page = (content) => `<div class="mx-auto flex w-full max-w-7xl flex-1 px-4 py-8"><main class="min-w-0 flex-1"><div class="${CARD}">${content}</div></main></div>`;

// Landing page (public home): hero, stats, features, latest jobs, how it works, partners.
function homePage({ stats, jobs }) {
  const feat = [['search', 'Find the right job', 'Search openings by role, location or keyword and apply in one click.'], ['doc', 'One profile, one resume', 'Keep your education, skills and resume online and up to date.'], ['users', 'Hire faster', 'Recruiters post jobs, browse candidates and review applicants in one place.']];
  const steps = [['1', 'Register', 'Create a free job seeker or recruiter account.'], ['2', 'Connect', 'Recruiters post jobs; candidates search and apply.'], ['3', 'Get hired', 'Review responses, get in touch and close the role.']];
  const jobCards = jobs.length ? `<div class="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">${jobs.map((j) => `<a href="/login?type=jobseeker" class="group rounded-xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md"><div class="flex items-start justify-between gap-2"><h3 class="font-bold text-slate-900 group-hover:text-brand">${esc(j.role || j.category || 'Opening')}</h3><span class="shrink-0 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">${esc(j.category || 'Job')}</span></div><p class="mt-1 text-sm font-semibold text-slate-600">${esc(j.org_name)}</p><p class="mt-2 text-sm text-slate-500">${esc(j.location || 'Location not specified')}${j.closing_date ? ` &middot; closes ${esc(j.closing_date)}` : ''}</p>${j.skills_required ? `<p class="mt-2 line-clamp-1 text-xs text-slate-500">${esc(j.skills_required)}</p>` : ''}</a>`).join('')}</div>` : `<div class="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">No openings posted yet. Recruiters can <a href="/recruiter/register" class="${LINK}">register</a> and post the first job.</div>`;
  return `<section class="bg-gradient-to-br from-[#0606c4] via-[#1f1fff] to-sky-500 text-white"><div class="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
<div><span class="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider">Online placement portal</span>
<h1 class="mt-4 text-4xl font-extrabold leading-tight md:text-5xl">Shape your future with the right career path</h1>
<p class="mt-4 max-w-xl text-lg text-blue-100">CareerPath brings students, job seekers and recruiters together. Upload your CV, discover openings and get hired &mdash; or find the best talent for your company.</p>
<div class="mt-7 flex flex-wrap gap-3"><a href="/login?type=jobseeker" class="rounded-lg bg-white px-6 py-3 font-bold !text-brand no-underline shadow-lg transition hover:bg-blue-50">I'm a Job Seeker</a><a href="/login?type=recruiter" class="rounded-lg border-2 border-white/70 px-6 py-3 font-bold !text-white no-underline transition hover:bg-white/10">I'm a Recruiter</a></div>
<p class="mt-4 text-sm text-blue-100">New here? <a href="/jobseeker/register" class="font-bold !text-white underline">Create a free account</a></p></div>
<div class="grid grid-cols-3 gap-3 rounded-2xl bg-white/10 p-4 text-center backdrop-blur md:p-6">${[['Open jobs', stats.jobs], ['Recruiters', stats.recruiters], ['Job seekers', stats.seekers]].map(([l, v]) => `<div class="rounded-xl bg-white/10 px-2 py-5"><div class="text-3xl font-extrabold md:text-4xl">${v}</div><div class="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-100">${l}</div></div>`).join('')}</div></div></section>
<section class="mx-auto max-w-7xl px-4 py-14"><h2 class="text-center text-3xl font-extrabold text-slate-900">Everything you need to get hired</h2><p class="mx-auto mt-2 max-w-2xl text-center text-slate-500">Simple tools for candidates and employers, all in one portal.</p>
<div class="mt-8 grid gap-5 md:grid-cols-3">${feat.map(([i, t, d]) => `<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">${icon(i)}</div><h3 class="text-lg font-bold text-slate-900">${t}</h3><p class="mt-1.5 text-slate-500">${d}</p></div>`).join('')}</div></section>
<section class="bg-white"><div class="mx-auto max-w-7xl px-4 py-14"><div class="flex flex-wrap items-end justify-between gap-2"><div><h2 class="text-3xl font-extrabold text-slate-900">Latest openings</h2><p class="mt-1 text-slate-500">Fresh jobs from recruiters on CareerPath.</p></div><a href="/login?type=jobseeker" class="${LINK}">Login to search all jobs &rarr;</a></div>${jobCards}</div></section>
<section class="mx-auto max-w-7xl px-4 py-14"><h2 class="text-center text-3xl font-extrabold text-slate-900">How it works</h2><div class="mt-8 grid gap-5 md:grid-cols-3">${steps.map(([n, t, d]) => `<div class="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-white">${n}</div><div><h3 class="font-bold text-slate-900">${t}</h3><p class="mt-1 text-slate-500">${d}</p></div></div>`).join('')}</div></section>
<section class="border-y border-slate-200 bg-white"><div class="mx-auto max-w-7xl px-4 py-10"><p class="mb-5 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Trusted by hiring companies</p><div class="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 opacity-80">${['dell.gif', 'hdfclogo.gif', 'acs_inc.gif', 'adobe_logo_ja.gif', 'aztec_logo.gif', 'ffkeralalogo.gif', 'dazyee_logo.gif', 'cc_logos.gif'].map((f) => img(f, 'class="h-9 w-auto object-contain grayscale transition hover:grayscale-0" alt=""')).join('')}</div></div></section>`;
}

// Build a complete HTML document. `title` is the page heading / breadcrumb; `opts.raw` renders `body` full-width without the card.
function layout(req, title, body, opts = {}) {
  const th = theme(req), s = req.session || {};
  const m0 = (req.query && req.query.msg) || '';
  const bad = /invalid|wrong|already|cannot|not match|not found|required|taken|please log in/i.test(m0);
  const msg = m0 ? `<p role="alert" class="mb-4 rounded-lg border px-4 py-2.5 text-sm font-semibold ${bad ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-800'}">${esc(m0)}</p>` : '';
  const content = `${title ? `<h2 class="mb-5 border-b-2 border-brand pb-3 text-2xl font-bold tracking-tight text-brand">${esc(title)}</h2>` : ''}${msg}${body}`;
  let main, nav = '';
  if (th === 'admin' && s.role === 'admin') nav = adminMenu();
  else if (th === 'jobseeker') {
    const m = [['/jobseeker/resume', 'View Resume'], ['/jobseeker/profile/contact', 'Update Your Profile'], ['/jobseeker/password', 'Update Account Profile'], ['/jobseeker/profile/skills', 'Update Technical Skill Profile'], ['/jobseeker/profile/job', 'Update Job Profile'], ['/jobseeker/profile/background', 'Update Education Profile'], ['/jobseeker/jobs', 'Search Job'], ['/jobseeker/applied', 'Jobs I Applied To']];
    nav = `<nav class="bg-brand"><div class="mx-auto flex max-w-7xl flex-wrap px-3">${barLinks(m, '!text-white hover:bg-brand-dark', '!bg-brand-dark', req.path)}</div></nav>`;
  } else if (th === 'recruiter') {
    const m = [['/recruiter/profile', 'Update My Profile'], ['/recruiter/password', 'Update Account Profile'], ['/recruiter/jobs/new', 'Add New Job'], ['/recruiter/jobs', 'View Posted Jobs'], ['/recruiter/seekers', 'Search Job Seeker'], ['/recruiter/responses', 'Applicants']];
    nav = `<nav class="border-b-[3px] border-brand bg-white"><div class="mx-auto flex max-w-7xl flex-wrap px-3">${barLinks(m, '!text-brand hover:bg-slate-100', '!bg-brand !text-white', req.path)}</div></nav>`;
  }
  if (opts.raw) main = `${msg ? `<div class="mx-auto max-w-7xl px-4 pt-4">${msg}</div>` : ''}${body}`;
  else main = `${bar(req, title)}${nav}${page(content)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title ? esc(title) + ' - ' : ''}Career Path</title><link rel="stylesheet" href="/tailwind.css"></head><body class="t-${th} flex min-h-screen flex-col bg-page font-sans text-[15px] text-slate-800 antialiased">${siteHeader(req)}${main}${footer()}</body></html>`;
}

// field: {name,label,type,options,required}. options: ['a','b'] or [[value,label]]
// Render one form control. Values are escaped; password fields are never pre-filled.
function input(f, v) {
  const val = v?.[f.name] ?? '';
  const req = f.required ? ' required' : '';
  const n = `name="${f.name}" id="${f.name}"`;
  if (f.type === 'textarea') return `<textarea ${n} rows="4" class="input"${req}>${esc(val)}</textarea>`;
  if (f.type === 'checkbox') return `<input type="checkbox" ${n} value="1" class="mt-2 h-4 w-4 accent-brand"${val ? ' checked' : ''}>`;
  if (f.type === 'select') {
    const opts = (f.options || []).map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(ov)}"${String(ov) === String(val) ? ' selected' : ''}>${esc(ol)}</option>`; }).join('');
    return `<select ${n} class="input"${req}><option value="">-- Select --</option>${opts}</select>`;
  }
  return `<input type="${f.type || 'text'}" ${n} value="${f.type === 'password' ? '' : esc(val)}" class="input"${req}${f.type === 'number' ? ' min="0" step="any"' : ''}>`;
}

// POST form from a field list. `{heading}` entries become section headings. `values` pre-fills the controls.
function form(fields, values, action, label = 'Save') {
  const rows = fields.map((f) => f.heading
    ? `<h3 class="mt-5 rounded border-l-4 border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand first:mt-0">${esc(f.heading)}</h3>`
    : `<div class="grid gap-1 sm:grid-cols-[13rem_1fr] sm:gap-4"><label for="${f.name}" class="pt-2 text-sm font-semibold text-slate-600">${esc(f.label)}${f.required ? ' <span class="text-red-600">*</span>' : ''}</label><div>${input(f, values)}</div></div>`).join('');
  return `<form method="post" action="${action}" class="space-y-2">${rows}<div class="pt-3"><button>${esc(label)}</button></div></form>`;
}

// Data table. cols = [[key, label], ...]; actions(row) returns extra HTML for an Actions column.
function table(rows, cols, actions) {
  if (!rows.length) return '<p class="my-4 italic text-slate-500">No records found.</p>';
  const head = cols.map(([, l]) => `<th class="whitespace-nowrap px-3 py-2.5 font-semibold">${esc(l)}</th>`).join('') + (actions ? '<th class="px-3 py-2.5 font-semibold">Actions</th>' : '');
  const body = rows.map((r) => '<tr class="odd:bg-white even:bg-slate-50 hover:bg-slate-100">' + cols.map(([k]) => `<td class="px-3 py-2 align-middle">${esc(r[k])}</td>`).join('') + (actions ? `<td class="whitespace-nowrap px-3 py-2 align-middle"><div class="flex items-center gap-3">${actions(r)}</div></td>` : '') + '</tr>').join('');
  return `<div class="my-4 overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-left text-sm"><thead class="bg-brand text-white"><tr>${head}</tr></thead><tbody class="divide-y divide-slate-200">${body}</tbody></table></div>`;
}

// Label / value list for detail pages. rows = [label, value] or {heading}.
function kv(rows) {
  return `<div class="my-3 overflow-hidden rounded-lg border border-slate-200"><table class="w-full text-sm"><tbody class="divide-y divide-slate-200">${rows.map((r) => r.heading
    ? `<tr><th colspan="2" class="border-l-4 border-brand bg-brand/10 px-3 py-1.5 text-left font-semibold text-brand">${esc(r.heading)}</th></tr>`
    : `<tr><th class="w-52 bg-slate-50 px-3 py-2 text-left align-top font-semibold text-slate-600">${esc(r[0])}</th><td class="whitespace-pre-wrap px-3 py-2">${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>`;
}

// Delete button inside its own POST form, with a confirm() prompt.
const delBtn = (action, label = 'Delete') => `<form method="post" action="${action}" onsubmit="return confirm('Are you sure?')"><button class="!border-red-300 !bg-white !px-3 !py-1 !text-xs !text-red-700 hover:!bg-red-700 hover:!text-white">${label}</button></form>`;

module.exports = { esc, layout, form, table, kv, delBtn, LINK, homePage };
